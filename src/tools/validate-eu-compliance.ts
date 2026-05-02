/**
 * validate_eu_compliance — Check Norwegian statute's EU/EEA compliance status.
 *
 * v0.1 STATUS: not-supported / data-source-unavailable.
 *
 * EU/EEA reference data (eu_documents, eu_references tables) requires a
 * dedicated ingestion pass which is not yet configured for the Norwegian corpus.
 * This tool is NOT registered in registry.ts. It returns a structured
 * not-available response.
 *
 * Activation path: complete EU/EEA reference ingestion → add to registry.ts.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface ValidateEUComplianceInput {
  sfs_number: string;
  provision_ref?: string;
  eu_document_id?: string;
}

export interface EUComplianceResult {
  sfs_number: string;
  provision_ref?: string;
  compliance_status: 'compliant' | 'partial' | 'unclear' | 'not_applicable';
  eu_references_found: number;
  warnings: string[];
  outdated_references?: Array<{
    eu_document_id: string;
    title?: string;
    issue: string;
    replaced_by?: string;
  }>;
  recommendations?: string[];
}

export async function validateEUCompliance(
  db: Database,
  input: ValidateEUComplianceInput
): Promise<ToolResponse<EUComplianceResult>> {
  if (!input.sfs_number) {
    throw new Error('document_id is required. Expected format: "LOV-2018-06-15-38" or short name (e.g., "personopplysningsloven")');
  }

  return {
    results: {
      sfs_number: input.sfs_number,
      provision_ref: input.provision_ref,
      compliance_status: 'not_applicable',
      eu_references_found: 0,
      warnings: [],
      recommendations: [
        'EU/EEA reference data requires a dedicated ingestion pass that is not yet configured for Norwegian Law MCP v0.1.',
      ],
    },
    _meta: {
      ...generateResponseMetadata(db),
      note: 'data-source-unavailable: EU/EEA compliance validation requires eu_documents and eu_references tables which are not populated in this MCP v0.1. This tool is not active in the current tool registry.',
    },
  };
}
