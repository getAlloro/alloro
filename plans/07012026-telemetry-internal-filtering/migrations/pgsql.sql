-- Migration 1 of 2 — add users.is_internal, backfilled by @getalloro.com domain.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

UPDATE users
SET is_internal = true
WHERE lower(email) LIKE '%@getalloro.com';

-- Rollback:
-- ALTER TABLE users DROP COLUMN IF EXISTS is_internal;

-- ---------------------------------------------------------------------------

-- Migration 2 of 2 — purge existing Pilot-session telemetry rows.
-- These are staff-generated "view as user" support-session events
-- (see plans/06272026-embedded-organization-pilot-tab), not real client usage.
-- Irreversible — see spec Risk section for production-safety notes.
DELETE FROM app_usage_events
WHERE is_pilot_session = true;

-- Rollback: none. Deleted rows cannot be restored (accepted, documented in spec).
