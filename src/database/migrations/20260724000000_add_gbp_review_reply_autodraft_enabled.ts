import { Knex } from "knex";

const SETTINGS_TABLE = "gbp_automation_settings";
const COLUMN = "review_reply_autodraft_enabled";

/**
 * Per-scope activation switch for review-reply AUTO-DRAFT on ingest.
 *
 * Seeded DISABLED for every existing row, so merging the auto-draft feature
 * changes nothing anywhere until the switch is turned on for one account at a
 * time. This is deliberate and load-bearing: auto-draft is gated on the same
 * readiness the MANUAL reply path uses, so without its own switch it would
 * activate on the first nightly sync for every location already using manual
 * replies — and back-fill one LLM call per currently-unreplied review.
 *
 * Mirrors business_info_writeback_enabled (20260716000000): additive, default
 * false, and NOT client-toggleable through the settings endpoint — it is
 * enabled per account by Alloro, not by an authenticated org member.
 *
 * `down` drops only this column. It is cleanly reversible: no data is rewritten,
 * no rows are deleted, and dropping the switch cannot orphan a work item (the
 * drafts it gates are ordinary review_reply rows that the manual path also
 * creates and that survive independently).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(SETTINGS_TABLE, (table) => {
    table.boolean(COLUMN).notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(SETTINGS_TABLE, (table) => {
    table.dropColumn(COLUMN);
  });
}
