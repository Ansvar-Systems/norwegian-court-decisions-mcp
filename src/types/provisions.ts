/**
 * Types for legal provisions (paragrafer) within Norwegian statutes.
 */

/** A specific provision within a statute */
export interface LegalProvision {
  /** Auto-increment ID */
  id: number;

  /** LOV/FOR identifier of the parent statute (e.g., "LOV-2018-06-15-38") */
  document_id: string;

  /**
   * Provision reference.
   * For chaptered statutes: "3:13" (kapittel 3, § 13).
   * For flat statutes: "13" (§ 13 only).
   */
  provision_ref: string;

  /** Chapter number — kapittel (null for flat statutes) */
  chapter?: string;

  /** Section/paragraph number — paragrafnummer */
  section: string;

  /** Rubrikk (heading) for the provision */
  title?: string;

  /** Full text content in Norwegian */
  content: string;

  /** JSON metadata: ledd, bokstav, nr., etc. */
  metadata?: Record<string, unknown>;
}

/** A reference to a specific provision */
export interface ProvisionRef {
  /** LOV/FOR identifier (e.g., "LOV-2018-06-15-38") */
  document_id: string;

  /** Chapter — kapittel (may be undefined for flat statutes) */
  chapter?: string;

  /** Section/paragraph number */
  section: string;
}

/** A cross-reference between provisions or documents */
export interface CrossReference {
  /** Source provision or document */
  source_document_id: string;
  source_provision_ref?: string;

  /** Target provision or document */
  target_document_id: string;
  target_provision_ref?: string;

  /** Type of reference */
  ref_type: 'references' | 'amended_by' | 'implements' | 'see_also';
}
