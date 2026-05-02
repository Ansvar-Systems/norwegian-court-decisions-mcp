# Coverage Limitations

## What This MCP Covers

This MCP covers the current consolidated corpus distributed by Stiftelsen Lovdata via the Open Data API (`api.lovdata.no`):

- **Gjeldende lover** — all current consolidated Norwegian statutes (approximately 700 unique laws after deduplicating Bokmål and Nynorsk parallel texts)
- **Gjeldende sentrale forskrifter** — all current central regulations

Both corpora are distributed as tar.bz2 archives and published under NLOD 2.0.

## What This MCP Does NOT Cover

### Historical and Repealed Legislation

Only current consolidated text is included. Historical statute versions, amendment histories, and repealed legislation are not available through the Open Data API endpoint and are therefore out of scope.

### Case Law

Norwegian case law (Høyesterett, Lagmannsretten, tingretten) is not included in this MCP. For case law research, use the separate `norwegian-court-decisions-mcp` or a commercial database such as Lovdata (full subscription) or Rettsdata.

### Preparatory Works (Forarbeider)

Forarbeider — including odelstingsproposisjoner, innstillinger, stortingsdebatter, and NOU reports — are part of the Lovdata Pro tier and are not available through the Open Data API. They are out of scope for this MCP.

### Agency Guidance and Administrative Decisions

Guidance from Norwegian regulatory authorities (Datatilsynet, Finanstilsynet, Konkurransetilsynet, etc.) and administrative decisions (forvaltningsvedtak) are not included.

### Expert Statements and Legal Literature

Legal textbooks, journal articles, and expert statements are not included.

### Local Regulations (Lokale Forskrifter)

The Open Data API endpoint covers central regulations only. Local regulations issued by municipalities and counties are out of scope.

### EU/EEA Law

Full EU regulation and directive text is not included in this MCP. Use `@ansvar/eu-regulations-mcp` for EU law. Norwegian statute cross-references to EU acts are available through the `get_eu_basis` tool.

## Bokmål / Nynorsk Deduplication

Many Norwegian statutes are published in both Bokmål (nb) and Nynorsk (nn) versions. The ingestion pipeline deduplicates these at the statute level. Both language variants are searchable.

## Data Freshness

The corpus is updated monthly from api.lovdata.no. A freshness check workflow detects amendments and newly published statutes. Staleness warnings are emitted for data exceeding the configured threshold.

For time-sensitive professional legal work, always verify current text against lovdata.no directly.
