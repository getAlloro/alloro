import { Knex } from "knex";

/**
 * `email_logs` — every outbound email, captured at the single sendEmail
 * choke-point (src/emails/emailService.ts). Backs the internal-admin Email
 * Logs dashboard (plans/07062026-email-logs-dashboard).
 *
 * Notes:
 *  - Lives in `public` (no dedicated schema). `gen_random_uuid()` is built in
 *    on PG13+ (prod/dev are PG17) — same precedent as os.* tables.
 *  - `body_html` holds the full rendered email; it can contain PII/PHI, so the
 *    reading surface is internal-admin only (superAdminMiddleware). Retention
 *    is indefinite by owner decision (plan Risk, Level 4 — owner-owned).
 *  - `status`/`category` are app-level enums stored as text (no DB CHECK) so a
 *    new category/status never requires a migration.
 *  - Additive, no locks on existing tables, reversible down().
 */

export async function up(knex: Knex): Promise<void> {
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
    t.text("body_html"); // full rendered HTML — PII/PHI; internal-only read surface
    t.text("provider_message_id"); // Mailgun id; correlation key for delivery/open events
    t.boolean("intercepted").notNullable().defaultTo(false);
    t.jsonb("original_recipients"); // pre-intercept to/cc/bcc, for audit
    t.text("error");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("delivered_at", { useTz: true });
    t.timestamp("opened_at", { useTz: true });

    t.index(["category"], "email_logs_category_idx");
    t.index(["status"], "email_logs_status_idx");
    t.index(["created_at"], "email_logs_created_at_idx");
    t.index(["provider_message_id"], "email_logs_provider_message_id_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("email_logs");
}
