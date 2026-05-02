#!/usr/bin/env tsx
/**
 * Lovdata Open Data API Ingestion Script
 *
 * Fetches Norwegian statutes from Lovdata's public bulk API and converts
 * them to seed JSON format for the Norwegian Law MCP server.
 *
 * Data source: api.lovdata.no/v1/publicData/get/gjeldende-lover.tar.bz2
 * License: NLOD 2.0 (Norwegian Licence for Open Government Data 2.0)
 * Publisher: Stiftelsen Lovdata
 *
 * Pipeline:
 *   Lovdata API -> ingest-lovdata.ts -> data/seed/<id>.json -> build-db.ts -> database.db
 *
 * Usage:
 *   npm run ingest                  -- ingest all laws + regulations
 *   npm run ingest -- --limit 50   -- ingest first 50 per dataset (testing)
 *   npm run ingest -- --use-cached -- skip download if cache exists
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const LOVDATA_BASE = 'https://api.lovdata.no/v1/publicData/get';
const DATASETS: { name: string; url: string; docType: 'statute' | 'regulation'; subdir: string; prefix: string }[] = [
  {
    name: 'gjeldende-lover',
    url: `${LOVDATA_BASE}/gjeldende-lover.tar.bz2`,
    docType: 'statute',
    subdir: 'nl',
    prefix: 'nl',
  },
  {
    name: 'gjeldende-sentrale-forskrifter',
    url: `${LOVDATA_BASE}/gjeldende-sentrale-forskrifter.tar.bz2`,
    docType: 'regulation',
    subdir: 'sf',
    prefix: 'sf',
  },
];

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CACHE_DIR = path.resolve(__dirname, '../data/cache');
const USER_AGENT = 'Norwegian-Law-MCP/1.0.0 (https://github.com/Ansvar-Systems/norwegian-law-mcp; NLOD-2.0)';
const PROGRESS_INTERVAL = 50;

// Attribution string per NLOD 2.0
const ATTRIBUTION_TEXT = 'Contains data under the Norwegian licence for Open Government data (NLOD) distributed by Lovdata';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LovdataProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
}

export interface LovdataSeed {
  id: string;
  type: 'statute' | 'regulation';
  canonical_ref: string;
  title: string;
  title_short?: string;
  ministry?: string;
  issued_date?: string;
  in_force_date?: string;
  last_amended_date?: string;
  legal_area?: string[];
  eea_references?: string[];
  language: 'nb' | 'nn';
  status: 'in_force';
  provisions?: LovdataProvision[];
  source_url: string;
  attribution_text: string;
  _citation: {
    source_url: string;
    publisher: string;
    license: string;
    attribution_text: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filename parsing
// ─────────────────────────────────────────────────────────────────────────────

interface FilenameInfo {
  id: string;
  language: 'nb' | 'nn';
  date: string;
  num: string;
}

function parseFilename(filename: string, prefix: string = 'nl'): FilenameInfo | null {
  // Laws:        nl-YYYYMMDD-NNN.xml or nl-YYYYMMDD-NNN-nn.xml
  // Regulations: sf-YYYYMMDD-NNNN.xml or sf-YYYYMMDD-NNNN-nn.xml
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}-(\\d{8})-(\\d+)(-nn)?\\.xml$`);
  const match = filename.match(pattern);
  if (!match) return null;

  const [, date8, num, nnSuffix] = match;
  const language: 'nb' | 'nn' = nnSuffix ? 'nn' : 'nb';

  const year = date8.slice(0, 4);
  const month = date8.slice(4, 6);
  const day = date8.slice(6, 8);
  const dateStr = `${year}-${month}-${day}`;

  // Pad laws to 3 digits, regulations to 4 digits (they already are in the archive)
  const numPadded = prefix === 'sf' ? num.padStart(4, '0') : num.padStart(3, '0');

  // ID scheme: nl-lov-YYYY-MM-DD-NNN or sf-for-YYYY-MM-DD-NNNN
  const docKind = prefix === 'sf' ? 'for' : 'lov';
  const id = `${prefix}-${docKind}-${dateStr}-${numPadded}${language === 'nn' ? '-nn' : ''}`;

  return { id, language, date: dateStr, num: numPadded };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML/XML parsing utilities
// ─────────────────────────────────────────────────────────────────────────────

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractDlField(document: Document, className: string): string | undefined {
  const dd = document.querySelector(`dd.${className}`);
  if (!dd) return undefined;
  return normalizeWhitespace(dd.textContent ?? '') || undefined;
}

function extractDlFieldMulti(document: Document, className: string): string[] {
  const dd = document.querySelector(`dd.${className}`);
  if (!dd) return [];
  const items = dd.querySelectorAll('li');
  if (items.length > 0) {
    return Array.from(items)
      .map(li => normalizeWhitespace(li.textContent ?? ''))
      .filter(Boolean);
  }
  const text = normalizeWhitespace(dd.textContent ?? '');
  return text ? [text] : [];
}

function extractEEAReferences(document: Document): string[] {
  const dd = document.querySelector('dd.eeaReferences');
  if (!dd) return [];
  const text = normalizeWhitespace(dd.textContent ?? '');
  return text ? [text] : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Provision parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse provisions from the HTML body.
 *
 * Lovdata structure:
 *   <section class="section" data-name="kap1"> — chapter (optional)
 *     <h2>Kapittel 1. Title</h2>
 *     <article class="legalArticle" data-name="§1">
 *       <h3><span class="legalArticleValue">§ 1</span>. <span class="legalArticleTitle">Title</span></h3>
 *       <article class="legalP">paragraph text</article>
 *     </article>
 *   </section>
 *
 * Old laws: legalArticle directly in body with h2 headers (no section wrapper).
 */
