import type { Knex } from "knex";

const SCHEMA = "website_builder";
const TABLE = "projects";
const ARCHIVED_AT_INDEX = "idx_wb_projects_archived_at";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(SCHEMA).alterTable(TABLE, (table) => {
    table.timestamp("archived_at", { useTz: true }).nullable();
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${ARCHIVED_AT_INDEX}
      ON ${SCHEMA}.${TABLE} (archived_at)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${SCHEMA}.${ARCHIVED_AT_INDEX}`);

  await knex.schema.withSchema(SCHEMA).alterTable(TABLE, (table) => {
    table.dropColumn("archived_at");
  });
}
