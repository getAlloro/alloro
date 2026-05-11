import { Knex } from "knex";

/**
 * Rankings clarity + competitor reselection
 *
 * Spec: plans/05092026-no-ticket-rankings-clarity-competitor-reselection/spec.md
 *
 * Adds explicit snapshot metadata for competitor sets so the dashboard can show
 * sampled/estimated signals honestly and rerun rankings after competitor
 * reselection without feeding task-generation summaries.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("location_competitors", (table) => {
    table.integer("discovery_position").nullable();
    table.text("discovery_query").nullable();
    table.string("discovery_source", 30).nullable();
    table.timestamp("discovery_checked_at", { useTz: true }).nullable();
    table.decimal("profile_strength_score", 6, 2).nullable();
    table.string("profile_strength_tier", 30).nullable();
    table.jsonb("profile_strength_factors").nullable();
  });

  await knex.raw(`
    ALTER TABLE location_competitors
      ADD CONSTRAINT location_competitors_discovery_source_check
        CHECK (discovery_source IS NULL OR discovery_source IN (
          'apify_maps',
          'places_text',
          'user_added',
          'unknown'
        ))
  `);

  await knex.raw(`
    ALTER TABLE location_competitors
      ADD CONSTRAINT location_competitors_profile_strength_tier_check
        CHECK (profile_strength_tier IS NULL OR profile_strength_tier IN (
          'strong',
          'competitive',
          'needs_review',
          'not_measured'
        ))
  `);

  await knex.schema.alterTable("locations", (table) => {
    table.integer("competitor_set_revision").notNullable().defaultTo(1);
  });

  await knex.schema.alterTable("practice_rankings", (table) => {
    table.integer("competitor_set_revision").nullable();
    table.jsonb("competitor_snapshot").nullable();
    table.string("run_reason", 40).nullable();
    table
      .boolean("include_in_summary_recommendations")
      .notNullable()
      .defaultTo(true);
  });

  await knex.raw(`
    ALTER TABLE practice_rankings
      ADD CONSTRAINT practice_rankings_run_reason_check
        CHECK (run_reason IS NULL OR run_reason IN (
          'scheduled',
          'manual',
          'first_competitor_finalize',
          'competitor_reselection',
          'retry'
        ))
  `);

  await knex.raw(`
    CREATE INDEX idx_practice_rankings_summary_recommendations
      ON practice_rankings(organization_id, location_id, created_at DESC)
      WHERE status = 'completed' AND include_in_summary_recommendations = true
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_practice_rankings_summary_recommendations
  `);

  await knex.raw(`
    ALTER TABLE practice_rankings
      DROP CONSTRAINT IF EXISTS practice_rankings_run_reason_check
  `);

  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("include_in_summary_recommendations");
    table.dropColumn("run_reason");
    table.dropColumn("competitor_snapshot");
    table.dropColumn("competitor_set_revision");
  });

  await knex.schema.alterTable("locations", (table) => {
    table.dropColumn("competitor_set_revision");
  });

  await knex.raw(`
    ALTER TABLE location_competitors
      DROP CONSTRAINT IF EXISTS location_competitors_profile_strength_tier_check
  `);

  await knex.raw(`
    ALTER TABLE location_competitors
      DROP CONSTRAINT IF EXISTS location_competitors_discovery_source_check
  `);

  await knex.schema.alterTable("location_competitors", (table) => {
    table.dropColumn("profile_strength_factors");
    table.dropColumn("profile_strength_tier");
    table.dropColumn("profile_strength_score");
    table.dropColumn("discovery_checked_at");
    table.dropColumn("discovery_source");
    table.dropColumn("discovery_query");
    table.dropColumn("discovery_position");
  });
}
