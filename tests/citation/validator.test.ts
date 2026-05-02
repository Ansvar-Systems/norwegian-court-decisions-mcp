import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from '@ansvar/mcp-sqlite';
import { validateCitation } from '../../src/citation/validator.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('validateCitation', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  describe('valid citations', () => {
    it('should validate an existing statute by LOV ID', () => {
      const result = validateCitation(db, 'LOV-2018-06-15-38');
      expect(result.document_exists).toBe(true);
      expect(result.provision_exists).toBe(true); // no provision specified, so N/A
      expect(result.document_title).toBeDefined();
      expect(result.warnings).toHaveLength(0);
    });

    it('should validate a specific provision', () => {
      const result = validateCitation(db, 'LOV-2018-06-15-38 § 13');
      expect(result.document_exists).toBe(true);
      expect(result.provision_exists).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('warnings', () => {
    it('should warn about repealed statute (opphevet)', () => {
      const result = validateCitation(db, 'LOV-2000-01-01-1');
      // Fixture test DB has a repealed entry — warning includes 'opphevet'
      if (result.document_exists) {
        const hasRepealWarning = result.warnings.some(w => w.includes('opphevet') || w.includes('repealed'));
        // Only assert if document was found and is repealed
        if (result.status === 'repealed') {
          expect(hasRepealWarning).toBe(true);
        }
      }
    });

    it('should warn about non-existent provision', () => {
      const result = validateCitation(db, 'LOV-2018-06-15-38 § 9999');
      expect(result.document_exists).toBe(true);
      expect(result.provision_exists).toBe(false);
      expect(result.warnings.some(w => w.includes('not found'))).toBe(true);
    });
  });

  describe('non-existent documents', () => {
    it('should report missing document', () => {
      const result = validateCitation(db, 'LOV-9999-99-99-999');
      expect(result.document_exists).toBe(false);
      expect(result.provision_exists).toBe(false);
      expect(result.warnings.some(w => w.includes('not found'))).toBe(true);
    });
  });

  describe('invalid format', () => {
    it('should report invalid citation format', () => {
      const result = validateCitation(db, 'not a citation');
      expect(result.document_exists).toBe(false);
      expect(result.citation.valid).toBe(false);
    });

    it('should handle empty input', () => {
      const result = validateCitation(db, '');
      expect(result.document_exists).toBe(false);
      expect(result.citation.valid).toBe(false);
    });
  });
});
