/**
 * search_legislation — Full-text search across Norwegian statute provisions.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants } from '../utils/fts-query.js';
import { normalizeAsOfDate } from '../utils/as-of-date.js';
import { resolveDocumentId } from '../utils/statute-id.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { buildProvisionCitation } from '../utils/citation.js';
import type { CitationMetadata } from '../utils/citation.js';

export interface SearchLegislationInput {
  query: string;
  document_id?: string;
  status?: string;
  as_of_date?: string;
  limit?: number;
}

export interface SearchLegislationResult {
  document_id: string;
  document_title: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  snippet: string;
  relevance: number;
  valid_from?: string | null;
  valid_to?: string | null;
  _citation: CitationMetadata;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function searchLegislation(
  db: Database,
  input: SearchLegislationInput
): Promise<ToolResponse<SearchLegislationResult[]>> {
  if (!input.query || input.query.trim().length === 0) {
    return {
      results: [],
      _meta: generateResponseMetadata(db)
    };
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  // Fetch extra rows to account for deduplication
  const fetchLimit = limit * 2;
  const queryVariants = buildFtsQueryVariants(input.query);
  const asOfDate = normalizeAsOfDate(input.as_of_date);

  // Resolve document_id from title if provided (same resolution as get_provision)
  let resolvedDocId: string | undefined;
  if (input.document_id) {
    const resolved = resolveDocumentId(db, input.document_id);
    resolvedDocId = resolved ?? undefined;
    if (!resolved) {
      return {
        results: [],
        _meta: {
          ...generateResponseMetadata(db),
          note: `No document found matching "${input.document_id}"`,
        },
      };
    }
  }

  let sql = '';

  const params: (string | number)[] = [];

  if (asOfDate) {
    sql = `
      WITH ranked_versions AS (
        SELECT
          lpv.document_id,
          ld.title as document_title,
          ld.short_name as document_short_name,
          ld.url as document_url,
          lpv.provision_ref,
          lpv.chapter,
          lpv.section,
          lpv.title,
          lpv.valid_from,
          lpv.valid_to,
          substr(lpv.content, 1, 320) as snippet,
          0.0 as relevance,
          row_number() OVER (
            PARTITION BY lpv.document_id, lpv.provision_ref
            ORDER BY COALESCE(lpv.valid_from, '0000-01-01') DESC, lpv.id DESC
          ) as version_rank
        FROM provision_versions_fts
        JOIN legal_provision_versions lpv ON lpv.id = provision_versions_fts.rowid
        JOIN legal_documents ld ON ld.id = lpv.document_id
        WHERE provision_versions_fts MATCH ?
          AND (lpv.valid_from IS NULL OR lpv.valid_from <= ?)
          AND (lpv.valid_to IS NULL OR lpv.valid_to > ?)
    `;
    params.push(asOfDate, asOfDate);

    if (resolvedDocId) {
      sql += ` AND lpv.document_id = ?`;
      params.push(resolvedDocId);
    }

    if (input.status) {
      sql += ` AND ld.status = ?`;
      params.push(input.status);
    }

    sql += `
      )
      SELECT
        document_id,
        document_title,
        document_short_name,
        document_url,
        provision_ref,
        chapter,
        section,
        title,
        snippet,
        relevance,
        valid_from,
        valid_to
      FROM ranked_versions
      WHERE version_rank = 1
      ORDER BY relevance
      LIMIT ?
    `;
  } else {
    sql = `
      SELECT
        lp.document_id,
        ld.title as document_title,
        ld.short_name as document_short_name,
        ld.url as document_url,
        lp.provision_ref,
        lp.chapter,
        lp.section,
        lp.title,
        snippet(provisions_fts, 0, '>>>', '<<<', '...', 32) as snippet,
        bm25(provisions_fts) as relevance,
        NULL as valid_from,
        NULL as valid_to
      FROM provisions_fts
      JOIN legal_provisions lp ON lp.id = provisions_fts.rowid
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE provisions_fts MATCH ?
    `;

    if (resolvedDocId) {
      sql += ` AND lp.document_id = ?`;
      params.push(resolvedDocId);
    }

    if (input.status) {
      sql += ` AND ld.status = ?`;
      params.push(input.status);
    }

    sql += ` ORDER BY relevance LIMIT ?`;
  }

  params.push(fetchLimit);

  // Raw row type from SQLite includes extra fields not in SearchLegislationResult
  interface SearchRow {
    document_id: string;
    document_title: string;
    document_short_name: string | null;
    document_url: string | null;
    provision_ref: string;
    chapter: string | null;
    section: string;
    title: string | null;
    snippet: string;
    relevance: number;
    valid_from?: string | null;
    valid_to?: string | null;
  }

  const runQuery = (ftsQuery: string): SearchLegislationResult[] => {
    const bound = [ftsQuery, ...params];
    const rows = db.prepare(sql).all(...bound) as SearchRow[];
    return rows.map(row => ({
      document_id: row.document_id,
      document_title: row.document_title,
      provision_ref: row.provision_ref,
      chapter: row.chapter,
      section: row.section,
      title: row.title,
      snippet: row.snippet,
      relevance: row.relevance,
      valid_from: row.valid_from,
      valid_to: row.valid_to,
      _citation: buildProvisionCitation(
        row.document_id,
        row.document_title,
        row.provision_ref,
        row.document_id,
        row.provision_ref,
        row.document_url,
        row.document_short_name,
      ),
    }));
  };

  const primaryResults = runQuery(queryVariants.primary);
  if (primaryResults.length > 0) {
    return {
      results: deduplicateResults(primaryResults, limit),
      _meta: generateResponseMetadata(db),
    };
  }

  if (queryVariants.fallback) {
    const fallbackResults = runQuery(queryVariants.fallback);
    if (fallbackResults.length > 0) {
      return {
        results: deduplicateResults(fallbackResults, limit),
        _meta: {
          ...generateResponseMetadata(db),
          query_strategy: 'broadened',
        },
      };
    }
  }

  return {
    results: [],
    _meta: generateResponseMetadata(db),
  };
}

/**
 * Deduplicate search results by document_title + provision_ref.
 * Duplicate document IDs (numeric vs slug) cause the same provision to appear twice.
 * Keeps the first (highest-ranked) occurrence.
 */
function deduplicateResults(
  rows: SearchLegislationResult[],
  limit: number,
): SearchLegislationResult[] {
  const seen = new Set<string>();
  const deduped: SearchLegislationResult[] = [];
  for (const row of rows) {
    const key = `${row.document_title}::${row.provision_ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }
  return deduped;
}
