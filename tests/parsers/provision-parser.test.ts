import { describe, it, expect } from 'vitest';
import { parseStatuteText, isChapteredStatute } from '../../src/parsers/provision-parser.js';

describe('parseStatuteText', () => {
  it('should parse a chaptered Norwegian statute', () => {
    const text = `
Kapittel 1 Innledende bestemmelser

§ 1 Denne loven utfyller EUs personvernforordning.

§ 2 Loven gjelder ved behandling av personopplysninger.

Kapittel 2 Rettslig grunnlag

§ 3 Personopplysninger kan behandles dersom det finnes rettslig grunnlag.
    `;

    const provisions = parseStatuteText(text);

    expect(provisions).toHaveLength(3);
    expect(provisions[0]).toMatchObject({
      provision_ref: '1:1',
      chapter: '1',
      section: '1',
    });
    expect(provisions[0].content).toContain('personvernforordning');
    expect(provisions[1].provision_ref).toBe('1:2');
    expect(provisions[2].provision_ref).toBe('2:3');
    expect(provisions[2].chapter).toBe('2');
  });

  it('should parse a flat Norwegian statute (no chapters)', () => {
    const text = `
§ 1 Formålet med denne loven er å verne personopplysninger.

§ 2 Loven gjelder alle.

§ 3 Definisjoner fastsettes her.
    `;

    const provisions = parseStatuteText(text);

    expect(provisions).toHaveLength(3);
    expect(provisions[0]).toMatchObject({
      provision_ref: '1',
      chapter: undefined,
      section: '1',
    });
    expect(provisions[0].content).toContain('personopplysninger');
    expect(provisions[2].provision_ref).toBe('3');
  });

  it('should handle legacy Swedish-style section numbering (13 §)', () => {
    const text = `
13 § Behandlingsansvarlig skal sikre at personopplysninger behandles i samsvar med denne loven.
    `;

    const provisions = parseStatuteText(text);
    expect(provisions).toHaveLength(1);
    expect(provisions[0].section).toBe('13');
  });

  it('should return empty array for empty input', () => {
    expect(parseStatuteText('')).toEqual([]);
  });
});

describe('isChapteredStatute', () => {
  it('should detect chaptered text (Kapittel N)', () => {
    expect(isChapteredStatute('Kapittel 1 Innledende bestemmelser')).toBe(true);
  });

  it('should detect chaptered text (N kap.)', () => {
    expect(isChapteredStatute('1 kap. Innledende bestemmelser')).toBe(true);
  });

  it('should detect non-chaptered text', () => {
    expect(isChapteredStatute('§ 1 Denne loven gjelder...')).toBe(false);
  });
});
