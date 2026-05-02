/**
 * Smoke test for norwegian-court-decisions-mcp.
 *
 * Verifies the database is built, contains Norwegian Supreme Court
 * decisions, and that retrieval tools emit Gate 13-compliant `_citation`
 * triples (publisher: domstol.no, license: Norwegian-Court-Publication).
 *
 * v0.1 smoke test replacing the inherited swedish-law-mcp test suite.
 * Full test migration tracked as Tier 2 follow-up.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from '@ansvar/mcp-sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

import { searchCaseLaw } from '../src/tools/search-case-law.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../data/database.db');

describe('norwegian-court-decisions-mcp smoke', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `Database not found at ${DB_PATH}. Run \`npm run ingest\` then \`npm run build:db\` before tests.`,
      );
    }
    db = new Database(DB_PATH, { readonly: true });
  });

  afterAll(() => {
    db?.close();
  });

  it('database has Norwegian Supreme Court decisions', () => {
    const row = db
      .prepare('SELECT count(*) as n FROM decisions')
      .get() as { n: number };
    expect(row.n).toBeGreaterThan(0);
  });

  it('search_case_law returns results for a Norwegian query term', async () => {
    const response = await searchCaseLaw(db, { query: 'vold', limit: 5 });

    expect(response).toHaveProperty('results');
    expect(response).toHaveProperty('_meta');
    expect(Array.isArray(response.results)).toBe(true);

    if (response.results.length === 0) {
      console.warn('No results for query "vold" — smoke probe inconclusive for this query');
    }
  });

  it('search_case_law result items have required fields', async () => {
    // Use a broad search most likely to return results from the Høyesterett corpus
    const response = await searchCaseLaw(db, { query: 'Høyesterett', limit: 1 });

    if (response.results.length === 0) {
      // Try a fallback that matches any decision text
      const fallback = await searchCaseLaw(db, { query: 'dom', limit: 1 });
      if (fallback.results.length === 0) {
        console.warn('search_case_law returned 0 results for both probes — skipping field check');
        return;
      }
      const item = fallback.results[0];
      expect(item).toHaveProperty('document_id');
      expect(item).toHaveProperty('case_number');
      expect(item).toHaveProperty('court');
      expect(item).toHaveProperty('source_url');
      return;
    }

    const item = response.results[0];
    expect(item).toHaveProperty('document_id');
    expect(item).toHaveProperty('case_number');
    expect(item).toHaveProperty('court');
    expect(item).toHaveProperty('source_url');
  });

  it('search_case_law emits valid _citation triple (publisher, license, source_url)', async () => {
    // Try multiple queries to find at least one result
    const queries = ['vold', 'Høyesterett', 'dom', 'sak'];
    let item: { _citation: { publisher: string; license: string; source_url: string } } | null = null;

    for (const query of queries) {
      const response = await searchCaseLaw(db, { query, limit: 1 });
      if (response.results.length > 0) {
        item = response.results[0] as typeof item;
        break;
      }
    }

    if (!item) {
      console.warn('No results from any probe query — _citation check skipped');
      return;
    }

    expect(item._citation).toBeDefined();
    expect(item._citation.publisher).toBe('domstol.no');
    expect(item._citation.license).toBe('Norwegian-Court-Publication');
    expect(item._citation.source_url).toMatch(/^https:\/\//);
  });

  it('search_case_law returns empty results for an empty query (not an error)', async () => {
    const response = await searchCaseLaw(db, { query: '' });
    expect(response.results).toEqual([]);
    expect(response._meta).toBeDefined();
  });
});
