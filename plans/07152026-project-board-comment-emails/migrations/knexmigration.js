/**
 * Knex mirror for PM comment image attachments.
 */
exports.up = async function up(knex) {
  const hasCommentId = await knex.schema.hasColumn("pm_task_attachments", "comment_id");
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
};

exports.down = async function down(knex) {
  await knex.raw("DROP INDEX IF EXISTS idx_pm_task_attachments_comment");
  const hasCommentId = await knex.schema.hasColumn("pm_task_attachments", "comment_id");
  if (hasCommentId) {
    await knex.schema.alterTable("pm_task_attachments", (table) => {
      table.dropColumn("comment_id");
    });
  }
};
