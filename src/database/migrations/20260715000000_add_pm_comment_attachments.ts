import type { Knex } from "knex";

/**
 * Attach selected PM task attachments to comments.
 *
 * Existing rows remain standalone task attachments with comment_id = null.
 * Comment images use the same S3-backed attachment table, which avoids a
 * second storage path and keeps presigned URL delivery unchanged.
 */
export async function up(knex: Knex): Promise<void> {
  const hasCommentId = await knex.schema.hasColumn(
    "pm_task_attachments",
    "comment_id"
  );

  if (!hasCommentId) {
    await knex.schema.alterTable("pm_task_attachments", (table) => {
      table
        .uuid("comment_id")
        .nullable()
        .references("id")
        .inTable("pm_task_comments")
        .onDelete("CASCADE");
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pm_task_attachments_comment
      ON pm_task_attachments(comment_id)
      WHERE comment_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_pm_task_attachments_comment");

  const hasCommentId = await knex.schema.hasColumn(
    "pm_task_attachments",
    "comment_id"
  );
  if (hasCommentId) {
    await knex.schema.alterTable("pm_task_attachments", (table) => {
      table.dropColumn("comment_id");
    });
  }
}
