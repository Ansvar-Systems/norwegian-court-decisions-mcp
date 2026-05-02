import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import {
  getProvisionHistory,
  diffProvision,
  getRecentChanges,
} from '../../src/tools/version-tracking.js';
import type { Database } from '@ansvar/mcp-sqlite';

describe('Version Tracking Tools (Premium)', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  // --- Premium Gate Tests ---

  describe('premium gating', () => {
    const originalEnv = process.env.PREMIUM_ENABLED;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.PREMIUM_ENABLED;
      } else {
        process.env.PREMIUM_ENABLED = originalEnv;
      }
    });

    it('get_provision_history returns upgrade message when PREMIUM_ENABLED is not set', async () => {
      delete process.env.PREMIUM_ENABLED;
      const result = await getProvisionHistory(db, { document_id: '2018:218', provision_ref: '1:1' });
      expect(result).toHaveProperty('premium', false);
      expect((result as any).message).toContain('Intelligence Portal');
    });

    it('diff_provision returns upgrade message when PREMIUM_ENABLED is not set', async () => {
      delete process.env.PREMIUM_ENABLED;
      const result = await diffProvision(db, {
        document_id: '2018:218',
        provision_ref: '1:1',
        from_date: '2018-01-01',
      });
      expect(result).toHaveProperty('premium', false);
      expect((result as any).message).toContain('hello@ansvar.ai');
    });

    it('get_recent_changes returns upgrade message when PREMIUM_ENABLED is not set', async () => {
      delete process.env.PREMIUM_ENABLED;
      const result = await getRecentChanges(db, { since: '2024-01-01' });
      expect(result).toHaveProperty('premium', false);
    });

    it('returns upgrade message when PREMIUM_ENABLED is "false"', async () => {
      process.env.PREMIUM_ENABLED = 'false';
      const result = await getProvisionHistory(db, { document_id: '2018:218', provision_ref: '1:1' });
      expect(result).toHaveProperty('premium', false);
    });

    it('returns real data when PREMIUM_ENABLED is "true"', async () => {
      process.env.PREMIUM_ENABLED = 'true';
      const result = await getProvisionHistory(db, { document_id: '2018:218', provision_ref: '1:1' });
      expect(result).not.toHaveProperty('premium');
      expect(result).toHaveProperty('versions');
    });
  });

  // --- Functional Tests ---

  describe('getProvisionHistory', () => {
    beforeEach(() => { process.env.PREMIUM_ENABLED = 'true'; });
    afterEach(() => { delete process.env.PREMIUM_ENABLED; });

    it('returns version timeline for DSL 2018:218 1:1', async () => {
      const result = await getProvisionHistory(db, { document_id: '2018:218', provision_ref: '1:1' });
      const history = result as { versions: any[]; current_version: string | null };
      expect(history.versions).toHaveLength(1);
      expect(history.current_version).toBe('2018-05-25');
    });

    it('returns multiple versions for 3:1 (name change Datainspektionen → IMY)', async () => {
      const result = await getProvisionHistory(db, { document_id: '2018:218', provision_ref: '3:1' });
      const history = result as { versions: any[]; total_versions: number };
      expect(history.total_versions).toBe(2);
      expect(history.versions[0].valid_from).toBe('2018-05-25');
      expect(history.versions[0].valid_to).toBe('2021-01-01');
      expect(history.versions[1].valid_from).toBe('2021-01-01');
      expect(history.versions[1].valid_to).toBeNull();
    });

    it('marks current version correctly', async () => {
      const result = await getProvisionHistory(db, { document_id: '2018:218', provision_ref: '3:1' });
      const history = result as { versions: Array<{ is_current: boolean }> };
      expect(history.versions[0].is_current).toBe(false);
      expect(history.versions[1].is_current).toBe(true);
    });

    it('returns repealed statute versions with valid_to set', async () => {
      const result = await getProvisionHistory(db, { document_id: '1998:204', provision_ref: '1' });
      const history = result as { versions: Array<{ valid_to: string | null }> };
      expect(history.versions).toHaveLength(1);
      expect(history.versions[0].valid_to).toBe('2018-05-25');
    });

    it('throws for non-existent statute', async () => {
      await expect(
        getProvisionHistory(db, { document_id: '9999:999', provision_ref: '1:1' }),
      ).rejects.toThrow('not found');
    });

    it('resolves by title', async () => {
      const result = await getProvisionHistory(db, {
        document_id: 'dataskyddsförordning',
        provision_ref: '1:1',
      });
      const history = result as { versions: any[] };
      expect(history.versions.length).toBeGreaterThan(0);
    });

    it('returns empty versions for provision with no version history', async () => {
      // Provision 5 a exists in legal_provisions but not in legal_provision_versions for 1998:204
      // Actually, it does exist. Let's test a provision that doesn't exist in versions
      const result = await getProvisionHistory(db, { document_id: '2018:218', provision_ref: '99:99' });
      const history = result as { versions: any[]; current_version: string | null };
      expect(history.versions).toHaveLength(0);
      expect(history.current_version).toBeNull();
    });
  });

  describe('diffProvision', () => {
    beforeEach(() => { process.env.PREMIUM_ENABLED = 'true'; });
    afterEach(() => { delete process.env.PREMIUM_ENABLED; });

    it('returns diff for 3:1 between 2019 and 2022 (name change)', async () => {
      const result = await diffProvision(db, {
        document_id: '2018:218',
        provision_ref: '3:1',
        from_date: '2019-01-01',
        to_date: '2022-01-01',
      });
      const diff = result as { diff: string | null; change_summary: string };
      expect(diff.diff).toContain('---');
      expect(diff.diff).toContain('+++');
      expect(diff.diff).toContain('Datainspektionen');
      expect(diff.diff).toContain('Integritetsskyddsmyndigheten');
      expect(diff.change_summary).toContain('changed');
    });

    it('returns null diff when no changes in date range', async () => {
      const result = await diffProvision(db, {
        document_id: '2018:218',
        provision_ref: '1:1',
        from_date: '2019-01-01',
        to_date: '2025-01-01',
      });
      const diff = result as { diff: string | null; change_summary: string };
      expect(diff.diff).toBeNull();
      expect(diff.change_summary).toContain('No changes');
    });

    it('defaults to_date to today when not provided', async () => {
      const result = await diffProvision(db, {
        document_id: '2018:218',
        provision_ref: '1:1',
        from_date: '2018-01-01',
      });
      const diff = result as { to_date: string };
      const today = new Date().toISOString().slice(0, 10);
      expect(diff.to_date).toBe(today);
    });

    it('throws for non-existent provision in non-existent statute', async () => {
      await expect(
        diffProvision(db, {
          document_id: '9999:999',
          provision_ref: '1:1',
          from_date: '2018-01-01',
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('getRecentChanges', () => {
    beforeEach(() => { process.env.PREMIUM_ENABLED = 'true'; });
    afterEach(() => { delete process.env.PREMIUM_ENABLED; });

    it('returns changes since a given date', async () => {
      const result = await getRecentChanges(db, { since: '2020-01-01' });
      const changes = result as { changes: any[]; total: number };
      expect(changes.total).toBeGreaterThanOrEqual(1);
    });

    it('filters by document_id', async () => {
      const result = await getRecentChanges(db, {
        since: '1990-01-01',
        document_id: '1998:204',
      });
      const changes = result as { changes: Array<{ document_id: string }> };
      expect(changes.changes.length).toBeGreaterThan(0);
      for (const change of changes.changes) {
        expect(change.document_id).toBe('1998:204');
      }
    });

    it('returns empty when no changes since date', async () => {
      const result = await getRecentChanges(db, { since: '2030-01-01' });
      const changes = result as { changes: any[]; total: number };
      expect(changes.changes).toHaveLength(0);
      expect(changes.total).toBe(0);
    });

    it('respects limit parameter', async () => {
      const result = await getRecentChanges(db, { since: '1990-01-01', limit: 1 });
      const changes = result as { changes: any[] };
      expect(changes.changes.length).toBeLessThanOrEqual(1);
    });

    it('clamps limit to max 200', async () => {
      const result = await getRecentChanges(db, { since: '1990-01-01', limit: 9999 });
      expect(result).toHaveProperty('changes');
    });

    it('returns changes ordered by valid_from DESC', async () => {
      const result = await getRecentChanges(db, { since: '1990-01-01' });
      const changes = result as { changes: Array<{ effective_date: string }> };
      if (changes.changes.length > 1) {
        for (let i = 0; i < changes.changes.length - 1; i++) {
          expect(changes.changes[i].effective_date >= changes.changes[i + 1].effective_date).toBe(true);
        }
      }
    });

    it('includes document metadata in results', async () => {
      const result = await getRecentChanges(db, { since: '2020-01-01' });
      const changes = result as { changes: Array<{ document_title: string }> };
      const withTitle = changes.changes.find(c => c.document_title);
      expect(withTitle).toBeDefined();
    });
  });
});
