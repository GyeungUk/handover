CREATE TABLE IF NOT EXISTS removed_tasks (
  task_key TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  title TEXT NOT NULL,
  removed_by TEXT NOT NULL,
  removed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS removed_tasks_person_idx
  ON removed_tasks (person_id);
