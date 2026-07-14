-- Rev 2 planning reference - PostgreSQL equivalent.
-- Execution must add a new follow-up migration rather than rewriting
-- src/database/migrations/20260710000000_add_pms_type_to_organizations.ts.

ALTER TABLE organizations
  ALTER COLUMN pms_type DROP NOT NULL,
  ALTER COLUMN pms_type DROP DEFAULT;

UPDATE organizations
SET pms_type = NULL
WHERE pms_type = 'default';

COMMENT ON COLUMN organizations.pms_type IS
  'Nullable server-owned PMS parser assignment; null resolves to the configurable default parser.';

-- Verification:
-- SELECT COALESCE(pms_type, '<default>'), COUNT(*)
-- FROM organizations GROUP BY pms_type;
-- Expected: former default rows are null; custom parser keys are unchanged.

-- Rollback:
-- UPDATE organizations SET pms_type = 'default' WHERE pms_type IS NULL;
-- ALTER TABLE organizations
--   ALTER COLUMN pms_type SET DEFAULT 'default',
--   ALTER COLUMN pms_type SET NOT NULL;
