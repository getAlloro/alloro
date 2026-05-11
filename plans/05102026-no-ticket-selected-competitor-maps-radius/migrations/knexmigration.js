/**
 * Selected Competitor Maps and Radius Discovery
 *
 * Spec: plans/05102026-no-ticket-selected-competitor-maps-radius/spec.md
 *
 * Schema intent:
 * - locations.competitor_discovery_radius_meters integer nullable/default 40234
 * - location_competitors.discovery_radius_meters integer nullable
 * - practice_rankings.competitor_discovery_radius_meters integer nullable
 *
 * TODO: fill during execution with the real Knex migration.
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable("locations", (table) => {
    table.integer("competitor_discovery_radius_meters").notNullable().defaultTo(40234);
  });

  await knex.schema.alterTable("location_competitors", (table) => {
    table.integer("discovery_radius_meters").nullable();
  });

  await knex.schema.alterTable("practice_rankings", (table) => {
    table.integer("competitor_discovery_radius_meters").nullable();
  });

  await knex("location_competitors")
    .whereNull("discovery_radius_meters")
    .update({ discovery_radius_meters: 40234 });

  await knex("practice_rankings")
    .whereNull("competitor_discovery_radius_meters")
    .update({ competitor_discovery_radius_meters: 40234 });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("competitor_discovery_radius_meters");
  });

  await knex.schema.alterTable("location_competitors", (table) => {
    table.dropColumn("discovery_radius_meters");
  });

  await knex.schema.alterTable("locations", (table) => {
    table.dropColumn("competitor_discovery_radius_meters");
  });
};
