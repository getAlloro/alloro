-- Migration 1 of 2 — add users.is_internal, backfilled by @getalloro.com domain.
-- Not used by Alloro today (Postgres/Knex only) — kept for plan-scaffold parity.
IF COL_LENGTH('dbo.users', 'is_internal') IS NULL
BEGIN
  ALTER TABLE dbo.users
    ADD is_internal bit NOT NULL CONSTRAINT df_users_is_internal DEFAULT 0;
END;

UPDATE dbo.users
SET is_internal = 1
WHERE LOWER(email) LIKE '%@getalloro.com';

-- Rollback:
-- ALTER TABLE dbo.users DROP COLUMN is_internal;

-- ---------------------------------------------------------------------------

-- Migration 2 of 2 — purge existing Pilot-session telemetry rows.
-- Irreversible — see spec Risk section for production-safety notes.
DELETE FROM dbo.app_usage_events
WHERE is_pilot_session = 1;

-- Rollback: none. Deleted rows cannot be restored (accepted, documented in spec).
