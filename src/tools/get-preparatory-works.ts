/**
 * get_preparatory_works — Retrieve preparatory works (forarbeider) for a Norwegian statute.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { buildProvisionCitation } from '../utils/citation.js';
import type { CitationMetadata } from '../utils/citation.js';

export interface GetPreparatoryWorksInput {
  document_id: string;
}

export interface PreparatoryWorkResult {
  statute_id: string;
  statute_title: string;
  prep_document_id: string;
  prep_type: string;
  prep_title: string;
  summary: string | null;
  issued_date: string | null;
  url: string | null;
  _citation: CitationMetadata;
}

export async function getPreparatoryWorks(
  db: Database,
  input: GetPreparatoryWorksInput
): Promise<ToolResponse<PreparatoryWorkResult[]>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }

  const sql = `
    SELECT
      pw.statute_id,
      statute.title as statute_title,
      statute.short_name as statute_short_name,
      statute.url as statute_url,
      pw.prep_document_id,
      prep.type as prep_type,
      COALESCE(pw.title, prep.title) as prep_title,
      pw.summary,
      prep.issued_date,
      prep.url
    FROM preparatory_works pw
    JOIN legal_documents statute ON statute.id = pw.statute_id
    JOIN legal_documents prep ON prep.id = pw.prep_document_id
    WHERE pw.statute_id = ?
    ORDER BY prep.issued_date
  `;

  interface PrepRow {
    statute_id: string;
    statute_title: string;
    statute_short_name: string | null;
    statute_url: string | null;
    prep_document_id: string;
    prep_type: string;
    prep_title: string;
    summary: string | null;
    issued_date: string | null;
    url: string | null;
  }

  const rows = db.prepare(sql).all(input.document_id) as PrepRow[];

  const results: PreparatoryWorkResult[] = rows.map(row => ({
    statute_id: row.statute_id,
    statute_title: row.statute_title,
    prep_document_id: row.prep_document_id,
    prep_type: row.prep_type,
    prep_title: row.prep_title,
    summary: row.summary,
    issued_date: row.issued_date,
    url: row.url,
    // Citation points to the parent statute (the downloaded legal text being referenced)
    _citation: buildProvisionCitation(
      row.statute_id,
      row.statute_title,
      '',
      input.document_id,
      '',
      row.statute_url,
      row.statute_short_name,
    ),
  }));

  return {
    results,
    _meta: generateResponseMetadata(db)
  };
}
