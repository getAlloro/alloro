import type { Knex } from "knex";

const TABLE_NAME = "schedule_runs";
const COLUMN_NAME = "logical_run_key";
const UNIQUE_INDEX = "schedule_runs_logical_run_key_uidx";

export async function up(knex: Knex): Promise<void> {
  // Additive and nullable: historical/manual runs remain valid and need no
  // backfill. Creating this ordinary (non-CONCURRENTLY) index can briefly block
  // writes to schedule_runs; the table is an execution log and the index is
  // small, but deploy operators should still treat that lock as the migration's
  // production risk.
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasColumn) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.string(COLUMN_NAME, 255).nullable();
    });
  }

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${UNIQUE_INDEX}
     ON ${TABLE_NAME} (schedule_id, ${COLUMN_NAME})`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${UNIQUE_INDEX}`);

  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (hasColumn) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.dropColumn(COLUMN_NAME);
    });
  }
}
