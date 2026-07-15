const TABLE = "metric_action_events";

exports.up = async function up(knex) {
  await knex.schema.createTable(TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.integer("organization_id").notNullable().references("id").inTable("organizations").onDelete("CASCADE");
    table.integer("location_id").nullable().references("id").inTable("locations").onDelete("CASCADE");
    table.uuid("project_id").nullable().references("id").inTable("website_builder.projects").onDelete("CASCADE");
    table.string("action_type", 80).notNullable();
    table.string("stage_key", 80).notNullable();
    table.string("metric_key", 80).notNullable();
    table.string("source_type", 100).notNullable();
    table.string("source_id", 160).notNullable();
    table.string("entity_type", 40).nullable();
    table.integer("affected_count").notNullable();
    table.timestamp("occurred_at", { useTz: true }).notNullable();
    table.timestamp("active_until", { useTz: true }).notNullable();
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(["action_type", "source_type", "source_id"], { indexName: "uq_metric_action_events_source" });
    table.index(
      ["organization_id", "project_id", "stage_key", "metric_key", "active_until", "occurred_at"],
      "idx_metric_action_events_active_metric"
    );
    table.check("affected_count > 0", [], "metric_action_events_affected_count_check");
    table.check("active_until > occurred_at", [], "metric_action_events_active_window_check");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists(TABLE);
};
