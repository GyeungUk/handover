CREATE TABLE IF NOT EXISTS removed_tasks (
    task_key   text        NOT NULL,
    person_id  text        NOT NULL,
    title      text        NOT NULL,
    removed_by text        NOT NULL,
    removed_at timestamptz NOT NULL,
    CONSTRAINT removed_tasks_pkey PRIMARY KEY (task_key)
);

CREATE INDEX IF NOT EXISTS removed_tasks_person_id_idx
    ON removed_tasks (person_id);

COMMENT ON TABLE removed_tasks IS 'seed-plan calendar tasks deleted from the workspace';
