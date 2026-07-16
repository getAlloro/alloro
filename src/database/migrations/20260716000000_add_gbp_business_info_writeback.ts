import { Knex } from "knex";

const SETTINGS_TABLE = "gbp_automation_settings";
const WORK_ITEMS_TABLE = "gbp_work_items";
const CONTENT_TYPE_CONSTRAINT = "gbp_work_items_content_type_check";

/**
 * A6 — GBP write-back. Additive + reversible.
 *
 * Adds the `business_info` work-item content type (owner-approved businessInformation
 * PATCH to Google), a nullable jsonb slot for its proposed patch + rollback snapshot,
 * and the per-scope master switch — seeded DISABLED so the lever is inert until Dave
 * enables it per account. No data is rewritten; existing review_reply/local_post rows
 * are untouched.
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

export async function down(knex: Knex): Promise<void> {
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
