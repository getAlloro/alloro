const TABLE = "gbp_local_posts";

exports.up = async function up(knex) {
  await knex.schema.createTable(TABLE, (table) => {
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
    table.text("google_resource_name").notNullable();
    table.text("google_post_id").notNullable();
    table.string("topic_type", 50).notNullable().defaultTo("STANDARD");
    table.string("state", 80).notNullable().defaultTo("UNKNOWN");
    table.text("summary").notNullable().defaultTo("");
    table.text("featured_image_url");
    table.text("search_url");
    table.jsonb("media").notNullable().defaultTo("[]");
    table.jsonb("call_to_action");
    table.jsonb("google_response").notNullable().defaultTo("{}");
    table.timestamp("create_time", { useTz: true });
    table.timestamp("update_time", { useTz: true });
    table.timestamp("last_synced_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("deleted_at", { useTz: true });
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);

    table.unique(["google_resource_name"]);
    table.index(["organization_id", "location_id", "state", "create_time"]);
    table.index(["organization_id", "location_id", "deleted_at"]);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists(TABLE);
};
