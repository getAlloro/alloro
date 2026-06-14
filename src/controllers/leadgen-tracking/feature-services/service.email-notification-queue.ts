/**
 * Email-notify FAB queue service.
 *
 * The leadgen tool's "Email me when ready" FAB POSTs an email + audit_id
 * here. We upsert a row in `leadgen_email_notifications` and either:
 *   (a) send immediately if the audit is already complete (closes the
 *       race where the user submits the FAB the same instant the worker
 *       finishes); or
 *   (b) leave it as `pending` for the worker to drain on completion.
 *
 * The worker calls `drainNotificationsForAudit(auditId)` after the audit
 * finishes (success OR failure) — every pending row for that audit gets
 * the report email and is marked `sent` / `failed`. Failures stay in the
 * table for admin visibility; no automatic retry in v1.
 *
 * All public functions silent on failure — never throws. The audit worker
 * must not be killed by an email hiccup.
 */

import { db } from "../../../database/connection";
import { sendAuditReportEmail } from "./service.n8n-email-sender";
import logger from "../../../lib/logger";

function log(message: string): void {
  logger.info(`[LEADGEN-NOTIFY] ${message}`);
}

interface EnqueueOpts {
  session_id: string;
  audit_id: string;
  email: string;
}

interface AuditRow {
  id: string;
  status: string | null;
  step_self_gbp: unknown;
}

interface NotifRow {
  id: string;
  session_id: string;
  audit_id: string;
  email: string;
  status: string;
}

function pickBusinessName(audit: AuditRow | undefined): string | undefined {
  // step_self_gbp.title is the practice name when present; safe fallback to
  // undefined (the email template handles the missing-name case).
  const gbp = audit?.step_self_gbp as { title?: unknown } | null | undefined;
  if (gbp && typeof gbp.title === "string") return gbp.title;
  return undefined;
}

/**
 * Idempotent upsert. If the audit is already complete, sends the email
 * inline and marks `sent` so the user gets it immediately rather than
 * waiting for a worker drain that already happened.
 */
export async function enqueueEmailNotification(
  opts: EnqueueOpts
): Promise<void> {
  try {
    // Upsert: latest email wins on conflict, but never overwrite a row
    // that's already been sent (don't double-email the user).
    await db.raw(
      `
      INSERT INTO leadgen_email_notifications
        (session_id, audit_id, email, status, created_at)
      VALUES (?, ?, ?, 'pending', NOW())
      ON CONFLICT (session_id, audit_id) DO UPDATE
        SET email = EXCLUDED.email
        WHERE leadgen_email_notifications.status <> 'sent'
      `,
      [opts.session_id, opts.audit_id, opts.email]
    );

    const audit = (await db("audit_processes")
      .select("id", "status", "step_self_gbp")
      .where({ id: opts.audit_id })
      .first()) as AuditRow | undefined;

    if (audit?.status === "completed" || audit?.status === "failed") {
      // Audit already done — send immediately, don't leave the user
      // waiting for the next worker tick.
      const result = await sendAuditReportEmail({
        recipientEmail: opts.email,
        auditId: opts.audit_id,
        businessName: pickBusinessName(audit),
      });

      if (result.ok) {
        await db("leadgen_email_notifications")
          .where({ session_id: opts.session_id, audit_id: opts.audit_id })
          .update({ status: "sent", sent_at: db.fn.now() })
          .increment("attempt_count", 1);
        log(
          `enqueue → audit already done → sent inline (audit=${opts.audit_id}, email=${opts.email})`
        );
      } else {
        await db("leadgen_email_notifications")
          .where({ session_id: opts.session_id, audit_id: opts.audit_id })
          .update({ status: "failed", last_error: result.error ?? null })
          .increment("attempt_count", 1);
        log(
          `enqueue inline send FAILED (audit=${opts.audit_id}): ${result.error}`
        );
      }
    } else {
      log(
        `enqueue → pending (audit=${opts.audit_id}, email=${opts.email}, audit_status=${audit?.status ?? "?"})`
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`enqueueEmailNotification failed: ${msg}`);
  }
}

/**
 * Worker-side drain. Called when audit completes (or fails). Sends every
 * pending notification, updates row status, never throws.
 */
export async function drainNotificationsForAudit(
  audit_id: string
): Promise<void> {
  try {
    const pending = (await db("leadgen_email_notifications")
      .select("id", "session_id", "audit_id", "email", "status")
      .where({ audit_id, status: "pending" })) as NotifRow[];

    if (pending.length === 0) return;

    const audit = (await db("audit_processes")
      .select("id", "status", "step_self_gbp")
      .where({ id: audit_id })
      .first()) as AuditRow | undefined;

    log(`drain audit=${audit_id}: ${pending.length} pending notification(s)`);

    for (const row of pending) {
      const result = await sendAuditReportEmail({
        recipientEmail: row.email,
        auditId: audit_id,
        businessName: pickBusinessName(audit),
      });

      if (result.ok) {
        await db("leadgen_email_notifications")
          .where({ id: row.id })
          .update({ status: "sent", sent_at: db.fn.now() })
          .increment("attempt_count", 1);
        log(`  ✓ sent → ${row.email}`);
      } else {
        await db("leadgen_email_notifications")
          .where({ id: row.id })
          .update({ status: "failed", last_error: result.error ?? null })
          .increment("attempt_count", 1);
        log(`  ✗ failed → ${row.email}: ${result.error}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`drainNotificationsForAudit failed: ${msg}`);
  }
}
