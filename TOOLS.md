# Tools — Norwegian Law MCP

Tools for searching and retrieving Norwegian legislation from api.lovdata.no.

---

## 1. search_legislation

Full-text search across all Norwegian statutes and central regulations.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search query (Norwegian or English) |
| `limit` | number | No | Max results (default 10, max 50) |
| `status` | string | No | Filter: `in_force`, `amended`, `repealed` |

**Returns:** Matching provisions with document context, snippets, and relevance scores.

---

## 2. get_provision

Retrieve the full text of a specific provision from a statute.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `document_id` | string | Yes | LOV identifier (e.g., `LOV-2018-06-15-38`) or statute title |
| `section` | string | No | Section/article number |

**Returns:** Full provision text with document metadata and `_citation` triple.

---

## 3. list_sources

List all data sources with provenance metadata and database statistics.

**Returns:** Source authority, coverage scope (gjeldende lover + gjeldende sentrale forskrifter), document/provision counts, and build date.

---

## 4. validate_citation

Validate a Norwegian legal citation against the database.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `citation` | string | Yes | Citation string to validate (e.g., `LOV-2018-06-15-38 § 5`) |

**Returns:** Whether the cited document and provision exist, with warnings.

---

## 5. format_citation

Format a legal citation per Norwegian conventions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `citation` | string | Yes | Citation to format |
| `format` | string | No | `full`, `short`, or `pinpoint` |

**Returns:** Formatted citation string per Norwegian legal citation standards.

---

## 6. check_currency

Check whether a statute or provision is currently in force.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `document_id` | string | Yes | LOV identifier or statute title |
| `provision_ref` | string | No | Optional provision reference |

**Returns:** Status (in_force/amended/repealed), dates, and warnings.

---

## 7. get_eu_basis

Get the EU directives or regulations that a Norwegian statute implements via the EEA Agreement (EØS-avtalen).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `document_id` | string | Yes | LOV identifier or statute title |

**Returns:** Linked EU acts with EUR-Lex references.

---

## 8. about

Server metadata, dataset statistics, and data freshness.

**Returns:** Document/provision counts, build date, source authority (api.lovdata.no / NLOD 2.0), and database version.
