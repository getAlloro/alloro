import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("projects", (table) => {
      table.string("rybbit_time_zone", 64).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("projects", (table) => {
      table.dropColumn("rybbit_time_zone");
    });
}
