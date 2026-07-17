/**
 * Leadgen Tracking Controller
 *
 * Public-facing handlers for anonymous session + event tracking from the
 * leadgen audit tool. Three entry points:
 *
 *   POST /leadgen/session  — upsert a session row on first landing
 *   POST /leadgen/event    — append an event + patch session state
 *   POST /leadgen/beacon   — same as /event but tolerates sendBeacon quirks
 *
 * All three are rate-limited + gated by `X-Leadgen-Key` (the beacon route
 * tolerates key-in-body because sendBeacon cannot set custom headers).
 *
 * Invariants enforced here:
 *   - `final_stage` never downgrades (see util.event-ordering.isLaterStage)
 *   - `abandoned=true` is only set when the session hasn't completed yet
 *     (see util.event-ordering.shouldSetAbandoned)
 *   - Known session fields (email, audit_id, domain, practice_search_string)
 *     are never overwritten with null once set
 */

import { Request, Response } from "express";
import {
  ILeadgenSession,
  LeadgenSessionModel,
} from "../../models/LeadgenSessionModel";
import { parseUserAgent } from "../../lib/userAgent";
import { enqueueEmailNotification } from "./feature-services/service.email-notification-queue";
import {
  buildWriteOnceSessionPatch,
  LeadgenEventIngestionService,
} from "./feature-services/LeadgenEventIngestionService";
import type { LeadgenEventPayload } from "../../validation/leadgenTracking.schemas";
import logger from "../../lib/logger";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// POST /leadgen/session
// ---------------------------------------------------------------------------

/**
 * Upserts a session row. Body:
 *   { session_id, referrer?, utm_source?, utm_medium?, utm_campaign?, utm_term?, utm_content? }
 *
 * If the row exists we only bump `last_seen_at` — acquisition fields are
 * preserved from the first visit.
 */
export async function upsertSession(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const {
      session_id,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
    } = req.body || {};

    if (!isValidUuid(session_id)) {
      return res
        .status(400)
        .json({ ok: false, error: "invalid_session_id" });
    }

    const userAgent = req.headers["user-agent"];
    const existing = (await LeadgenSessionModel.findById(session_id)) as
      | ILeadgenSession
      | undefined;

    const now = new Date();

    if (existing) {
      // Back-fill write-once fields on subsequent pings if they were missing.
      // Acquisition fields (referrer/utm_*) also back-filled here via
      // buildSessionPatch — but only when not already set.
      const update: Record<string, unknown> = {
        last_seen_at: now,
        updated_at: now,
        ...buildWriteOnceSessionPatch(existing, {
          referrer,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          utm_content,
        }),
      };

      if (!existing.user_agent && typeof userAgent === "string") {
        update.user_agent = userAgent;
      }

      // Write-once UA-derived fields. Only populate when the column is
      // currently null — treat them identically to first_seen_at.
      if (
        typeof userAgent === "string" &&
        (existing.browser == null ||
          existing.os == null ||
          existing.device_type == null)
      ) {
        const parsed = parseUserAgent(userAgent);
        if (existing.browser == null && parsed.browser != null) {
          update.browser = parsed.browser;
        }
        if (existing.os == null && parsed.os != null) {
          update.os = parsed.os;
        }
        if (existing.device_type == null && parsed.device_type != null) {
          update.device_type = parsed.device_type;
        }
      }

      await LeadgenSessionModel.patchById(session_id, update);
    } else {
      const parsed = parseUserAgent(
        typeof userAgent === "string" ? userAgent : null
      );
      await LeadgenSessionModel.insertRow({
        id: session_id,
        referrer: typeof referrer === "string" ? referrer : null,
        utm_source: typeof utm_source === "string" ? utm_source : null,
        utm_medium: typeof utm_medium === "string" ? utm_medium : null,
        utm_campaign: typeof utm_campaign === "string" ? utm_campaign : null,
        utm_term: typeof utm_term === "string" ? utm_term : null,
        utm_content: typeof utm_content === "string" ? utm_content : null,
        user_agent: typeof userAgent === "string" ? userAgent : null,
        browser: parsed.browser,
        os: parsed.os,
        device_type: parsed.device_type,
        final_stage: "landed",
        completed: false,
        abandoned: false,
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "[LeadgenTracking] upsertSession error:");
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

// ---------------------------------------------------------------------------
// POST /leadgen/event
// ---------------------------------------------------------------------------

export async function recordEvent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const userAgent = req.headers["user-agent"];
    const result = await LeadgenEventIngestionService.ingest(
      req.body as LeadgenEventPayload,
      typeof userAgent === "string" ? userAgent : undefined
    );
    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error({ err: error }, "[LeadgenTracking] recordEvent error:");
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

// ---------------------------------------------------------------------------
// POST /leadgen/beacon
// ---------------------------------------------------------------------------

/**
 * Beacon handler — same ingestion semantics as /event but:
 *   - Always returns 204 (sendBeacon discards responses)
 *   - Tolerates `text/plain` Content-Type (sendBeacon blob fallback)
 *   - Never leaks error state to the client
 *
 * If the body came in as a raw string (text/plain), parse it before
 * handing off to the ingestion core.
 */
export async function recordBeacon(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const userAgent = req.headers["user-agent"];
    await LeadgenEventIngestionService.ingest(
      req.body as LeadgenEventPayload,
      typeof userAgent === "string" ? userAgent : undefined
    );
  } catch (error) {
    // Internal logging only — beacon client can't read responses anyway.
    logger.error({ err: error }, "[LeadgenTracking] recordBeacon error:");
  }
  return res.status(204).end();
}

// ---------------------------------------------------------------------------
// POST /leadgen/email-notify
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/leadgen/email-notify — FAB "Email me when ready" submission.
 *
 * Behavior:
 *   1. Validate session_id, audit_id (UUIDs) and email.
 *   2. Confirm the session row exists.
 *   3. Patch session.email (write-once) and bump final_stage to
 *      email_submitted via isLaterStage (server-authoritative — does not
 *      depend on a separate trackEvent landing).
 *   4. Idempotently write `email_gate_shown` + `email_submitted` to
 *      leadgen_events so the funnel reflects this regardless of JS.
 *   5. Enqueue the notification (which sends inline if the audit is
 *      already done).
 *
 * Auth: same X-Leadgen-Key gate as /event (NOT silent — we want a real
 * 401 if the key is missing/wrong since this is a fetch, not a beacon).
 */
export async function submitEmailNotify(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const body = req.body ?? {};
    const session_id = body.session_id;
    const audit_id = body.audit_id;
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!isValidUuid(session_id)) {
      return res
        .status(400)
        .json({ ok: false, error: "invalid_session_id" });
    }
    if (!isValidUuid(audit_id)) {
      return res
        .status(400)
        .json({ ok: false, error: "invalid_audit_id" });
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ ok: false, error: "invalid_email" });
    }

    const result = await LeadgenEventIngestionService.recordEmailSubmission({
      sessionId: session_id,
      auditId: audit_id,
      email,
      source: "fab-email-notify",
    });
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }

    // Fire-and-forget: enqueue handles inline-send if audit is already
    // complete. Don't block the FAB response on n8n.
    enqueueEmailNotification({ session_id, audit_id, email }).catch(
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, "[LeadgenTracking] enqueueEmailNotification error:");
      }
    );

    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error({ err: error }, "[LeadgenTracking] submitEmailNotify error:");
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

