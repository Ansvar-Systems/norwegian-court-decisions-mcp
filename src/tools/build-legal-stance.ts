/**
 * build_legal_stance — Aggregate citations from multiple sources for a legal question.
 *
 * Searches across statutes, case law, and preparatory works to build
 * a comprehensive set of citations relevant to a legal topic.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants } from '../utils/fts-query.js';
import { normalizeAsOfDate } from '../utils/as-of-date.js';
import { resolveDocumentId } from '../utils/statute-id.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { buildProvisionCitation } from '../utils/citation.js';
import type { CitationMetadata } from '../utils/citation.js';

export interface BuildLegalStanceInput {
  query: string;
  document_id?: string;
  include_case_law?: boolean;
  include_preparatory_works?: boolean;
  as_of_date?: string;
  limit?: number;
}

interface ProvisionHit {
  document_id: string;
  document_title: string;
  provision_ref: string;
  title: string | null;
  snippet: string;
  relevance: number;
  _citation: CitationMetadata;
}

interface ProvisionRow {
  document_id: string;
  document_title: string;
  document_short_name: string | null;
  document_url: string | null;
  provision_ref: string;
  title: string | null;
  snippet: string;
  relevance: number;
}

interface CaseLawHit {
  document_id: string;
  title: string;
  court: string;
  decision_date: string | null;
  summary_snippet: string;
  relevance: number;
}

interface PrepWorkHit {
  statute_id: string;
  prep_document_id: string;
  title: string | null;
  summary_snippet: string;
  relevance: number;
}

export interface LegalStanceResult {
  query: string;
  provisions: ProvisionHit[];
  case_law: CaseLawHit[];
  preparatory_works: PrepWorkHit[];
  total_citations: number;
  as_of_date?: string;
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MIN_FALLBACK_TOKEN_HITS = 2;

function extractQueryTokens(query: string): string[] {
  return (query.normalize('NFC').match(/[\p{L}\p{N}_]+/gu) ?? [])
    .map(token => token.toLowerCase())
    .filter(token => token.length > 1);
}

function hasMinimumTokenCoverage(text: string, tokens: string[]): boolean {
  if (tokens.length <= 1) {
    return true;
  }

  const minHits = Math.min(MIN_FALLBACK_TOKEN_HITS, tokens.length);
  const haystack = text.toLowerCase();
  let hits = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) {
      hits += 1;
      if (hits >= minHits) {
        return true;
      }
    }
  }

  return false;
}

export async function buildLegalStance(
  db: Database,
  input: BuildLegalStanceInput
): Promise<ToolResponse<LegalStanceResult>> {
  if (!input.query || input.query.trim().length === 0) {
    return {
      results: { query: '', provisions: [], case_law: [], preparatory_works: [], total_citations: 0 },
      _meta: generateResponseMetadata(db)
    };
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  // Fetch extra rows to account for deduplication
  const fetchLimit = limit * 2;
  const queryVariants = buildFtsQueryVariants(input.query);
  const queryTokens = extractQueryTokens(input.query);
  const includeCaseLaw = input.include_case_law !== false;
  const includePrepWorks = input.include_preparatory_works !== false;
  const asOfDate = normalizeAsOfDate(input.as_of_date);
  let usedFallback = false;

  // Resolve document_id from title if provided
  let resolvedDocId: string | undefined;
  if (input.document_id) {
    const resolved = resolveDocumentId(db, input.document_id);
    resolvedDocId = resolved ?? undefined;
    if (!resolved) {
      return {
        results: { query: input.query, provisions: [], case_law: [], preparatory_works: [], total_citations: 0 },
        _meta: {
          ...generateResponseMetadata(db),
          note: `No document found matching "${input.document_id}"`,
        },
      };
    }
  }

  // Search provisions
  let provSql = '';
  const provParams: (string | number)[] = [];

  if (asOfDate) {
    provSql = `
      WITH ranked_versions AS (
        SELECT
          lpv.document_id,
          ld.title as document_title,
          ld.short_name as document_short_name,
          ld.url as document_url,
          lpv.provision_ref,
          lpv.title,
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
    provParams.push(asOfDate, asOfDate);

    if (resolvedDocId) {
      provSql += ` AND lpv.document_id = ?`;
      provParams.push(resolvedDocId);
    }

    provSql += `
      )
      SELECT
        document_id,
        document_title,
        document_short_name,
        document_url,
        provision_ref,
        title,
        snippet,
        relevance
      FROM ranked_versions
      WHERE version_rank = 1
      ORDER BY relevance LIMIT ?
    `;
  } else {
    provSql = `
      SELECT
        lp.document_id,
        ld.title as document_title,
        ld.short_name as document_short_name,
        ld.url as document_url,
        lp.provision_ref,
        lp.title,
        snippet(provisions_fts, 0, '>>>', '<<<', '...', 32) as snippet,
        bm25(provisions_fts) as relevance
      FROM provisions_fts
      JOIN legal_provisions lp ON lp.id = provisions_fts.rowid
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE provisions_fts MATCH ?
    `;

    if (resolvedDocId) {
      provSql += ` AND lp.document_id = ?`;
      provParams.push(resolvedDocId);
    }

    provSql += ` ORDER BY relevance LIMIT ?`;
  }
  provParams.push(fetchLimit);

  const runProvisionQuery = (ftsQuery: string): ProvisionHit[] => {
    const bound = [ftsQuery, ...provParams];
    const rows = db.prepare(provSql).all(...bound) as ProvisionRow[];
    return rows.map(row => ({
      document_id: row.document_id,
      document_title: row.document_title,
      provision_ref: row.provision_ref,
      title: row.title,
      snippet: row.snippet,
      relevance: row.relevance,
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
  let provisions = runProvisionQuery(queryVariants.primary);
  if (provisions.length === 0 && queryVariants.fallback) {
    provisions = runProvisionQuery(queryVariants.fallback);
    if (provisions.length > 0) usedFallback = true;
  }
  provisions = deduplicateProvisions(provisions, limit);

  // Search case law
  let caseLaw: CaseLawHit[] = [];
  if (includeCaseLaw) {
    let clSql = `
      SELECT
        cl.document_id,
        COALESCE(ld.title, cl.case_number, cl.document_id) as title,
        cl.court,
        cl.decision_date,
        snippet(case_law_fts, 0, '>>>', '<<<', '...', 32) as summary_snippet,
        bm25(case_law_fts) as relevance
      FROM case_law_fts
      JOIN case_law cl ON cl.id = case_law_fts.rowid
      LEFT JOIN legal_documents ld ON ld.id = cl.document_id
      WHERE case_law_fts MATCH ?
    `;
    const clParams: (string | number)[] = [];
    if (asOfDate) {
      clSql += ` AND (cl.decision_date IS NULL OR cl.decision_date <= ?)`;
      clParams.push(asOfDate);
    }
    clSql += ` ORDER BY relevance LIMIT ?`;
    clParams.push(limit);

    const runCaseLawQuery = (ftsQuery: string): CaseLawHit[] =>
      db.prepare(clSql).all(ftsQuery, ...clParams) as CaseLawHit[];

    caseLaw = runCaseLawQuery(queryVariants.primary);
    if (caseLaw.length === 0 && queryVariants.fallback) {
      caseLaw = runCaseLawQuery(queryVariants.fallback).filter(hit =>
        hasMinimumTokenCoverage(`${hit.title} ${hit.summary_snippet}`, queryTokens)
      );
    }
  }

  // Search preparatory works
  let prepWorks: PrepWorkHit[] = [];
  if (includePrepWorks) {
    let pwSql = `
      SELECT
        pw.statute_id,
        pw.prep_document_id,
        pw.title,
        snippet(prep_works_fts, 1, '>>>', '<<<', '...', 32) as summary_snippet,
        bm25(prep_works_fts) as relevance
      FROM prep_works_fts
      JOIN preparatory_works pw ON pw.id = prep_works_fts.rowid
      JOIN legal_documents prep_doc ON prep_doc.id = pw.prep_document_id
      WHERE prep_works_fts MATCH ?
    `;
    const pwParams: (string | number)[] = [];
    if (asOfDate) {
      pwSql += ` AND (prep_doc.issued_date IS NULL OR prep_doc.issued_date <= ?)`;
      pwParams.push(asOfDate);
    }
    pwSql += ` ORDER BY relevance LIMIT ?`;
    pwParams.push(limit);
    const runPrepQuery = (ftsQuery: string): PrepWorkHit[] =>
      db.prepare(pwSql).all(ftsQuery, ...pwParams) as PrepWorkHit[];

    prepWorks = runPrepQuery(queryVariants.primary);
    if (prepWorks.length === 0 && queryVariants.fallback) {
      prepWorks = runPrepQuery(queryVariants.fallback).filter(hit =>
        hasMinimumTokenCoverage(`${hit.title || ''} ${hit.summary_snippet}`, queryTokens)
      );
    }
  }

  return {
    results: {
      query: input.query,
      provisions,
      case_law: caseLaw,
      preparatory_works: prepWorks,
      total_citations: provisions.length + caseLaw.length + prepWorks.length,
      as_of_date: asOfDate,
    },
    _meta: {
      ...generateResponseMetadata(db),
      ...(usedFallback ? { query_strategy: 'broadened' } : {}),
    },
  };
}

/**
 * Deduplicate provision results by document_title + provision_ref.
 * Duplicate document IDs (numeric vs slug) cause the same provision to appear twice.
 * Keeps the first (highest-ranked) occurrence.
 */
function deduplicateProvisions(
  rows: ProvisionHit[],
  limit: number,
): ProvisionHit[] {
  const seen = new Set<string>();
  const deduped: ProvisionHit[] = [];
  for (const row of rows) {
    const key = `${row.document_title}::${row.provision_ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }
  return deduped;
}
