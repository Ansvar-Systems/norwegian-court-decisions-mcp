#!/usr/bin/env tsx
/**
 * Check for updates to ingested Swedish statutes.
 *
 * Queries the Riksdagen API to detect amendments since last ingestion.
 *
 * Usage: npm run check-updates
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../data/database.db');

const RIKSDAGEN_LIST_URL = 'https://data.riksdagen.se/dokumentlista';
const USER_AGENT = 'Swedish-Law-MCP/0.1.0';
const REQUEST_DELAY_MS = 500;

interface LocalDocument {
  id: string;
  title: string;
  type: string;
  status: string;
  last_updated: string | null;
}

interface UpdateCheckResult {
  id: string;
  title: string;
  local_date: string | null;
  remote_date: string | null;
  has_update: boolean;
  error?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkRiksdagenForUpdates(doc: LocalDocument): Promise<UpdateCheckResult> {
  try {
    const url = `${RIKSDAGEN_LIST_URL}/?sok=${encodeURIComponent(doc.id)}&doktyp=sfs&format=json&utformat=json`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return {
        id: doc.id,
        title: doc.title,
        local_date: doc.last_updated,
        remote_date: null,
        has_update: false,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json() as {
      dokumentlista?: { dokument?: Array<{ datum?: string }> };
    };

    const remoteDoc = data?.dokumentlista?.dokument?.[0];
    const remoteDate = remoteDoc?.datum ?? null;

    const hasUpdate = remoteDate != null
      && doc.last_updated != null
      && remoteDate > doc.last_updated;

    return {
      id: doc.id,
      title: doc.title,
      local_date: doc.last_updated,
      remote_date: remoteDate,
      has_update: hasUpdate,
    };
  } catch (err) {
    return {
      id: doc.id,
      title: doc.title,
      local_date: doc.last_updated,
      remote_date: null,
      has_update: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkUpdates(): Promise<void> {
  console.log('Swedish Law MCP - Update Checker');
  console.log('');

  if (!fs.existsSync(DB_PATH)) {
    console.log('Database not found:', DB_PATH);
    console.log('Run "npm run build:db" first.');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  const documents = db.prepare(`
    SELECT id, title, type, status, last_updated
    FROM legal_documents
    WHERE type = 'statute'
    ORDER BY id
  `).all() as LocalDocument[];

  db.close();

  if (documents.length === 0) {
    console.log('No statutes in database.');
    process.exit(0);
  }

  console.log(`Checking ${documents.length} statute(s)...\n`);

  const results: UpdateCheckResult[] = [];

  for (const doc of documents) {
    process.stdout.write(`  ${doc.id} (${doc.title.substring(0, 40)})... `);

    const result = await checkRiksdagenForUpdates(doc);
    results.push(result);

    if (result.error) {
      console.log(`error: ${result.error}`);
    } else if (result.has_update) {
      console.log('UPDATE AVAILABLE');
    } else {
      console.log('up to date');
    }

    await delay(REQUEST_DELAY_MS);
  }

  // Summary
  console.log('');
  const updates = results.filter(r => r.has_update);
  const errors = results.filter(r => r.error);
  const current = results.filter(r => !r.has_update && !r.error);

  console.log(`Up to date: ${current.length}`);
  console.log(`Updates:    ${updates.length}`);
  console.log(`Errors:     ${errors.length}`);

  if (updates.length > 0) {
    console.log('');
    console.log('To re-ingest updated statutes:');
    for (const u of updates) {
      const safeId = u.id.replace(':', '_');
      console.log(`  npm run ingest -- ${u.id} data/seed/${safeId}.json`);
    }
    console.log('  npm run build:db');
  }

  if (updates.length > 0) {
    process.exit(1);
  }
}

checkUpdates().catch(error => {
  console.error('Check failed:', error.message);
  process.exit(1);
});
