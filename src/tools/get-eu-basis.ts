/**
 * get_eu_basis — Retrieve EU legal basis for a Norwegian statute.
 *
 * Norway is an EEA member. EU acts are incorporated via the EEA Agreement.
 *
 * v0.1 STATUS: not-supported / data-source-unavailable.
 *
 * The eu_documents and eu_references tables require a dedicated EEA/EU reference
 * ingestion pass cross-referencing Lovdata and EUR-Lex. That ingestion is not yet
 * configured for the Norwegian corpus. This tool is NOT registered in registry.ts.
 * It returns a structured not-available response rather than an empty result, per
 * the Ansvar No Silent Fallbacks rule.
 *
 * Activation path: complete EU/EEA reference ingestion → add to registry.ts.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { EUBasisDocument } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetEUBasisInput {
  sfs_number: string;  // accepts LOV/FOR ID or short name (field name kept for registry compat)
  include_articles?: boolean;
  reference_types?: string[];
}

export interface GetEUBasisResult {
  sfs_number: string;  // actual document id returned
  sfs_title: string;
  eu_documents: EUBasisDocument[];
  statistics: {
    total_eu_references: number;
    directive_count: number;
    regulation_count: number;
  };
}

export async function getEUBasis(
  db: Database,
  input: GetEUBasisInput
): Promise<ToolResponse<GetEUBasisResult>> {
  if (!input.sfs_number) {
    throw new Error('document_id is required. Expected format: "LOV-2018-06-15-38" or short name (e.g., "personopplysningsloven")');
  }

  return {
    results: {
      sfs_number: input.sfs_number,
      sfs_title: '',
      eu_documents: [],
      statistics: { total_eu_references: 0, directive_count: 0, regulation_count: 0 },
    },
    _meta: {
      ...generateResponseMetadata(db),
      note: 'data-source-unavailable: EU/EEA reference data requires a dedicated ingestion pass against EUR-Lex that is not yet configured for Norwegian Law MCP v0.1. This tool is not active in the current tool registry.',
    },
  };
}
