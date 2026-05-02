#!/usr/bin/env tsx
/**
 * Ingestion script for Norwegian Supreme Court (Høyesterett) decisions.
 *
 * Fetches decisions from domstol.no sitemap, parses HTML pages using
 * __INITIAL__DATA__ JSON blob (most reliable content extraction),
 * and writes seed JSON files to data/seed/.
 *
 * License basis:
 *   - åndsverkloven §14: court decisions are copyright-exempt
 *   - domstol.no anonymization regime (post-2021): all decisions pre-anonymized
 *
 * Source rate-limit: 1 request/second (respectful).
 * Scope: post-2021 decisions only (HR-2021-NNNN-X through HR-2026-NNNN-X).
 *
 * Usage:
 *   npm run ingest
 *   COURT_MAX_PER_RUN=200 npm run ingest
 *   COURT_SKIP_EXISTING=true npm run ingest   (skip already-downloaded seeds)
 */

import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const SITEMAP_URL = 'https://www.domstol.no/sitemap.xml';
const BASE_URL = 'https://www.domstol.no';
const RATE_LIMIT_MS = 1100; // 1.1 seconds between requests
const MAX_PER_RUN = parseInt(process.env.COURT_MAX_PER_RUN ?? '500', 10);
const SKIP_EXISTING = process.env.COURT_SKIP_EXISTING === 'true';

// Post-2021 scope: include years 2021-2026
const MIN_YEAR = 2021;
const MAX_YEAR = 2026;

