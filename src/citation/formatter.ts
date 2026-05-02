/**
 * Format Norwegian legal citations per standard conventions.
 */

import type { ParsedCitation, CitationFormat } from '../types/index.js';

/** Norwegian ordinal strings for ledd numbering */
const LEDD_ORDINAL_STRINGS: Record<number, string> = {
  1: 'første',
  2: 'andre',
  3: 'tredje',
  4: 'fjerde',
  5: 'femte',
  6: 'sjette',
  7: 'sjuende',
  8: 'åttende',
  9: 'niende',
  10: 'tiende',
};

/**
 * Format a parsed citation into a standard Norwegian citation string.
 *
 * Formats:
 *   full:     "LOV-2018-06-15-38 § 13 første ledd bokstav a"
 *   short:    "LOV-2018-06-15-38 § 13"
 *   pinpoint: "§ 13 første ledd bokstav a" (provision clause only)
 */
export function formatCitation(citation: ParsedCitation, format: CitationFormat = 'full'): string {
  if (!citation.valid) {
    return citation.raw;
  }

  switch (citation.type) {
    case 'statute':
      return formatStatute(citation, format);
    case 'regulation':
      return formatRegulation(citation, format);
    case 'preparatory_work':
      return citation.document_id;
    case 'case_law':
      return formatCaseLaw(citation);
    default:
      return citation.raw;
  }
}

function formatStatute(citation: ParsedCitation, format: CitationFormat): string {
  return formatLovdataDocument(citation, format);
}

function formatRegulation(citation: ParsedCitation, format: CitationFormat): string {
  return formatLovdataDocument(citation, format);
}

/**
 * Format a Lovdata document citation (LOV or FOR).
 *
 * full:     "LOV-2018-06-15-38 § 13 første ledd bokstav a"
 * short:    "LOV-2018-06-15-38 § 13"
 * pinpoint: "§ 13 første ledd bokstav a"
 */
function formatLovdataDocument(citation: ParsedCitation, format: CitationFormat): string {
  const { document_id, chapter, section, ledd, bokstav, nr } = citation;

  const pinpointClause = buildPinpointClause({ chapter, section, ledd, bokstav, nr }, format);

  if (format === 'pinpoint') {
    return pinpointClause || document_id;
  }

  if (format === 'short') {
    // Short: document_id + § N (omit ledd/bokstav/nr)
    const shortPinpoint = buildPinpointClause({ chapter, section }, format);
    return shortPinpoint ? `${document_id} ${shortPinpoint}` : document_id;
  }

  // full format
  return pinpointClause ? `${document_id} ${pinpointClause}` : document_id;
}

/**
 * Build the pinpoint clause string (§ N ...) from its components.
 * Returns empty string if no pinpoint components are present.
 */
function buildPinpointClause(
  parts: {
    chapter?: string;
    section?: string;
    ledd?: number;
    bokstav?: string;
    nr?: string;
  },
  format: CitationFormat = 'full',
): string {
  const { chapter, section, ledd, bokstav, nr } = parts;
  const tokens: string[] = [];

  if (chapter && !section) {
    // kapittel only (no §)
    tokens.push(`kapittel ${chapter}`);
    return tokens.join(' ');
  }

  if (section) {
    tokens.push(`§ ${section}`);
  } else if (chapter) {
    tokens.push(`kapittel ${chapter}`);
    return tokens.join(' ');
  } else {
    return '';
  }

  if (format === 'full') {
    if (ledd !== undefined) {
      const ordinal = LEDD_ORDINAL_STRINGS[ledd] ?? `${ledd}.`;
      tokens.push(`${ordinal} ledd`);
    }
    if (bokstav) {
      tokens.push(`bokstav ${bokstav}`);
    }
    if (nr) {
      tokens.push(`nr. ${nr}`);
    }
  }

  return tokens.join(' ');
}

function formatCaseLaw(citation: ParsedCitation): string {
  // Norwegian case law citations are handled by a separate case-law MCP.
  // Stub support: return document_id as-is.
  return citation.document_id;
}

/**
 * Format a provision reference string from chapter and section.
 * Returns e.g. "3:13" for kapittel 3 § 13, or just "13" for flat statutes.
 */
export function formatProvisionRef(chapter: string | undefined, section: string): string {
  if (chapter) {
    return `${chapter}:${section}`;
  }
  return section;
}
