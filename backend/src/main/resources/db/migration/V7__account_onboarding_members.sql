-- A custom member can be linked to the account that created it during first-sign-in onboarding.
-- Administrator-created rows stay unlinked, so existing organisation data needs no backfill.
ALTER TABLE custom_members ADD COLUMN IF NOT EXISTS employee_id text;

CREATE UNIQUE INDEX IF NOT EXISTS custom_members_employee_id_key
    ON custom_members (employee_id)
    WHERE employee_id IS NOT NULL;

COMMENT ON COLUMN custom_members.employee_id IS 'account that created this calendar member during onboarding';
