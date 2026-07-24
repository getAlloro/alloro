import { Knex } from "knex";

/**
 * `vocabulary_configs` — one resolved per-org vocabulary preset, produced by
 * services/vocabularyAutoMapper.ts from a business's GBP category. Each row is
 * the ONE record that tells Alloro how to speak to a given owner (patient vs.
 * client vs. customer, referral source, primary metric, avg case value, …).
 *
 * The model (models/VocabularyConfigModel.ts) has referenced this table since it
 * was extracted from the mapper, but no migration ever created it — so the write
 * path (autoConfigureVocabulary) would have thrown at runtime. This migration
 * closes that gap so the mapper can actually populate and serve the preset.
 *
 * Shape:
 *  - `org_id` is UNIQUE: one config per organization. The mapper's
 *    first-write-wins guard (findByOrgId → skip insert if present) relies on it,
 *    and the unique constraint is the hard backstop against duplicates under a
 *    race.
 *  - `overrides` is jsonb — the mapper writes a pre-stringified VocabularyPreset
 *    payload (PG casts the JSON text to jsonb on insert; reads return an object).
 *
 * Production safety:
 *  - Additive only. Creates ONE new table; alters, rewrites, and backfills
 *    nothing. No existing row is read or written, so there is no data-loss or
 *    long-lock risk on any live table.
 *  - The org_id FK adds a referential constraint to `organizations`. Postgres
 *    takes a brief SHARE ROW EXCLUSIVE lock on the referenced table to validate
 *    it; because the new table is empty there are no rows to check, so the lock
 *    is held for microseconds. It blocks nothing at production scale.
 *  - up() is idempotent (hasTable guard) — re-running is a no-op.
 *  - down() is a real, complete reversal: dropTableIfExists removes the table
 *    and its FK. Rollback loses only auto-derived vocabulary configs, which the
 *    mapper regenerates on the next business-data refresh. No user-entered data
 *    lives here.
 *  - Production rows affected on rollback: every row of `vocabulary_configs`
 *    only. No other table is touched.
 */

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("vocabulary_configs");
  if (exists) return;

  await knex.schema.createTable("vocabulary_configs", (t) => {
    t.increments("id").primary();
    // FK to organizations.id, matching the locations table (§10.4). Without it
    // a deleted org leaves an orphan config row forever and nothing in the
    // schema states what this column means. CASCADE: the config is derived
    // per-org data with no meaning once the org is gone.
    t
      .integer("org_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    t.text("vertical").notNullable();
    // Resolved VocabularyPreset payload (patientTerm, referralTerm, avgCaseValue, …).
    t.jsonb("overrides").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // One config per org; also the index that findByOrgId filters on (§10.4).
    t.unique(["org_id"], { indexName: "vocabulary_configs_org_id_unique" });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("vocabulary_configs");
}
