-- Per-site Rybbit reporting timezone.
-- Additive, nullable, no default, no backfill. NULL => code falls back to
-- America/New_York via RYBBIT_DEFAULT_TIME_ZONE, so existing rows are unchanged.
-- Authoritative implementation is the knex-TS migration; this mirrors its DDL.

ALTER TABLE website_builder.projects
  ADD COLUMN IF NOT EXISTS rybbit_time_zone VARCHAR(64) NULL;

-- Rollback:
-- ALTER TABLE website_builder.projects DROP COLUMN IF EXISTS rybbit_time_zone;