// ---------------------------------------------------------------------------
// GET /leadgen/session-by-audit/:auditId — phantom-session prevention
// ---------------------------------------------------------------------------

/**
 * Returns the ORIGINAL `leadgen_sessions.id` that owns the given audit,
 * so the leadgen tool can "adopt" that id on mount when a user opens a
 * report link (`audit.getalloro.com?audit_id=<id>`) instead of spinning
 * up a fresh session and bloating the admin with phantom rows.
 *
 * Gated by the same `X-Leadgen-Key` as the other public endpoints. If
 * no session owns this audit (e.g. audit was created outside the
 * leadgen flow), returns `{ session_id: null }` — the client falls
 * through to normal localStorage behavior.
 */
export async function getSessionByAudit(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const auditId = req.params.auditId;
    if (!isValidUuid(auditId)) {
      return res
        .status(400)
        .json({ ok: false, error: "invalid_audit_id" });
    }

    // Pick the OLDEST matching session — if somehow more than one row
    // got stamped with this audit_id (e.g. an earlier phantom case
    // before this fix landed), treat the first as canonical.
    const row = await LeadgenSessionModel.findOldestByAuditId(auditId);

    return res.json({ ok: true, session_id: row?.id ?? null });
  } catch (error) {
    logger.error({ err: error }, "[LeadgenTracking] getSessionByAudit error:");
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

// ---------------------------------------------------------------------------
// POST /leadgen/email-paywall
// ---------------------------------------------------------------------------

/**
 * POST /api/leadgen/email-paywall — paywall email submission, server-
 * authoritative version of the previous JS-only `trackEvent("email_submitted")`
 * call.
 *
 * Why this exists separately from /email-notify:
 *   - /email-notify enqueues a server-driven send-on-complete (used by the
 *     FAB when the audit isn't done yet).
 *   - /email-paywall is fired AFTER the user submits via the in-tab paywall,
 *     where the email send already happens client-side via n8n. We just
 *     need durable event recording + session.email patch — no enqueue, no
 *     duplicate send.
 *
 * Idempotent. Same X-Leadgen-Key gate.
 */
export async function submitEmailPaywall(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const body = req.body ?? {};
    const session_id = body.session_id;
    const audit_id = body.audit_id;
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!isValidUuid(session_id)) {
      return res
        .status(400)
        .json({ ok: false, error: "invalid_session_id" });
    }
    if (!isValidUuid(audit_id)) {
      return res
        .status(400)
        .json({ ok: false, error: "invalid_audit_id" });
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ ok: false, error: "invalid_email" });
    }

    const result = await LeadgenEventIngestionService.recordEmailSubmission({
      sessionId: session_id,
      auditId: audit_id,
      email,
      source: "paywall",
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error({ err: error }, "[LeadgenTracking] submitEmailPaywall error:");
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
