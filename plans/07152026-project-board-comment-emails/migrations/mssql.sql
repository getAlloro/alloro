-- Microsoft SQL Server mirror for PM comment image attachments.
-- Alloro runtime is PostgreSQL; this documents equivalent intent.

IF COL_LENGTH('pm_task_attachments', 'comment_id') IS NULL
BEGIN
  ALTER TABLE pm_task_attachments ADD comment_id uniqueidentifier NULL;
END;
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'pm_task_attachments_comment_id_foreign'
)
BEGIN
  ALTER TABLE pm_task_attachments
    ADD CONSTRAINT pm_task_attachments_comment_id_foreign
    FOREIGN KEY (comment_id)
    REFERENCES pm_task_comments(id)
    ON DELETE CASCADE;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'idx_pm_task_attachments_comment'
    AND object_id = OBJECT_ID('pm_task_attachments')
)
BEGIN
  CREATE INDEX idx_pm_task_attachments_comment
    ON pm_task_attachments(comment_id)
    WHERE comment_id IS NOT NULL;
END;
