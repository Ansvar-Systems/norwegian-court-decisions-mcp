/**
 * EU References Types
 *
 * Types for EU law cross-references in Norwegian legislation.
 * Norway is an EEA member — EU directives and regulations are incorporated
 * via the EEA Agreement and implemented into Norwegian law.
 */

export type EUDocumentType = 'directive' | 'regulation';

/**
 * EU community designations used in Norwegian law references.
 * 'EF' is the Norwegian abbreviation for 'EG' (Europæisk Fællesskab / Europeisk fellesskap).
 * 'EG' is included for compatibility with legacy DB rows from pre-Norwegian data.
 * 'EEG' is the old form for EEC.
 */
export type EUCommunity = 'EU' | 'EF' | 'EG' | 'EEG' | 'EØS' | 'Euratom';

export type ReferenceType =
  | 'implements'          // Norwegian law implements this EU directive via EEA
  | 'supplements'         // Norwegian law supplements this EU regulation
  | 'applies'             // This EU regulation applies directly (via EEA)
  | 'references'          // General reference to EU law
  | 'complies_with'       // Norwegian law must comply with this
  | 'derogates_from'      // Norwegian law derogates from this (EEA-permitted)
  | 'amended_by'          // Norwegian law was amended to implement this
  | 'repealed_by'         // Norwegian law was repealed by this EU act
  | 'cites_article';      // Cites specific article(s) of EU act

export type ImplementationStatus = 'complete' | 'partial' | 'pending' | 'unknown';

export interface EUDocument {
  id: string;                    // "directive:2016/679" or "regulation:2016/679"
  type: EUDocumentType;
  year: number;
  number: number;
  community: EUCommunity;
  celex_number?: string;         // "32016R0679"
  title?: string;
  title_no?: string;             // Norwegian title
  short_name?: string;           // "GDPR"
  adoption_date?: string;
  entry_into_force_date?: string;
  in_force: boolean;
  amended_by?: string;           // JSON array
  repeals?: string;              // JSON array
  url_eur_lex?: string;
  description?: string;
  last_updated?: string;
}

export interface EUReference {
  id: number;
  source_type: 'provision' | 'document' | 'case_law';
  source_id: string;
  document_id: string;           // LOV/FOR identifier
  provision_id?: number;
  eu_document_id: string;
  eu_article?: string;           // "6.1.c", "13-15", etc.
  reference_type: ReferenceType;
  reference_context?: string;
  full_citation?: string;
  is_primary_implementation: boolean;
  implementation_status?: ImplementationStatus;
  created_at?: string;
  last_verified?: string;
}

export interface EUBasisDocument {
  id: string;
  type: EUDocumentType;
  year: number;
  number: number;
  community: EUCommunity;
  celex_number?: string;
  title?: string;
  short_name?: string;
  reference_type: ReferenceType;
  is_primary_implementation: boolean;
  articles?: string[];
  url_eur_lex?: string;
}

export interface NorwegianImplementation {
  /** LOV/FOR identifier (e.g., "LOV-2018-06-15-38") */
  lov_number: string;
  lov_title: string;
  short_name?: string;
  status: string;
  reference_type: ReferenceType;
  is_primary_implementation: boolean;
  implementation_status?: ImplementationStatus;
  articles_referenced?: string[];
}

export interface ProvisionEUReference {
  id: string;
  type: EUDocumentType;
  title?: string;
  short_name?: string;
  article?: string;
  reference_type: ReferenceType;
  full_citation: string;
  context?: string;
}
