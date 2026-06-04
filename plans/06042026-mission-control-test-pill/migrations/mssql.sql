-- Microsoft SQL Server variant — CONVENTION ARTIFACT ONLY.
-- The live Alloro DB is PostgreSQL (see pgsql.sql / the knex migration). This file
-- exists to satisfy the plan migrations convention; it is not run against any DB today.

ALTER TABLE organizations
  ADD is_sandbox BIT NOT NULL CONSTRAINT DF_organizations_is_sandbox DEFAULT 0;
GO

-- One-time backfill by normalized name (lowercase + whitespace stripped).
UPDATE organizations
SET is_sandbox = 1
WHERE LOWER(REPLACE(REPLACE(REPLACE(name, ' ', ''), CHAR(9), ''), CHAR(160), '')) IN (
  'test',
  'hamiltonwise''sorganization',
  'alloroteam''sorganization'
);
GO

-- Rollback:
-- ALTER TABLE organizations DROP COLUMN is_sandbox;
