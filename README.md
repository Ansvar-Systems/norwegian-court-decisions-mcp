# Norwegian Law MCP Server

**Norwegian statutes and central regulations via api.lovdata.no — NLOD 2.0 licensed.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fnorwegian-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/norwegian-law-mcp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Data License](https://img.shields.io/badge/Data-NLOD_2.0-green)](https://data.norge.no/nlod/en/2.0/)

Query current Norwegian statutes (gjeldende lover) directly from Claude, Cursor, or any MCP-compatible client. Data sourced from Lovdata's sanctioned bulk API under NLOD 2.0.

Built by [Ansvar Systems](https://ansvar.eu)

**Data source:** Lovdata Open Data API (`api.lovdata.no/v1/publicData`). This MCP uses only the publicly-licensed bulk download endpoint. It does not scrape `lovdata.no/dokument/` HTML.

---

## Why This Exists

Norwegian legal research is scattered across Lovdata, Norsk Lovtidend publications, and EUR-Lex. Whether you're:
- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking if a statute is still in force
- A **legal tech developer** building tools on Norwegian law
- A **researcher** tracing legislative history from proposition to statute

...you shouldn't need browser tabs and manual PDF cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Norwegian law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use via Gateway (No Install Needed)

> Connect to the hosted version through the Ansvar Gateway — zero dependencies, nothing to install.

**Endpoint:** `https://gateway.ansvar.eu` (OAuth 2.1 — requires an Ansvar account)

<!-- TODO: confirm direct per-MCP endpoint URL once gateway routing is configured for norwegian-law -->

### Use Locally (npm)

```bash
npx @ansvar/norwegian-law-mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "norwegian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/norwegian-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "norwegian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/norwegian-law-mcp"]
    }
  }
}
```

## Example Queries

Once connected, ask naturally:

- *"What does Personopplysningsloven § 5 say about data minimisation?"*
- *"Is LOV-2018-06-15-38 (Personopplysningsloven) still in force?"*
- *"Find provisions about samtykke in Norwegian law"*
- *"Which Norwegian laws implement the GDPR?"*
- *"Get the text of Personopplysningsloven chapter 3"*
- *"Validate the citation LOV-2018-06-15-38"*
- *"Find regulations about personvern"*

---

## What's Included

| Category | Details |
|----------|---------|
| **Statutes** | All current consolidated Norwegian laws (gjeldende lover) from api.lovdata.no |
| **Regulations** | All current central regulations (gjeldende sentrale forskrifter) from api.lovdata.no |
| **Full-text search** | FTS5 on all provision text, both Bokmål and Nynorsk |
| **Case law** | Not included — Norwegian case law is provided by a separate MCP (`norwegian-court-decisions-mcp`) |
| **Preparatory works** | Not included in this MCP — covered by Lovdata Pro (paid, out of scope) |
| **Daily Updates** | Automated freshness checks against api.lovdata.no |

**Verified data only** — every citation is validated against api.lovdata.no. Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from Stiftelsen Lovdata via the official bulk-download API
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing — the database contains regulation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring
- Provision retrieval gives exact text by LOV identifier + chapter/section
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
api.lovdata.no → Parse → SQLite → FTS5 snippet() → MCP response
                  ↑                      ↑
           Provision parser       Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search lovdata.no by LOV number | Search by plain Norwegian: *"personopplysninger samtykke"* |
| Navigate multi-chapter statutes manually | Get the exact provision with context |
| "Is this statute still in force?" → check manually | `check_currency` tool → answer in seconds |
| Find EU basis → dig through EUR-Lex | `get_eu_basis` → linked EU directives instantly |
| Check updates manually | Daily automated freshness checks |
| No API, no integration | MCP protocol → AI-native |

**Traditional:** Open lovdata.no → Find LOV number → Navigate chapters → Check for amendments → Cross-reference with Norsk Lovtidend → Repeat

**This MCP:** *"What are the consent requirements under Personopplysningsloven?"* → Done.

---

## Available Tools

### Core Legal Research Tools

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 search on provisions with BM25 ranking |
| `get_provision` | Retrieve specific provision by LOV identifier + chapter/section |
| `validate_citation` | Validate citation against database |
| `format_citation` | Format citations per Norwegian conventions |
| `check_currency` | Check if statute is in force, amended, or repealed |
| `get_eu_basis` | Get EU directives/regulations underlying a Norwegian statute |

See [TOOLS.md](TOOLS.md) for full tool documentation.

---

## EU Law Integration

Norway is a member of the EEA (European Economic Area) and has implemented a large body of EU legislation through the EEA Agreement. Many Norwegian statutes transpose EU directives — for example, Personopplysningsloven (LOV-2018-06-15-38) implements the GDPR as adopted through the EEA Agreement (EØS-avtalen).

The `get_eu_basis` tool maps Norwegian statutes to the EU acts they implement.

---

## Data Sources & Freshness

All content is sourced from Stiftelsen Lovdata via the Open Data API:

- **[api.lovdata.no](https://api.lovdata.no/)** — Lovdata's official bulk-download endpoint (NLOD 2.0)

### Automated Freshness Checks

A GitHub Actions workflow monitors data sources for updates. The MCP includes staleness warnings when data exceeds the configured threshold.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from Stiftelsen Lovdata via api.lovdata.no. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Case law is not included** — use `norwegian-court-decisions-mcp` for Høyesterett, Lagmannsrett, and tingretten decisions
> - **Verify critical citations** against primary sources (lovdata.no) for court filings
> - **EU cross-references** are derived from Norwegian statute text, not EUR-Lex full text

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for Advokatforeningen compliance guidance.

---

## Documentation

- **[Security Policy](SECURITY.md)** — Vulnerability reporting and scanning details
- **[Disclaimer](DISCLAIMER.md)** — Legal disclaimers and professional use notices
- **[Privacy](PRIVACY.md)** — Client confidentiality and data handling
- **[Coverage](COVERAGE.md)** — Corpus statistics (auto-generated after ingestion)
- **[Coverage Limitations](COVERAGE_LIMITATIONS.md)** — What is and is not included
- **[Data Licenses](DATA_LICENSES.md)** — Source attribution and license details
- **[Tools](TOOLS.md)** — Full tool documentation

---

## Development

### Branching Strategy

This repository uses a `dev` integration branch. **Do not push directly to `main`.**

```
feature-branch → PR to dev → verify on dev → PR to main → deploy
```

- `main` is production-ready. Only receives merges from `dev` via PR.
- `dev` is the integration branch. All changes land here first.
- Feature branches are created from `dev`.

### Setup

```bash
git clone https://github.com/Ansvar-Systems/norwegian-law-mcp
cd norwegian-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                                    # Ingest from api.lovdata.no
npm run build:db                                  # Rebuild SQLite database
npm run check-updates                             # Check for amendments
npm run drift:detect                              # Detect corpus drift
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Reliability:** Sourced exclusively from the official Lovdata API

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** — MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query EU regulations directly from Claude** — GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### @ansvar/norwegian-law-mcp (This Project)
**Query current Norwegian statutes and central regulations** — Personopplysningsloven, Straffeloven, Aksjeloven, and more. Full provision text with EU cross-references. `npx @ansvar/norwegian-law-mcp`

### [@ansvar/ot-security-mcp](https://github.com/Ansvar-Systems/ot-security-mcp)
**Query IEC 62443, NIST 800-82/53, and MITRE ATT&CK for ICS** — Specialized for OT/ICS environments. `npx @ansvar/ot-security-mcp`

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- EU EEA cross-reference mapping (Personopplysningsloven → GDPR, etc.)
- Bokmål/Nynorsk variant deduplication improvements
- Historical statute versions and amendment tracking

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Regulations:** NLOD 2.0 (Norwegian Licence for Open Government Data), distributed by Stiftelsen Lovdata
- See [DATA_LICENSES.md](DATA_LICENSES.md) for full attribution requirements

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the European market.

**[ansvar.eu](https://ansvar.eu)**
