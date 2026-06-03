/**
 * PMS File Manager Knex migration scaffold.
 *
 * Production safety:
 * - Additive only.
 * - Existing pms_jobs rows remain active.
 * - No data rewrites or destructive cleanup.
 * - Soft-delete uses deleted_at; aggregation must exclude deleted rows in code.
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable("pms_jobs", (table) => {
    table.text("original_file_name").nullable();
    table.string("original_file_mime_type", 120).nullable();
    table.bigInteger("original_file_size_bytes").nullable();
    table.text("original_file_s3_key").nullable().unique();
    table.integer("uploaded_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    table.jsonb("original_response_log").nullable();
    table.timestamp("deleted_at", { useTz: true }).nullable();
    table.integer("deleted_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    table.text("deleted_reason").nullable();
  });

  await knex.schema.createTable("pms_job_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.integer("pms_job_id").notNullable().references("id").inTable("pms_jobs").onDelete("CASCADE");
    table.integer("actor_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    table.string("event_type", 80).notNullable();
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["pms_job_id", "created_at"], "idx_pms_job_events_job_created");
    table.index(["actor_user_id", "created_at"], "idx_pms_job_events_actor_created");
  });

  await knex.raw(`
    CREATE INDEX idx_pms_jobs_org_location_deleted_timestamp
      ON pms_jobs (organization_id, location_id, deleted_at, timestamp DESC)
  `);
  await knex.raw("CREATE INDEX idx_pms_jobs_uploaded_by_user_id ON pms_jobs (uploaded_by_user_id)");
  await knex.raw("CREATE INDEX idx_pms_jobs_deleted_by_user_id ON pms_jobs (deleted_by_user_id)");
};

exports.down = async function down(knex) {
  await knex.raw("DROP INDEX IF EXISTS idx_pms_jobs_deleted_by_user_id");
  await knex.raw("DROP INDEX IF EXISTS idx_pms_jobs_uploaded_by_user_id");
  await knex.raw("DROP INDEX IF EXISTS idx_pms_jobs_org_location_deleted_timestamp");
  await knex.schema.dropTableIfExists("pms_job_events");
  await knex.schema.alterTable("pms_jobs", (table) => {
    table.dropColumn("deleted_reason");
    table.dropColumn("deleted_by_user_id");
    table.dropColumn("deleted_at");
    table.dropColumn("original_response_log");
    table.dropColumn("uploaded_by_user_id");
    table.dropColumn("original_file_s3_key");
    table.dropColumn("original_file_size_bytes");
    table.dropColumn("original_file_mime_type");
    table.dropColumn("original_file_name");
  });
};
