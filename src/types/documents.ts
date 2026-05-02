/**
 * Domain types for Norwegian legal documents.
 */

/** Types of legal documents in the Norwegian system */
export type DocumentType = 'statute' | 'regulation' | 'preparatory_work' | 'case_law';

/** Status of a legal document */
export type DocumentStatus = 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';

/** Norwegian court types */
export type CourtType =
  | 'Høyesterett'
  | 'Lagmannsrett'
  | 'Tingrett'
  | 'Arbeidsretten'
  | 'Frostating'
  | 'Gulating'
  | 'Borgarting'
  | 'Eidsivating'
  | 'Agder';

/** A legal document in the Norwegian system */
export interface LegalDocument {
  /** LOV or FOR identifier (e.g., "LOV-2018-06-15-38") */
  id: string;

  /** Document type */
  type: DocumentType;

  /** Norwegian title */
  title: string;

  /** English title if available */
  title_en?: string;

  /** Short name / Korttittel (e.g., "personopplysningsloven") */
  short_name?: string;

  /** Current status */
  status: DocumentStatus;

  /** Issuing date (ISO 8601) */
  issued_date?: string;

  /** Date entering into force */
  in_force_date?: string;

  /** URL to official human-readable source (lovdata.no) */
  url?: string;

  /** Summary / description */
  description?: string;
}
