#!/usr/bin/env tsx
/**
 * Database builder for Norwegian Court Decisions MCP server.
 *
 * Builds the SQLite database from seed JSON files in data/seed/.
 * Each seed file represents one Høyesterett decision fetched from domstol.no.
 *
 * Usage: npm run build:db
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const DB_PATH = path.resolve(__dirname, '../data/database.db');

// ─────────────────────────────────────────────────────────────────────────────
// Seed file shape
// ─────────────────────────────────────────────────────────────────────────────

interface DecisionSeed {
  id: string;               // e.g. "hr-2025-2303-a"
  case_number: string;      // e.g. "HR-2025-2303-A"
  court: string;            // "Høyesterett" | "Høyesteretts ankeutvalg"
  title: string;            // Anonymized headline
  decision_date: string | null;   // "2025-11-19"
  main_intro: string | null;      // HTML: parties, docket reference
  main_body: string | null;       // HTML: substantive summary, rettsområde, nøkkelavsnitt, dommere
  legal_area: string | null;      // e.g. "Strafferett. Medvirkning. Straffeloven § 15."
  key_sections: string | null;    // e.g. "37, 39–40"
  judges: string | null;          // e.g. "Bergsø, Bergh, Steinsvik, Stenvik, Vang"
  source_url: string;             // domstol.no page URL
  pdf_url: string | null;         // domstol.no PDF URL
  language: string;               // "nb"
  _citation: {
    source_url: string;
    publisher: string;
    license: string;
    attribution_text: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = `
-- Core decisions table
CREATE TABLE decisions (
  rowid INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE,
  case_number TEXT NOT NULL UNIQUE,
  court TEXT NOT NULL,
  title TEXT NOT NULL,
  decision_date TEXT,
  main_intro TEXT,
  main_body TEXT,
  legal_area TEXT,
  key_sections TEXT,
  judges TEXT,
  source_url TEXT NOT NULL,
  pdf_url TEXT,
  language TEXT DEFAULT 'nb',
  citation_publisher TEXT NOT NULL DEFAULT 'domstol.no',
  citation_license TEXT NOT NULL DEFAULT 'Norwegian-Court-Publication',
  citation_attribution TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_decisions_case_number ON decisions(case_number);
CREATE INDEX idx_decisions_court ON decisions(court);
CREATE INDEX idx_decisions_date ON decisions(decision_date);

-- FTS5 for full-text search
CREATE VIRTUAL TABLE decisions_fts USING fts5(
  title,
  main_intro,
  main_body,
  legal_area,
  judges,
  content='decisions',
  content_rowid='rowid',
  tokenize='unicode61'
);

CREATE TRIGGER decisions_ai AFTER INSERT ON decisions BEGIN
  INSERT INTO decisions_fts(rowid, title, main_intro, main_body, legal_area, judges)
  VALUES (new.rowid, new.title, new.main_intro, new.main_body, new.legal_area, new.judges);
END;

CREATE TRIGGER decisions_ad AFTER DELETE ON decisions BEGIN
  INSERT INTO decisions_fts(decisions_fts, rowid, title, main_intro, main_body, legal_area, judges)
  VALUES ('delete', old.rowid, old.title, old.main_intro, old.main_body, old.legal_area, old.judges);
END;

CREATE TRIGGER decisions_au AFTER UPDATE ON decisions BEGIN
  INSERT INTO decisions_fts(decisions_fts, rowid, title, main_intro, main_body, legal_area, judges)
  VALUES ('delete', old.rowid, old.title, old.main_intro, old.main_body, old.legal_area, old.judges);
  INSERT INTO decisions_fts(rowid, title, main_intro, main_body, legal_area, judges)
  VALUES (new.rowid, new.title, new.main_intro, new.main_body, new.legal_area, new.judges);
END;

-- Build metadata
CREATE TABLE db_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// ─────────────────────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────────────────────

function buildDatabase(): void {
  console.log('Building Norwegian Court Decisions database...\n');

  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const insertDecision = db.prepare(`
    INSERT INTO decisions (
      document_id, case_number, court, title, decision_date,
      main_intro, main_body, legal_area, key_sections, judges,
      source_url, pdf_url, language,
      citation_publisher, citation_license, citation_attribution
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  if (!fs.existsSync(SEED_DIR)) {
    console.log(`No seed directory at ${SEED_DIR} — creating empty database.`);
    writeMetadata(db);
    db.close();
    return;
  }

  const seedFiles = fs.readdirSync(SEED_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('.') && !f.startsWith('_'))
    .sort();

  if (seedFiles.length === 0) {
    console.log('No seed files found. Database created with empty schema.');
    writeMetadata(db);
    db.close();
    return;
  }

  let totalLoaded = 0;
  let totalSkipped = 0;

  const loadAll = db.transaction(() => {
    for (const file of seedFiles) {
      const filePath = path.join(SEED_DIR, file);
      let seed: DecisionSeed;
      try {
        seed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DecisionSeed;
      } catch (err) {
        console.warn(`  SKIP ${file}: parse error — ${err}`);
        totalSkipped++;
        continue;
      }

      if (!seed.id || !seed.case_number || !seed.source_url) {
        console.warn(`  SKIP ${file}: missing required fields (id, case_number, source_url)`);
        totalSkipped++;
        continue;
      }

      try {
        insertDecision.run(
          seed.id,
          seed.case_number,
          seed.court ?? 'Høyesterett',
          seed.title ?? seed.case_number,
          seed.decision_date ?? null,
          seed.main_intro ?? null,
          seed.main_body ?? null,
          seed.legal_area ?? null,
          seed.key_sections ?? null,
          seed.judges ?? null,
          seed.source_url,
          seed.pdf_url ?? null,
          seed.language ?? 'nb',
          seed._citation?.publisher ?? 'domstol.no',
          seed._citation?.license ?? 'Norwegian-Court-Publication',
          seed._citation?.attribution_text ?? null
        );
        totalLoaded++;
      } catch (err) {
        // Likely UNIQUE constraint on case_number — skip duplicate
        console.warn(`  SKIP ${file}: insert error — ${err}`);
        totalSkipped++;
      }
    }
  });

  loadAll();
  writeMetadata(db);

  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma('journal_mode = DELETE');
  db.exec('ANALYZE');
  db.close();

  const size = fs.statSync(DB_PATH).size;
  console.log(`\nBuild complete: ${totalLoaded} decisions loaded, ${totalSkipped} skipped`);
  console.log(`Output: ${DB_PATH} (${(size / 1024).toFixed(1)} KB)`);
}

function writeMetadata(db: Database.Database): void {
  const insertMeta = db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)');
  db.transaction(() => {
    insertMeta.run('tier', 'free');
    insertMeta.run('schema_version', '1');
    insertMeta.run('built_at', new Date().toISOString());
    insertMeta.run('builder', 'build-db.ts');
    insertMeta.run('jurisdiction', 'NO');
    insertMeta.run('corpus', 'hoyesterett-decisions');
  })();
}

buildDatabase();
