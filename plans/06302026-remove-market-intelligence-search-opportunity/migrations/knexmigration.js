/**
 * Drop Market Intelligence + legacy search-volume tables.
 *
 * Scaffold for plans/06302026-remove-market-intelligence-search-opportunity (T6).
 * The real migration lives at:
 *   src/database/migrations/{ts}_drop_market_intelligence_and_search_volume.ts
 *
 * up():   drop the feature tables in dependency-safe order (children before parents).
 * down(): recreate table STRUCTURE only (not data) by copying the exact DDL from the
 *         original create migrations — do NOT edit those originals:
 *           - 20260624000000_create_keyword_search_volume.ts
 *           - 20260626000000_create_market_intelligence_tables.ts
 *
 * Production safety (AGENTS.md): destructive. Runs on dev first, then on prod at the
 * next `main` deploy via `npm run db:migrate`. Data loss is intended (feature retired).
 *
 * TABLE NAMES TO CONFIRM at execution by reading the create migrations (likely set):
 *   - keyword_search_volume            (gen-1, from 20260624000000)
 *   - market_keywords                  (gen-2)
 *   - market_keyword_search_volume     (gen-2)
 *   - market_* summary/cluster tables  (gen-2, confirm names)
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // TODO: fill during execution — drop in dependency-safe order, idempotent.
  // Example shape (confirm real table names first):
  //   await knex.schema.dropTableIfExists("market_keyword_search_volume");
  //   await knex.schema.dropTableIfExists("market_keywords");
  //   await knex.schema.dropTableIfExists(/* market summary/cluster tables */);
  //   await knex.schema.dropTableIfExists("keyword_search_volume");
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  // TODO: fill during execution — recreate STRUCTURE by copying DDL verbatim from:
  //   src/database/migrations/20260624000000_create_keyword_search_volume.ts
  //   src/database/migrations/20260626000000_create_market_intelligence_tables.ts
  // Recreate parents before children. Data is not restored.
};
