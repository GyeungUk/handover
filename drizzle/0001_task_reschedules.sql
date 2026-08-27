CREATE TABLE IF NOT EXISTS task_reschedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL,
  person_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  from_start INTEGER NOT NULL,
  to_start INTEGER NOT NULL,
  reason TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS task_reschedules_task_key_idx ON task_reschedules (task_key, id);
