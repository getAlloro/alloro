import { Knex } from "knex";

/**
 * §10.4 — index the columns the published-work reads filter, range and sort on.
 *
 * The proof-receipt read and ReceiptsReportModel's published-work count both
 * filter `organization_id` + `status` and then range-and-sort on
 * `published_at`. The existing (organization_id, location_id, status) index
 * cannot serve either: the whole-org query skips the middle column, leaving
 * Postgres a leading-column scan plus a filter plus an explicit sort.
 *
 * Equality columns lead, then the range-and-sort column, so one index serves
 * the filter, the range and the ORDER BY without a sort step. The partial
 * predicate keeps the index to published rows, a small fraction of the table.
 *
 * Production safety: additive, no data rewrite, idempotent via IF NOT EXISTS,
 * and `down` is a clean DROP with zero data impact. A plain CREATE INDEX takes
 * a SHARE lock that blocks writes to gbp_work_items while it builds; the table
 * is small (a couple of dozen producing sites). If it ever grows past ~500k
 * rows, switch to CREATE INDEX CONCURRENTLY and add
 * `export const config = { transaction: false };` — CONCURRENTLY cannot run
 * inside Knex's transaction (precedent:
 * 20260505000001_add_archived_support_ticket_status.ts).
 */

const WORK_ITEMS_TABLE = "gbp_work_items";
const INDEX_NAME = "idx_gbp_work_items_org_status_published_at";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${INDEX_NAME}
    ON ${WORK_ITEMS_TABLE} (organization_id, status, published_at DESC)
    WHERE published_at IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
}
