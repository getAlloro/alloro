import type { Knex } from "knex";

const TABLE_NAME = "organizations";
const COLUMN_NAME = "pms_type";
const DEFAULT_PMS_TYPE = "default";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (hasColumn) return;

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.string(COLUMN_NAME, 50).notNullable().defaultTo(DEFAULT_PMS_TYPE);
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasColumn) return;

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropColumn(COLUMN_NAME);
  });
}
