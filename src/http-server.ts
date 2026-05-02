#!/usr/bin/env node
/**
 * Swedish Legal Citation MCP Server (HTTP transport)
 *
 * Standalone HTTP server for Docker deployment.
 * Exposes /health and /mcp endpoints.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from '@ansvar/mcp-sqlite';
import { registerTools } from './tools/registry.js';
import { detectCapabilities, readDbMetadata } from './capabilities.js';
import type { AboutContext } from './tools/about.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = parseInt(process.env.PORT || '3000', 10);
const SERVER_NAME = 'norwegian-legal-citations';
const DB_ENV_VAR = 'SWEDISH_LAW_DB_PATH';

function resolveDbPath(): string {
  if (process.env[DB_ENV_VAR]) return process.env[DB_ENV_VAR]!;
  const relative = join(__dirname, '..', '..', 'data', 'database.db');
  if (existsSync(relative)) return relative;
  const alt = join(__dirname, '..', 'data', 'database.db');
  if (existsSync(alt)) return alt;
  throw new Error(`Database not found. Set ${DB_ENV_VAR} or ensure data/database.db exists`);
}

async function main() {
  const dbPath = resolveDbPath();
  const db = new Database(dbPath, { readonly: true });
  db.pragma('foreign_keys = ON');

  const caps = detectCapabilities(db);
  const meta = readDbMetadata(db);
  const pkgVersion: string = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;

  console.log(`[${SERVER_NAME}] Database: ${dbPath}`);
  console.log(`[${SERVER_NAME}] Tier: ${meta.tier}, Capabilities: ${[...caps].join(', ')}`);

  let fingerprint = 'unknown';
  let dbBuilt = new Date().toISOString();
  try {
    const dbBuffer = readFileSync(dbPath);
    fingerprint = createHash('sha256').update(dbBuffer).digest('hex').slice(0, 12);
    dbBuilt = statSync(dbPath).mtime.toISOString();
  } catch { /* non-fatal */ }
  const aboutContext: AboutContext = { version: pkgVersion, fingerprint, dbBuilt };

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  function createMCPServer(): Server {
    const server = new Server(
      { name: SERVER_NAME, version: pkgVersion },
      { capabilities: { tools: {} } },
    );
    registerTools(server, db, aboutContext);
    return server;
  }

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.pathname === '/health' && req.method === 'GET') {
        let dbOk = false;
        try {
          db.prepare('SELECT 1').get();
          dbOk = true;
        } catch { /* DB not healthy */ }
        res.writeHead(dbOk ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: dbOk ? 'ok' : 'degraded',
          server: SERVER_NAME,
          version: pkgVersion,
        }));
        return;
      }

      if (url.pathname === '/mcp') {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (sessionId && sessions.has(sessionId)) {
          await sessions.get(sessionId)!.handleRequest(req, res);
          return;
        }

        if (req.method === 'POST') {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });
          const server = createMCPServer();
          await server.connect(transport);
          transport.onclose = () => {
            if (transport.sessionId) sessions.delete(transport.sessionId);
          };
          await transport.handleRequest(req, res);
          if (transport.sessionId) sessions.set(transport.sessionId, transport);
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request — missing or invalid session' }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      console.error('[HTTP] Unhandled error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`${SERVER_NAME} v${pkgVersion} HTTP server listening on port ${PORT}`);
  });

  const shutdown = () => {
    console.log('Shutting down...');
    for (const [, t] of sessions) t.close().catch(() => {});
    sessions.clear();
    try { db.close(); } catch {}
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
