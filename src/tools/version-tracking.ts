/**
 * Premium version tracking tools for Norwegian Law MCP.
 *
 * These tools provide provision history timelines, change diffs, and cross-statute
 * change monitoring. They leverage the existing legal_provision_versions table
 * but are gated behind the PREMIUM_ENABLED env var.
 *
 * On free tier, tools return an upgrade message pointing to Ansvar Intelligence Portal.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { buildProvisionCitation } from '../utils/citation.js';
import type { CitationMetadata } from '../utils/citation.js';

// ── Premium gate ─────────────────────────────────────────────────────────────

function isPremiumEnabled(): boolean {
  return process.env.PREMIUM_ENABLED === 'true';
}

function upgradeResponse() {
  return {
    premium: false,
    message:
      'Version tracking requires Ansvar Intelligence Portal (premium tier). ' +
      'Contact hello@ansvar.ai for access.',
    upgrade_url: 'https://ansvar.eu/intelligence-portal',
  };
}

// ── Input types ──────────────────────────────────────────────────────────────

export interface GetProvisionHistoryInput {
  document_id: string;
  provision_ref: string;
}

export interface DiffProvisionInput {
  document_id: string;
  provision_ref: string;
  from_date: string;
  to_date?: string;
}

export interface GetRecentChangesInput {
  since: string;
  document_id?: string;
  limit?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a document_id that might be a title or short_name.
 * Returns the canonical SFS number (e.g., "2018:218").
 */
function resolveDocumentId(db: Database, input: string): string {
  // Direct match
  const direct = db.prepare(
    'SELECT id FROM legal_documents WHERE id = ?',
  ).get(input) as { id: string } | undefined;
  if (direct) return direct.id;

  // Title or short_name match
  const byName = db.prepare(
    "SELECT id FROM legal_documents WHERE title LIKE ? OR short_name LIKE ? OR title_en LIKE ? LIMIT 1",
  ).get(`%${input}%`, `%${input}%`, `%${input}%`) as { id: string } | undefined;
  if (byName) return byName.id;

  throw new Error(`Statute "${input}" not found. Use a LOV/FOR ID (e.g., "LOV-2018-06-15-38") or statute title (e.g., "personopplysningsloven").`);
}

/**
 * Generate a simple unified diff between two text blocks.
 */
function generateDiff(oldText: string, newText: string, label: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines: string[] = [`--- a/${label}`, `+++ b/${label}`, `@@ -1,${oldLines.length} +1,${newLines.length} @@`];
  for (const line of oldLines) lines.push(`-${line}`);
  for (const line of newLines) lines.push(`+${line}`);
  return lines.join('\n');
}

// ── Tool implementations ─────────────────────────────────────────────────────

export async function getProvisionHistory(
  db: Database,
  input: GetProvisionHistoryInput,
): Promise<unknown> {
  if (!isPremiumEnabled()) return upgradeResponse();

  const documentId = resolveDocumentId(db, input.document_id);

  // Also fetch document title, short_name, and url for citation building
  const docRow = db.prepare(`
    SELECT title, short_name, url FROM legal_documents WHERE id = ?
  `).get(documentId) as { title: string; short_name: string | null; url: string | null } | undefined;

  const versions = db.prepare(`
    SELECT
      provision_ref,
      chapter,
      section,
      title,
      content,
      valid_from,
      valid_to
    FROM legal_provision_versions
    WHERE document_id = ?
      AND provision_ref = ?
    ORDER BY valid_from ASC
  `).all(documentId, input.provision_ref) as Array<{
    provision_ref: string;
    chapter: string | null;
    section: string;
    title: string | null;
    content: string;
    valid_from: string | null;
    valid_to: string | null;
  }>;

  const current = versions.find(v => v.valid_to === null);

  return {
    document_id: documentId,
    provision_ref: input.provision_ref,
    versions: versions.map(v => ({
      content: v.content,
      title: v.title,
      valid_from: v.valid_from,
      valid_to: v.valid_to,
      is_current: v.valid_to === null,
      _citation: buildProvisionCitation(
        documentId,
        docRow?.title ?? documentId,
        v.provision_ref,
        input.document_id,
        input.provision_ref,
        docRow?.url ?? null,
        docRow?.short_name ?? null,
      ),
    })),
    current_version: current?.valid_from ?? null,
    total_versions: versions.length,
  };
}

