/**
 * get_norwegian_implementations — Find Norwegian statutes implementing an EU directive/regulation.
 *
 * Norway is an EEA member. EU directives are incorporated via the EEA Agreement
 * and implemented into Norwegian law.
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
import type { NorwegianImplementation } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetSwedishImplementationsInput {
  eu_document_id: string;
  primary_only?: boolean;
  in_force_only?: boolean;
}

export interface GetSwedishImplementationsResult {
  eu_document: {
    id: string;
    type: 'directive' | 'regulation';
    year: number;
    number: number;
    title?: string;
    short_name?: string;
    celex_number?: string;
  };
  implementations: NorwegianImplementation[];
  statistics: {
    total_statutes: number;
    primary_implementations: number;
    in_force: number;
    repealed: number;
  };
}

export async function getSwedishImplementations(
  db: Database,
  input: GetSwedishImplementationsInput
): Promise<ToolResponse<GetSwedishImplementationsResult>> {
  if (!input.eu_document_id || !/^(directive|regulation):\d+\/\d+$/.test(input.eu_document_id)) {
    throw new Error(
      `Invalid EU document ID format: "${input.eu_document_id}". Expected format: "directive:YYYY/NNN" or "regulation:YYYY/NNN" (e.g., "regulation:2016/679")`
    );
  }

  return {
    results: {
      eu_document: {
        id: input.eu_document_id,
        type: 'directive',
        year: 0,
        number: 0,
      },
      implementations: [] as NorwegianImplementation[],
      statistics: { total_statutes: 0, primary_implementations: 0, in_force: 0, repealed: 0 },
    },
    _meta: {
      ...generateResponseMetadata(db),
      note: 'data-source-unavailable: EU/EEA reference data requires a dedicated ingestion pass that is not yet configured for Norwegian Law MCP v0.1. This tool is not active in the current tool registry.',
    },
  };
}
