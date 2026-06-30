/**
 * Patient Journey Insights — market search-volume table (Task T1).
 *
 * Powers the "Searching your market" funnel stage (the one stage with no live
 * data today). One row per location + keyword + month. Scaffold only — the real
 * migration lands in src/database/migrations/{timestamp}_create_keyword_search_volume.ts
 * during execution. Alloro is PostgreSQL + Knex only (no MSSQL).
 *
 * Schema:
 *   website_builder.keyword_search_volume
 *     id             uuid pk default gen_random_uuid()
 *     location_id    integer  FK -> public.locations(id) ON DELETE CASCADE
 *     keyword        varchar(255) not null   -- from practice_rankings.rank_keywords
 *     report_month   date not null           -- first day of the month
 *     search_volume  integer not null        -- monthly searches from the provider
 *     source         varchar(64) not null    -- e.g. 'dataforseo'
 *     data           jsonb                    -- raw provider payload (audit)
 *     created_at     timestamptz default now()
 *     updated_at     timestamptz default now()
 *   unique (location_id, keyword, report_month)
 *   index on (location_id, report_month)
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // TODO: fill during execution — mirror the structure used by
  // src/database/migrations/20260430200002_create_analytics_data_tables.ts
  // (schema-qualified table in website_builder, uuid pk, jsonb payload, unique index).
  // await knex.schema.withSchema('website_builder').createTable('keyword_search_volume', (t) => { ... });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  // TODO: fill during execution — must be reversible (§10.3).
  // await knex.schema.withSchema('website_builder').dropTableIfExists('keyword_search_volume');
};
