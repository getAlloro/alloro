import { Knex } from "knex";

const TABLE = "form_responder_settings";

/**
 * Owner-controlled auto-responder settings (per org, optional per-location).
 * The Responder never auto-replies to a lead unless the owner has turned it ON
 * here — `enabled` defaults to false. This is what makes the auto-reply a
 * freedom the owner controls (toggle + their own copy or an approved AI draft),
 * not a behavior Alloro imposes; it is also the honest form of Option B consent
 * and it keeps auto-send off until an owner opts in. Mirrors the
 * gbp_automation_settings shape (org default row + optional location override).
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TABLE)) return;

  await knex.schema.createTable(TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .integer("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table
      .integer("location_id")
      .references("id")
      .inTable("locations")
      .onDelete("CASCADE");
    // The owner's on/off switch. OFF by default: no auto-reply until opt-in.
    table.boolean("enabled").notNullable().defaultTo(false);
    // 'ai' = Alloro drafts, owner approves/edits; 'custom' = owner writes their own.
    table.string("mode", 20).notNullable().defaultTo("ai");
    table.text("reply_subject"); // null → default subject
    table.text("reply_body"); // stored template (AI-approved or custom); null → default body
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);

    table.index(["organization_id", "location_id"]);
  });

  await knex.raw(`
    CREATE UNIQUE INDEX form_responder_settings_org_default_unique
    ON ${TABLE}(organization_id)
    WHERE location_id IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX form_responder_settings_org_location_unique
    ON ${TABLE}(organization_id, location_id)
    WHERE location_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TABLE);
}
