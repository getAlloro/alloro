-- previous_content: JSON-typed -> plain text equivalent (MSSQL reference script)
-- Alloro runs PostgreSQL; this file exists per the plan convention only.
-- MSSQL has no native jsonb; the equivalent is widening to NVARCHAR(MAX).

-- TODO: fill during execution
ALTER TABLE website_builder.posts
  ALTER COLUMN previous_content NVARCHAR(MAX) NULL;
