CREATE TABLE IF NOT EXISTS task_dates (
    id         bigserial   NOT NULL,
    task_key   text        NOT NULL,
    person_id  text        NOT NULL,
    task_title text        NOT NULL,
    date       date        NOT NULL,
    label      text        NOT NULL,
    created_by text        NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT task_dates_pkey PRIMARY KEY (id),
    CONSTRAINT task_dates_task_key_date_key UNIQUE (task_key, date)
);

CREATE INDEX IF NOT EXISTS task_dates_person_id_idx
    ON task_dates (person_id, date);

COMMENT ON TABLE task_dates IS 'confirmed calendar dates inside a task''s week span';
