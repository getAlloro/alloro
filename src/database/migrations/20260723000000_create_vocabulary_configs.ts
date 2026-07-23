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
 * Additive, no locks on existing tables, idempotent up() (hasTable guard),
 * reversible down().
 */

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("vocabulary_configs");
  if (exists) return;

  await knex.schema.createTable("vocabulary_configs", (t) => {
    t.increments("id").primary();
    t.integer("org_id").notNullable();
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
