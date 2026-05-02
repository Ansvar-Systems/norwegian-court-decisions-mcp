/**
 * Contract tests for Norwegian Law MCP.
 *
 * TODO: Most tests are skipped until the database is populated via ingestion.
 *       Re-enable by removing .skip after running scripts/ingest-lovdata.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import Database from '@ansvar/mcp-sqlite';
import { registerTools } from '../../src/tools/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ToolResult {
  tool: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

async function callTool(
  mcpClient: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const result = await mcpClient.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content?.[0]?.text ?? '';
    if (result.isError) {
      return { tool: name, ok: false, error: { code: 'TOOL_ERROR', message: text } };
    }
    try {
      const data = JSON.parse(text);
      return { tool: name, ok: true, data };
    } catch {
      return { tool: name, ok: true, data: text };
    }
  } catch (err) {
    return { tool: name, ok: false, error: { code: 'CALL_ERROR', message: (err as Error).message } };
  }
}

// ---------------------------------------------------------------------------
// Norwegian smoke tests
// ---------------------------------------------------------------------------

describe('Norwegian Law MCP — citation triple smoke test', () => {
  let mcpClient: Client;
  let db: InstanceType<typeof Database>;

  const dbPath =
    process.env['NORWEGIAN_LAW_DB_PATH'] ?? join(__dirname, '..', '..', 'data', 'database.db');

  const dbExists = existsSync(dbPath);

  beforeAll(async () => {
    if (!dbExists) return;
    try { rmdirSync(dbPath + '.lock'); } catch { /* ignore */ }
    try { rmSync(dbPath + '-wal', { force: true }); } catch { /* ignore */ }
    try { rmSync(dbPath + '-shm', { force: true }); } catch { /* ignore */ }
    db = new Database(dbPath, { readonly: true });
    db.pragma('foreign_keys = ON');
    const server = new Server({ name: 'norwegian-law-test', version: '0.0.0' }, { capabilities: { tools: {} } });
    registerTools(server, db);
    mcpClient = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);
  }, 30_000);

  afterAll(() => { db?.close(); });

  it.skip(
    'search_legislation("personopplysninger") returns results with valid _citation triple (publisher=lovdata.no, license=NLOD-2.0)',
    // TODO: Remove .skip after ingestion. Verifies:
    // - publisher === "lovdata.no"
    // - license === "NLOD-2.0"
    // - source_url matches https://lovdata.no/dokument/NL/lov/...
    async () => {
      if (!dbExists) return;
      const result = await callTool(mcpClient, 'search_legislation', { query: 'personopplysninger', limit: 5 });
      expect(result.ok).toBe(true);
      const data = result.data as { results?: unknown[] };
      expect((data.results ?? []).length).toBeGreaterThan(0);
      const fullText = JSON.stringify(data);
      expect(fullText).toContain('lovdata.no');
      expect(fullText).toContain('NLOD-2.0');
    }
  );

  it.skip(
    'get_provision("LOV-2018-06-15-38", section="13") returns valid _citation with lovdata.no URL containing /§13',
    // TODO: Remove .skip after ingestion.
    async () => {
      if (!dbExists) return;
      const result = await callTool(mcpClient, 'get_provision', { document_id: 'LOV-2018-06-15-38', section: '13' });
      expect(result.ok).toBe(true);
      const data = result.data as Record<string, unknown>;
      const citation = data._citation as Record<string, string> | undefined;
      expect(citation).toBeDefined();
      expect(citation?.publisher).toBe('lovdata.no');
      expect(citation?.license).toBe('NLOD-2.0');
      expect(citation?.source_url).toMatch(/lovdata\.no\/dokument\/NL\/lov\//);
      expect(citation?.source_url).toContain('/§13');
    }
  );
});

// ---------------------------------------------------------------------------
// Fixture-driven tests (runs when fixtures/golden-tests.json exists)
// ---------------------------------------------------------------------------

const fixturesPath = join(__dirname, '..', '..', 'fixtures', 'golden-tests.json');
if (existsSync(fixturesPath)) {
  const fixture = JSON.parse(readFileSync(fixturesPath, 'utf-8'));
  describe(`Contract tests: ${fixture.mcp_name}`, () => {
    for (const test of fixture.tests) {
      it.skip(`[${test.id}] ${test.description}`, () => {
        // Fixture-driven tests activated post-ingestion
      });
    }
  });
}
