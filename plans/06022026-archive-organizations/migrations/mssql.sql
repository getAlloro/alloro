-- Microsoft SQL Server parity script.
-- Alloro production uses PostgreSQL/Knex; do not execute this against Alloro.

IF COL_LENGTH('organizations', 'archived_at') IS NULL
  ALTER TABLE organizations ADD archived_at datetimeoffset NULL;

IF COL_LENGTH('organizations', 'archived_by_user_id') IS NULL
  ALTER TABLE organizations ADD archived_by_user_id int NULL;

IF COL_LENGTH('organizations', 'archive_reason') IS NULL
  ALTER TABLE organizations ADD archive_reason nvarchar(max) NULL;

IF COL_LENGTH('organizations', 'archive_metadata') IS NULL
  ALTER TABLE organizations ADD archive_metadata nvarchar(max) NOT NULL
    CONSTRAINT DF_organizations_archive_metadata DEFAULT ('{}');

IF NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys
  WHERE name = 'FK_organizations_archived_by_user_id'
)
  ALTER TABLE organizations
    ADD CONSTRAINT FK_organizations_archived_by_user_id
    FOREIGN KEY (archived_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'idx_organizations_archived_at'
    AND object_id = OBJECT_ID('organizations')
)
  CREATE INDEX idx_organizations_archived_at
    ON organizations (archived_at);

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'idx_organizations_archived_by_user_id'
    AND object_id = OBJECT_ID('organizations')
)
  CREATE INDEX idx_organizations_archived_by_user_id
    ON organizations (archived_by_user_id);
