CREATE TABLE IF NOT EXISTS task_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL,
  person_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  date TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (task_key, date)
);

CREATE INDEX IF NOT EXISTS task_dates_person_idx
  ON task_dates (person_id, date);
