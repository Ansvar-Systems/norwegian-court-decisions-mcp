-- Premium tier: provision version tracking (Swedish Law)
-- The legal_provision_versions table already exists in the Swedish schema.
-- This script is a no-op for Swedish Law MCP but kept for consistency
-- with the premium tier template. It ensures the table exists if missing.
--
-- Apply to existing database: sqlite3 data/database.db < scripts/add-provision-versions.sql

CREATE TABLE IF NOT EXISTS legal_provision_versions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  chapter TEXT,
  section TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  valid_from TEXT,
  valid_to TEXT
);

CREATE INDEX IF NOT EXISTS idx_provision_versions_doc_ref ON legal_provision_versions(document_id, provision_ref);
