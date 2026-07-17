import { Knex } from "knex";

/**
 * Adds a nullable `source_method` column to website_builder.form_submissions —
 * the PROVENANCE of the `source` label added by 20260715000000: how we came to
 * believe it, stored next to what we believe.
 *
 * WHY IT IS A SEPARATE COLUMN (§5.2 / §5.4): `source` alone cannot distinguish a
 * channel the visitor's browser CLAIMED (`utm_source=facebook` — attacker- and
 * JS-controlled on a public endpoint) from one Alloro CLASSIFIED from a referrer.
 * Same label, different evidence. Collapsing them lets a client claim be reported
 * as verified attribution, which is a lie the owner would act on. The method
 * rides with the label so every reader can tell the two apart; the honest
 * confidence tier is derived from it in sourceAttribution.ts, which is the one
 * place that judgement lives.
 *
 * Values written by deriveSubmissionSource(): `client_label`, `client_referrer`,
 * `header_referrer`. Null iff `source` is null (unknown). No CHECK constraint —
 * matching this table's sibling migrations (sender_ip, is_flagged, source), which
 * keep column-level validation in code rather than the schema.
 *
 * A SEPARATE migration rather than an edit to 20260715000000 on purpose: that one
 * may already have run in a dev/local DB, and knex will never re-run a recorded
 * migration — an edit there would silently never reach the column. Additive,
 * idempotent, reversible, no default/index/backfill. Historical rows stay null,
 * which honestly reads as "we didn't record how" — not a guessed provenance.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.form_submissions
      ADD COLUMN IF NOT EXISTS source_method VARCHAR(32);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.form_submissions
      DROP COLUMN IF EXISTS source_method;
  `);
}
