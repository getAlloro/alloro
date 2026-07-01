import { Knex } from "knex";

/**
 * Adds:
 *  - practice_facts: source-traceable, organization/location-scoped facts extracted
 *    from existing business_data + page/post content. Every row carries a literal
 *    source_excerpt so a fact can never be used downstream without provenance.
 *  - website_builder.posts.previous_content: nullable JSONB snapshot column. Written
 *    immediately before any system/auto-generated content write to a post body, since
 *    PostModel has no version-row system (unlike pages). Gives a one-step recovery
 *    path for auto-applied GEO content.
 *
 * Both changes are additive only. No backfill, no data rewrite, no lock risk beyond a
 * standard ALTER TABLE ADD COLUMN on posts (nullable, no default scan).
 */

const TABLE_NAME = "practice_facts";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("CASCADE");
    table.uuid("page_id").nullable();
    table.uuid("post_id").nullable();
    table.text("fact_text").notNullable();
    table.string("source_field", 50).notNullable(); // "business_data" | "page_content" | "post_content"
    table.text("source_excerpt").notNullable(); // literal snippet the fact was extracted from
    table.timestamp("extracted_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["organization_id", "location_id"]);
  });

  await knex.schema.withSchema("website_builder").alterTable("posts", (table) => {
    table.jsonb("previous_content").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("website_builder").alterTable("posts", (table) => {
    table.dropColumn("previous_content");
  });

  await knex.schema.dropTableIfExists(TABLE_NAME);
}
