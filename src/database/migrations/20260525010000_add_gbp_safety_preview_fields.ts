import { Knex } from "knex";

const WORK_ITEMS_TABLE = "gbp_work_items";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(WORK_ITEMS_TABLE, (table) => {
    table.string("safety_status", 50);
    table.jsonb("safety_reason_codes").notNullable().defaultTo("[]");
    table.jsonb("safety_reasons").notNullable().defaultTo("[]");
    table.integer("safety_confidence");
    table.jsonb("deploy_preview_payload");
  });

  await knex.raw(`
    ALTER TABLE ${WORK_ITEMS_TABLE}
    ADD CONSTRAINT gbp_work_items_safety_status_check
    CHECK (
      safety_status IS NULL
      OR safety_status IN ('safe', 'needs_review', 'blocked')
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ${WORK_ITEMS_TABLE}
    DROP CONSTRAINT IF EXISTS gbp_work_items_safety_status_check
  `);

  await knex.schema.alterTable(WORK_ITEMS_TABLE, (table) => {
    table.dropColumn("deploy_preview_payload");
    table.dropColumn("safety_confidence");
    table.dropColumn("safety_reasons");
    table.dropColumn("safety_reason_codes");
    table.dropColumn("safety_status");
  });
}