export async function diffProvision(
  db: Database,
  input: DiffProvisionInput,
): Promise<unknown> {
  if (!isPremiumEnabled()) return upgradeResponse();

  const documentId = resolveDocumentId(db, input.document_id);
  const toDate = input.to_date ?? new Date().toISOString().slice(0, 10);

  // Fetch document metadata for citation building
  const docRow = db.prepare(`
    SELECT title, short_name, url FROM legal_documents WHERE id = ?
  `).get(documentId) as { title: string; short_name: string | null; url: string | null } | undefined;

  // Get version valid at from_date
  const fromVersion = db.prepare(`
    SELECT content, valid_from, valid_to
    FROM legal_provision_versions
    WHERE document_id = ?
      AND provision_ref = ?
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to IS NULL OR valid_to > ?)
    ORDER BY valid_from DESC
    LIMIT 1
  `).get(documentId, input.provision_ref, input.from_date, input.from_date) as {
    content: string; valid_from: string | null; valid_to: string | null;
  } | undefined;

  // Get version valid at to_date
  const toVersion = db.prepare(`
    SELECT content, valid_from, valid_to
    FROM legal_provision_versions
    WHERE document_id = ?
      AND provision_ref = ?
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to IS NULL OR valid_to > ?)
    ORDER BY valid_from DESC
    LIMIT 1
  `).get(documentId, input.provision_ref, toDate, toDate) as {
    content: string; valid_from: string | null; valid_to: string | null;
  } | undefined;

  if (!fromVersion && !toVersion) {
    throw new Error(
      `Provision "${input.provision_ref}" not found in statute "${documentId}".`,
    );
  }

  const changed = fromVersion?.content !== toVersion?.content;

  const citation: CitationMetadata = buildProvisionCitation(
    documentId,
    docRow?.title ?? documentId,
    input.provision_ref,
    input.document_id,
    input.provision_ref,
    docRow?.url ?? null,
    docRow?.short_name ?? null,
  );

  return {
    document_id: documentId,
    provision_ref: input.provision_ref,
    from_date: input.from_date,
    to_date: toDate,
    diff: changed && fromVersion && toVersion
      ? generateDiff(fromVersion.content, toVersion.content, `${documentId}_${input.provision_ref}`)
      : null,
    change_summary: changed
      ? `Text changed between ${input.from_date} and ${toDate}`
      : `No changes between ${input.from_date} and ${toDate}`,
    from_version: fromVersion ? { valid_from: fromVersion.valid_from, valid_to: fromVersion.valid_to } : null,
    to_version: toVersion ? { valid_from: toVersion.valid_from, valid_to: toVersion.valid_to } : null,
    _citation: citation,
  };
}

export async function getRecentChanges(
  db: Database,
  input: GetRecentChangesInput,
): Promise<unknown> {
  if (!isPremiumEnabled()) return upgradeResponse();

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  let query = `
    SELECT
      v.document_id,
      v.provision_ref,
      v.title,
      v.valid_from,
      v.valid_to,
      d.title AS document_title,
      d.short_name,
      d.url AS source_url
    FROM legal_provision_versions v
    JOIN legal_documents d ON d.id = v.document_id
    WHERE v.valid_from >= ?
  `;
  const params: (string | number)[] = [input.since];

  if (input.document_id) {
    query += ' AND v.document_id = ?';
    params.push(input.document_id);
  }

  query += ' ORDER BY v.valid_from DESC LIMIT ?';
  params.push(limit);

  const changes = db.prepare(query).all(...params) as Array<{
    document_id: string;
    provision_ref: string;
    title: string | null;
    valid_from: string;
    valid_to: string | null;
    document_title: string;
    short_name: string | null;
    source_url: string | null;
  }>;

  return {
    changes: changes.map(c => ({
      document_id: c.document_id,
      provision_ref: c.provision_ref,
      provision_title: c.title,
      effective_date: c.valid_from,
      superseded_date: c.valid_to,
      document_title: c.document_title,
      short_name: c.short_name,
      source_url: c.source_url,
      _citation: buildProvisionCitation(
        c.document_id,
        c.document_title,
        c.provision_ref,
        c.document_id,
        c.provision_ref,
        c.source_url,
        c.short_name,
      ),
    })),
    total: changes.length,
    since: input.since,
  };
}
