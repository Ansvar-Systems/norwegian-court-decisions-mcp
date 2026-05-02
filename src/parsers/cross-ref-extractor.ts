/**
 * Extract cross-references from Norwegian legal provision text.
 *
 * Detects patterns like:
 *   - "\u00a7 13 f\u00f8rste ledd" (same statute, different provision)
 *   - "LOV-2018-06-15-38" (reference to another statute by canonical ID)
 *   - "personopplysningsloven \u00a7 13" (reference by short name)
 */

/** An extracted cross-reference */
export interface ExtractedRef {
  /** LOV/FOR identifier if detected (e.g., "LOV-2018-06-15-38") */
  target_lov?: string;
  /** Target provision reference (e.g., "3:13" or "13") */
  target_provision_ref?: string;
  /** Raw text of the reference */
  raw_text: string;
}

/** Pattern for LOV/FOR canonical IDs within text */
const LOV_REF_PATTERN = /\b((?:LOV|FOR)-\d{4}-\d{2}-\d{2}-[A-Za-z0-9]+)\b/gi;

/** Pattern for \u00a7 N provision references */
const PROVISION_REF_PATTERN = /\u00a7\s*(\d+)/g;

/**
 * Extract cross-references from Norwegian provision text.
 *
 * @param text - Provision content text
 * @returns Array of extracted references
 */
export function extractCrossReferences(text: string): ExtractedRef[] {
  const refs: ExtractedRef[] = [];
  const seen = new Set<string>();

  let match;

  // Extract LOV/FOR canonical ID references
  while ((match = LOV_REF_PATTERN.exec(text)) !== null) {
    const id = match[1].toUpperCase();
    const key = `lov:${id}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({
        target_lov: id,
        raw_text: match[0],
      });
    }
  }

  // Extract § N provision references
  while ((match = PROVISION_REF_PATTERN.exec(text)) !== null) {
    const section = match[1];
    const key = `prov:${section}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({
        target_provision_ref: section,
        raw_text: match[0],
      });
    }
  }

  return refs;
}
