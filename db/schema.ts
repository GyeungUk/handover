export const createRemovedMembersTable = `
  CREATE TABLE IF NOT EXISTS removed_members (
    person_id TEXT PRIMARY KEY,
    removed_at TEXT NOT NULL
  )
`;

export const createCustomTeamsTable = `
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
  )
`;

export const createCustomMembersTable = `
  CREATE TABLE IF NOT EXISTS custom_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    initial TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

export const createCustomMembersTeamIndex = `
  CREATE INDEX IF NOT EXISTS custom_members_team_idx ON custom_members (team_id, created_at)
`;

export const createTaskReschedulesTable = `
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
  )
`;

export const createTaskReschedulesIndex = `
  CREATE INDEX IF NOT EXISTS task_reschedules_task_key_idx ON task_reschedules (task_key, id)
`;

export const createCustomTasksTable = `
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
  )
`;

export const createCustomTasksPersonIndex = `
  CREATE INDEX IF NOT EXISTS custom_tasks_person_idx ON custom_tasks (person_id, start_week, id)
`;

/** A seed-plan task somebody deleted. Seed tasks are code, not rows, so the key is tombstoned. */
export const createRemovedTasksTable = `
  CREATE TABLE IF NOT EXISTS removed_tasks (
    task_key TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    title TEXT NOT NULL,
    removed_by TEXT NOT NULL,
    removed_at TEXT NOT NULL
  )
`;

export const createRemovedTasksPersonIndex = `
  CREATE INDEX IF NOT EXISTS removed_tasks_person_idx ON removed_tasks (person_id)
`;

/**
 * A confirmed calendar date inside a task's week span.
 *
 * The plan is kept in week slots; these are the days inside one that are actually fixed — a group
 * appointment, a published deadline. A task may carry several, so the day is unique per task
 * rather than the task being unique.
 */
export const createTaskDatesTable = `
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
  )
`;

export const createTaskDatesPersonIndex = `
  CREATE INDEX IF NOT EXISTS task_dates_person_idx ON task_dates (person_id, date)
`;

/** One durable checkbox state per task and checklist item. */
export const createTaskChecklistItemsTable = `
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
  )
`;

/**
 * The saved handover document.
 *
 * One row per account in `handover_documents` holds the workflow state; the entries and bundles hang
 * off it by `owner_email`. Entries and bundles are always written as a whole document, so `position`
 * is what preserves the order the author arranged them in.
 */
export const createHandoverDocumentsTable = `
  CREATE TABLE IF NOT EXISTS handover_documents (
    owner_email TEXT PRIMARY KEY,
    owner_name TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    submitted_at TEXT,
    reviewed_at TEXT,
    reviewed_by TEXT,
    CHECK (status IN ('draft', 'pending', 'rejected', 'approved'))
  )
`;

export const createHandoverEntriesTable = `
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
  )
`;

export const createHandoverBundlesTable = `
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
  )
`;

export const createHandoverEntriesIndex = `
  CREATE INDEX IF NOT EXISTS handover_entries_owner_idx ON handover_entries (owner_email, position)
`;

export const createHandoverBundlesIndex = `
  CREATE INDEX IF NOT EXISTS handover_bundles_owner_idx ON handover_bundles (owner_email, position)
`;

export const createHandoverDocumentsStatusIndex = `
  CREATE INDEX IF NOT EXISTS handover_documents_status_idx ON handover_documents (status, updated_at)
`;
