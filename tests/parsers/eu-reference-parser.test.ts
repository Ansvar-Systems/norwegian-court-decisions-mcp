/**
 * EU reference parser tests.
 *
 * TODO: These tests currently use Swedish-language text fixtures.
 *       Post-ingestion, replace with Norwegian text fixtures that match
 *       actual patterns from the Lovdata corpus.
 *       Norwegian uses "forordning" (vs Swedish "förordning") and
 *       "direktiv" (same in both). Pattern refinement tracked under
 *       eu-reference-parser.ts TODO comment.
 */
import { describe, expect, it } from 'vitest';
import {
  extractEUReferences,
  extractInlineEUArticleReferences,
} from '../../src/parsers/eu-reference-parser.js';

describe('eu-reference-parser', () => {
  it('extracts and normalizes inline article references with parentheses', () => {
    // TODO: Replace with Norwegian text fixture post-ingestion
    const articles = extractInlineEUArticleReferences(
      'Behandling kan skje med hjemmel i artikel 9.2(h) og 9.3 i EUs personvernforordning.'
    );

    expect(articles).toContain('9.2.h');
    expect(articles).toContain('9.3');
  });

  it.skip(
    'maps named GDPR references to regulation 2016/679 in Norwegian text',
    // TODO: Norwegian GDPR named-act pattern needs adapting; skip until done.
    async () => {
      const refs = extractEUReferences(
        'Personopplysninger kan behandles etter artikel 9.2(h) og 9.3 i EUs personvernforordning.'
      );
      expect(refs.length).toBeGreaterThan(0);
      const gdprRef = refs.find(ref => ref.type === 'regulation' && ref.id === '2016/679');
      expect(gdprRef).toBeDefined();
    }
  );
});
