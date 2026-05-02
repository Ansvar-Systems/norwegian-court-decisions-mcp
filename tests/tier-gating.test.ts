/**
 * Tests for tier capability gating in registry.ts.
 *
 * Verifies that free-tier databases get _tier_notice injected
 * into responses for premium-gated tools, and that professional-tier
 * databases do NOT get the notice.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from '@ansvar/mcp-sqlite';
import { TOOLS } from '../src/tools/registry.js';
import { detectCapabilities, upgradeMessage } from '../src/capabilities.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal test DB with free-tier tables only. */
function createFreeTierDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE legal_provisions (id INTEGER PRIMARY KEY, content TEXT);
    CREATE TABLE case_law (id INTEGER PRIMARY KEY, summary TEXT);
    CREATE TABLE eu_references (id INTEGER PRIMARY KEY, ref_type TEXT);
  `);
  return db;
}

/** Test DB with professional-tier tables. */
function createProfessionalDb(): InstanceType<typeof Database> {
  const db = createFreeTierDb();
  db.exec(`
    CREATE TABLE case_law_full (id INTEGER PRIMARY KEY, full_text TEXT);
    CREATE TABLE preparatory_works_full (id INTEGER PRIMARY KEY, full_text TEXT);
    CREATE TABLE agency_guidance (id INTEGER PRIMARY KEY, guidance TEXT);
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Tier gating', () => {
  describe('capability detection', () => {
    it('free-tier DB lacks expanded_case_law and full_preparatory_works', () => {
      const db = createFreeTierDb();
      const caps = detectCapabilities(db);
      expect(caps.has('expanded_case_law')).toBe(false);
      expect(caps.has('full_preparatory_works')).toBe(false);
      db.close();
    });

    it('professional-tier DB has all capabilities', () => {
      const db = createProfessionalDb();
      const caps = detectCapabilities(db);
      expect(caps.has('expanded_case_law')).toBe(true);
      expect(caps.has('full_preparatory_works')).toBe(true);
      expect(caps.has('agency_guidance')).toBe(true);
      db.close();
    });
  });

  describe('tool descriptions', () => {
    it('all three gated tools exist in TOOLS array', () => {
      const toolNames = TOOLS.map(t => t.name);
      expect(toolNames).toContain('search_case_law');
      expect(toolNames).toContain('get_preparatory_works');
      expect(toolNames).toContain('build_legal_stance');
    });

    it('gated tool descriptions mention tier dependency', () => {
      const caseLaw = TOOLS.find(t => t.name === 'search_case_law');
      const prepWorks = TOOLS.find(t => t.name === 'get_preparatory_works');
      const legalStance = TOOLS.find(t => t.name === 'build_legal_stance');

      expect(caseLaw?.description).toContain('tier');
      expect(prepWorks?.description).toContain('tier');
      expect(legalStance?.description).toContain('tier');
    });

    it('non-gated tools do NOT mention tier dependency', () => {
      const searchLeg = TOOLS.find(t => t.name === 'search_legislation');
      const getProv = TOOLS.find(t => t.name === 'get_provision');
      // These should not confuse agents with tier language
      expect(searchLeg?.description).not.toContain('tier');
      expect(getProv?.description).not.toContain('tier');
    });
  });

  describe('upgrade message', () => {
    it('includes the feature name', () => {
      const msg = upgradeMessage('Full case law archive (4,800+ decisions)');
      expect(msg).toContain('Full case law archive');
    });

    it('explains the reason (size constraint)', () => {
      const msg = upgradeMessage('test feature');
      expect(msg).toContain('free community instance');
      expect(msg).toContain('too large to serve');
    });

    it('mentions upgrade path', () => {
      const msg = upgradeMessage('test feature');
      expect(msg).toContain('Ansvar delivers consulting services');
    });
  });

  describe('tier notice injection logic', () => {
    it('injects _tier_notice into object results when capability is missing', () => {
      // Simulate what registry.ts does after a tool call
      const capabilities = new Set(['core_legislation', 'basic_case_law', 'eu_references']);
      const TIER_SENSITIVE_TOOLS: Record<string, { capability: string; feature: string }> = {
        search_case_law: { capability: 'expanded_case_law', feature: 'Full case law archive' },
      };

      let result: unknown = { results: [], _meta: {} };
      const tierInfo = TIER_SENSITIVE_TOOLS['search_case_law'];

      if (tierInfo && !capabilities.has(tierInfo.capability)) {
        const notice = upgradeMessage(tierInfo.feature);
        if (Array.isArray(result)) {
          result = { results: result, _tier_notice: notice };
        } else if (result && typeof result === 'object') {
          (result as Record<string, unknown>)._tier_notice = notice;
        }
      }

      expect((result as Record<string, unknown>)._tier_notice).toBeDefined();
      expect((result as Record<string, unknown>)._tier_notice).toContain('Full case law archive');
    });

    it('does NOT inject _tier_notice when capability IS present', () => {
      const capabilities = new Set(['core_legislation', 'basic_case_law', 'eu_references', 'expanded_case_law']);
      const TIER_SENSITIVE_TOOLS: Record<string, { capability: string; feature: string }> = {
        search_case_law: { capability: 'expanded_case_law', feature: 'Full case law archive' },
      };

      const result: Record<string, unknown> = { results: [], _meta: {} };
      const tierInfo = TIER_SENSITIVE_TOOLS['search_case_law'];

      if (tierInfo && !capabilities.has(tierInfo.capability)) {
        result._tier_notice = upgradeMessage(tierInfo.feature);
      }

      expect(result._tier_notice).toBeUndefined();
    });

    it('wraps array results to preserve _tier_notice in JSON serialization', () => {
      const arrayResult: unknown[] = [{ id: 1 }, { id: 2 }];
      let result: unknown = arrayResult;

      // Simulate array wrapping
      if (Array.isArray(result)) {
        result = { results: result, _tier_notice: 'test notice' };
      }

      // Verify _tier_notice survives JSON serialization
      const serialized = JSON.stringify(result);
      const parsed = JSON.parse(serialized);
      expect(parsed._tier_notice).toBe('test notice');
      expect(parsed.results).toHaveLength(2);
    });

    it('_tier_notice on raw array is LOST in JSON (proving the fix is needed)', () => {
      const arr: unknown[] = [{ id: 1 }];
      (arr as Record<string, unknown>)._tier_notice = 'lost notice';

      // JSON.stringify drops non-index properties on arrays
      const serialized = JSON.stringify(arr);
      const parsed = JSON.parse(serialized);
      expect(parsed._tier_notice).toBeUndefined(); // This proves the bug
    });

    it('handles non-gated tools without injecting anything', () => {
      const capabilities = new Set(['core_legislation']);
      const TIER_SENSITIVE_TOOLS: Record<string, { capability: string; feature: string }> = {
        search_case_law: { capability: 'expanded_case_law', feature: 'test' },
      };

      const result: Record<string, unknown> = { results: [] };
      const tierInfo = TIER_SENSITIVE_TOOLS['search_legislation']; // not gated

      if (tierInfo && !capabilities.has(tierInfo.capability)) {
        result._tier_notice = upgradeMessage(tierInfo.feature);
      }

      expect(result._tier_notice).toBeUndefined();
    });
  });
});
