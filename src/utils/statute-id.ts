/**
 * statute-id.ts — Document ID resolution for Norwegian Law MCP.
 *
 * Resolves human-readable law names (e.g., "personopplysningsloven") or
 * canonical LOV/FOR IDs (e.g., "LOV-2018-06-15-38") to internal document IDs.
 * Allows search and stance tools to accept the same inputs as get_provision.
 */

import type { Database } from '@ansvar/mcp-sqlite';

/**
 * Common Norwegian short names → canonical LOV IDs.
 *
 * This list is intentionally small. The primary resolution path is
 * the database short_name column (populated from Korttittel fields).
 * Entries here handle callers who pass a common name before ingestion
 * has loaded short_name into the DB.
 *
 * TODO: Remove or reduce this table once DB Korttittel coverage is verified.
 */
const COLLOQUIAL_NAMES: Record<string, string> = {
  'personopplysningsloven': 'LOV-2018-06-15-38',
  'popplysningsloven': 'LOV-2018-06-15-38',
  'straffeloven': 'LOV-2005-05-20-28',
  'arbeidsmiljøloven': 'LOV-2005-06-17-62',
  'aml': 'LOV-2005-06-17-62',
  'tvisteloven': 'LOV-2005-06-17-90',
  'aksjeloven': 'LOV-1997-06-13-44',
  'asl': 'LOV-1997-06-13-44',
  'åndsverkloven': 'LOV-2018-06-15-40',
  'sikkerhetsloven': 'LOV-2018-06-01-24',
};

/**
 * Resolve a document_id that may be:
 *  1. An exact internal LOV/FOR ID (e.g., "LOV-2018-06-15-38") — returned as-is if found
 *  2. A title or partial title — looked up via LIKE match
 *  3. A short name / Korttittel — matched against short_name column
 *  4. A colloquial name from the local table above
 *
 * Returns the resolved internal ID, or null if no match found.
 */
export function resolveDocumentId(db: Database, input: string): string | null {
  // 1. Try exact match on id
  const exact = db.prepare(
    'SELECT id FROM legal_documents WHERE id = ? LIMIT 1'
  ).get(input) as { id: string } | undefined;
  if (exact) return exact.id;

  // 2. Try case-insensitive exact match on id (LOV- prefix may vary in case)
  const exactUpper = db.prepare(
    'SELECT id FROM legal_documents WHERE upper(id) = upper(?) LIMIT 1'
  ).get(input) as { id: string } | undefined;
  if (exactUpper) return exactUpper.id;

  // 3. Try exact match on title
  const byTitle = db.prepare(
    'SELECT id FROM legal_documents WHERE title = ? LIMIT 1'
  ).get(input) as { id: string } | undefined;
  if (byTitle) return byTitle.id;

  // 4. Try colloquial name lookup (before fuzzy — short names don't substring-match formal titles)
  const colloquial = COLLOQUIAL_NAMES[input.toLowerCase()];
  if (colloquial) {
    const byColloquial = db.prepare(
      'SELECT id FROM legal_documents WHERE id = ? LIMIT 1'
    ).get(colloquial) as { id: string } | undefined;
    if (byColloquial) return byColloquial.id;
  }

  // 5. Try exact match on short_name / Korttittel
  const byShortName = db.prepare(
    'SELECT id FROM legal_documents WHERE short_name = ? LIMIT 1'
  ).get(input) as { id: string } | undefined;
  if (byShortName) return byShortName.id;

  // 6. Try LIKE match on title (case-insensitive partial)
  const byLike = db.prepare(
    'SELECT id FROM legal_documents WHERE title LIKE ? LIMIT 1'
  ).get(`%${input}%`) as { id: string } | undefined;
  if (byLike) return byLike.id;

  // 7. Try LIKE match on short_name
  const byShortNameLike = db.prepare(
    'SELECT id FROM legal_documents WHERE short_name LIKE ? LIMIT 1'
  ).get(`%${input}%`) as { id: string } | undefined;
  if (byShortNameLike) return byShortNameLike.id;

  // 8. Strip "LOV-" or "FOR-" prefix and retry (callers may drop prefix)
  const prefixStripped = input.replace(/^(LOV|FOR)-/i, '');
  if (prefixStripped !== input) {
    const byStripped = db.prepare(
      'SELECT id FROM legal_documents WHERE id LIKE ? LIMIT 1'
    ).get(`%${prefixStripped}%`) as { id: string } | undefined;
    if (byStripped) return byStripped.id;
  }

  return null;
}

/**
 * Normalize a human-readable provision reference to the internal format.
 *
 *   "kapittel 3 § 13"  → "3:13"
 *   "kap. 3 § 13"      → "3:13"
 *   "§ 13"             → "13"
 *   "13"               → "13"  (already canonical)
 *   "3:13"             → "3:13" (already canonical)
 */
export function normalizeProvisionRef(input: string): string {
  const trimmed = input.trim();

  // Already in canonical format: digits with optional colon+digits
  if (/^\d+(:\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  // "kapittel N § M" or "kap. N § M"
  const chaptered = trimmed.match(
    /^(?:kapittel|kap\.)\s*(\d+)\s*§\s*(\d+)/i
  );
  if (chaptered) {
    return `${chaptered[1]}:${chaptered[2]}`;
  }

  // "§ M" (flat statute)
  const flat = trimmed.match(/^§\s*(\d+)/);
  if (flat) {
    return flat[1];
  }

  // "N § M" — e.g., from "3 § 13" (unusual but handle it)
  const sectionFirst = trimmed.match(/^(\d+)\s*§\s*(\d+)/);
  if (sectionFirst) {
    return `${sectionFirst[1]}:${sectionFirst[2]}`;
  }

  // Unrecognized — return as-is and let the DB query decide
  return trimmed;
}
