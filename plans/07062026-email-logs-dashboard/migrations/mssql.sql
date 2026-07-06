-- MSSQL DDL — provided per plan convention only.
-- NOT USED: the Alloro stack is PostgreSQL exclusively (see AGENTS.md). The
-- executed artifact is the Knex migration (knexmigration.js) against Postgres.
-- This file exists to satisfy the three-file migrations convention; it is a
-- reference translation, not something that runs anywhere in this project.
-- TODO: N/A for this repo — do not execute.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'email_logs')
BEGIN
  CREATE TABLE email_logs (
    id                   uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
    category             nvarchar(64) NOT NULL DEFAULT 'uncategorized',
    status               nvarchar(32) NOT NULL DEFAULT 'sent',
    from_email           nvarchar(320) NULL,
    from_name            nvarchar(256) NULL,
    recipients           nvarchar(max) NOT NULL DEFAULT '[]',   -- JSON
    cc                   nvarchar(max) NOT NULL DEFAULT '[]',   -- JSON
    bcc                  nvarchar(max) NOT NULL DEFAULT '[]',   -- JSON
    subject              nvarchar(max) NULL,
    body_html            nvarchar(max) NULL,                     -- PII/PHI, internal-only
    provider_message_id  nvarchar(512) NULL,
    intercepted          bit NOT NULL DEFAULT 0,
    original_recipients  nvarchar(max) NULL,                     -- JSON
    error                nvarchar(max) NULL,
    created_at           datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at           datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
    delivered_at         datetimeoffset NULL,
    opened_at            datetimeoffset NULL
  );
  CREATE INDEX idx_email_logs_category            ON email_logs (category);
  CREATE INDEX idx_email_logs_status              ON email_logs (status);
  CREATE INDEX idx_email_logs_created_at          ON email_logs (created_at);
  CREATE INDEX idx_email_logs_provider_message_id ON email_logs (provider_message_id);
END
