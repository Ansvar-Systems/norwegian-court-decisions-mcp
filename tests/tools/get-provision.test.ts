import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from '@ansvar/mcp-sqlite';
import DatabaseConstructor from '@ansvar/mcp-sqlite';
import { getProvision } from '../../src/tools/get-provision.js';
import { normalizeProvisionRef } from '../../src/utils/statute-id.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('get_provision', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should get a specific provision by chapter and section', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      chapter: '1',
      section: '1',
    });

    expect(response.results).not.toBeNull();
    expect(response.results).not.toBeInstanceOf(Array);
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.provision_ref).toBe('1:1');
    expect(prov.content).toContain('dataskyddsförordning');
    expect(prov.title).toBe('Lagens syfte');
  });

  it('should get a provision by provision_ref directly', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      provision_ref: '3:1',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.provision_ref).toBe('3:1');
    expect(prov.title).toBe('Tillsynsmyndighet');
  });

  it('should get a flat statute provision', async () => {
    const response = await getProvision(db, {
      document_id: '1998:204',
      section: '5 a',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.provision_ref).toBe('5 a');
    expect(prov.title).toBe('Missbruksregeln');
    expect(prov.content).toContain('personuppgifter');
  });

  it('should return all provisions when no specific one requested', async () => {
    const response = await getProvision(db, { document_id: '2018:218' });

    expect(Array.isArray(response.results)).toBe(true);
    const provisions = response.results as Array<unknown>;
    expect(provisions.length).toBe(8); // 8 sample provisions for 2018:218
  });

  it('should return null for non-existent provision', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      provision_ref: '99:99',
    });

    expect(response.results).toBeNull();
  });

  it('should include cross-references', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      provision_ref: '1:1',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.cross_references).toBeDefined();
    expect(prov.cross_references.length).toBeGreaterThan(0);
  });

  it('should throw for missing document_id', async () => {
    await expect(
      getProvision(db, { document_id: '' })
    ).rejects.toThrow('document_id is required');
  });

  it('should return historical text when as_of_date is provided', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      provision_ref: '3:1',
      as_of_date: '2019-06-01',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.content).toContain('Datainspektionen');
    expect(prov.valid_to).toBe('2021-01-01');
  });

  it('should return null when provision is outside historical validity window', async () => {
    const response = await getProvision(db, {
      document_id: '1998:204',
      provision_ref: '1',
      as_of_date: '2020-01-01',
    });

    expect(response.results).toBeNull();
  });

  it('should resolve document by short_name', async () => {
    const response = await getProvision(db, {
      document_id: 'DSL',
      provision_ref: '1:1',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.document_id).toBe('2018:218');
    expect(prov.provision_ref).toBe('1:1');
  });

  it('should resolve document by SFS prefix', async () => {
    const response = await getProvision(db, {
      document_id: 'SFS 2018:218',
      provision_ref: '1:1',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.document_id).toBe('2018:218');
  });

  it('should resolve document by partial title match', async () => {
    const response = await getProvision(db, {
      document_id: 'Personuppgiftslag',
      provision_ref: '1',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.document_id).toBe('1998:204');
  });

  it('should resolve document by colloquial name', async () => {
    const response = await getProvision(db, {
      document_id: 'dataskyddslagen',
      provision_ref: '1:1',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.document_id).toBe('2018:218');
    expect(prov.provision_ref).toBe('1:1');
  });

  it('should normalize Swedish provision_ref format', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      provision_ref: '1 kap. 1 §',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.provision_ref).toBe('1:1');
    expect(prov.content).toContain('dataskyddsförordning');
  });

  it('should normalize flat provision_ref format', async () => {
    const response = await getProvision(db, {
      document_id: '1998:204',
      provision_ref: '5 a §',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.provision_ref).toBe('5 a');
  });

  it('should return null for unresolvable document_id', async () => {
    const response = await getProvision(db, {
      document_id: 'nonexistent-law',
    });

    expect(response.results).toBeNull();
  });
});

describe('normalizeProvisionRef', () => {
  it('should pass through canonical format', () => {
    expect(normalizeProvisionRef('3:5')).toBe('3:5');
    expect(normalizeProvisionRef('1:1')).toBe('1:1');
    expect(normalizeProvisionRef('5')).toBe('5');
    expect(normalizeProvisionRef('5 a')).toBe('5 a');
  });

  it('should convert chaptered Swedish format', () => {
    expect(normalizeProvisionRef('1 kap. 1 §')).toBe('1:1');
    expect(normalizeProvisionRef('3 kap. 5 §')).toBe('3:5');
    expect(normalizeProvisionRef('3 kap. 5 a §')).toBe('3:5 a');
  });

  it('should convert flat Swedish format', () => {
    expect(normalizeProvisionRef('5 §')).toBe('5');
    expect(normalizeProvisionRef('5 a §')).toBe('5 a');
  });

  it('should handle whitespace', () => {
    expect(normalizeProvisionRef('  3 kap. 5 §  ')).toBe('3:5');
    expect(normalizeProvisionRef('  5 §  ')).toBe('5');
  });
});

describe('get_provision truncation cap', () => {
  let largeDb: Database;

  beforeAll(() => {
    largeDb = new DatabaseConstructor(':memory:');
    largeDb.pragma('foreign_keys = ON');
    largeDb.exec(`
      CREATE TABLE legal_documents (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL,
        title_en TEXT, short_name TEXT,
        status TEXT NOT NULL DEFAULT 'in_force',
        issued_date TEXT, in_force_date TEXT, url TEXT, description TEXT, last_updated TEXT
      );
      CREATE TABLE legal_provisions (
        id INTEGER PRIMARY KEY, document_id TEXT NOT NULL REFERENCES legal_documents(id),
        provision_ref TEXT NOT NULL, chapter TEXT, section TEXT NOT NULL,
        title TEXT, content TEXT NOT NULL, metadata TEXT,
        UNIQUE(document_id, provision_ref)
      );
      CREATE TABLE cross_references (
        id INTEGER PRIMARY KEY, source_document_id TEXT, source_provision_ref TEXT,
        target_document_id TEXT, target_provision_ref TEXT,
        ref_type TEXT NOT NULL DEFAULT 'references'
      );
    `);

    // Insert a large statute with 150 provisions (exceeds 100 cap)
    largeDb.exec(`
      INSERT INTO legal_documents VALUES (
        '1962:700', 'statute', 'Brottsbalken', 'Criminal Code', 'BrB',
        'in_force', '1962-12-21', '1965-01-01', NULL, NULL, NULL
      );
    `);

    const insertProv = largeDb.prepare(`
      INSERT INTO legal_provisions (document_id, provision_ref, chapter, section, title, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (let i = 1; i <= 150; i++) {
      const chapter = String(Math.ceil(i / 10));
      const section = String(((i - 1) % 10) + 1);
      insertProv.run('1962:700', `${chapter}:${section}`, chapter, section, `Section ${i}`, `Content of provision ${i} in Brottsbalken.`);
    }
  });

  afterAll(() => {
    if (largeDb) largeDb.close();
  });

  it('should cap results at 100 provisions when returning all', async () => {
    const response = await getProvision(largeDb, { document_id: '1962:700' });

    expect(Array.isArray(response.results)).toBe(true);
    const provisions = response.results as Array<unknown>;
    expect(provisions.length).toBe(100);
  });

  it('should include _truncated flag when results are capped', async () => {
    const response = await getProvision(largeDb, { document_id: '1962:700' });

    expect((response as Record<string, unknown>)._truncated).toBe(true);
    expect((response as Record<string, unknown>)._hint).toContain('chapter+section');
  });

  it('should NOT truncate when below cap', async () => {
    // Add a small statute
    largeDb.exec(`
      INSERT OR IGNORE INTO legal_documents VALUES (
        '2020:1', 'statute', 'Test Statute', NULL, NULL,
        'in_force', '2020-01-01', '2020-01-01', NULL, NULL, NULL
      );
      INSERT OR IGNORE INTO legal_provisions (document_id, provision_ref, chapter, section, title, content)
      VALUES ('2020:1', '1:1', '1', '1', 'Test', 'Test content.');
    `);

    const response = await getProvision(largeDb, { document_id: '2020:1' });

    expect(Array.isArray(response.results)).toBe(true);
    const provisions = response.results as Array<unknown>;
    expect(provisions.length).toBe(1);
    expect((response as Record<string, unknown>)._truncated).toBeUndefined();
  });

  it('should still return specific provisions without truncation', async () => {
    const response = await getProvision(largeDb, {
      document_id: '1962:700',
      chapter: '15',
      section: '10',
    });

    expect(response.results).not.toBeNull();
    expect(Array.isArray(response.results)).toBe(false);
  });
});
