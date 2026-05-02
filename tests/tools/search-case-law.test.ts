import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from '@ansvar/mcp-sqlite';
import { searchCaseLaw } from '../../src/tools/search-case-law.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('search_case_law', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should find case law by keyword', async () => {
    const response = await searchCaseLaw(db, { query: 'personuppgifter' });
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]).toHaveProperty('document_id');
    expect(response.results[0]).toHaveProperty('court');
    expect(response.results[0]).toHaveProperty('summary_snippet');
  });

  it('should filter by court', async () => {
    const response = await searchCaseLaw(db, {
      query: 'personuppgifter',
      court: 'HD',
    });
    for (const r of response.results) {
      expect(r.court).toBe('HD');
    }
  });

  it('should filter by date range', async () => {
    const response = await searchCaseLaw(db, {
      query: 'personuppgifter',
      date_from: '2020-01-01',
    });
    for (const r of response.results) {
      if (r.decision_date) {
        expect(r.decision_date >= '2020-01-01').toBe(true);
      }
    }
  });

  it('should return empty array for empty query', async () => {
    const response = await searchCaseLaw(db, { query: '' });
    expect(response.results).toEqual([]);
  });

  it('should respect limit', async () => {
    const response = await searchCaseLaw(db, {
      query: 'personuppgifter',
      limit: 1,
    });
    expect(response.results.length).toBeLessThanOrEqual(1);
  });

  it('should include attribution metadata in all results', async () => {
    const response = await searchCaseLaw(db, { query: 'personuppgifter' });
    expect(response.results.length).toBeGreaterThan(0);

    for (const result of response.results) {
      expect(result).toHaveProperty('_meta');
      expect(result._meta).toHaveProperty('source');
      expect(result._meta).toHaveProperty('attribution');
      expect(result._meta.source).toBe('lagen.nu');
      expect(result._meta.attribution).toContain('CC-BY Domstolsverket');
    }
  });

  // Regression: production case_law rows often have document_id values
  // (e.g. "NJA_2020_s45") that do not appear in legal_documents. The
  // INNER JOIN previously dropped every such row, returning empty results
  // for every query against the live premium DB even though FTS matched
  // hundreds of cases. Search must surface these rows; title falls back
  // to case_number or document_id when no legal_document is linked.
  it('should return case_law rows whose document_id is not in legal_documents', async () => {
    db.pragma('foreign_keys = OFF');
    db.prepare(
      `INSERT INTO case_law (document_id, court, case_number, decision_date, summary, keywords)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      'NJA_2024_s100',
      'HD',
      'B 9999-23',
      '2024-04-15',
      'Avgörande om regressionsstämning utan motsvarande post i legal_documents.',
      'regression case_law join'
    );
    db.pragma('foreign_keys = ON');

    const response = await searchCaseLaw(db, { query: 'regressionsstämning' });
    const orphan = response.results.find(r => r.document_id === 'NJA_2024_s100');
    expect(orphan).toBeDefined();
    expect(orphan?.court).toBe('HD');
    expect(orphan?.case_number).toBe('B 9999-23');
    expect(orphan?.title).toBeTruthy();
  });
});
