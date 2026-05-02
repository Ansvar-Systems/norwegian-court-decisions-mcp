/**
 * list_sources tool — returns data provenance metadata.
 * Required by Ansvar MCP audit standard (Phase 1.5).
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ListSourcesResult {
  jurisdiction: string;
  sources: Array<{
    name: string;
    authority: string;
    url: string;
    retrieval_method: string;
    update_frequency: string;
    last_ingested: string;
    license: string;
    coverage: string;
    limitations: string;
  }>;
  data_freshness: {
    automated_checks: boolean;
    check_frequency: string;
    last_verified: string;
  };
}

/**
 * Read the database build date from db_metadata if available.
 * Falls back to a sensible default if the table doesn't exist.
 */
function readBuildDate(db?: InstanceType<typeof Database>): string {
  if (!db) return 'unknown';
  try {
    const hasTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='db_metadata'"
    ).get();
    if (!hasTable) return 'unknown';

    const row = db.prepare("SELECT value FROM db_metadata WHERE key = 'built_at'").get() as
      | { value: string }
      | undefined;
    if (row?.value && row.value !== 'unknown') {
      // Return date portion only (YYYY-MM-DD)
      return row.value.slice(0, 10);
    }
  } catch {
    // Non-fatal
  }
  return 'unknown';
}

export function listSources(db?: InstanceType<typeof Database>): ListSourcesResult {
  const buildDate = readBuildDate(db);
  const lastIngested = buildDate !== 'unknown' ? buildDate : 'see about tool';

  return {
    jurisdiction: 'Sweden (SE)',
    sources: [
      {
        name: 'Riksdagen Open Data',
        authority: 'Riksdagen (Swedish Parliament)',
        url: 'https://data.riksdagen.se/',
        retrieval_method: 'API',
        update_frequency: 'on_change',
        last_ingested: lastIngested,
        license: 'Swedish Government Open Data (PSI)',
        coverage: 'All consolidated Swedish statutes (SFS), chapters, sections, and provision text',
        limitations: 'May lag official publication by 24-48 hours; no editorial annotations',
      },
      {
        name: 'Lagen.nu',
        authority: 'Community-maintained (sources from Domstolsverket)',
        url: 'https://lagen.nu/',
        retrieval_method: 'RDF',
        update_frequency: 'weekly',
        last_ingested: lastIngested,
        license: 'CC-BY Domstolsverket',
        coverage: 'Swedish court decisions (HD, HFD, AD, RH, MÖD, MIG), 2011-2023',
        limitations: 'Not official; coverage varies by court and time period; volunteer-driven',
      },
      {
        name: 'EUR-Lex',
        authority: 'Publications Office of the European Union',
        url: 'https://eur-lex.europa.eu/',
        retrieval_method: 'API + manual verification',
        update_frequency: 'on_change',
        last_ingested: lastIngested,
        license: 'EU public domain',
        coverage: '228 EU documents (89 directives, 139 regulations) cross-referenced from Swedish statutes',
        limitations: 'Metadata only; full EU regulation text requires @ansvar/eu-regulations-mcp',
      },
    ],
    data_freshness: {
      automated_checks: true,
      check_frequency: 'daily',
      last_verified: lastIngested,
    },
  };
}
