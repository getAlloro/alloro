import { Knex } from "knex";

/**
 * Alloro Funnel Engine A3 — AI-Answer Visibility (AEO) observation log.
 * Additive, reversible. A LOG (one row per location+prompt+engine+run-date),
 * never a score. `position` is stored raw for analysis but is NEVER surfaced as
 * a rank (research/aeo-measurement-spec.md honesty caps).
 */

const OBSERVATION_TABLE = "ai_visibility_observation";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(OBSERVATION_TABLE, (table) => {
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
    table.string("engine", 40).notNullable();
    table.string("capture_method", 30).notNullable();
    table.string("prompt_key", 120).notNullable();
    table.text("prompt_text").notNullable();
    table.boolean("mentioned").notNullable().defaultTo(false);
    table.boolean("cited").notNullable().defaultTo(false);
    table.text("cited_source");
    // Raw ordinal only; NEVER rendered as a rank.
    table.integer("position");
    table.text("raw_excerpt").notNullable().defaultTo("");
    table.date("run_date").notNullable();
    table.timestamp("observed_at", { useTz: true }).notNullable();
    table.timestamps(true, true);

    // Idempotency: one observation per location+prompt+engine per run day.
    table.unique(["location_id", "prompt_key", "engine", "run_date"], {
      indexName: "ai_visibility_observation_idem",
    });
    table.index(["organization_id", "location_id", "engine", "observed_at"]);
  });

  await knex.raw(`
    ALTER TABLE ${OBSERVATION_TABLE}
    ADD CONSTRAINT ai_visibility_observation_engine_check
    CHECK (engine IN ('gemini', 'perplexity', 'google_ai_overview'))
  `);
  await knex.raw(`
    ALTER TABLE ${OBSERVATION_TABLE}
    ADD CONSTRAINT ai_visibility_observation_capture_check
    CHECK (capture_method IN ('api_grounded', 'api_proxy', 'serp_scrape'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(OBSERVATION_TABLE);
}
