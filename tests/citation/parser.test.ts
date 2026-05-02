import { describe, it, expect } from 'vitest';
import { parseCitation, detectDocumentType } from '../../src/citation/parser.js';

describe('parseCitation', () => {
  describe('LOV canonical IDs', () => {
    it('should parse LOV ID with no pinpoint', () => {
      const result = parseCitation('LOV-2018-06-15-38');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('statute');
      expect(result.document_id).toBe('LOV-2018-06-15-38');
      expect(result.section).toBeUndefined();
      expect(result.chapter).toBeUndefined();
    });

    it('should parse LOV ID case-insensitively', () => {
      const result = parseCitation('lov-2018-06-15-38');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('LOV-2018-06-15-38');
    });

    it('should parse LOV ID with section', () => {
      const result = parseCitation('LOV-2018-06-15-38 § 13');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('LOV-2018-06-15-38');
      expect(result.section).toBe('13');
      expect(result.chapter).toBeUndefined();
    });

    it('should parse LOV ID with section and første ledd', () => {
      const result = parseCitation('LOV-2018-06-15-38 § 13 første ledd');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('LOV-2018-06-15-38');
      expect(result.section).toBe('13');
      expect(result.ledd).toBe(1);
    });

    it('should parse LOV ID with section, ledd, and bokstav', () => {
      const result = parseCitation('LOV-2018-06-15-38 § 13 første ledd bokstav a');
      expect(result.valid).toBe(true);
      expect(result.section).toBe('13');
      expect(result.ledd).toBe(1);
      expect(result.bokstav).toBe('a');
    });

    it('should parse LOV ID with section and nr.', () => {
      const result = parseCitation('LOV-2018-06-15-38 § 13 nr. 2');
      expect(result.valid).toBe(true);
      expect(result.section).toBe('13');
      expect(result.nr).toBe('2');
    });

    it('should parse LOV ID with kapittel', () => {
      const result = parseCitation('LOV-2018-06-15-38 kapittel 3');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('LOV-2018-06-15-38');
      expect(result.chapter).toBe('3');
      expect(result.section).toBeUndefined();
    });
  });

  describe('FOR canonical IDs', () => {
    it('should parse FOR ID', () => {
      const result = parseCitation('FOR-2018-07-20-1222');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('regulation');
      expect(result.document_id).toBe('FOR-2018-07-20-1222');
    });

    it('should parse FOR ID with section', () => {
      const result = parseCitation('FOR-2018-07-20-1222 § 5');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('regulation');
      expect(result.section).toBe('5');
    });
  });

  describe('short-name citations', () => {
    it('should resolve personopplysningsloven', () => {
      const result = parseCitation('personopplysningsloven');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('statute');
      expect(result.document_id).toBe('LOV-2018-06-15-38');
    });

    it('should resolve personopplysningsloven with section', () => {
      const result = parseCitation('personopplysningsloven § 13');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('LOV-2018-06-15-38');
      expect(result.section).toBe('13');
    });

    it('should resolve straffeloven', () => {
      const result = parseCitation('straffeloven § 185');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('LOV-2005-05-20-28');
      expect(result.section).toBe('185');
    });

    it('should resolve arbeidsmiljøloven', () => {
      const result = parseCitation('arbeidsmiljøloven § 1-1');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('LOV-2005-06-17-62');
    });

    it('should resolve short abbreviation aml', () => {
      const result = parseCitation('aml § 3-1');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('LOV-2005-06-17-62');
    });
  });

  describe('ledd ordinals', () => {
    it('should parse andre ledd as ledd=2', () => {
      const result = parseCitation('LOV-2018-06-15-38 § 13 andre ledd');
      expect(result.ledd).toBe(2);
    });

    it('should parse tredje ledd as ledd=3', () => {
      const result = parseCitation('LOV-2018-06-15-38 § 5 tredje ledd');
      expect(result.ledd).toBe(3);
    });
  });

  describe('error cases', () => {
    it('should return invalid for empty string', () => {
      const result = parseCitation('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return invalid for unrecognized format', () => {
      const result = parseCitation('some random text 12345');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unrecognized');
    });
  });
});

describe('detectDocumentType', () => {
  it('should detect statute from LOV prefix', () => {
    expect(detectDocumentType('LOV-2018-06-15-38')).toBe('statute');
  });

  it('should detect regulation from FOR prefix', () => {
    expect(detectDocumentType('FOR-2018-07-20-1222')).toBe('regulation');
  });

  it('should detect statute from short name', () => {
    expect(detectDocumentType('personopplysningsloven § 13')).toBe('statute');
    expect(detectDocumentType('straffeloven')).toBe('statute');
  });

  it('should return null for unknown', () => {
    expect(detectDocumentType('random text 999')).toBeNull();
  });
});
