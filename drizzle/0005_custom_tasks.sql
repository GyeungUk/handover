CREATE TABLE IF NOT EXISTS custom_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_week INTEGER NOT NULL CHECK (start_week >= 0 AND start_week < 48),
  duration INTEGER NOT NULL CHECK (duration >= 1 AND duration <= 48),
  note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (person_id, title),
  CHECK (start_week + duration <= 48)
);

CREATE INDEX IF NOT EXISTS custom_tasks_person_idx
  ON custom_tasks (person_id, start_week, id);
