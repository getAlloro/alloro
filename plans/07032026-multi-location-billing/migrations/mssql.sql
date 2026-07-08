-- Multi-Location Billing — Phase B: location cancellation lifecycle (SQL Server variant)
-- FILLED during execution. Alloro runs PostgreSQL; this variant exists per the
-- plan-folder migration contract for cross-dialect reference.
-- Table: locations
-- Data: no rows modified; existing locations default to 'active'.

ALTER TABLE locations ADD
  status nvarchar(32) NOT NULL CONSTRAINT DF_locations_status DEFAULT 'active',
  cancel_effective_at datetimeoffset NULL,
  cancelled_at datetimeoffset NULL;

ALTER TABLE locations ADD CONSTRAINT CK_locations_status
  CHECK (status IN ('active', 'pending_cancellation', 'cancelled'));

CREATE INDEX IX_locations_org_status ON locations (organization_id, status);

-- Rollback:
-- ALTER TABLE locations DROP CONSTRAINT CK_locations_status;
-- DROP INDEX IX_locations_org_status ON locations;
-- ALTER TABLE locations DROP CONSTRAINT DF_locations_status;
-- ALTER TABLE locations DROP COLUMN status, cancel_effective_at, cancelled_at;
