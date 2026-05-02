#!/usr/bin/env node
/**
 * Norwegian Court Decisions MCP Server (stdio transport)
 *
 * Provides tools for querying Norwegian Supreme Court (Høyesterett) decisions.
 * Covers post-2021 anonymized decisions published on domstol.no.
 *
 * Zero-hallucination: never generates citations, only returns verified database entries.
 *
 * Tool definitions are in src/tools/registry.ts — the single source of truth
 * shared between stdio (this file) and HTTP (api/mcp.ts) transports.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import type { AboutContext } from './tools/about.js';
import { registerTools } from './tools/registry.js';
import {
  detectCapabilities,
  readDbMetadata,
  type Capability,
  type DbMetadata,
} from './capabilities.js';

const SERVER_NAME = 'norwegian-court-decisions';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_PATH = path.join(__dirname, '..', 'package.json');
const pkgVersion: string = JSON.parse(readFileSync(PKG_PATH, 'utf-8')).version;

const DB_ENV_VAR = 'NORWEGIAN_COURT_DB_PATH';
const DEFAULT_DB_PATH = '../data/database.db';

let dbInstance: InstanceType<typeof Database> | null = null;
let serverCapabilities: Set<Capability> | null = null;
let serverMetadata: DbMetadata | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!dbInstance) {
    const dbPath = process.env[DB_ENV_VAR] || getDefaultDbPath();
    console.error(`[${SERVER_NAME}] Opening database: ${dbPath}`);
    dbInstance = new Database(dbPath, { readonly: true });
    dbInstance.pragma('foreign_keys = ON');
    console.error(`[${SERVER_NAME}] Database opened successfully`);

    // Detect capabilities on first open
    serverCapabilities = detectCapabilities(dbInstance);
    serverMetadata = readDbMetadata(dbInstance);
    console.error(`[${SERVER_NAME}] Tier: ${serverMetadata.tier}`);
    console.error(`[${SERVER_NAME}] Capabilities: ${[...serverCapabilities].join(', ')}`);
  }
  return dbInstance;
}

export function getCapabilities(): Set<Capability> {
  if (!serverCapabilities) {
    getDb(); // triggers detection
  }
  return serverCapabilities!;
}

export function getMetadata(): DbMetadata {
  if (!serverMetadata) {
    getDb(); // triggers detection
  }
  return serverMetadata!;
}

function getDefaultDbPath(): string {
  return path.resolve(__dirname, DEFAULT_DB_PATH);
}

function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.error(`[${SERVER_NAME}] Database closed`);
  }
}

function computeAboutContext(): AboutContext {
  let fingerprint = 'unknown';
  let dbBuilt = new Date().toISOString();
  try {
    const dbPath = process.env[DB_ENV_VAR] || getDefaultDbPath();
    const dbBuffer = readFileSync(dbPath);
    fingerprint = createHash('sha256').update(dbBuffer).digest('hex').slice(0, 12);
    const dbStat = statSync(dbPath);
    dbBuilt = dbStat.mtime.toISOString();
  } catch {
    // Non-fatal
  }
  return { version: pkgVersion, fingerprint, dbBuilt };
}

const aboutContext = computeAboutContext();

const server = new Server(
  { name: SERVER_NAME, version: pkgVersion },
  { capabilities: { tools: {}, resources: {} } }
);

// Register tools from the shared registry (single source of truth for both transports)
registerTools(server, getDb(), aboutContext);

// Resources (stdio-only — HTTP transport doesn't support resources yet)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  console.error(`[${SERVER_NAME}] ListResources request received`);
  return {
    resources: [
      {
        uri: 'case-law-stats://norwegian-court-decisions-mcp/metadata',
        name: 'Court Decisions Statistics',
        description: 'Metadata about court decision data freshness and coverage',
        mimeType: 'application/json',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  console.error(`[${SERVER_NAME}] ReadResource: ${uri}`);

  if (uri === 'case-law-stats://norwegian-court-decisions-mcp/metadata') {
    try {
      const db = getDb();

      // Check if sync metadata table exists
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='case_law_sync_metadata'
      `).get();

      if (!tableExists) {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  status: 'no_data',
                  message: 'No case law data has been synced yet. Run npm run sync:cases to fetch case law from lagen.nu.',
                  last_sync_date: null,
                  last_decision_date: null,
                  total_cases: 0,
                  cases_by_court: {},
                  source: {
                    name: 'lagen.nu',
                    url: 'https://lagen.nu',
                    license: 'Creative Commons Attribution',
                    attribution: 'Case law from lagen.nu, licensed CC-BY Domstolsverket',
                  },
                  update_frequency: 'weekly',
                  coverage: '1993-present (varies by court)',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Get sync metadata
      const syncMeta = db.prepare(`
        SELECT last_sync_date, last_decision_date, cases_count, source
        FROM case_law_sync_metadata
        WHERE id = 1
      `).get() as
        | { last_sync_date: string; last_decision_date: string | null; cases_count: number; source: string }
        | undefined;

      // Get total case count
      const totalRow = db.prepare('SELECT COUNT(*) as count FROM case_law').get() as { count: number };
      const totalCases = totalRow.count;

      // Get cases by court
      const courtCounts = db.prepare(`
        SELECT court, COUNT(*) as count
        FROM case_law
        GROUP BY court
        ORDER BY count DESC
      `).all() as { court: string; count: number }[];

      const casesByCourt: Record<string, number> = {};
      for (const row of courtCounts) {
        casesByCourt[row.court] = row.count;
      }

      const stats = {
        last_sync_date: syncMeta?.last_sync_date || new Date().toISOString(),
        last_decision_date: syncMeta?.last_decision_date || null,
        total_cases: totalCases,
        cases_by_court: casesByCourt,
        source: {
          name: syncMeta?.source || 'lagen.nu',
          url: 'https://lagen.nu',
          license: 'Creative Commons Attribution',
          attribution: 'Case law from lagen.nu, licensed CC-BY Domstolsverket',
        },
        update_frequency: 'weekly',
        coverage: '1993-present (varies by court)',
      };

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${SERVER_NAME}] ReadResource failed: ${message}`);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Failed to read case law stats: ${message}` }, null, 2),
          },
        ],
      };
    }
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'text/plain',
        text: `Error: Unknown resource URI "${uri}"`,
      },
    ],
  };
});

async function main(): Promise<void> {
  console.error(`[${SERVER_NAME}] Starting server v${pkgVersion}...`);

  const transport = new StdioServerTransport();

  process.on('SIGINT', () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    closeDb();
    process.exit(0);
  });

  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server started successfully`);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  closeDb();
  process.exit(1);
});