function parseProvisions(document: Document): LovdataProvision[] {
  const provisions: LovdataProvision[] = [];

  const sections = document.querySelectorAll('section.section');

  if (sections.length > 0) {
    for (const section of Array.from(sections)) {
      const chapterHeading = section.querySelector(':scope > h2');
      const chapterText = chapterHeading
        ? normalizeWhitespace(chapterHeading.textContent ?? '')
        : undefined;

      const articles = section.querySelectorAll(':scope > article.legalArticle');
      for (const article of Array.from(articles)) {
        const provision = extractProvisionFromArticle(article, chapterText);
        if (provision) provisions.push(provision);
      }
    }
  } else {
    // Flat structure — no chapters
    const articles = document.querySelectorAll('article.legalArticle');
    for (const article of Array.from(articles)) {
      const provision = extractProvisionFromArticle(article, undefined);
      if (provision) provisions.push(provision);
    }
  }

  return provisions;
}

function extractProvisionFromArticle(article: Element, chapterText: string | undefined): LovdataProvision | null {
  // Support both h3 (within section) and h2 (flat structure) headers
  const header = article.querySelector('h3.legalArticleHeader, h2.legalArticleHeader');
  if (!header) return null;

  const valueEl = header.querySelector('span.legalArticleValue');
  const titleEl = header.querySelector('span.legalArticleTitle');
  if (!valueEl) return null;

  const sectionValue = normalizeWhitespace(valueEl.textContent ?? '');
  const sectionTitle = titleEl ? normalizeWhitespace(titleEl.textContent ?? '') : undefined;

  // Use data-name for provision_ref (e.g. "§1", "§1a"), fall back to stripped section value
  const dataName = article.getAttribute('data-name') ?? '';
  const provisionRef = dataName || sectionValue.replace(/\s+/g, '');

  // Collect text from legalP paragraphs (direct children only to avoid deep nesting)
  const paragraphs = article.querySelectorAll(':scope > article.legalP');
  const contentParts: string[] = [];

  for (const para of Array.from(paragraphs)) {
    // changesToParent = amendment notes — not substantive text
    if (para.classList.contains('changesToParent')) continue;
    const text = normalizeWhitespace(para.textContent ?? '');
    if (text) contentParts.push(text);
  }

  // Fallback for articles without direct legalP children
  if (contentParts.length === 0) {
    const fullText = normalizeWhitespace(article.textContent ?? '');
    const headerText = normalizeWhitespace(header.textContent ?? '');
    const afterHeader = fullText.startsWith(headerText)
      ? fullText.slice(headerText.length).trim()
      : fullText;
    if (afterHeader) contentParts.push(afterHeader);
  }

  const content = contentParts.join(' ').trim();
  if (!content) return null;

  return {
    provision_ref: provisionRef,
    chapter: chapterText,
    section: sectionValue,
    title: sectionTitle || undefined,
    content,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse a single XML file
// ─────────────────────────────────────────────────────────────────────────────

function parseXmlFile(xmlContent: string, info: FilenameInfo, docType: 'statute' | 'regulation'): LovdataSeed | null {
  let dom: JSDOM;
  try {
    dom = new JSDOM(xmlContent, { contentType: 'text/html' });
  } catch {
    return null;
  }

  // Wrap in try/finally so we always release the JSDOM window. Without this,
  // the V8 heap grows unbounded across thousands of files (the regulations
  // archive has 3,416 files; without close() we OOM at ~400).
  try {
    const document = dom.window.document;

    const titleEl = document.querySelector('title');
    const title = normalizeWhitespace(titleEl?.textContent ?? '');
    if (!title) return null;

    const legacyID = extractDlField(document, 'legacyID'); // LOV-2018-06-15-38
    const dokid = extractDlField(document, 'dokid');        // NL/lov/2018-06-15-38
    const ministry = extractDlField(document, 'ministry');
    const dateInForce = extractDlField(document, 'dateInForce');
    const lastChangeInForce = extractDlField(document, 'lastChangeInForce');
    const dateOfPublication = extractDlField(document, 'dateOfPublication');
    const titleShort = extractDlField(document, 'titleShort');
    const legalAreas = extractDlFieldMulti(document, 'legalArea');
    const eeaRefs = extractEEAReferences(document);

    const canonicalRef = legacyID ?? `LOV-${info.date}-${info.num}`;

    // source_url: https://lovdata.no/dokument/NL/lov/2018-06-15-38
    //           or https://lovdata.no/dokument/SF/forskrift/2014-01-10-21
    let sourceUrl: string;
    if (dokid && (dokid.startsWith('NL/') || dokid.startsWith('SF/'))) {
      sourceUrl = `https://lovdata.no/dokument/${dokid}`;
    } else {
      // Fallback: construct from info
      const prefix = info.id.startsWith('sf-') ? 'SF/forskrift' : 'NL/lov';
      sourceUrl = `https://lovdata.no/dokument/${prefix}/${info.date}-${info.num}`;
    }

    const provisions = parseProvisions(document);

    const seed: LovdataSeed = {
      id: info.id,
      type: docType,
      canonical_ref: canonicalRef,
      title,
      title_short: titleShort,
      ministry,
      issued_date: dateOfPublication,
      in_force_date: dateInForce,
      last_amended_date: lastChangeInForce,
      legal_area: legalAreas.length > 0 ? legalAreas : undefined,
      eea_references: eeaRefs.length > 0 ? eeaRefs : undefined,
      language: info.language,
      status: 'in_force',
      provisions: provisions.length > 0 ? provisions : undefined,
      source_url: sourceUrl,
      attribution_text: ATTRIBUTION_TEXT,
      _citation: {
        source_url: sourceUrl,
        publisher: 'lovdata.no',
        license: 'NLOD-2.0',
        attribution_text: ATTRIBUTION_TEXT,
      },
    };

    return seed;
  } finally {
    // Release JSDOM's internal browser-emulation state; without this each file
    // leaks ~10MB and we OOM. With it, memory is flat across the corpus.
    dom.window.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────────────────────

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading ${url}...`);

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));

  const sizeMB = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
  console.log(`  Downloaded: ${destPath} (${sizeMB} MB)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract tar.bz2 and process
// ─────────────────────────────────────────────────────────────────────────────

function extractAndProcess(
  tarPath: string,
  docType: 'statute' | 'regulation',
  subdir: string,
  prefix: string,
  seedDir: string,
  limit: number | undefined
): { processed: number; skipped: number; errors: number } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lovdata-'));

  try {
    console.log(`  Extracting to ${tempDir}...`);
    const result = spawnSync('tar', ['xjf', tarPath, '-C', tempDir], { encoding: 'utf-8' });
    if (result.status !== 0) {
      const msg = result.stderr || result.error?.message || 'unknown error';
      throw new Error(`tar extraction failed: ${msg}`);
    }

    const xmlDir = path.join(tempDir, subdir);
    if (!fs.existsSync(xmlDir)) {
      throw new Error(`Expected '${subdir}/' directory not found in archive`);
    }

    const allFiles = fs.readdirSync(xmlDir).filter(f => f.endsWith('.xml')).sort();
    console.log(`  Found ${allFiles.length} XML files`);

    const filesToProcess = limit !== undefined ? allFiles.slice(0, limit) : allFiles;

    let processed = 0;
    let skipped = 0;
    let alreadyDone = 0;
    let errors = 0;

    // Per-run cap as memory-leak workaround: jsdom retains internal state across
    // documents even with window.close(); after ~1000 files we OOM at 6GB heap.
    // Bash loop re-runs the script; each run skips already-done files and
    // processes another chunk. See README "ingestion runbook" for the loop.
    const maxPerRun = parseInt(process.env.LOVDATA_MAX_PER_RUN ?? '800', 10);

    for (const filename of filesToProcess) {
      try {
        const info = parseFilename(filename, prefix);
        if (!info) {
          skipped++;
          continue;
        }

        // Skip-already-processed: if seed file exists, treat as done.
        // Enables safe restart after OOM crashes mid-corpus.
        const outPath = path.join(seedDir, `${info.id}.json`);
        if (fs.existsSync(outPath)) {
          alreadyDone++;
          continue;
        }

        // Per-run cap: stop early when we've processed enough this iteration.
        // Bash loop will re-launch and pick up where we left off.
        if (processed >= maxPerRun) {
          console.log(`  [${processed}/${filesToProcess.length}] hit per-run cap of ${maxPerRun}; exiting cleanly so caller can restart with fresh heap`);
          break;
        }

        const xmlContent = fs.readFileSync(path.join(xmlDir, filename), 'utf-8');
        const seed = parseXmlFile(xmlContent, info, docType);

        if (!seed) {
          skipped++;
          continue;
        }

        fs.writeFileSync(outPath, JSON.stringify(seed, null, 2));
        processed++;

        if (processed % PROGRESS_INTERVAL === 0) {
          console.log(`  [${processed}/${filesToProcess.length}] processed (skipped=${skipped} already_done=${alreadyDone} errors=${errors})`);
        }
      } catch (err) {
        errors++;
        console.error(`  ERROR in ${filename}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (alreadyDone > 0) {
      console.log(`  Resumed: ${alreadyDone} already-done files skipped, ${processed} new files processed this run.`);
    }
    return { processed, skipped: skipped + alreadyDone, errors };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : undefined;
  const useCached = args.includes('--use-cached');

  console.log('Lovdata Open Data Ingestion');
  console.log(`  License: NLOD 2.0 (Stiftelsen Lovdata)`);
  console.log(`  Output: ${SEED_DIR}`);
  if (limit !== undefined) console.log(`  Limit: ${limit} per dataset`);
  console.log('');

  fs.mkdirSync(SEED_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const dataset of DATASETS) {
    console.log(`Dataset: ${dataset.name}`);

    const cachePath = path.join(CACHE_DIR, `${dataset.name}.tar.bz2`);

    if (useCached && fs.existsSync(cachePath)) {
      const sizeMB = (fs.statSync(cachePath).size / 1024 / 1024).toFixed(1);
      console.log(`  Using cached: ${cachePath} (${sizeMB} MB)`);
    } else {
      try {
        await downloadFile(dataset.url, cachePath);
      } catch (err) {
        console.error(`  DOWNLOAD ERROR for ${dataset.name}: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`  Skipping dataset.`);
        continue;
      }
    }

    const { processed, skipped, errors } = extractAndProcess(
      cachePath, dataset.docType, dataset.subdir, dataset.prefix, SEED_DIR, limit
    );
    totalProcessed += processed;
    totalSkipped += skipped;
    totalErrors += errors;

    console.log(`  Done: ${processed} written, ${skipped} skipped, ${errors} errors`);
    console.log('');
  }

  console.log('=== Ingestion summary ===');
  console.log(`  Seed files written: ${totalProcessed}`);
  console.log(`  Skipped:            ${totalSkipped}`);
  console.log(`  Errors:             ${totalErrors}`);
  console.log('');
  console.log('Next: npm run build:db');
}

const isMainModule = process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  main().catch(err => {
    console.error('Ingestion failed:', err.message);
    process.exit(1);
  });
}
