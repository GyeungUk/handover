-- Resubmitting a unit clears the verdict that sent it back, which left the reviewer re-reading a
-- correction with no record of what they had asked for. The request moves here on submission and
-- stays until the next verdict answers it.
ALTER TABLE handover_bundles
    ADD COLUMN IF NOT EXISTS previous_comment text NOT NULL DEFAULT '';

COMMENT ON COLUMN handover_bundles.previous_comment IS
    'the rejection comment this unit was resubmitted against, empty once a new verdict lands';
