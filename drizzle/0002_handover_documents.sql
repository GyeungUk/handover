CREATE TABLE IF NOT EXISTS handover_documents (
  owner_email TEXT PRIMARY KEY,
  owner_name TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  CHECK (status IN ('draft', 'pending', 'rejected', 'approved'))
);

CREATE TABLE IF NOT EXISTS handover_entries (
  owner_email TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  properties TEXT NOT NULL,
  attachments TEXT NOT NULL,
  font_family TEXT NOT NULL,
  font_size TEXT NOT NULL,
  PRIMARY KEY (owner_email, entry_id),
  UNIQUE (owner_email, position),
  CHECK (position >= 0),
  FOREIGN KEY (owner_email) REFERENCES handover_documents(owner_email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS handover_bundles (
  owner_email TEXT NOT NULL,
  bundle_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  entry_ids TEXT NOT NULL,
  decision TEXT,
  comment TEXT NOT NULL,
  PRIMARY KEY (owner_email, bundle_id),
  UNIQUE (owner_email, position),
  CHECK (position >= 0),
  CHECK (decision IS NULL OR decision IN ('approved', 'rejected')),
  FOREIGN KEY (owner_email) REFERENCES handover_documents(owner_email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS handover_entries_owner_idx ON handover_entries (owner_email, position);
CREATE INDEX IF NOT EXISTS handover_bundles_owner_idx ON handover_bundles (owner_email, position);
CREATE INDEX IF NOT EXISTS handover_documents_status_idx ON handover_documents (status, updated_at);
