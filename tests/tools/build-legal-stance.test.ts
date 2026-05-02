import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from '@ansvar/mcp-sqlite';
import { buildLegalStance } from '../../src/tools/build-legal-stance.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('build_legal_stance', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should aggregate citations from multiple sources', async () => {
    const response = await buildLegalStance(db, { query: 'personuppgifter' });

    expect(response.results.query).toBe('personuppgifter');
    expect(response.results.provisions.length).toBeGreaterThan(0);
    expect(response.results.case_law.length).toBeGreaterThan(0);
    expect(response.results.total_citations).toBeGreaterThan(0);
    expect(response.results.total_citations).toBe(
      response.results.provisions.length + response.results.case_law.length + response.results.preparatory_works.length
    );
  });

  it('should filter provisions by document_id', async () => {
    const response = await buildLegalStance(db, {
      query: 'personuppgifter',
      document_id: '2018:218',
    });

    for (const prov of response.results.provisions) {
      expect(prov.document_id).toBe('2018:218');
    }
  });

  it('should exclude case law when requested', async () => {
    const response = await buildLegalStance(db, {
      query: 'personuppgifter',
      include_case_law: false,
    });

    expect(response.results.case_law).toEqual([]);
  });

  it('should exclude preparatory works when requested', async () => {
    const response = await buildLegalStance(db, {
      query: 'personuppgifter',
      include_preparatory_works: false,
    });

    expect(response.results.preparatory_works).toEqual([]);
  });

  it('should respect limit', async () => {
    const response = await buildLegalStance(db, {
      query: 'personuppgifter',
      limit: 1,
    });

    expect(response.results.provisions.length).toBeLessThanOrEqual(1);
    expect(response.results.case_law.length).toBeLessThanOrEqual(1);
  });

  it('should suppress low-signal fallback matches for case law and preparatory works', async () => {
    db.prepare(`
      INSERT INTO legal_documents (id, type, title, status, issued_date)
      VALUES ('2025/26:999', 'bill', 'Hamn- och vindkraftsfrågor', 'in_force', '2025-11-10')
    `).run();

    db.prepare(`
      INSERT INTO preparatory_works (statute_id, prep_document_id, title, summary)
      VALUES ('2018:218', '2025/26:999', 'Ändringsförslag',
        'Propositionen behandlar personuppgifter i hamn- och vindkraftsprojekt.')
    `).run();

    const response = await buildLegalStance(db, {
      query: 'cybersäkerhet personuppgifter',
      include_case_law: true,
      include_preparatory_works: true,
    });

    expect(response.results.case_law).toHaveLength(0);
    expect(response.results.preparatory_works).toHaveLength(0);
  });

  it('should return empty results for empty query', async () => {
    const response = await buildLegalStance(db, { query: '' });

    expect(response.results.provisions).toEqual([]);
    expect(response.results.case_law).toEqual([]);
    expect(response.results.preparatory_works).toEqual([]);
    expect(response.results.total_citations).toBe(0);
  });

  // Regression: parallel coverage to search-case-law.test.ts. The case_law
  // branch of build-legal-stance previously used the same INNER JOIN against
  // legal_documents that hid every production case_law row whose document_id
  // is not in legal_documents. Without this test, a future revert of the
  // LEFT JOIN in build-legal-stance.ts would slip through CI.
  it('should aggregate case_law rows whose document_id is not in legal_documents', async () => {
    db.pragma('foreign_keys = OFF');
    db.prepare(
      `INSERT INTO case_law (document_id, court, case_number, decision_date, summary, keywords)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      'NJA_2024_s200',
      'HD',
      'B 8888-23',
      '2024-04-15',
      'Avgörande om juristkonsultationsplikt utan motsvarande post i legal_documents.',
      'juristkonsultationsplikt regression case_law join'
    );
    db.pragma('foreign_keys = ON');

    const response = await buildLegalStance(db, {
      query: 'juristkonsultationsplikt',
      include_provisions: false,
      include_preparatory_works: false,
    });
    const orphan = response.results.case_law.find(c => c.document_id === 'NJA_2024_s200');
    expect(orphan).toBeDefined();
    expect(orphan?.court).toBe('HD');
    expect(orphan?.title).toBeTruthy();
  });

  it('should apply as_of_date to historical retrieval', async () => {
    const response = await buildLegalStance(db, {
      query: 'Datainspektionen',
      document_id: '2018:218',
      as_of_date: '2019-06-01',
      include_case_law: false,
      include_preparatory_works: false,
    });

    expect(response.results.as_of_date).toBe('2019-06-01');
    expect(response.results.provisions.length).toBeGreaterThan(0);
    expect(response.results.provisions[0].provision_ref).toBe('3:1');
  });
});
