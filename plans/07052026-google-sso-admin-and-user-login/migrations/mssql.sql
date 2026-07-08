-- MS SQL Server reference equivalent (Alloro runs PostgreSQL — provided for parity only).
-- SQL Server has no partial-unique + IF NOT EXISTS on ADD COLUMN, so guards are explicit.

-- UP
IF COL_LENGTH('users', 'google_sub') IS NULL
  ALTER TABLE users ADD google_sub nvarchar(255) NULL;
IF COL_LENGTH('users', 'avatar_url') IS NULL
  ALTER TABLE users ADD avatar_url nvarchar(1024) NULL;
GO

-- Filtered unique index = Postgres partial unique (uniqueness only for linked accounts).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'users_google_sub_unique')
  CREATE UNIQUE INDEX users_google_sub_unique
    ON users (google_sub)
    WHERE google_sub IS NOT NULL;
GO

-- DOWN
-- DROP INDEX users_google_sub_unique ON users;
-- ALTER TABLE users DROP COLUMN google_sub;
-- ALTER TABLE users DROP COLUMN avatar_url;
