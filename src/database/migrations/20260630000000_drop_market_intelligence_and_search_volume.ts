import type { Knex } from "knex";

/**
 * Teardown of the DataForSEO Market Intelligence + legacy search-volume feature
 * (plans/06302026-remove-market-intelligence-search-opportunity, T6).
 *
 * Drops, in dependency-safe order:
 *   - market_keyword_search_volume (child, FK → market_keywords)  [20260626000000]
 *   - market_keywords             (parent)                        [20260626000000]
 *   - keyword_search_volume       (legacy gen-1)                  [20260624000000]
 *
 * Production note (AGENTS.md): destructive — harvested search-volume data is lost
 * on `up()`. Runs on dev first, then on prod at the next `main` deploy. The
 * `down()` recreates table STRUCTURE only (verbatim from the original create
 * migrations); harvested data is not restored.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("market_keyword_search_volume");
  await knex.schema.dropTableIfExists("market_keywords");
  await knex.raw(`DROP TABLE IF EXISTS keyword_search_volume CASCADE;`);
}

export async function down(knex: Knex): Promise<void> {
  // Recreate legacy keyword_search_volume (from 20260624000000).
  await knex.raw(`
    CREATE TABLE keyword_search_volume (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      keyword VARCHAR(255) NOT NULL,
      report_month DATE NOT NULL,
      search_volume INTEGER,
      source VARCHAR(64) NOT NULL DEFAULT 'dataforseo',
      location_name VARCHAR(255),
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT keyword_search_volume_unique_location_keyword_month
        UNIQUE (location_id, keyword, report_month)
    );

    CREATE INDEX idx_keyword_search_volume_location_month
      ON keyword_search_volume(location_id, report_month DESC);

    CREATE INDEX idx_keyword_search_volume_org
      ON keyword_search_volume(organization_id);
  `);

  // Recreate market_keywords (parent) then market_keyword_search_volume (child)
  // from 20260626000000.
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
}
