CREATE TABLE IF NOT EXISTS custom_teams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  short_name TEXT NOT NULL,
  english TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT NOT NULL,
  soft TEXT NOT NULL,
  mark TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  initial TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS custom_members_team_idx
ON custom_members (team_id, created_at);
