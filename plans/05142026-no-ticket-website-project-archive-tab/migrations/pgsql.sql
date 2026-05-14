-- PostgreSQL schema plan for website project admin archive state.
--
-- Target table:
--   website_builder.projects
--
-- New column:
--   archived_at TIMESTAMPTZ NULL
--
-- Intended behavior:
--   archived_at IS NULL     => project remains in normal admin list tabs
--   archived_at IS NOT NULL => project appears in the Archive admin tab
--
-- Important:
--   Do not add ARCHIVED to website_builder.project_status.
--   Do not mutate projects.status, organization_id, custom_domain, or generated_hostname.

ALTER TABLE website_builder.projects
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_wb_projects_archived_at
  ON website_builder.projects (archived_at);

-- Rollback sketch:
-- DROP INDEX IF EXISTS website_builder.idx_wb_projects_archived_at;
-- ALTER TABLE website_builder.projects DROP COLUMN IF EXISTS archived_at;
