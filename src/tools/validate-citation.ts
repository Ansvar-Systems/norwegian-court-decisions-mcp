/**
 * validate_citation — Validate a Norwegian court decision citation against the database.
 *
 * Zero-hallucination enforcer: checks that the cited HR case number
 * actually exists in the decisions database.
 *
 * Accepts format: HR-YYYY-NNNN-X (e.g., "HR-2025-2303-A")
 */

import type Database from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface ValidateCitationInput {
  citation: string;
}

export interface ValidateCitationResult {
  citation: string;
  formatted_citation: string;
  valid: boolean;
  document_exists: boolean;
  provision_exists: boolean;
  document_title?: string;
  status?: string;
  warnings: string[];
}

interface DecisionRow {
  case_number: string;
  title: string;
  decision_date: string | null;
}

/**
 * Normalize an HR citation to uppercase canonical form.
 * "HR-2025-2303-a" → "HR-2025-2303-A"
 */
function normalizeCitation(citation: string): string {
  return citation.trim().toUpperCase();
}

/**
 * Validate that the citation matches the HR-YYYY-NNNN-X pattern.
 */
function isValidHrFormat(citation: string): boolean {
  return /^HR-\d{4}-\d+-[A-Z]$/.test(citation);
}

export async function validateCitationTool(
  db: InstanceType<typeof Database>,
  input: ValidateCitationInput
): Promise<ToolResponse<ValidateCitationResult>> {
  if (!input.citation || input.citation.trim().length === 0) {
    return {
      results: {
        citation: input.citation,
        formatted_citation: '',
        valid: false,
        document_exists: false,
        provision_exists: false,
        warnings: ['Empty citation'],
      },
      _meta: generateResponseMetadata(db),
    };
  }

  const normalized = normalizeCitation(input.citation);
  const warnings: string[] = [];

  if (!isValidHrFormat(normalized)) {
    warnings.push(`Citation "${normalized}" does not match HR-YYYY-NNNN-X format. Expected example: HR-2025-2303-A`);
    return {
      results: {
        citation: input.citation,
        formatted_citation: normalized,
        valid: false,
        document_exists: false,
        provision_exists: false,
        warnings,
      },
      _meta: generateResponseMetadata(db),
    };
  }

  // Check if the decisions table exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='decisions'"
  ).get();

  if (!tableExists) {
    return {
      results: {
        citation: input.citation,
        formatted_citation: normalized,
        valid: false,
        document_exists: false,
        provision_exists: false,
        warnings: ['Database not built. Run `npm run build:db` after ingestion.'],
      },
      _meta: generateResponseMetadata(db),
    };
  }

  const row = db.prepare(`
    SELECT case_number, title, decision_date
    FROM decisions
    WHERE UPPER(case_number) = ?
    LIMIT 1
  `).get(normalized) as DecisionRow | undefined;

  if (!row) {
    warnings.push(`Case ${normalized} not found in the database. It may post-date the last ingestion, or the case number may be incorrect.`);
  }

  return {
    results: {
      citation: input.citation,
      formatted_citation: normalized,
      valid: !!row,
      document_exists: !!row,
      provision_exists: true, // court decisions are single documents, no provisions
      document_title: row?.title,
      status: row ? `Decision dated ${row.decision_date ?? 'unknown'}` : undefined,
      warnings,
    },
    _meta: generateResponseMetadata(db),
  };
}
