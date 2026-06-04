-- Migration: add organizations.is_sandbox + backfill known sandbox/test orgs
-- Target: PostgreSQL (LIVE — this is the real target). Applied in-app via the
-- knex migration in T1 (src/database/migrations/...). SQL shown for reference/parity.

ALTER TABLE organizations
  ADD COLUMN is_sandbox boolean NOT NULL DEFAULT false;

-- One-time backfill: flag existing sandbox/test orgs by normalized name
-- (lowercase + all whitespace stripped) ∈ the known set. This is the ONLY place
-- the old hardcoded names survive — runtime code no longer references them.
UPDATE organizations
SET is_sandbox = true
WHERE lower(regexp_replace(name, '\s+', '', 'g')) IN (
  'test',
  'hamiltonwise''sorganization',
  'alloroteam''sorganization'
);

-- Rollback:
-- ALTER TABLE organizations DROP COLUMN is_sandbox;
