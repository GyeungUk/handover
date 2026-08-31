CREATE TABLE IF NOT EXISTS task_checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL,
  person_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  item_key TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (task_key, item_key)
);
