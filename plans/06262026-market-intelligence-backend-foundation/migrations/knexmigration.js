// Knex migration reference for Market Intelligence Backend Foundation.
// Executed migration: src/database/migrations/20260626000000_create_market_intelligence_tables.ts

exports.up = async function up(knex) {
  await knex.schema.createTable("market_keywords", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.integer("organization_id").notNullable().references("id").inTable("organizations").onDelete("CASCADE");
    table.integer("location_id").notNullable().references("id").inTable("locations").onDelete("CASCADE");
    table.string("specialty", 128).nullable();
    table.string("keyword", 255).notNullable();
    table.string("normalized_keyword", 255).notNullable();
    table.string("canonical_keyword", 255).nullable();
    table.string("cluster", 128).nullable();
    table.string("intent", 64).nullable();
    table.string("source", 64).notNullable();
    table.string("status", 32).notNullable().defaultTo("approved");
    table.decimal("confidence", 5, 4).nullable();
    table.string("language_code", 16).notNullable().defaultTo("en");
    table.string("location_name", 255).nullable();
    table.timestamp("last_seen_at", { useTz: true }).nullable();
    table.jsonb("metadata").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(["organization_id", "location_id", "normalized_keyword"], {
      indexName: "market_keywords_unique_org_location_keyword",
    });
    table.index(["organization_id", "location_id", "status"], "idx_market_keywords_org_location_status");
    table.index(["organization_id", "status"], "idx_market_keywords_org_status");
    table.index(["location_id", "normalized_keyword"], "idx_market_keywords_location_keyword");
  });

  await knex.schema.createTable("market_keyword_search_volume", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("market_keyword_id").notNullable().references("id").inTable("market_keywords").onDelete("CASCADE");
    table.integer("organization_id").notNullable().references("id").inTable("organizations").onDelete("CASCADE");
    table.integer("location_id").notNullable().references("id").inTable("locations").onDelete("CASCADE");
    table.date("report_month").notNullable();
    table.integer("search_volume").nullable();
    table.string("source", 64).notNullable().defaultTo("dataforseo");
    table.string("provider", 64).notNullable().defaultTo("dataforseo");
    table.string("provider_location_name", 255).nullable();
    table.jsonb("provider_metadata").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(["market_keyword_id", "report_month", "source"], {
      indexName: "market_keyword_search_volume_unique_keyword_month_source",
    });
    table.index(["organization_id", "report_month"], "idx_market_keyword_volume_org_month");
    table.index(["location_id", "report_month"], "idx_market_keyword_volume_location_month");
    table.index(["market_keyword_id", "report_month"], "idx_market_keyword_volume_keyword_month");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("market_keyword_search_volume");
  await knex.schema.dropTableIfExists("market_keywords");
};
