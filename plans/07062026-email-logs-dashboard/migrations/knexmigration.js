/**
 * Knex migration scaffold — email_logs
 *
 * This is the REAL target for this repo (Postgres + Knex). During execution,
 * copy into src/database/migrations/<YYYYMMDDHHMMSS>_create_email_logs.ts and
 * convert to the repo's TS migration style (see analog
 * 20260704000000_create_os_knowledge_base_tables.ts): `import type { Knex }`,
 * `export async function up/down`, idempotent guards, tz timestamps.
 *
 * Category enum (app-level, stored as text): auth | account | billing |
 *   support | notification | leadgen | website_form | system | uncategorized
 * Status enum (app-level, stored as text): queued | sent | failed |
 *   delivered | opened | bounced | complained
 */

// TODO: fill during execution
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("email_logs");
  if (exists) return;

  await knex.schema.createTable("email_logs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("category").notNullable().defaultTo("uncategorized");
    t.text("status").notNullable().defaultTo("sent");
    t.text("from_email");
    t.text("from_name");
    t.jsonb("recipients").notNullable().defaultTo("[]");
    t.jsonb("cc").notNullable().defaultTo("[]");
    t.jsonb("bcc").notNullable().defaultTo("[]");
    t.text("subject");
    t.text("body_html"); // full rendered HTML — PII/PHI; internal-only access
    t.text("provider_message_id"); // Mailgun id, correlation key for events
    t.boolean("intercepted").notNullable().defaultTo(false);
    t.jsonb("original_recipients"); // pre-intercept to/cc/bcc, for audit
    t.text("error");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("delivered_at", { useTz: true });
    t.timestamp("opened_at", { useTz: true });

    t.index(["category"], "idx_email_logs_category");
    t.index(["status"], "idx_email_logs_status");
    t.index(["created_at"], "idx_email_logs_created_at");
    t.index(["provider_message_id"], "idx_email_logs_provider_message_id");
  });
};

// TODO: fill during execution
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("email_logs");
};
