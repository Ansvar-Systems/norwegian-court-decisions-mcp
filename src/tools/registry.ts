/**
 * Tool registry for Norwegian Court Decisions MCP Server.
 * Shared between stdio (index.ts) and HTTP (api/mcp.ts) entry points.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';

import { searchCaseLaw, SearchCaseLawInput } from './search-case-law.js';
import { getDecision, GetDecisionInput } from './get-decision.js';
import { validateCitationTool, ValidateCitationInput } from './validate-citation.js';
import { formatCitationTool, FormatCitationInput } from './format-citation.js';
import { getAbout, type AboutContext } from './about.js';
import { listSources } from './list-sources.js';
import { checkDataFreshness } from './check-data-freshness.js';
import { detectCapabilities } from '../capabilities.js';
export type { AboutContext } from './about.js';

const LIST_SOURCES_TOOL: Tool = {
  name: 'list_sources',
  description: 'List all data sources used by this MCP server with provenance metadata.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const ABOUT_TOOL: Tool = {
  name: 'about',
  description:
    'Server metadata, dataset statistics, freshness, and provenance. ' +
    'Call this to verify data coverage, currency, and content basis before relying on results.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const CHECK_DATA_FRESHNESS_TOOL: Tool = {
  name: 'check_data_freshness',
  description:
    'Returns the corpus build timestamp and per-source last_verified dates with staleness_days against a 7-day threshold (court-decisions feed updates daily). ' +
    'Use this to verify whether the data backing this MCP is current before relying on it for compliance work. ' +
    'For full source provenance, use list_sources; for server statistics, use about.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const TOOLS: Tool[] = [
  {
    name: 'search_case_law',
    description: 'Search Norwegian Supreme Court (Høyesterett) decisions by keyword. FTS5 with BM25 ranking. Post-2021 decisions only (pre-anonymized per domstol.no policy). Returns results with _citation triple (publisher: domstol.no, license: Norwegian-Court-Publication).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'Search query in Norwegian or English. Supports FTS5 syntax.' },
        court: { type: 'string', description: 'Filter by court name (e.g., "Høyesterett" or "Høyesteretts ankeutvalg").' },
        date_from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Earliest decision date (YYYY-MM-DD).' },
        date_to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Latest decision date (YYYY-MM-DD).' },
        limit: { type: 'number', default: 10, minimum: 1, maximum: 50, description: 'Maximum results to return.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_decision',
    description: 'Retrieve a single Norwegian Supreme Court decision by HR case number. Returns full record including main_body summary, legal area, judges, and PDF link. Returns _citation triple.',
    inputSchema: {
      type: 'object',
      properties: {
        case_number: { type: 'string', description: 'HR case number (e.g., "HR-2025-2303-A").' },
      },
      required: ['case_number'],
    },
  },
  {
    name: 'validate_citation',
    description: 'Validate a Norwegian court decision citation. Zero-hallucination enforcer — verifies the case exists in the database.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: { type: 'string', minLength: 1, description: 'Citation to validate (e.g., "HR-2025-2303-A").' },
      },
      required: ['citation'],
    },
  },
  {
    name: 'format_citation',
    description: 'Format a Norwegian court decision citation in standard form.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: { type: 'string', minLength: 1, description: 'Citation to format (e.g., "HR-2025-2303-A").' },
        format: { type: 'string', enum: ['full', 'short', 'pinpoint'], default: 'full', description: 'Output format.' },
      },
      required: ['citation'],
    },
  },
];

export function buildTools(context?: AboutContext): Tool[] {
  return context
    ? [...TOOLS, LIST_SOURCES_TOOL, CHECK_DATA_FRESHNESS_TOOL, ABOUT_TOOL]
    : [...TOOLS, LIST_SOURCES_TOOL, CHECK_DATA_FRESHNESS_TOOL];
}

export function registerTools(
  server: Server,
  db: InstanceType<typeof Database>,
  context?: AboutContext,
): void {
  const allTools = buildTools(context);
  detectCapabilities(db);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_case_law':
          result = await searchCaseLaw(db, args as unknown as SearchCaseLawInput);
          break;
        case 'get_decision':
          result = await getDecision(db, args as unknown as GetDecisionInput);
          break;
        case 'validate_citation':
          result = await validateCitationTool(db, args as unknown as ValidateCitationInput);
          break;
        case 'format_citation':
          result = await formatCitationTool(args as unknown as FormatCitationInput);
          break;
        case 'list_sources':
          result = listSources(db);
          break;
        case 'check_data_freshness':
          result = checkDataFreshness(db, { thresholdDays: 7 });
          break;
        case 'about':
          if (context) {
            result = getAbout(db, context);
          } else {
            return {
              content: [{ type: 'text', text: 'About tool not configured.' }],
              isError: true,
            };
          }
          break;
        default:
          return {
            content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error executing ${name}: ${message}` }],
        isError: true,
      };
    }
  });
}
