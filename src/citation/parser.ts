/**
 * Parse Norwegian legal citation strings into structured objects.
 *
 * Supported formats:
 *   - LOV-2018-06-15-38
 *   - LOV-2018-06-15-38 § 13
 *   - LOV-2018-06-15-38 § 13 første ledd
 *   - LOV-2018-06-15-38 § 13 første ledd bokstav a
 *   - LOV-2018-06-15-38 § 13 nr. 2
 *   - LOV-2018-06-15-38 kapittel 3
 *   - FOR-2018-06-15-38
 *   - personopplysningsloven § 13
 *   - personopplysningsloven § 13 første ledd bokstav a
 */

import type { ParsedCitation, DocumentType } from '../types/index.js';

// ---------------------------------------------------------------------------
// Short-name dictionary (Korttittel → canonical LOV/FOR id)
// ---------------------------------------------------------------------------

/**
 * Maps common Norwegian law short names to their LOV identifiers.
 *
 * TODO: Verify and expand this dictionary post-ingestion using actual
 *       Korttittel fields from the Lovdata corpus.
 *
 * Note: forvaltningsloven date (1967-02-10) needs verification during
 *       ingestion — the law number "X" is a placeholder; Lovdata uses
 *       a sequential number assigned at the time (typically a low integer).
 */
const NORWEGIAN_SHORT_NAMES: Record<string, string> = {
  'personopplysningsloven': 'LOV-2018-06-15-38',
  'popplysningsloven': 'LOV-2018-06-15-38',
  'straffeloven': 'LOV-2005-05-20-28',
  'arbeidsmiljøloven': 'LOV-2005-06-17-62',
  'aml': 'LOV-2005-06-17-62',
  'forvaltningsloven': 'LOV-1967-02-10-X',    // TODO: verify date+number during ingestion
  'fvl': 'LOV-1967-02-10-X',
  'tvisteloven': 'LOV-2005-06-17-90',
  'aksjeloven': 'LOV-1997-06-13-44',
  'asl': 'LOV-1997-06-13-44',
  'ehandelsloven': 'LOV-2003-05-23-35',
  'åndsverkloven': 'LOV-2018-06-15-40',
  'avhendingsloven': 'LOV-1992-07-03-93',
  'sikkerhetsloven': 'LOV-2018-06-01-24',
  'finansforetaksloven': 'LOV-2015-04-10-17',
  'verdipapirhandelloven': 'LOV-2007-06-29-75',
  'skatteloven': 'LOV-1999-03-26-14',
  'merverdiavgiftsloven': 'LOV-2009-06-19-58',
  'mval': 'LOV-2009-06-19-58',
  'plan- og bygningsloven': 'LOV-2008-06-27-71',
  'pbl': 'LOV-2008-06-27-71',
  'kommuneloven': 'LOV-2018-06-22-83',
  'barnevernsloven': 'LOV-2021-06-18-97',
  'helseregisterloven': 'LOV-2014-06-20-43',
  'pasientjournalloven': 'LOV-2014-06-20-42',
  'pasient- og brukerrettighetsloven': 'LOV-1999-07-02-63',
  'pbrl': 'LOV-1999-07-02-63',
  // ...additional short names to be added post-ingestion
};

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/** LOV canonical ID: LOV-YYYY-MM-DD-NNN (case-insensitive) */
const LOV_PATTERN = /^(LOV-\d{4}-\d{2}-\d{2}-[A-Za-z0-9]+)/i;

/** FOR canonical ID: FOR-YYYY-MM-DD-NNN (case-insensitive) */
const FOR_PATTERN = /^(FOR-\d{4}-\d{2}-\d{2}-[A-Za-z0-9]+)/i;

/**
 * Pinpoint clause appended after document ID or short name.
 * Captures optional kapittel, § section, ledd ordinal, bokstav, and nr.
 *
 * Examples matched:
 *   § 13
 *   § 13 første ledd
 *   § 13 første ledd bokstav a
 *   § 13 nr. 2
 *   § 13 andre ledd bokstav b nr. 1
 *   kapittel 3
 *   kap. 3
 */
const PINPOINT_PATTERN =
  /(?:\s+(?:kapittel|kap\.)\s*(\d+))?(?:\s+§\s*(\d+))?(?:\s+(første|andre|tredje|fjerde|femte|sjette|sjuende|åttende|niende|tiende)\s+ledd)?(?:\s+bokstav\s+([a-å]))?(?:\s+nr\.\s*(\d+))?/i;

