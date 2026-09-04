-- A workflow now advances per 담당업무 unit. `pending` means this unit is with the reviewer,
-- while the author may continue drafting or correcting the remaining units.
ALTER TABLE handover_bundles DROP CONSTRAINT handover_bundles_decision_check;
ALTER TABLE handover_bundles ADD CONSTRAINT handover_bundles_decision_check
    CHECK (decision IS NULL OR decision IN ('pending', 'approved', 'rejected'));

UPDATE handover_bundles bundle
SET decision = 'pending'
FROM handover_documents document
WHERE bundle.owner_email = document.owner_email
  AND document.status = 'pending'
  AND bundle.decision IS NULL;
