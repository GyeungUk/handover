CREATE TABLE IF NOT EXISTS task_periods (
    task_key   text        NOT NULL,
    person_id  text        NOT NULL,
    task_title text        NOT NULL,
    starts_on  date        NOT NULL,
    ends_on    date        NOT NULL,
    set_by     text        NOT NULL,
    set_at     timestamptz NOT NULL,
    CONSTRAINT task_periods_pkey PRIMARY KEY (task_key),
    CONSTRAINT task_periods_order_check CHECK (starts_on <= ends_on)
);

CREATE INDEX IF NOT EXISTS task_periods_person_id_idx
    ON task_periods (person_id, starts_on);

COMMENT ON TABLE task_periods IS 'real dates a task runs on, replacing the days its week slots stand for';
