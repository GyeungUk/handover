-- Parts and people created by an administrator. Seed parts and people remain in the exported
-- domain JSON, so `team_id` intentionally has no foreign key: it may point at either a seed part
-- or a row in custom_teams.
CREATE TABLE IF NOT EXISTS custom_teams (
    id          text        NOT NULL,
    title       text        NOT NULL,
    short_name  text        NOT NULL,
    english     text        NOT NULL,
    description text        NOT NULL,
    color       text        NOT NULL,
    soft        text        NOT NULL,
    mark        text        NOT NULL,
    created_at  timestamptz NOT NULL,
    CONSTRAINT custom_teams_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS custom_members (
    id         text        NOT NULL,
    team_id    text        NOT NULL,
    name       text        NOT NULL,
    role       text        NOT NULL,
    initial    text        NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT custom_members_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS custom_members_team_idx ON custom_members (team_id, created_at);

COMMENT ON TABLE custom_teams IS 'administrator-created org-chart parts';
COMMENT ON TABLE custom_members IS 'administrator-created org-chart people';
