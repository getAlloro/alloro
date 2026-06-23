-- Plan scaffold — PostgreSQL equivalent of the org-type backfill (DATA only).
-- Alloro runs PostgreSQL + Knex; the executed artifact is the Knex .ts migration
-- (see knexmigration.js for intent). This file documents the raw SQL equivalent.
-- No schema change: organizations.organization_type already exists.

-- 1. Backfill existing accounts to 'health' (explicit; null already behaves as health in code).
UPDATE organizations
SET    organization_type = 'health'
WHERE  organization_type IS NULL;

-- 2. Normalize the renamed value 'saas' -> 'generic'.
UPDATE organizations
SET    organization_type = 'generic'
WHERE  organization_type = 'saas';

-- Verify (run during execution T1):
--   SELECT organization_type, COUNT(*) FROM organizations GROUP BY organization_type;
--   Expect only 'health' and (if any) 'generic' — no NULL, no 'saas'.

-- Rollback: intentionally none. NULL and 'health' are behaviorally identical
-- and the original state is neither recoverable nor meaningful to restore.
