import { describe, it, expect } from 'vitest';
import { formatCitation, formatProvisionRef } from '../../src/citation/formatter.js';
import type { ParsedCitation } from '../../src/types/index.js';

describe('formatCitation', () => {
  describe('statute — full format', () => {
    it('should format statute with document_id only', () => {
      const citation: ParsedCitation = {
        raw: 'LOV-2018-06-15-38', type: 'statute', document_id: 'LOV-2018-06-15-38', valid: true,
      };
      expect(formatCitation(citation, 'full')).toBe('LOV-2018-06-15-38');
    });

    it('should format statute with section only', () => {
      const citation: ParsedCitation = {
        raw: 'LOV-2018-06-15-38 § 13', type: 'statute', document_id: 'LOV-2018-06-15-38',
        section: '13', valid: true,
      };
      expect(formatCitation(citation, 'full')).toBe('LOV-2018-06-15-38 § 13');
    });

    it('should format statute with section and ledd', () => {
      const citation: ParsedCitation = {
        raw: 'LOV-2018-06-15-38 § 13 første ledd', type: 'statute', document_id: 'LOV-2018-06-15-38',
        section: '13', ledd: 1, valid: true,
      };
      expect(formatCitation(citation, 'full')).toBe('LOV-2018-06-15-38 § 13 første ledd');
    });

    it('should format statute with section, ledd, and bokstav', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: 'LOV-2018-06-15-38',
        section: '13', ledd: 1, bokstav: 'a', valid: true,
      };
      expect(formatCitation(citation, 'full')).toBe('LOV-2018-06-15-38 § 13 første ledd bokstav a');
    });

    it('should format statute with section and nr.', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: 'LOV-2018-06-15-38',
        section: '13', nr: '2', valid: true,
      };
      expect(formatCitation(citation, 'full')).toBe('LOV-2018-06-15-38 § 13 nr. 2');
    });

    it('should format statute with chapter only', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: 'LOV-2018-06-15-38',
        chapter: '3', valid: true,
      };
      expect(formatCitation(citation, 'full')).toBe('LOV-2018-06-15-38 kapittel 3');
    });

    it('should format regulation (FOR) the same way', () => {
      const citation: ParsedCitation = {
        raw: 'FOR-2018-07-20-1222 § 5', type: 'regulation', document_id: 'FOR-2018-07-20-1222',
        section: '5', valid: true,
      };
      expect(formatCitation(citation, 'full')).toBe('FOR-2018-07-20-1222 § 5');
    });
  });

  describe('statute — short format', () => {
    it('should format short (section only, no ledd)', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: 'LOV-2018-06-15-38',
        section: '13', ledd: 1, bokstav: 'a', valid: true,
      };
      // short format omits ledd/bokstav
      expect(formatCitation(citation, 'short')).toBe('LOV-2018-06-15-38 § 13');
    });
  });

  describe('statute — pinpoint format', () => {
    it('should format pinpoint with section', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: 'LOV-2018-06-15-38',
        section: '13', valid: true,
      };
      expect(formatCitation(citation, 'pinpoint')).toBe('§ 13');
    });

    it('should format pinpoint with section and ledd', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: 'LOV-2018-06-15-38',
        section: '13', ledd: 2, valid: true,
      };
      expect(formatCitation(citation, 'pinpoint')).toBe('§ 13 andre ledd');
    });

    it('should format pinpoint with chapter only', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: 'LOV-2018-06-15-38',
        chapter: '3', valid: true,
      };
      expect(formatCitation(citation, 'pinpoint')).toBe('kapittel 3');
    });
  });

  describe('invalid citation', () => {
    it('should return raw text for invalid citation', () => {
      const citation: ParsedCitation = {
        raw: 'bad input', type: 'statute', document_id: '', valid: false,
      };
      expect(formatCitation(citation)).toBe('bad input');
    });
  });
});

describe('formatProvisionRef', () => {
  it('should format chaptered provision', () => {
    expect(formatProvisionRef('3', '13')).toBe('3:13');
  });

  it('should format flat provision', () => {
    expect(formatProvisionRef(undefined, '13')).toBe('13');
  });
});
