import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Database from '@ansvar/mcp-sqlite';
import { join } from 'path';
import { existsSync, copyFileSync, rmSync, readFileSync, statSync } from 'fs';
import { createHash } from 'crypto';

import { registerTools } from '../src/tools/registry.js';
import type { AboutContext } from '../src/tools/about.js';

const PKG_PATH = join(process.cwd(), 'package.json');
const pkgVersion: string = JSON.parse(readFileSync(PKG_PATH, 'utf-8')).version;

const SOURCE_DB = process.env.SWEDISH_LAW_DB_PATH
  || join(process.cwd(), 'data', 'database.db');
const TMP_DB = '/tmp/database.db';
const TMP_DB_LOCK = '/tmp/database.db.lock';

// Cache DB connection and aboutContext across warm requests.
// The Server itself MUST be created per-request because server.connect()
// throws if the server is already connected to a transport.
let db: InstanceType<typeof Database> | null = null;
let aboutContext: AboutContext | null = null;

function getDatabase(): InstanceType<typeof Database> {
  if (!db) {
    // Clean stale lock directory from previous invocations
    if (existsSync(TMP_DB_LOCK)) {
      rmSync(TMP_DB_LOCK, { recursive: true, force: true });
    }
    if (!existsSync(TMP_DB)) {
      copyFileSync(SOURCE_DB, TMP_DB);
    }
    db = new Database(TMP_DB, { readonly: true });
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function getAboutContext(): AboutContext {
  if (!aboutContext) {
    let fingerprint = 'unknown';
    let dbBuilt = new Date().toISOString();
    try {
      const dbPath = existsSync(TMP_DB) ? TMP_DB : SOURCE_DB;
      const dbBuffer = readFileSync(dbPath);
      fingerprint = createHash('sha256').update(dbBuffer).digest('hex').slice(0, 12);
      const dbStat = statSync(dbPath);
      dbBuilt = dbStat.mtime.toISOString();
    } catch {
      // Non-fatal
    }
    aboutContext = { version: pkgVersion, fingerprint, dbBuilt };
  }
  return aboutContext;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      name: 'swedish-legal-citations',
      version: pkgVersion,
      protocol: 'mcp-streamable-http',
    });
    return;
  }

  try {
    if (!existsSync(SOURCE_DB)) {
      res.status(500).json({ error: `Database not found at ${SOURCE_DB}` });
      return;
    }

    const database = getDatabase();

    // Fresh Server per request — required because server.connect() throws
    // if already connected ("use a separate Protocol instance per connection")
    const server = new Server(
      { name: 'swedish-legal-citations', version: pkgVersion },
      { capabilities: { tools: {} } }
    );

    registerTools(server, database, getAboutContext());

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('MCP handler error:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}
