/**
 * SerpApi Maps Rank Source
 *
 * Schema plan:
 * - Update practice_rankings.search_position_source check constraint.
 * - Allow existing values: apify_maps, places_text.
 * - Add new value: serpapi_maps.
 *
 * Implemented during execution as:
 * - src/database/migrations/20260514000001_allow_serpapi_search_position_source.ts
 */

exports.up = async function up(knex) {
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
};

exports.down = async function down(knex) {
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
};
