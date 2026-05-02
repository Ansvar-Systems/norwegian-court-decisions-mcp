/**
 * get_provision_eu_basis — Get EU/EEA legal basis for a specific provision.
 *
 * v0.1 STATUS: not-supported / data-source-unavailable.
 *
 * EU/EEA reference data (eu_documents, eu_references tables) requires a
 * dedicated ingestion pass which is not yet configured for the Norwegian corpus.
 * This tool is NOT registered in registry.ts. It returns a structured
 * not-available response rather than silently throwing or returning empty results.
 *
 * Activation path: complete EU/EEA reference ingestion → add to registry.ts.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { ProvisionEUReference } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetProvisionEUBasisInput {
  sfs_number: string;
  provision_ref: string;
}

export interface GetProvisionEUBasisResult {
  sfs_number: string;
  provision_ref: string;
  provision_content?: string;
  eu_references: ProvisionEUReference[];
}

export async function getProvisionEUBasis(
  db: Database,
  input: GetProvisionEUBasisInput
): Promise<ToolResponse<GetProvisionEUBasisResult>> {
  if (!input.sfs_number) {
    throw new Error('document_id is required. Expected format: "LOV-2018-06-15-38" or short name.');
  }
  if (!input.provision_ref || !input.provision_ref.trim()) {
    throw new Error('provision_ref is required (e.g., "13" or "3:13")');
  }

  return {
    results: {
      sfs_number: input.sfs_number,
      provision_ref: input.provision_ref,
      eu_references: [],
    },
    _meta: {
      ...generateResponseMetadata(db),
      note: 'data-source-unavailable: EU/EEA reference data requires a dedicated ingestion pass that is not yet configured for Norwegian Law MCP v0.1. This tool is not active in the current tool registry.',
    },
  };
}
