/**
 * format_citation — Format a Norwegian court decision citation in standard form.
 *
 * Accepts HR-YYYY-NNNN-X format and returns normalized output.
 * For full format: "HR-2025-2303-A (Høyesterett)"
 * For short format: "HR-2025-2303-A"
 * For pinpoint format: "HR-2025-2303-A" (same as short for court decisions)
 */

import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface FormatCitationInput {
  citation: string;
  format?: 'full' | 'short' | 'pinpoint';
}

export interface FormatCitationResult {
  input: string;
  formatted: string;
  type: string;
  valid: boolean;
  error?: string;
}

/**
 * Detect court name from case number suffix.
 * -A/-P = full Høyesterett; -U = Høyesteretts ankeutvalg; -S = Storkammer
 */
function detectCourt(caseNumber: string): string {
  const suffix = caseNumber.split('-').pop()?.toUpperCase() ?? '';
  if (suffix === 'U') return 'Høyesteretts ankeutvalg';
  if (suffix === 'S') return 'Høyesterett (storkammer)';
  return 'Høyesterett';
}

export async function formatCitationTool(
  input: FormatCitationInput
): Promise<ToolResponse<FormatCitationResult>> {
  if (!input.citation || input.citation.trim().length === 0) {
    return {
      results: { input: '', formatted: '', type: 'unknown', valid: false, error: 'Empty citation' },
      _meta: generateResponseMetadata(),
    };
  }

  const normalized = input.citation.trim().toUpperCase();
  const hrPattern = /^HR-\d{4}-\d+-[A-Z]$/;

  if (!hrPattern.test(normalized)) {
    return {
      results: {
        input: input.citation,
        formatted: normalized,
        type: 'unknown',
        valid: false,
        error: `Citation does not match HR-YYYY-NNNN-X format. Got: "${normalized}"`,
      },
      _meta: generateResponseMetadata(),
    };
  }

  const format = input.format ?? 'full';
  let formatted: string;

  if (format === 'full') {
    const court = detectCourt(normalized);
    formatted = `${normalized} (${court})`;
  } else {
    formatted = normalized; // short and pinpoint are the same for court decisions
  }

  return {
    results: {
      input: input.citation,
      formatted,
      type: 'case_law',
      valid: true,
    },
    _meta: generateResponseMetadata(),
  };
}
