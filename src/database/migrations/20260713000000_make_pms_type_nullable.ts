import type { Knex } from "knex";

const TABLE_NAME = "organizations";
const COLUMN_NAME = "pms_type";
const LEGACY_DEFAULT_PMS_TYPE = "default";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasColumn) return;

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.string(COLUMN_NAME, 50).nullable().alter();
  });

  await knex(TABLE_NAME)
    .where(COLUMN_NAME, LEGACY_DEFAULT_PMS_TYPE)
    .update({ [COLUMN_NAME]: null });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasColumn) return;

  await knex(TABLE_NAME)
    .whereNull(COLUMN_NAME)
    .update({ [COLUMN_NAME]: LEGACY_DEFAULT_PMS_TYPE });

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table
      .string(COLUMN_NAME, 50)
      .notNullable()
      .defaultTo(LEGACY_DEFAULT_PMS_TYPE)
      .alter();
  });
}