interface DecisionSeed {
  id: string;
  case_number: string;
  court: string;
  title: string;
  decision_date: string | null;
  main_intro: string | null;
  main_body: string | null;
  legal_area: string | null;
  key_sections: string | null;
  judges: string | null;
  source_url: string;
  pdf_url: string | null;
  language: string;
  _citation: {
    source_url: string;
    publisher: string;
    license: string;
    attribution_text: string;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * HTML entity map for Norwegian/European characters commonly found in domstol.no pages.
 * Using a compiled regex-based approach (no DOM, no XSS risk).
 */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—', '&hellip;': '…',
  '&oslash;': 'ø', '&Oslash;': 'Ø',
  '&aring;': 'å', '&Aring;': 'Å',
  '&aelig;': 'æ', '&AElig;': 'Æ',
  '&ouml;': 'ö', '&Ouml;': 'Ö',
  '&auml;': 'ä', '&Auml;': 'Ä',
  '&uuml;': 'ü', '&Uuml;': 'Ü',
  '&szlig;': 'ß',
  '&eacute;': 'é', '&Eacute;': 'É',
  '&egrave;': 'è', '&agrave;': 'à',
  '&laquo;': '«', '&raquo;': '»',
};

/**
 * Decode HTML entities and strip tags to produce plain text for FTS5 indexing.
 * Safe regex-based approach (no DOM, no XSS risk).
 */
function htmlToPlainText(rawHtml: string): string {
  if (!rawHtml) return '';
  return rawHtml
    // Strip HTML tags using safe bounded regex (from lessons learned on cleanText fleet bug)
    .replace(/<\/?[a-zA-Z][^<>]{0,200}>/g, ' ')
    // Decode named entities
    .replace(/&[a-zA-Z]+;/g, m => HTML_ENTITIES[m] ?? '')
    // Decode numeric entities &#NNN; and &#xHH;
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ansvar-court-decisions-mcp/0.1 (research; domstol.no public data; contact: hello@ansvar.eu)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'no,nb;q=0.9,en;q=0.5',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.text();
}

/**
 * Extract decision URLs from sitemap.xml.
 * Filters to post-2021 Høyesterett avgjørelser URLs.
 */
async function fetchDecisionUrls(): Promise<string[]> {
  console.log('Fetching sitemap...');
  const sitemapText = await fetchText(SITEMAP_URL);
  await sleep(RATE_LIMIT_MS);

  // Extract all URLs matching the Høyesterett avgjørelser pattern
  const urlPattern = /https:\/\/www\.domstol\.no\/no\/hoyesterett\/avgjorelser\/avgjorelser-(\d{4})\/[^\s<"]+/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(sitemapText)) !== null) {
    const year = parseInt(match[1], 10);
    if (year >= MIN_YEAR && year <= MAX_YEAR) {
      matches.push(match[0]);
    }
  }

  console.log(`Found ${matches.length} decision URLs in sitemap (years ${MIN_YEAR}-${MAX_YEAR})`);
  return matches;
}

/**
 * Extract decision content from a domstol.no decision page.
 *
 * Primary path: parse __INITIAL__DATA__ JSON blob from <script> tag.
 * Fallback: parse rendered HTML divs.
 *
 * JSDOM memory management: always call dom.window.close() in finally block.
 */
function extractDecisionFromHtml(html: string, url: string): Partial<DecisionSeed> | null {
  let dom: JSDOM | null = null;

  try {
    dom = new JSDOM(html, { runScripts: 'outside-only' });
    const document = dom.window.document;

    // ── Primary path: parse __INITIAL__DATA__ JSON blob ──────────────────────
    const scriptTags = Array.from(document.querySelectorAll('script'));
    let initialData: Record<string, unknown> | null = null;

    for (const script of scriptTags) {
      const content = script.textContent ?? '';
      const match = content.match(/__INITIAL__DATA__\s*=\s*(\{[\s\S]+\});\s*__INITIAL__DATA__\.status\s*=\s*'available'/);
      if (match) {
        try {
          initialData = JSON.parse(match[1]) as Record<string, unknown>;
          break;
        } catch {
          // try next script
        }
      }
    }

    let title = '';
    let mainIntro: string | null = null;
    let mainBody: string | null = null;
    let pdfUrl: string | null = null;

    if (initialData) {
      // Parse from __INITIAL__DATA__ IContent structure
      const icontent = initialData['IContent'] as Record<string, unknown> | undefined;
      if (icontent) {
        // Title: decode HTML entities (Name is usually plain text, but may have entities)
        const rawName = String((icontent['Name'] as Record<string, unknown>)?.['Value'] ?? icontent['Name'] ?? '');
        title = htmlToPlainText(rawName) || rawName;

        // Main intro/body: decode HTML entities and strip tags for FTS5 indexability
        const mainIntroVal = icontent['MainIntro'] as Record<string, unknown> | undefined;
        const rawIntro = String(mainIntroVal?.['Value'] ?? '');
        mainIntro = rawIntro ? htmlToPlainText(rawIntro) : null;

        const mainBodyVal = icontent['MainBody'] as Record<string, unknown> | undefined;
        const rawBody = String(mainBodyVal?.['Value'] ?? '');
        mainBody = rawBody ? htmlToPlainText(rawBody) : null;
      }
    }

    // ── Fallback: HTML divs ──────────────────────────────────────────────────
    if (!title) {
      const h1 = document.querySelector('h1');
      title = h1?.textContent?.trim() ?? '';
    }

    if (!mainIntro) {
      const ingressDiv = document.querySelector('.ingress');
      mainIntro = ingressDiv ? htmlToPlainText(ingressDiv.textContent ?? '') : null;
    }

    if (!mainBody) {
      // Find the content div after the ingress
      const contentDivs = document.querySelectorAll('.xhtml-container-old-domstol');
      if (contentDivs.length >= 2) {
        mainBody = htmlToPlainText(contentDivs[1]?.textContent ?? '');
      } else if (contentDivs.length === 1) {
        mainBody = htmlToPlainText(contentDivs[0]?.textContent ?? '');
      }
    }

    if (!title) {
      return null;
    }

    // ── Extract PDF URL ──────────────────────────────────────────────────────
    const pdfLinks = document.querySelectorAll('a[href*=".pdf"]');
    for (const link of pdfLinks) {
      const href = (link as HTMLAnchorElement).href;
      if (href.includes('avgjorelser') || href.includes('hret')) {
        pdfUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        break;
      }
    }

    // ── Extract structured fields from main_body text ────────────────────────
    let legalArea: string | null = null;
    let keySections: string | null = null;
    let judges: string | null = null;

    if (mainBody) {
      // mainBody is already plain text after htmlToPlainText()
      const bodyText = mainBody;

      const rettsMatch = bodyText.match(/Rettsomr[åa]de\s*[:：]\s*([^.]*(?:\.[^N][^ø][^k])*)/i);
      if (rettsMatch) {
        legalArea = rettsMatch[1].trim().slice(0, 300);
      }

      const nokkMatch = bodyText.match(/N[øo]kkelavsnitt\s*[:：]\s*([\d,\s–-]+)/i);
      if (nokkMatch) {
        keySections = nokkMatch[1].trim().slice(0, 100);
      }

      const domMatch = bodyText.match(/Dommere\s*[:：]\s*([A-ZÆØÅ][a-zæøå]+(?:[,\s]+[A-ZÆØÅ][a-zæøå]+)*)/i);
      if (domMatch) {
        judges = domMatch[1].trim().slice(0, 200);
      }
    }

    return {
      title,
      main_intro: mainIntro,
      main_body: mainBody,
      legal_area: legalArea,
      key_sections: keySections,
      judges,
      pdf_url: pdfUrl,
    };
  } finally {
    // JSDOM memory leak prevention: always close the window
    if (dom) {
      try {
        dom.window.close();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Derive case_number, court, and decision_date from the URL path.
 *
 * URL pattern:
 *   .../avgjorelser-2025/hoyesterett---straff/HR-2025-2303-A/
 *   .../avgjorelser-2025/hoyesteretts-ankeutvalg---sivil/HR-2025-2256-U/
 */
function parseCaseMetaFromUrl(url: string): {
  case_number: string;
  court: string;
  decision_year: number | null;
} {
  const urlObj = new URL(url);
  const parts = urlObj.pathname.split('/').filter(Boolean);

  // Last path component is the case slug, e.g. "HR-2025-2303-A"
  const caseSlug = parts[parts.length - 1].toUpperCase();

  // Court from the category segment
  const categorySlug = parts[parts.length - 2] ?? '';
  let court = 'Høyesterett';
  if (categorySlug.includes('ankeutvalg')) {
    court = 'Høyesteretts ankeutvalg';
  }

  // Year from the case number
  const yearMatch = caseSlug.match(/HR-(\d{4})-/);
  const decisionYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

  return { case_number: caseSlug, court, decision_year: decisionYear };
}

/**
 * Try to extract decision date from main_intro text.
 * Pattern: "Høyesteretts dom 19. november 2025"
 */
function extractDateFromIntro(mainIntro: string | null): string | null {
  if (!mainIntro) return null;
  const text = mainIntro.replace(/<[^>]{0,200}>/g, ' ');

  const months: Record<string, string> = {
    januar: '01', februar: '02', mars: '03', april: '04',
    mai: '05', juni: '06', juli: '07', august: '08',
    september: '09', oktober: '10', november: '11', desember: '12',
  };

  const match = text.match(/(\d{1,2})\.\s+(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\s+(\d{4})/i);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = months[match[2].toLowerCase()] ?? '01';
    const year = match[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

function urlToDocumentId(url: string): string {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const slug = parts[parts.length - 1].toLowerCase();
  return slug;
}

async function main(): Promise<void> {
  console.log('Norwegian Court Decisions Ingestion Script');
  console.log(`Max per run: ${MAX_PER_RUN}, Skip existing: ${SKIP_EXISTING}`);
  console.log(`Scope: years ${MIN_YEAR}-${MAX_YEAR}\n`);

  // Ensure seed directory exists
  if (!fs.existsSync(SEED_DIR)) {
    fs.mkdirSync(SEED_DIR, { recursive: true });
  }

  const urls = await fetchDecisionUrls();

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let downloaded = 0;

  for (const url of urls) {
    if (processed >= MAX_PER_RUN) {
      console.log(`\nReached MAX_PER_RUN limit (${MAX_PER_RUN}). Run again to continue.`);
      break;
    }

    const { case_number, court } = parseCaseMetaFromUrl(url);
    const documentId = urlToDocumentId(url);
    const outPath = path.join(SEED_DIR, `${documentId}.json`);

    if (SKIP_EXISTING && fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    process.stdout.write(`  [${processed + 1}/${Math.min(urls.length, MAX_PER_RUN)}] ${case_number}... `);

    let html: string;
    try {
      html = await fetchText(url);
      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      process.stdout.write(`FETCH ERROR: ${err}\n`);
      errors++;
      processed++;
      continue;
    }

    const extracted = extractDecisionFromHtml(html, url);

    if (!extracted || !extracted.title) {
      process.stdout.write('PARSE ERROR (no title)\n');
      errors++;
      processed++;
      continue;
    }

    const decisionDate = extractDateFromIntro(extracted.main_intro ?? null);

    const seed: DecisionSeed = {
      id: documentId,
      case_number,
      court,
      title: extracted.title,
      decision_date: decisionDate,
      main_intro: extracted.main_intro ?? null,
      main_body: extracted.main_body ?? null,
      legal_area: extracted.legal_area ?? null,
      key_sections: extracted.key_sections ?? null,
      judges: extracted.judges ?? null,
      source_url: url,
      pdf_url: extracted.pdf_url ?? null,
      language: 'nb',
      _citation: {
        source_url: url,
        publisher: 'domstol.no',
        license: 'Norwegian-Court-Publication',
        attribution_text:
          `Norwegian Supreme Court (Høyesterett) decision ${case_number}, ` +
          `anonymized per domstol.no publication policy. Copyright-exempt under åndsverkloven §14.`,
      },
    };

    fs.writeFileSync(outPath, JSON.stringify(seed, null, 2), 'utf-8');
    downloaded++;
    process.stdout.write(`OK (${decisionDate ?? 'date unknown'})\n`);
    processed++;
  }

  console.log(`\nIngestion complete:`);
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Skipped (existing): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total seed files: ${fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json')).length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
