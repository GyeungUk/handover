-- Members an administrator has taken off the org chart.
-- Ported from drizzle/0000_removed_members.sql (Cloudflare D1 / SQLite).
--   person_id  TEXT PRIMARY KEY -> text primary key, unchanged
--   removed_at TEXT NOT NULL    -> timestamptz, so ordering is a real time comparison rather than
--                                  a string sort; the API never returns this column.
CREATE TABLE IF NOT EXISTS removed_members (
    person_id  text        NOT NULL,
    removed_at timestamptz NOT NULL,
    CONSTRAINT removed_members_pkey PRIMARY KEY (person_id)
);

COMMENT ON TABLE removed_members IS 'org-chart members hidden by an administrator; restoring deletes the row';
