/**
 * previous_content: jsonb -> text
 *
 * The column stores raw HTML (posts.content snapshot for GEO auto-apply
 * recovery); every reader treats it as a string. It was created as jsonb by
 * mistake (20260701000000_add_practice_facts_and_post_snapshot), which makes
 * PostModel.updateContentWithSnapshot crash with Postgres 22P02 on any real
 * HTML — the column is provably all-NULL in prod (0/553, 2026-07-02), so this
 * conversion carries zero data risk and the down migration is equally safe.
 *
 * TODO: fill during execution — copy into src/database/migrations/ with the
 * real timestamp prefix and .ts extension.
 */

exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE website_builder.posts
      ALTER COLUMN previous_content TYPE text
      USING previous_content #>> '{}'
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE website_builder.posts
      ALTER COLUMN previous_content TYPE jsonb
      USING to_jsonb(previous_content)
  `);
};
