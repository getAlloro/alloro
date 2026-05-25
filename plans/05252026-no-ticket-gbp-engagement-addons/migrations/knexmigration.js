// GBP Engagement Add-ons Knex migration scaffold
// Plan: plans/05252026-no-ticket-gbp-engagement-addons/spec.md

/**
 * Expected implementation:
 * - Create gbp_review_insights.
 * - Create gbp_review_escalations.
 * - Create gbp_sync_health.
 * - Add structured voice/rule columns to gbp_automation_settings.
 * - Add safety/preview columns to gbp_work_items only if needed after model review.
 *
 * Production safety:
 * - Additive only.
 * - No destructive data rewrites.
 * - Any backfill must be bounded and idempotent.
 * - Down migration drops only addon-owned tables/columns.
 */

exports.up = async function up(knex) {
  // TODO: fill during execution.
};

exports.down = async function down(knex) {
  // TODO: fill during execution.
};
