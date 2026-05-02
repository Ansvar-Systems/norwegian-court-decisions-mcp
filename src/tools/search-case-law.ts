/**
 * search_case_law — Full-text search across Norwegian Supreme Court (Høyesterett) decisions.
 *
 * Searches the `decisions_fts` FTS5 table over: title, main_intro, main_body, legal_area, judges.
 * Returns results with a valid `_citation` triple per item (publisher: domstol.no,
 * license: Norwegian-Court-Publication).
 *
 * Coverage: post-2021 decisions published on domstol.no (anonymized per Høyesterett policy).
 * Full verbatim decision text requires PDF ingestion (Phase 2, not yet available).
 */

import type Database from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { buildCaseLawCitation } from '../utils/citation.js';

export interface SearchCaseLawInput {
  query: string;
  court?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export interface CaseLawResult {
  document_id: string;
  title: string;
  case_number: string;
  court: string;
  decision_date: string | null;
  legal_area: string | null;
  judges: string | null;
  snippet: string;
  source_url: string;
  _citation: {
    source_url: string;
    publisher: string;
    license: string;
    canonical_ref: string;
    display_text: string;
    attribution_text: string;
  };
}

interface DecisionRow {
  document_id: string;
  title: string;
  case_number: string;
  court: string;
  decision_date: string | null;
  legal_area: string | null;
  judges: string | null;
  main_body: string | null;
  source_url: string;
  rank: number;
}

/**
 * Build a short snippet from main_body (first 300 chars, cleaned).
 */
function buildSnippet(mainBody: string | null, query: string): string {
  if (!mainBody) return '';
  // Strip HTML tags and entities using safe regex (lessons learned from cleanText fleet bug)
  const text = mainBody
    .replace(/<\/?[a-zA-Z][^<>]{0,200}>/g, ' ')
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Try to find a sentence containing the query term for a more useful snippet
  const lowerQuery = query.toLowerCase();
  const sentences = text.split(/[.!?]+/);
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(lowerQuery)) {
      const trimmed = sentence.trim();
      if (trimmed.length > 20) {
        return trimmed.slice(0, 300) + (trimmed.length > 300 ? '...' : '');
      }
    }
  }

  return text.slice(0, 300) + (text.length > 300 ? '...' : '');
}

export async function searchCaseLaw(
  db: InstanceType<typeof Database>,
  input: SearchCaseLawInput
): Promise<ToolResponse<CaseLawResult[]>> {
  const limit = Math.min(input.limit ?? 10, 50);
  const query = input.query.trim();

  if (!query) {
    return {
      results: [],
      _meta: {
        ...generateResponseMetadata(db),
        note: 'Empty query — provide at least one search term.',
      },
    };
  }

  // Check if the decisions table exists (may be absent on fresh install)
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='decisions'"
  ).get();

  if (!tableExists) {
    return {
      results: [],
      _meta: {
        ...generateResponseMetadata(db),
        note: 'data-source-unavailable: The decisions table has not been built yet. Run `npm run ingest` then `npm run build:db` to populate the database.',
      },
    };
  }

  const totalRow = db.prepare('SELECT COUNT(*) as count FROM decisions').get() as { count: number };
  if (totalRow.count === 0) {
    return {
      results: [],
      _meta: {
        ...generateResponseMetadata(db),
        note: 'data-source-unavailable: The decisions table is empty. Run `npm run ingest` then `npm run build:db` to populate the database with domstol.no court decisions.',
      },
    };
  }

  try {
    // Build WHERE clause additions for optional filters
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (input.court) {
      conditions.push('d.court = ?');
      params.push(input.court);
    }
    if (input.date_from) {
      conditions.push('d.decision_date >= ?');
      params.push(input.date_from);
    }
    if (input.date_to) {
      conditions.push('d.decision_date <= ?');
      params.push(input.date_to);
    }

    const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

    // FTS5 search with BM25 ranking; fall back to LIKE on parse error
    let rows: DecisionRow[];
    try {
      const ftsQuery = `
        SELECT
          d.document_id,
          d.title,
          d.case_number,
          d.court,
          d.decision_date,
          d.legal_area,
          d.judges,
          d.main_body,
          d.source_url,
          bm25(decisions_fts) AS rank
        FROM decisions_fts
        JOIN decisions d ON d.rowid = decisions_fts.rowid
        WHERE decisions_fts MATCH ?
        ${whereClause}
        ORDER BY rank
        LIMIT ?
      `;
      rows = db.prepare(ftsQuery).all(query, ...params, limit) as DecisionRow[];
    } catch {
      // FTS5 syntax error — fall back to LIKE search
      const likeQuery = `
        SELECT
          d.document_id,
          d.title,
          d.case_number,
          d.court,
          d.decision_date,
          d.legal_area,
          d.judges,
          d.main_body,
          d.source_url,
          0 AS rank
        FROM decisions d
        WHERE (d.title LIKE ? OR d.main_body LIKE ? OR d.main_intro LIKE ?)
        ${whereClause}
        ORDER BY d.decision_date DESC
        LIMIT ?
      `;
      const likePattern = `%${query}%`;
      rows = db.prepare(likeQuery).all(likePattern, likePattern, likePattern, ...params, limit) as DecisionRow[];
    }

    const results: CaseLawResult[] = rows.map(row => {
      const citation = buildCaseLawCitation(row.case_number, row.title, row.source_url);
      return {
        document_id: row.document_id,
        title: row.title,
        case_number: row.case_number,
        court: row.court,
        decision_date: row.decision_date,
        legal_area: row.legal_area,
        judges: row.judges,
        snippet: buildSnippet(row.main_body, query),
        source_url: row.source_url,
        _citation: {
          source_url: citation.source_url,
          publisher: citation.publisher,
          license: citation.license,
          canonical_ref: citation.canonical_ref,
          display_text: citation.display_text,
          attribution_text: citation.attribution_text,
        },
      };
    });

    return {
      results,
      _meta: {
        ...generateResponseMetadata(db),
        note: results.length === 0
          ? `No decisions found for query "${query}". Try broader terms or Norwegian keywords.`
          : undefined,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      results: [],
      _meta: {
        ...generateResponseMetadata(db),
        note: `Search error: ${message}`,
      },
    };
  }
}
