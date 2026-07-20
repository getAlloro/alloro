import { Knex } from "knex";

/**
 * Responder V1 — record when an inbound website lead was auto-answered
 * (the Responder recipe / DAVE-LEAD-HANDOFF).
 *
 * Additive, nullable columns only — no backfill, no rewrite, no long lock,
 * fully reversible. `responded_at` stamps when the owner-approved instant
 * auto-reply was sent to the lead; `response_channel` records how (email in V1).
 */
export async function up(knex: Knex): Promise<void> {
  const hasRespondedAt = await knex.schema.hasColumn(
    "website_builder.form_submissions",
    "responded_at",
  );
  const hasResponseChannel = await knex.schema.hasColumn(
    "website_builder.form_submissions",
    "response_channel",
  );

  await knex.schema.alterTable("website_builder.form_submissions", (table) => {
    if (!hasRespondedAt) table.timestamp("responded_at", { useTz: true }).nullable();
    if (!hasResponseChannel) table.text("response_channel").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasRespondedAt = await knex.schema.hasColumn(
    "website_builder.form_submissions",
    "responded_at",
  );
  const hasResponseChannel = await knex.schema.hasColumn(
    "website_builder.form_submissions",
    "response_channel",
  );

  await knex.schema.alterTable("website_builder.form_submissions", (table) => {
    if (hasRespondedAt) table.dropColumn("responded_at");
    if (hasResponseChannel) table.dropColumn("response_channel");
  });
}
