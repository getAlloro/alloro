/**
 * Admin Email Logs Controller
 *
 * Two read-only handlers for the internal Email Logs dashboard
 * (plans/07062026-email-logs-dashboard). Mounted behind
 * `authenticateToken` + `superAdminMiddleware` at the route layer — this
 * controller does no auth of its own.
 *
 *   GET /admin/email-logs        — paginated, filtered list (no body_html)
 *   GET /admin/email-logs/:id    — full detail incl. rendered body_html
 *
 * Bodies can contain PII/PHI; the super-admin gate is the containment (plan
 * Risk, Level 4 — owner-owned).
 */

import { Request, Response } from "express";
import { EmailLogModel } from "../../models/EmailLogModel";
import { sendEmail, resolveTransport } from "../../emails/emailService";
import { buildSystemTestEmail } from "../../emails/templates/SystemTestEmail";
import { ok, fail } from "./feature-utils/controllerResponses";
import logger from "../../lib/logger";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function listEmailLogs(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(
      parsePositiveInt(req.query.limit, DEFAULT_LIMIT),
      MAX_LIMIT
    );
    const offset = (page - 1) * limit;

    const { data, total } = await EmailLogModel.listLogs({
      category: optionalString(req.query.category),
      status: optionalString(req.query.status),
      from: optionalString(req.query.from),
      to: optionalString(req.query.to),
      search: optionalString(req.query.search),
      limit,
      offset,
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return ok(res, {
      logs: data,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    logger.error({ err: error }, "[AdminEmailLogs] listEmailLogs error:");
    return fail(res, 500, "EMAIL_LOGS_LIST_FAILED", "Failed to list email logs.");
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendTestEmail(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { recipient } = req.body as { recipient?: string };

    if (!recipient || typeof recipient !== "string" || !EMAIL_REGEX.test(recipient.trim())) {
      return fail(res, 400, "INVALID_RECIPIENT", "A valid email address is required.");
    }

    const transport = resolveTransport();
    const result = await sendEmail({
      subject: `[Alloro Test] Email transport verification (${transport})`,
      body: buildSystemTestEmail({
        transport,
        recipient: recipient.trim(),
        sentAt: new Date().toISOString(),
      }),
      recipients: [recipient.trim()],
      from: "info@getalloro.com",
      fromName: "Alloro",
      category: "system",
      allowLiveSend: true,
    });

    if (!result.success) {
      return fail(res, 502, "TEST_EMAIL_FAILED", result.error ?? "Transport returned an error.");
    }

    return ok(res, {
      messageId: result.messageId,
      transport,
      recipient: recipient.trim(),
    });
  } catch (error) {
    logger.error({ err: error }, "[AdminEmailLogs] sendTestEmail error:");
    return fail(res, 500, "TEST_EMAIL_ERROR", "Failed to send test email.");
  }
}

export async function getEmailLogDetail(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    if (typeof id !== "string" || !UUID_REGEX.test(id)) {
      return fail(res, 400, "EMAIL_LOG_INVALID_ID", "Invalid email log id.");
    }

    const log = await EmailLogModel.getDetailById(id);
    if (!log) {
      return fail(res, 404, "EMAIL_LOG_NOT_FOUND", "Email log not found.");
    }

    return ok(res, { log });
  } catch (error) {
    logger.error({ err: error }, "[AdminEmailLogs] getEmailLogDetail error:");
    return fail(res, 500, "EMAIL_LOG_DETAIL_FAILED", "Failed to fetch email log.");
  }
}
