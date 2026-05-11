import { Knex } from "knex";

/**
 * Selected competitor Maps + radius discovery
 *
 * Spec: plans/05102026-no-ticket-selected-competitor-maps-radius/spec.md
 *
 * Stores the radius used for competitor suggestion discovery separately from
 * the sampled Maps search radius already stored on practice_rankings.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("locations", (table) => {
    table
      .integer("competitor_discovery_radius_meters")
      .notNullable()
      .defaultTo(40234);
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
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("competitor_discovery_radius_meters");
  });

  await knex.schema.alterTable("location_competitors", (table) => {
    table.dropColumn("discovery_radius_meters");
  });

  await knex.schema.alterTable("locations", (table) => {
    table.dropColumn("competitor_discovery_radius_meters");
  });
}
