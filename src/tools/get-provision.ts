/**
 * get_provision — Retrieve a specific provision from a Swedish statute.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { normalizeAsOfDate } from '../utils/as-of-date.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { buildProvisionCitation } from '../utils/citation.js';
import { resolveDocumentId, normalizeProvisionRef } from '../utils/statute-id.js';

export interface GetProvisionInput {
  document_id: string;
  chapter?: string;
  section?: string;
  provision_ref?: string;
  as_of_date?: string;
}

export interface ProvisionResult {
  document_id: string;
  document_title: string;
  document_status: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  cross_references: CrossRefResult[];
  valid_from?: string | null;
  valid_to?: string | null;
}

interface CrossRefResult {
  target_document_id: string;
  target_provision_ref: string | null;
  ref_type: string;
}

interface ProvisionRow {
  document_id: string;
  document_title: string;
  document_status: string;
  document_url: string | null;
  document_short_name: string | null;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  content: string;
  metadata: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

export async function getProvision(
  db: Database,
  input: GetProvisionInput
): Promise<ToolResponse<ProvisionResult | ProvisionResult[] | null>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }

  const resolvedId = resolveDocumentId(db, input.document_id);
  if (!resolvedId) {
    return {
      results: null,
      _meta: generateResponseMetadata(db),
    };
  }
  input = { ...input, document_id: resolvedId };

  // If provision_ref is directly provided, normalize it
  let provisionRef = input.provision_ref
    ? normalizeProvisionRef(input.provision_ref)
    : undefined;
  if (!provisionRef) {
    if (input.chapter && input.section) {
      provisionRef = `${input.chapter}:${input.section}`;
    } else if (input.section) {
      provisionRef = input.section;
    }
  }

  const asOfDate = normalizeAsOfDate(input.as_of_date);

  // If no specific provision, return all provisions for the document (capped)
  if (!provisionRef) {
    const MAX_ALL_PROVISIONS = 100;
    const all = getAllProvisions(db, input.document_id, asOfDate, MAX_ALL_PROVISIONS + 1);
    const truncated = all.length > MAX_ALL_PROVISIONS;
    return {
      results: truncated ? all.slice(0, MAX_ALL_PROVISIONS) : all,
      ...(truncated && { _truncated: true, _hint: `Only first ${MAX_ALL_PROVISIONS} provisions returned. Use chapter+section to retrieve specific provisions.` }),
      _meta: generateResponseMetadata(db)
    };
  }

  let row: ProvisionRow | undefined;
  if (asOfDate) {
    const sql = `
      SELECT
        lpv.document_id,
        ld.title as document_title,
        ld.status as document_status,
        ld.url as document_url,
        ld.short_name as document_short_name,
        lpv.provision_ref,
        lpv.chapter,
        lpv.section,
        lpv.title,
        lpv.content,
        lpv.metadata,
        lpv.valid_from,
        lpv.valid_to
      FROM legal_provision_versions lpv
      JOIN legal_documents ld ON ld.id = lpv.document_id
      WHERE lpv.document_id = ?
        AND lpv.provision_ref = ?
        AND (lpv.valid_from IS NULL OR lpv.valid_from <= ?)
        AND (lpv.valid_to IS NULL OR lpv.valid_to > ?)
      ORDER BY COALESCE(lpv.valid_from, '0000-01-01') DESC, lpv.id DESC
      LIMIT 1
    `;
    row = db.prepare(sql).get(input.document_id, provisionRef, asOfDate, asOfDate) as ProvisionRow | undefined;
  } else {
    const sql = `
      SELECT
        lp.document_id,
        ld.title as document_title,
        ld.status as document_status,
        ld.url as document_url,
        ld.short_name as document_short_name,
        lp.provision_ref,
        lp.chapter,
        lp.section,
        lp.title,
        lp.content,
        lp.metadata,
        NULL as valid_from,
        NULL as valid_to
      FROM legal_provisions lp
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE lp.document_id = ? AND lp.provision_ref = ?
    `;
    row = db.prepare(sql).get(input.document_id, provisionRef) as ProvisionRow | undefined;
  }

  if (!row) {
    return {
      results: null,
      _meta: generateResponseMetadata(db)
    };
  }

  const crossRefs = db.prepare(`
    SELECT target_document_id, target_provision_ref, ref_type
    FROM cross_references
    WHERE source_document_id = ? AND (source_provision_ref = ? OR source_provision_ref IS NULL)
  `).all(input.document_id, provisionRef) as CrossRefResult[];

  return {
    results: {
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      cross_references: crossRefs,
    },
    _meta: generateResponseMetadata(db),
    _citation: buildProvisionCitation(
      row.document_id,
      row.document_title,
      row.provision_ref,
      input.document_id,
      provisionRef,
      row.document_url,
      row.document_short_name,
    ),
  };
}

function getAllProvisions(db: Database, documentId: string, asOfDate?: string, limit?: number): ProvisionResult[] {
  let rows: ProvisionRow[];

  if (asOfDate) {
    const sql = `
      WITH ranked_versions AS (
        SELECT
          lpv.document_id,
          ld.title as document_title,
          ld.status as document_status,
          lpv.provision_ref,
          lpv.chapter,
          lpv.section,
          lpv.title,
          lpv.content,
          lpv.metadata,
          lpv.valid_from,
          lpv.valid_to,
          row_number() OVER (
            PARTITION BY lpv.document_id, lpv.provision_ref
            ORDER BY COALESCE(lpv.valid_from, '0000-01-01') DESC, lpv.id DESC
          ) as version_rank
        FROM legal_provision_versions lpv
        JOIN legal_documents ld ON ld.id = lpv.document_id
        WHERE lpv.document_id = ?
          AND (lpv.valid_from IS NULL OR lpv.valid_from <= ?)
          AND (lpv.valid_to IS NULL OR lpv.valid_to > ?)
      )
      SELECT
        document_id,
        document_title,
        document_status,
        provision_ref,
        chapter,
        section,
        title,
        content,
        metadata,
        valid_from,
        valid_to
      FROM ranked_versions
      WHERE version_rank = 1
      ORDER BY provision_ref
      ${limit ? 'LIMIT ?' : ''}
    `;
    rows = db.prepare(sql).all(...[documentId, asOfDate, asOfDate, ...(limit ? [limit] : [])]) as ProvisionRow[];
  } else {
    const sql = `
      SELECT
        lp.document_id,
        ld.title as document_title,
        ld.status as document_status,
        lp.provision_ref,
        lp.chapter,
        lp.section,
        lp.title,
        lp.content,
        lp.metadata,
        NULL as valid_from,
        NULL as valid_to
      FROM legal_provisions lp
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE lp.document_id = ?
      ORDER BY lp.id
      ${limit ? 'LIMIT ?' : ''}
    `;
    rows = db.prepare(sql).all(...[documentId, ...(limit ? [limit] : [])]) as ProvisionRow[];
  }

  return rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    cross_references: [],
  }));
}
