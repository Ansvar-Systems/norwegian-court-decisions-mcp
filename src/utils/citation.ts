/**
 * Citation metadata for the deterministic citation pipeline.
 *
 * Provides structured identifiers (canonical_ref, display_text, source_url)
 * that the platform's entity linker uses to match references in agent
 * responses to MCP tool results — without relying on LLM formatting.
 *
 * Court decisions: source_url points to the domstol.no decision page (human-readable).
 * publisher is "domstol.no", license is "Norwegian-Court-Publication".
 *
 * See: docs/guides/law-mcp-golden-standard.md Section 4.9c
 */

export interface CitationMetadata {
  source_url: string;
  publisher: string;
  license: string;
  canonical_ref: string;
  display_text: string;
  attribution_text: string;
  aliases?: string[];
  lookup: {
    tool: string;
    args: Record<string, string>;
  };
}

/**
 * Build citation metadata for a get_provision response.
 *
 * @param documentId     DB identifier (e.g., "LOV-2018-06-15-38")
 * @param documentTitle  Human-readable law title (e.g., "Lov om behandling av personopplysninger")
 * @param provisionRef   Provision reference (e.g., "13" or "3:13")
 * @param inputDocId     The document_id argument as passed by the caller
 * @param inputSection   The section argument as passed by the caller
 * @param sourceUrl      Override for the official portal URL (optional)
 * @param shortName      Short name / Korttittel (e.g., "personopplysningsloven") (optional)
 */
export function buildProvisionCitation(
  documentId: string,
  documentTitle: string,
  provisionRef: string,
  inputDocId: string,
  inputSection: string,
  sourceUrl?: string | null,
  shortName?: string | null,
): CitationMetadata {
  // Build canonical_ref from the LOV/FOR identifier
  // DB id "LOV-2018-06-15-38" → canonical ref is the full LOV ID
  const canonicalRef = documentId;

  // Build display_text: "§ 13 LOV-2018-06-15-38" or using short name if available
  const sectionLabel = provisionRef.includes(':')
    ? `§ ${provisionRef.split(':')[1]}`
    : `§ ${provisionRef}`;

  const docLabel = shortName ? shortName : canonicalRef;
  const displayText = `${docLabel} ${sectionLabel}`;

  // Build the lovdata.no human-readable URL for this provision.
  // Format: https://lovdata.no/dokument/NL/lov/YYYY-MM-DD-NN/§N
  // The document_id in the DB is "LOV-2018-06-15-38"; we derive the
  // URL path from it by lowercasing and replacing "LOV-" with "NL/lov/".
  const resolvedSourceUrl = sourceUrl ?? buildLovdataUrl(documentId, provisionRef);

  // Attribution text per NLOD-2.0
  const attributionText = `${documentTitle} — Lovdata (NLOD-2.0)`;

  // Build aliases from short name
  const aliases: string[] = [];
  if (shortName) aliases.push(shortName);

  return {
    source_url: resolvedSourceUrl,
    publisher: 'lovdata.no',
    license: 'NLOD-2.0',
    canonical_ref: canonicalRef,
    display_text: displayText,
    attribution_text: attributionText,
    ...(aliases.length > 0 && { aliases }),
    lookup: {
      tool: 'get_provision',
      args: { document_id: inputDocId, section: inputSection },
    },
  };
}

/**
 * Build the customer-facing lovdata.no URL for a provision.
 *
 * Example:
 *   documentId = "LOV-2018-06-15-38", provisionRef = "13"
 *   → "https://lovdata.no/dokument/NL/lov/2018-06-15-38/§13"
 *
 *   documentId = "LOV-2018-06-15-38", provisionRef = "3:13"
 *   → "https://lovdata.no/dokument/NL/lov/2018-06-15-38/§13"
 *     (lovdata.no URLs use just the § number, not the kapittel)
 *
 *   documentId = "FOR-2018-06-15-100", provisionRef = "5"
 *   → "https://lovdata.no/dokument/NL/forskrift/2018-06-15-100/§5"
 */
export function buildLovdataUrl(documentId: string, provisionRef?: string): string {
  const upper = documentId.toUpperCase();

  let pathPrefix: string;
  let datePart: string;

  if (upper.startsWith('LOV-')) {
    pathPrefix = 'NL/lov';
    datePart = documentId.slice(4); // "2018-06-15-38"
  } else if (upper.startsWith('FOR-')) {
    pathPrefix = 'NL/forskrift';
    datePart = documentId.slice(4);
  } else {
    // Unknown prefix — best effort
    pathPrefix = 'NL/lov';
    datePart = documentId;
  }

  const base = `https://lovdata.no/dokument/${pathPrefix}/${datePart}`;

  if (!provisionRef) {
    return base;
  }

  // Extract just the § number (strip chapter prefix if present: "3:13" → "13")
  const sectionNumber = provisionRef.includes(':')
    ? provisionRef.split(':')[1]
    : provisionRef;

  return `${base}/§${sectionNumber}`;
}

/**
 * Build citation metadata for a court decision (case law) result.
 *
 * @param caseNumber   HR case number (e.g., "HR-2025-2303-A")
 * @param _title       Anonymized decision title (reserved for future use)
 * @param sourceUrl    Direct URL on domstol.no
 */
export function buildCaseLawCitation(
  caseNumber: string,
  _title: string,
  sourceUrl: string,
): CitationMetadata {
  const attributionText =
    `Norwegian Supreme Court (Høyesterett) decision ${caseNumber}, anonymized per ` +
    `domstol.no publication policy. Copyright-exempt under åndsverkloven §14.`;

  return {
    source_url: sourceUrl,
    publisher: 'domstol.no',
    license: 'Norwegian-Court-Publication',
    canonical_ref: caseNumber,
    display_text: caseNumber,
    attribution_text: attributionText,
    lookup: {
      tool: 'get_decision',
      args: { case_number: caseNumber },
    },
  };
}
