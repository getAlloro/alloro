import { Knex } from "knex";

const SYNC_HEALTH_TABLE = "gbp_sync_health";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(SYNC_HEALTH_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table
      .integer("location_id")
      .notNullable()
      .references("id")
      .inTable("locations")
      .onDelete("CASCADE");
    table
      .integer("google_property_id")
      .references("id")
      .inTable("google_properties")
      .onDelete("SET NULL");
    table.string("sync_type", 50).notNullable().defaultTo("reviews");
    table.string("status", 50).notNullable().defaultTo("pending");
    table.timestamp("started_at", { useTz: true });
    table.timestamp("completed_at", { useTz: true });
    table.integer("synced_count").notNullable().defaultTo(0);
    table.string("error_code", 120);
    table.text("error_message");
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);

    table.index(["organization_id", "location_id", "sync_type", "created_at"]);
    table.index(["status", "created_at"]);
  });

  await knex.raw(`
    ALTER TABLE ${SYNC_HEALTH_TABLE}
    ADD CONSTRAINT gbp_sync_health_status_check
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(SYNC_HEALTH_TABLE);
}
