/**
 * get_decision — Retrieve a single Norwegian Supreme Court decision by case number.
 *
 * Returns the full decision record including main_body (HTML summary from domstol.no),
 * with a valid `_citation` triple (publisher: domstol.no, license: Norwegian-Court-Publication).
 */

import type Database from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { buildCaseLawCitation } from '../utils/citation.js';

export interface GetDecisionInput {
  case_number: string;
}

export interface DecisionResult {
  document_id: string;
  title: string;
  case_number: string;
  court: string;
  decision_date: string | null;
  main_intro: string | null;
  main_body: string | null;
  legal_area: string | null;
  key_sections: string | null;
  judges: string | null;
  source_url: string;
  pdf_url: string | null;
  _citation: {
    source_url: string;
    publisher: string;
    license: string;
    canonical_ref: string;
    display_text: string;
    attribution_text: string;
  };
}

interface DecisionRow {
  document_id: string;
  title: string;
  case_number: string;
  court: string;
  decision_date: string | null;
  main_intro: string | null;
  main_body: string | null;
  legal_area: string | null;
  key_sections: string | null;
  judges: string | null;
  source_url: string;
  pdf_url: string | null;
}

export async function getDecision(
  db: InstanceType<typeof Database>,
  input: GetDecisionInput
): Promise<ToolResponse<DecisionResult | null>> {
  const caseNumber = input.case_number.trim().toUpperCase();

  if (!caseNumber) {
    return {
      results: null,
      _meta: {
        ...generateResponseMetadata(db),
        note: 'case_number is required (e.g., "HR-2025-2303-A").',
      },
    };
  }

  // Check if the decisions table exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='decisions'"
  ).get();

  if (!tableExists) {
    return {
      results: null,
      _meta: {
        ...generateResponseMetadata(db),
        note: 'data-source-unavailable: The decisions table has not been built yet. Run `npm run ingest` then `npm run build:db`.',
      },
    };
  }

  try {
    const row = db.prepare(`
      SELECT
        document_id, title, case_number, court, decision_date,
        main_intro, main_body, legal_area, key_sections, judges, source_url, pdf_url
      FROM decisions
      WHERE UPPER(case_number) = ?
      LIMIT 1
    `).get(caseNumber) as DecisionRow | undefined;

    if (!row) {
      return {
        results: null,
        _meta: {
          ...generateResponseMetadata(db),
          note: `No decision found for case number "${caseNumber}". Verify the case number format (e.g., HR-2025-2303-A).`,
        },
      };
    }

    const citation = buildCaseLawCitation(row.case_number, row.title, row.source_url);
    const result: DecisionResult = {
      ...row,
      _citation: {
        source_url: citation.source_url,
        publisher: citation.publisher,
        license: citation.license,
        canonical_ref: citation.canonical_ref,
        display_text: citation.display_text,
        attribution_text: citation.attribution_text,
      },
    };

    return {
      results: result,
      _meta: generateResponseMetadata(db),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      results: null,
      _meta: {
        ...generateResponseMetadata(db),
        note: `Lookup error: ${message}`,
      },
    };
  }
}
