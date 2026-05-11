import type { Knex } from "knex";

const TABLE_NAME = "website_builder.form_recipient_rules";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("project_id")
      .notNullable()
      .references("id")
      .inTable("website_builder.projects")
      .onDelete("CASCADE");
    table.text("form_name").notNullable();
    table.text("form_key").notNullable();
    table.jsonb("recipients").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.boolean("is_enabled").notNullable().defaultTo(true);
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
      "uniq_form_recipient_rules_project_form_key",
    );
    table.index(["project_id"], "idx_form_recipient_rules_project");
  });

  await knex.raw(`
    ALTER TABLE ${TABLE_NAME}
      ADD CONSTRAINT form_recipient_rules_recipients_array_check
      CHECK (jsonb_typeof(recipients) = 'array')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TABLE_NAME);
}
