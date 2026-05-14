-- Microsoft SQL Server schema plan for conceptual parity only.
-- Alloro's website_builder.projects table is PostgreSQL-backed in this repo.
--
-- Equivalent schema intent:
--   archived_at DATETIMEOFFSET NULL
--
-- Intended behavior:
--   archived_at IS NULL     => project remains in normal admin list tabs
--   archived_at IS NOT NULL => project appears in the Archive admin tab

ALTER TABLE website_builder.projects
  ADD archived_at DATETIMEOFFSET NULL;

CREATE INDEX idx_wb_projects_archived_at
  ON website_builder.projects (archived_at);

-- Rollback sketch:
-- DROP INDEX idx_wb_projects_archived_at ON website_builder.projects;
-- ALTER TABLE website_builder.projects DROP COLUMN archived_at;
