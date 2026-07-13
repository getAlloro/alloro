-- Execution reference - PostgreSQL equivalent.
-- Runnable artifact: src/database/migrations/20260710000000_add_pms_type_to_organizations.ts

ALTER TABLE organizations
  ADD COLUMN pms_type varchar(50) NOT NULL DEFAULT 'default';

COMMENT ON COLUMN organizations.pms_type IS
  'Server-owned PMS parser registry key; default preserves universal parser behavior.';

-- Verification:
-- SELECT pms_type, COUNT(*) FROM organizations GROUP BY pms_type;
-- Expected immediately after migration: every existing row is 'default'.

-- Rollback:
-- ALTER TABLE organizations DROP COLUMN pms_type;
