import { Knex } from "knex";

const SETTINGS_TABLE = "gbp_automation_settings";
const WORK_ITEMS_TABLE = "gbp_work_items";
const CONTENT_TYPE_CONSTRAINT = "gbp_work_items_content_type_check";

/** Opt-in escape hatch for a rollback that must destroy business_info rows. See `down`. */
const ALLOW_ROW_DELETION_FLAG = "GBP_BUSINESS_INFO_ROLLBACK_DELETE_ROWS";

/**
 * A6 — GBP write-back.
 *
 * `up` is additive and rewrites nothing: it adds the `business_info` work-item
 * content type (owner-approved businessInformation PATCH to Google), a nullable
 * jsonb slot for its proposed patch + rollback snapshot, and the per-scope master
 * switch — seeded DISABLED so the lever is inert until it is enabled per account.
 * Existing review_reply/local_post rows are untouched.
 *
 * `down` is NOT symmetric, and is deliberately not called "cleanly reversible":
 * see the data-loss policy on the function below before running it.
 */
export async function up(knex: Knex): Promise<void> {
  // Widen the content_type CHECK to admit 'business_info'.
  await knex.raw(`ALTER TABLE ${WORK_ITEMS_TABLE} DROP CONSTRAINT ${CONTENT_TYPE_CONSTRAINT}`);
  await knex.raw(`
    ALTER TABLE ${WORK_ITEMS_TABLE}
    ADD CONSTRAINT ${CONTENT_TYPE_CONSTRAINT}
    CHECK (content_type IN ('review_reply', 'local_post', 'business_info'))
  `);

  // Proposed patch + updateMask + the capture-before-write rollback snapshot live here,
  // mirroring the local_post_payload slot. Nullable; only business_info items use it.
  await knex.schema.alterTable(WORK_ITEMS_TABLE, (table) => {
    table.jsonb("business_info_payload");
  });

  // The master switch — DISABLED by default (mirrors review_reply_enabled / local_post_generation_enabled).
  await knex.schema.alterTable(SETTINGS_TABLE, (table) => {
    table.boolean("business_info_writeback_enabled").notNullable().defaultTo(false);
  });
}

/**
 * DATA-LOSS POLICY — read before rolling this back.
 *
 * Re-narrowing the content_type CHECK cannot succeed while any `business_info`
 * row exists, so a rollback and those rows are mutually exclusive. Those rows are
 * not scratch data: each one carries the owner-approved patch and the
 * `previous_values` snapshot captured before the write to Google — i.e. the
 * rollback path for a change that is already live on the customer's real profile.
 * Deleting them destroys the audit history AND the only record of how to undo a
 * published change. That is a customer-data decision, not a schema decision, so
 * this migration will NOT make it silently.
 *
 * Default behavior: if any `business_info` row exists, `down` REFUSES and throws.
 *
 * To roll back anyway, an operator must first decide what happens to the rows and
 * then say so explicitly:
 *   1. Preferred — drain: revert or finalize every published business_info item so
 *      no live profile depends on a snapshot that is about to be deleted, then
 *      archive the rows (e.g. `CREATE TABLE gbp_work_items_business_info_archive AS
 *      SELECT * FROM gbp_work_items WHERE content_type = 'business_info'`).
 *   2. Then re-run the rollback with the deletion acknowledged:
 *      `GBP_BUSINESS_INFO_ROLLBACK_DELETE_ROWS=true npm run db:rollback`
 *
 * Recovery if rows were deleted: restore from the archive table above, or from the
 * database backup taken before the rollback. There is no in-migration undo — the
 * rows are gone once deleted, which is exactly why the flag is required.
 */
export async function down(knex: Knex): Promise<void> {
  const existingRows = await knex(WORK_ITEMS_TABLE)
    .where({ content_type: "business_info" })
    .count({ count: "*" })
    .first();
  const rowCount = Number(existingRows?.count ?? 0);

  if (rowCount > 0 && process.env[ALLOW_ROW_DELETION_FLAG] !== "true") {
    throw new Error(
      `Refusing to roll back: ${rowCount} '${WORK_ITEMS_TABLE}' row(s) with content_type='business_info' exist, ` +
        `and re-narrowing ${CONTENT_TYPE_CONSTRAINT} requires deleting them. ` +
        `Those rows hold each change's rollback snapshot (previous_values) for profiles already updated on Google, ` +
        `so deleting them destroys the ability to undo a live change. ` +
        `Drain or archive them first, then re-run with ${ALLOW_ROW_DELETION_FLAG}=true to acknowledge the deletion. ` +
        `See the data-loss policy in this migration file.`
    );
  }

  if (rowCount > 0) {
    // Reached only with the operator's explicit acknowledgement above.
    await knex(WORK_ITEMS_TABLE).where({ content_type: "business_info" }).del();
  }

  await knex.schema.alterTable(SETTINGS_TABLE, (table) => {
    table.dropColumn("business_info_writeback_enabled");
  });
  await knex.schema.alterTable(WORK_ITEMS_TABLE, (table) => {
    table.dropColumn("business_info_payload");
  });
  await knex.raw(`ALTER TABLE ${WORK_ITEMS_TABLE} DROP CONSTRAINT ${CONTENT_TYPE_CONSTRAINT}`);
  await knex.raw(`
    ALTER TABLE ${WORK_ITEMS_TABLE}
    ADD CONSTRAINT ${CONTENT_TYPE_CONSTRAINT}
    CHECK (content_type IN ('review_reply', 'local_post'))
  `);
}
