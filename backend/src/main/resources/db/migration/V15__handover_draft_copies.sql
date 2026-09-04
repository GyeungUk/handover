CREATE TABLE handover_draft_copies (
    id varchar(64) PRIMARY KEY,
    owner_email varchar(320) NOT NULL,
    source_academic_year integer NOT NULL,
    document text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);
CREATE INDEX handover_draft_copies_owner_updated_idx
    ON handover_draft_copies (owner_email, updated_at DESC);
ALTER TABLE handover_documents ADD COLUMN active_draft_id varchar(64);
