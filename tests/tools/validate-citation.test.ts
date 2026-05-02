import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from '@ansvar/mcp-sqlite';
import { validateCitationTool } from '../../src/tools/validate-citation.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('validate_citation tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should validate a fully valid citation', async () => {
    const response = await validateCitationTool(db, {
      citation: 'SFS 2018:218 1 kap. 1 §',
    });

    expect(response.results.valid).toBe(true);
    expect(response.results.document_exists).toBe(true);
    expect(response.results.provision_exists).toBe(true);
    expect(response.results.formatted_citation).toContain('2018:218');
    expect(response.results.warnings).toHaveLength(0);
  });

  it('should validate provision-first Swedish citation format', async () => {
    const response = await validateCitationTool(db, {
      citation: '3 kap. 2 § lag (2018:218)',
    });

    expect(response.results.valid).toBe(true);
    expect(response.results.document_exists).toBe(true);
    expect(response.results.provision_exists).toBe(true);
    expect(response.results.formatted_citation).toBe('SFS 2018:218 3 kap. 2 §');
  });

  it('should return warnings for repealed statute', async () => {
    const response = await validateCitationTool(db, {
      citation: 'SFS 1998:204 1 §',
    });

    expect(response.results.document_exists).toBe(true);
    expect(response.results.warnings.some(w => w.includes('repealed'))).toBe(true);
  });

  it('should handle empty citation', async () => {
    const response = await validateCitationTool(db, { citation: '' });

    expect(response.results.valid).toBe(false);
    expect(response.results.warnings).toContain('Empty citation');
  });

  it('should report non-existent document', async () => {
    const response = await validateCitationTool(db, {
      citation: 'SFS 9999:999',
    });

    expect(response.results.valid).toBe(false);
    expect(response.results.document_exists).toBe(false);
  });

  it('should report non-existent provision', async () => {
    const response = await validateCitationTool(db, {
      citation: 'SFS 2018:218 99 kap. 99 §',
    });

    expect(response.results.valid).toBe(false);
    expect(response.results.document_exists).toBe(true);
    expect(response.results.provision_exists).toBe(false);
  });
});
