/**
 * search_eu_implementations — Search for EU directives/regulations by keyword.
 *
 * v0.1 STATUS: not-supported / data-source-unavailable.
 *
 * EU/EEA reference data (eu_documents table) requires a dedicated ingestion pass
 * which is not yet configured for the Norwegian corpus. This tool is NOT registered
 * in registry.ts. It returns a structured not-available response.
 *
 * Activation path: complete EU/EEA reference ingestion → add to registry.ts.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface SearchEUImplementationsInput {
  query?: string;
  type?: 'directive' | 'regulation';
  year_from?: number;
  year_to?: number;
  community?: 'EU' | 'EG' | 'EEG' | 'Euratom';
  has_swedish_implementation?: boolean;
  limit?: number;
}

export interface SearchEUImplementationsResult {
  results: Array<{
    eu_document: {
      id: string;
      type: 'directive' | 'regulation';
      year: number;
      number: number;
      title?: string;
      short_name?: string;
      community: string;
      celex_number?: string;
    };
    swedish_statute_count: number;
    primary_implementations: string[];
    all_references: string[];
  }>;
  total_results: number;
  query_info: SearchEUImplementationsInput;
}

export async function searchEUImplementations(
  db: Database,
  input: SearchEUImplementationsInput
): Promise<ToolResponse<SearchEUImplementationsResult>> {
  return {
    results: {
      results: [],
      total_results: 0,
      query_info: input,
    },
    _meta: {
      ...generateResponseMetadata(db),
      note: 'data-source-unavailable: EU/EEA reference data requires a dedicated ingestion pass that is not yet configured for Norwegian Law MCP v0.1. This tool is not active in the current tool registry.',
    },
  };
}
