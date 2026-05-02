import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync, existsSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';
import Database from '@ansvar/mcp-sqlite';
import { readDbMetadata } from '../src/capabilities.js';

const SERVER_NAME = 'swedish-legal-citations';
const SERVER_VERSION: string = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
).version;
const REPO_URL = 'https://github.com/Ansvar-Systems/swedish-law-mcp';
const FRESHNESS_MAX_DAYS = 30;

const SOURCE_DB = process.env.SWEDISH_LAW_DB_PATH
  || join(process.cwd(), 'data', 'database.db');
const TMP_DB = '/tmp/database.db';
const TMP_DB_LOCK = '/tmp/database.db.lock';

let cachedTier: string | null = null;

function getTier(): string {
  if (cachedTier) return cachedTier;
  try {
    if (existsSync(TMP_DB_LOCK)) {
      rmSync(TMP_DB_LOCK, { recursive: true, force: true });
    }
    if (!existsSync(TMP_DB) && existsSync(SOURCE_DB)) {
      copyFileSync(SOURCE_DB, TMP_DB);
    }
    const dbPath = existsSync(TMP_DB) ? TMP_DB : SOURCE_DB;
    if (!existsSync(dbPath)) return 'unknown';

    const db = new Database(dbPath, { readonly: true });
    const metadata = readDbMetadata(db);
    db.close();
    cachedTier = metadata.tier;
    return cachedTier;
  } catch {
    return 'unknown';
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/', `https://${req.headers.host}`);

  if (url.pathname === '/version' || url.searchParams.has('version')) {
    res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      node_version: process.version,
      transport: ['stdio', 'streamable-http'],
      capabilities: ['statutes', 'eu_cross_references', 'case_law'],
      tier: getTier(),
      source_schema_version: '1.0',
      repo_url: REPO_URL,
      report_issue_url: `${REPO_URL}/issues/new?template=data-error.md`,
    });
    return;
  }

  res.status(200).json({
    status: 'ok',
    server: SERVER_NAME,
    version: SERVER_VERSION,
    uptime_seconds: Math.floor(process.uptime()),
    data_freshness: {
      max_age_days: FRESHNESS_MAX_DAYS,
      note: 'Serving bundled database',
    },
    capabilities: ['statutes', 'eu_cross_references', 'case_law'],
    tier: getTier(),
  });
}