/** Norwegian ordinals for ledd */
const LEDD_ORDINALS: Record<string, number> = {
  'første': 1,
  'andre': 2,
  'tredje': 3,
  'fjerde': 4,
  'femte': 5,
  'sjette': 6,
  'sjuende': 7,
  'åttende': 8,
  'niende': 9,
  'tiende': 10,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a Norwegian legal citation string.
 *
 * @param citation - Raw citation string
 * @returns Parsed citation with type, document ID, and optional provision reference
 */
export function parseCitation(citation: string): ParsedCitation {
  const trimmed = citation.trim();

  if (!trimmed) {
    return { raw: citation, type: 'statute', document_id: '', valid: false, error: 'Empty citation' };
  }

  // Try LOV canonical ID
  const lovMatch = trimmed.match(LOV_PATTERN);
  if (lovMatch) {
    const docId = lovMatch[1].toUpperCase();
    const remainder = trimmed.slice(lovMatch[0].length);
    return buildFromDocId(citation, 'statute', docId, remainder);
  }

  // Try FOR canonical ID
  const forMatch = trimmed.match(FOR_PATTERN);
  if (forMatch) {
    const docId = forMatch[1].toUpperCase();
    const remainder = trimmed.slice(forMatch[0].length);
    return buildFromDocId(citation, 'regulation', docId, remainder);
  }

  // Try short-name lookup
  const shortNameResult = tryShortName(citation, trimmed);
  if (shortNameResult) {
    return shortNameResult;
  }

  return {
    raw: citation,
    type: 'statute',
    document_id: '',
    valid: false,
    error: `Unrecognized citation format: "${trimmed}"`,
  };
}

/**
 * Detect the document type from a citation string without full parsing.
 */
export function detectDocumentType(citation: string): DocumentType | null {
  const trimmed = citation.trim();
  const upper = trimmed.toUpperCase();
  if (upper.startsWith('LOV-')) return 'statute';
  if (upper.startsWith('FOR-')) return 'regulation';
  // Check short names
  const lower = trimmed.toLowerCase().split(' ')[0].replace(/[^a-zæøå-]/g, '');
  if (NORWEGIAN_SHORT_NAMES[lower]) return 'statute';
  // Full short name (may include spaces like "plan- og bygningsloven")
  const firstWord = trimmed.toLowerCase().split('§')[0].trim();
  if (NORWEGIAN_SHORT_NAMES[firstWord]) return 'statute';
  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build a ParsedCitation from a resolved document ID and the trailing pinpoint text. */
function buildFromDocId(
  raw: string,
  type: 'statute' | 'regulation',
  docId: string,
  remainder: string,
): ParsedCitation {
  const result: ParsedCitation = {
    raw,
    type,
    document_id: docId,
    valid: true,
  };

  if (!remainder.trim()) {
    return result;
  }

  parsePinpoint(remainder.trim(), result);
  return result;
}

/**
 * Try to match the citation against known short names.
 * Short names may be followed by a pinpoint clause (§ N ...).
 */
function tryShortName(raw: string, trimmed: string): ParsedCitation | null {
  // Match "shortname [pinpoint]" where shortname may contain spaces/hyphens
  // Try longest possible short name first
  const lower = trimmed.toLowerCase();

  for (const [name, docId] of Object.entries(NORWEGIAN_SHORT_NAMES)) {
    if (lower.startsWith(name)) {
      const remainder = trimmed.slice(name.length).trim();
      // Remainder must be empty or start with §, kapittel, or kap.
      if (
        remainder === '' ||
        remainder.startsWith('§') ||
        /^kapittel\b/i.test(remainder) ||
        /^kap\./i.test(remainder)
      ) {
        const result: ParsedCitation = {
          raw,
          type: 'statute',
          document_id: docId,
          valid: true,
        };
        if (remainder) {
          parsePinpoint(remainder, result);
        }
        return result;
      }
    }
  }

  return null;
}

/**
 * Parse a pinpoint string into section, chapter, ledd, bokstav, nr fields
 * and attach them to the given ParsedCitation (mutates in place).
 *
 * Pinpoint formats:
 *   kapittel N
 *   kap. N
 *   § N
 *   § N første ledd
 *   § N første ledd bokstav a
 *   § N nr. 2
 *   § N første ledd bokstav b nr. 1
 */
function parsePinpoint(pinpoint: string, result: ParsedCitation): void {
  const m = pinpoint.match(PINPOINT_PATTERN);
  if (!m) return;

  const [, kapittel, section, leddOrdinal, bokstav, nr] = m;

  if (kapittel) {
    result.chapter = kapittel;
  }
  if (section) {
    result.section = section;
  }
  if (leddOrdinal) {
    result.ledd = LEDD_ORDINALS[leddOrdinal.toLowerCase()];
  }
  if (bokstav) {
    result.bokstav = bokstav.toLowerCase();
  }
  if (nr) {
    result.nr = nr;
  }
}
