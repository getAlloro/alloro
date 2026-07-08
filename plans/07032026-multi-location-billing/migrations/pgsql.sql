-- Multi-Location Billing — Phase B: location cancellation lifecycle
-- FILLED during execution. Real migration: src/database/migrations/
-- 20260703000000_add_location_cancellation_lifecycle.ts (runs via knex).
-- Table: locations
-- Data: no rows modified; all existing locations default to 'active'.
-- Rollback risk: down drops the columns — status/cancellation history is lost.

ALTER TABLE locations
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN cancel_effective_at timestamptz NULL,
  ADD COLUMN cancelled_at timestamptz NULL;

ALTER TABLE locations ADD CONSTRAINT chk_locations_status
  CHECK (status IN ('active', 'pending_cancellation', 'cancelled'));

CREATE INDEX idx_locations_org_status ON locations (organization_id, status);

-- Rollback:
-- ALTER TABLE locations DROP CONSTRAINT IF EXISTS chk_locations_status;
-- DROP INDEX IF EXISTS idx_locations_org_status;
-- ALTER TABLE locations DROP COLUMN status, DROP COLUMN cancel_effective_at, DROP COLUMN cancelled_at;
