import type { Knex } from "knex";

/**
 * previous_content: jsonb -> text
 *
 * The column stores raw HTML (a snapshot of posts.content taken by GEO
 * auto-apply for recovery); every reader — the posts editor restore surface,
 * api/posts.ts, and the unit tests — treats it as a plain string. It was
 * created as jsonb by mistake (20260701000000_add_practice_facts_and_post_
 * snapshot), which makes PostModel.updateContentWithSnapshot crash with
 * Postgres 22P02 ("Token \"<\" is invalid") on any real HTML — so the
 * snapshot has never once succeeded and the column is provably all-NULL
 * (0 non-null / 553 posts in prod, verified 2026-07-02). Both directions of
 * this migration are therefore zero-data-risk; the USING clauses exist only
 * for completeness.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.posts
      ALTER COLUMN previous_content TYPE text
      USING previous_content #>> '{}'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.posts
      ALTER COLUMN previous_content TYPE jsonb
      USING to_jsonb(previous_content)
  `);
}
