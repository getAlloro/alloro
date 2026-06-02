import type { Knex } from "knex";

const TABLE = "organizations";
const ARCHIVED_AT_INDEX = "idx_organizations_archived_at";
const ARCHIVED_BY_INDEX = "idx_organizations_archived_by_user_id";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TABLE, (table) => {
    table.timestamp("archived_at", { useTz: true }).nullable();
    table
      .integer("archived_by_user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.text("archive_reason").nullable();
    table.jsonb("archive_metadata").notNullable().defaultTo("{}");
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${ARCHIVED_AT_INDEX}
      ON ${TABLE} (archived_at)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${ARCHIVED_BY_INDEX}
      ON ${TABLE} (archived_by_user_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${ARCHIVED_BY_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${ARCHIVED_AT_INDEX}`);

  await knex.schema.alterTable(TABLE, (table) => {
    table.dropColumn("archive_metadata");
    table.dropColumn("archive_reason");
    table.dropColumn("archived_by_user_id");
    table.dropColumn("archived_at");
  });
}
