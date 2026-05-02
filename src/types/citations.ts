/**
 * Types for Norwegian legal citation parsing, formatting, and validation.
 */

import type { DocumentType, DocumentStatus } from './documents.js';

/** Supported citation formats */
export type CitationFormat = 'full' | 'short' | 'pinpoint';

/** Result of parsing a citation string */
export interface ParsedCitation {
  /** Original citation string */
  raw: string;

  /** Detected document type */
  type: DocumentType;

  /** Document identifier (LOV/FOR ID, e.g., "LOV-2018-06-15-38") */
  document_id: string;

  /** Chapter reference — kapittel number (if any) */
  chapter?: string;

  /** Section/paragraph reference — paragraf number (e.g., "13") */
  section?: string;

  /**
   * Ledd ordinal (numbered paragraph within a section).
   * 1=første ledd, 2=andre ledd, 3=tredje ledd, etc.
   */
  ledd?: number;

  /**
   * Bokstav sub-point reference (e.g., "a", "b").
   * From "§ N bokstav a" constructs.
   */
  bokstav?: string;

  /**
   * Nr reference (numbered list item within a ledd or section).
   * From "§ N nr. 1" constructs.
   */
  nr?: string;

  /** Whether parsing succeeded */
  valid: boolean;

  /** Parse error message if invalid */
  error?: string;
}

/** Result of validating a citation against the database */
export interface ValidationResult {
  /** The parsed citation */
  citation: ParsedCitation;

  /** Whether the cited document exists in the database */
  document_exists: boolean;

  /** Whether the specific provision exists (if cited) */
  provision_exists: boolean;

  /** Current document status */
  status?: DocumentStatus;

  /** Title of the document (if found) */
  document_title?: string;

  /** Warning messages (e.g., "statute has been repealed") */
  warnings: string[];
}
