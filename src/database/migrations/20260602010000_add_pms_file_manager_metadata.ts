import type { Knex } from "knex";

const PMS_JOBS_TABLE = "pms_jobs";
const PMS_JOB_EVENTS_TABLE = "pms_job_events";

/**
 * PMS File Manager metadata.
 *
 * Production safety:
 * - Additive only: all new pms_jobs columns are nullable.
 * - Existing PMS jobs remain active because deleted_at defaults to NULL.
 * - No historical payload rewrites or row deletes.
 * - Original file bytes live in S3; Postgres stores metadata and audit events.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ${PMS_JOBS_TABLE}
      ADD COLUMN IF NOT EXISTS original_file_name text NULL,
      ADD COLUMN IF NOT EXISTS original_file_mime_type varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS original_file_size_bytes bigint NULL,
      ADD COLUMN IF NOT EXISTS original_file_s3_key text NULL,
      ADD COLUMN IF NOT EXISTS uploaded_by_user_id integer NULL,
      ADD COLUMN IF NOT EXISTS original_response_log jsonb NULL,
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS deleted_by_user_id integer NULL,
      ADD COLUMN IF NOT EXISTS deleted_reason text NULL
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pms_jobs_uploaded_by_user_id_foreign'
      ) THEN
        ALTER TABLE ${PMS_JOBS_TABLE}
          ADD CONSTRAINT pms_jobs_uploaded_by_user_id_foreign
          FOREIGN KEY (uploaded_by_user_id)
          REFERENCES users(id)
          ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pms_jobs_deleted_by_user_id_foreign'
      ) THEN
        ALTER TABLE ${PMS_JOBS_TABLE}
          ADD CONSTRAINT pms_jobs_deleted_by_user_id_foreign
          FOREIGN KEY (deleted_by_user_id)
          REFERENCES users(id)
          ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  const hasEventsTable = await knex.schema.hasTable(PMS_JOB_EVENTS_TABLE);

  if (!hasEventsTable) {
    await knex.schema.createTable(PMS_JOB_EVENTS_TABLE, (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table
        .integer("pms_job_id")
        .notNullable()
        .references("id")
        .inTable(PMS_JOBS_TABLE)
        .onDelete("CASCADE");
      table
        .integer("actor_user_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.string("event_type", 80).notNullable();
      table.jsonb("metadata").notNullable().defaultTo("{}");
      table
        .timestamp("created_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS pms_jobs_original_file_s3_key_unique
      ON ${PMS_JOBS_TABLE} (original_file_s3_key)
      WHERE original_file_s3_key IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pms_jobs_org_location_deleted_timestamp
      ON ${PMS_JOBS_TABLE} (organization_id, location_id, deleted_at, timestamp DESC)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pms_jobs_uploaded_by_user_id
      ON ${PMS_JOBS_TABLE} (uploaded_by_user_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pms_jobs_deleted_by_user_id
      ON ${PMS_JOBS_TABLE} (deleted_by_user_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pms_job_events_job_created
      ON ${PMS_JOB_EVENTS_TABLE} (pms_job_id, created_at)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pms_job_events_actor_created
      ON ${PMS_JOB_EVENTS_TABLE} (actor_user_id, created_at)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS pms_jobs_original_file_s3_key_unique`);
  await knex.raw(`DROP INDEX IF EXISTS idx_pms_jobs_deleted_by_user_id`);
  await knex.raw(`DROP INDEX IF EXISTS idx_pms_jobs_uploaded_by_user_id`);
  await knex.raw(
    `DROP INDEX IF EXISTS idx_pms_jobs_org_location_deleted_timestamp`
  );

  await knex.schema.dropTableIfExists(PMS_JOB_EVENTS_TABLE);

  await knex.raw(`
    ALTER TABLE ${PMS_JOBS_TABLE}
      DROP COLUMN IF EXISTS deleted_reason,
      DROP COLUMN IF EXISTS deleted_by_user_id,
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS original_response_log,
      DROP COLUMN IF EXISTS uploaded_by_user_id,
      DROP COLUMN IF EXISTS original_file_s3_key,
      DROP COLUMN IF EXISTS original_file_size_bytes,
      DROP COLUMN IF EXISTS original_file_mime_type,
      DROP COLUMN IF EXISTS original_file_name
  `);
}
