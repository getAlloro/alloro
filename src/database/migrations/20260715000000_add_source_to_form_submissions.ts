import { Knex } from "knex";

/**
 * Adds a nullable `source` column to website_builder.form_submissions — the
 * channel a raised hand came through (referrer / UTM-derived at submit time), so
 * the owner can see an honest "X people reached out, from these sources" instead
 * of a bare submission count. This is the capture half of the connection-
 * measurement moat (Slice 4): the introduction, attributed to where it came from,
 * on a surface Alloro hosts.
 *
 * Mirrors the existing `sender_ip` capture on this same table — a request-derived
 * signal stored at submit time, no new table.
 *
 * Additive + nullable BY DESIGN: historical rows, internal navigation, and any
 * submission we cannot confidently classify stay null. The source is never
 * guessed — an unknown channel is null, not a catch-all label. Honesty over
 * completeness (Value #6): a null source reads as "we don't know," which is true,
 * rather than inventing an attribution we can't stand behind.
 */
export async function up(knex: Knex): Promise<void> {
  // Raw ADD COLUMN IF NOT EXISTS to match this table's sibling migrations
  // (sender_ip, is_flagged) — idempotent, additive, no default/index/backfill.
  await knex.raw(`
    ALTER TABLE website_builder.form_submissions
      ADD COLUMN IF NOT EXISTS source VARCHAR(100);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE website_builder.form_submissions
      DROP COLUMN IF EXISTS source;
  `);
}
