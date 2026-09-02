CREATE TABLE IF NOT EXISTS task_periods (
  task_key TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  set_by TEXT NOT NULL,
  set_at TEXT NOT NULL,
  CHECK (starts_on <= ends_on)
);

CREATE INDEX IF NOT EXISTS task_periods_person_idx
  ON task_periods (person_id, starts_on);
