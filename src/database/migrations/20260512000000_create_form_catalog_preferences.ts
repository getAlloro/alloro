import type { Knex } from "knex";

const SCHEMA = "website_builder";
const TABLE = "form_catalog_preferences";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(SCHEMA).createTable(TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("project_id")
      .notNullable()
      .references("id")
      .inTable("website_builder.projects")
      .onDelete("CASCADE");
    table.text("form_name").notNullable();
    table.text("form_key").notNullable();
    table.text("display_label").nullable();
    table.integer("sort_order").nullable();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(
      ["project_id", "form_key"],
      "uniq_form_catalog_preferences_project_form_key",
    );
    table.index(["project_id"], "idx_form_catalog_preferences_project");
    table.index(
      ["project_id", "sort_order"],
      "idx_form_catalog_preferences_project_sort",
    );
  });

  await knex.raw(`
    ALTER TABLE "${SCHEMA}"."${TABLE}"
      ADD CONSTRAINT form_catalog_preferences_sort_order_check
      CHECK (sort_order IS NULL OR sort_order >= 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(SCHEMA).dropTableIfExists(TABLE);
}
