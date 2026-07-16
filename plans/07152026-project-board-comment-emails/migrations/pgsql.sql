-- PostgreSQL mirror for PM comment image attachments.
-- Adds a nullable comment reference so existing task-level attachments keep working.

ALTER TABLE pm_task_attachments
  ADD COLUMN IF NOT EXISTS comment_id uuid NULL;

ALTER TABLE pm_task_attachments
  ADD CONSTRAINT pm_task_attachments_comment_id_foreign
  FOREIGN KEY (comment_id)
  REFERENCES pm_task_comments(id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pm_task_attachments_comment
  ON pm_task_attachments(comment_id)
  WHERE comment_id IS NOT NULL;
