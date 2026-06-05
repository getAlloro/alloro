import type { Knex } from "knex";

const TABLE = "app_usage_events";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("event_name", 100).notNullable();
    table.string("event_category", 40).notNullable();
    table.string("source", 16).notNullable().defaultTo("frontend");
    table.integer("user_id").references("id").inTable("users").onDelete("SET NULL");
    table
      .integer("organization_id")
      .references("id")
      .inTable("organizations")
      .onDelete("SET NULL");
    table.string("user_role", 20);
    table.uuid("session_id").notNullable();
    table.string("route_template", 160);
    table.string("surface", 60);
    table.string("page_label", 120);
    table.integer("active_seconds").notNullable().defaultTo(0);
    table.boolean("is_pilot_session").notNullable().defaultTo(false);
    table.jsonb("properties").notNullable().defaultTo("{}");
    table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["created_at"], "idx_app_usage_events_created_at");
    table.index(["organization_id", "created_at"], "idx_app_usage_events_org_created");
    table.index(["user_id", "created_at"], "idx_app_usage_events_user_created");
    table.index(["event_name", "created_at"], "idx_app_usage_events_event_created");
    table.index(["surface", "created_at"], "idx_app_usage_events_surface_created");
    table.index(["route_template", "created_at"], "idx_app_usage_events_route_created");
    table.index(
      ["organization_id", "user_id", "created_at"],
      "idx_app_usage_events_org_user_created",
    );
    table.index(
      ["organization_id", "surface", "created_at"],
      "idx_app_usage_events_org_surface_created",
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TABLE);
}
