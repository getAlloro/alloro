import { Knex } from "knex";

/**
 * Allow SerpApi as a persisted Search Position source.
 *
 * Spec: plans/05142026-no-ticket-serpapi-maps-rank-source/spec.md (T3)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE practice_rankings
      DROP CONSTRAINT IF EXISTS practice_rankings_search_position_source_check
  `);

  await knex.raw(`
    ALTER TABLE practice_rankings
      ADD CONSTRAINT practice_rankings_search_position_source_check
        CHECK (search_position_source IS NULL OR search_position_source IN (
          'apify_maps',
          'places_text',
          'serpapi_maps'
        ))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE practice_rankings
      DROP CONSTRAINT IF EXISTS practice_rankings_search_position_source_check
  `);

  await knex.raw(`
    ALTER TABLE practice_rankings
      ADD CONSTRAINT practice_rankings_search_position_source_check
        CHECK (search_position_source IS NULL OR search_position_source IN (
          'apify_maps',
          'places_text'
        ))
  `);
}
