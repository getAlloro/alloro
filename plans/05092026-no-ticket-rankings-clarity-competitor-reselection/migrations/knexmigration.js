/**
 * Rankings Clarity and Competitor Reselection
 * Knex migration planning scaffold.
 *
 * TODO during execution:
 * - Convert this scaffold to a timestamped TypeScript migration under
 *   src/database/migrations/.
 * - Add reversible DDL for:
 *   1. location_competitors discovery/search estimate metadata
 *   2. locations.competitor_set_revision
 *   3. practice_rankings competitor_set_revision, competitor_snapshot,
 *      run_reason, and include_in_summary_recommendations
 * - Add check constraints for discovery_source and profile_strength_tier.
 * - Add check constraint for run_reason.
 * - Add indexes documented in pgsql.sql if query plans need them.
 */

exports.up = async function up(knex) {
  // TODO: fill during execution.
};

exports.down = async function down(knex) {
  // TODO: fill during execution.
};
