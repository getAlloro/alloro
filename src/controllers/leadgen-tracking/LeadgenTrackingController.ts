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
import { db } from "../../database/connection";
import {
  FinalStage,
  ILeadgenSession,
  STAGE_ORDER,
} from "../../models/LeadgenSessionModel";
import {
  isLaterStage,
  shouldSetAbandoned,
  shouldRecordStageEvent,
  isProgressionStage,
} from "./feature-utils/util.event-ordering";
import { parseUserAgent } from "../../lib/userAgent";
import { enqueueEmailNotification } from "./feature-services/service.email-notification-queue";
import logger from "../../lib/logger";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isValidEventName(value: unknown): value is FinalStage {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(STAGE_ORDER, value)
  );
}

/**
 * Build the patch object for session fields that the client may have
 * discovered partway through the flow (audit_id once the audit starts,
 * email on paywall submit, etc.). Never overwrites a non-null value with
 * null — once known, these fields stick.
 */
function buildSessionPatch(
  current: ILeadgenSession,
  incoming: {
    audit_id?: unknown;
    email?: unknown;
    domain?: unknown;
    practice_search_string?: unknown;
    referrer?: unknown;
    utm_source?: unknown;
    utm_medium?: unknown;
    utm_campaign?: unknown;
    utm_term?: unknown;
    utm_content?: unknown;
  }
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (
    typeof incoming.audit_id === "string" &&
    incoming.audit_id.length > 0 &&
    current.audit_id == null
  ) {
    patch.audit_id = incoming.audit_id;
  }
  if (
    typeof incoming.email === "string" &&
    incoming.email.length > 0 &&
    current.email == null
  ) {
    patch.email = incoming.email;
  }
  if (
    typeof incoming.domain === "string" &&
    incoming.domain.length > 0 &&
    current.domain == null
  ) {
    patch.domain = incoming.domain;
  }
  if (
    typeof incoming.practice_search_string === "string" &&
    incoming.practice_search_string.length > 0 &&
    current.practice_search_string == null
  ) {
    patch.practice_search_string = incoming.practice_search_string;
  }

  // Acquisition fields — all write-once. First visit wins; subsequent upserts
  // / events never overwrite (prevents a mid-session internal nav from
  // clobbering the original referrer/UTM values).
  const acquisitionFields: Array<
    [keyof typeof incoming, keyof ILeadgenSession]
  > = [
    ["referrer", "referrer"],
    ["utm_source", "utm_source"],
    ["utm_medium", "utm_medium"],
    ["utm_campaign", "utm_campaign"],
    ["utm_term", "utm_term"],
    ["utm_content", "utm_content"],
  ];
  for (const [inKey, sessionKey] of acquisitionFields) {
    const value = incoming[inKey];
    if (
      typeof value === "string" &&
      value.length > 0 &&
      current[sessionKey] == null
    ) {
      patch[sessionKey as string] = value;
    }
  }

  return patch;
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
    const existing = (await db("leadgen_sessions")
      .where({ id: session_id })
      .first()) as ILeadgenSession | undefined;

    const now = new Date();

    if (existing) {
      // Back-fill write-once fields on subsequent pings if they were missing.
      // Acquisition fields (referrer/utm_*) also back-filled here via
      // buildSessionPatch — but only when not already set.
      const update: Record<string, unknown> = {
        last_seen_at: now,
        updated_at: now,
        ...buildSessionPatch(existing, {
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

      await db("leadgen_sessions").where({ id: session_id }).update(update);
    } else {
      const parsed = parseUserAgent(
        typeof userAgent === "string" ? userAgent : null
      );
      await db("leadgen_sessions").insert({
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
// Shared event-ingestion core (used by POST /event and POST /beacon)
// ---------------------------------------------------------------------------

/**
 * Processes an event payload. Creates the session row defensively if the
 * client sent an event without first hitting /session. Returns a status
 * code + body the caller can serialize (the beacon route ignores both and
 * always 204s).
 */
async function ingestEvent(body: unknown): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const {
    session_id,
    event_name,
    event_data,
    audit_id,
    email,
    domain,
    practice_search_string,
    referrer,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
  } = (body || {}) as Record<string, unknown>;

  if (!isValidUuid(session_id)) {
    return { status: 400, body: { ok: false, error: "invalid_session_id" } };
  }
  if (!isValidEventName(event_name)) {
    return { status: 400, body: { ok: false, error: "invalid_event_name" } };
  }

  const now = new Date();

  // Load (or defensively create) the session.
  let session = (await db("leadgen_sessions")
    .where({ id: session_id })
    .first()) as ILeadgenSession | undefined;

  if (!session) {
    await db("leadgen_sessions").insert({
      id: session_id,
      final_stage: "landed",
      completed: false,
      abandoned: false,
      first_seen_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    });
    session = (await db("leadgen_sessions")
      .where({ id: session_id })
      .first()) as ILeadgenSession;
  }

  // Strict-order gate for progression stage events. CTA / interaction
  // events (cta_clicked_*, email_field_*) and `abandoned` short-circuit
  // — they may fire many times and have their own separate handling.
  //
  // Progression events are exactly-once per session:
  //   - duplicate  (incoming === session.final_stage)   -> skip
  //   - regression (ord(incoming) < ord(final_stage))   -> skip
  //   - forward                                         -> allow
  //
  // Skipped writes still return {ok:true} so silent-fire tracking calls
  // on the client don't error, but the event row and session_patch are
  // not written. Visible in pm2 as "[LeadgenTracking] suppressed event".
  if (isProgressionStage(event_name)) {
    const decision = shouldRecordStageEvent(event_name, session);
    if (!decision.allow) {
      logger.info({ detail: {
                session_id,
                event_name,
                reason: decision.reason,
                current_stage: session.final_stage,
              } }, "[LeadgenTracking] suppressed event");
      return { status: 200, body: { ok: true, suppressed: decision.reason } };
    }
  }

  // Insert the event row.
  await db("leadgen_events").insert({
    session_id,
    event_name,
    event_data:
      event_data != null ? JSON.stringify(event_data) : null,
    created_at: now,
  });

  // Build the session patch.
  const patch: Record<string, unknown> = {
    last_seen_at: now,
    updated_at: now,
    ...buildSessionPatch(session, {
      audit_id,
      email,
      domain,
      practice_search_string,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
    }),
  };

  // `abandoned` is a boolean flag, NOT a progression stage — never let it
  // become `final_stage`. Otherwise a stray beforeunload beacon (e.g. from a
  // prior tab reusing the same sessionStorage id) would stamp final_stage=
  // abandoned (ordinal 99) and every later real-progression event would be
  // rejected as a downgrade, leaving the session stuck at "Abandoned" even
  // after the user completes the flow.
  if (event_name !== "abandoned" && isLaterStage(event_name, session.final_stage)) {
    patch.final_stage = event_name;
  } else if (
    event_name !== "abandoned" &&
    session.final_stage === "abandoned" &&
    isLaterStage(event_name, "landed")
  ) {
    // Recovery path: session is marked final_stage='abandoned' from legacy
    // data — any real progression event should pull it back to real.
    patch.final_stage = event_name;
  }

  if (event_name === "results_viewed") {
    patch.completed = true;
    // User reached the end — retroactively clear any abandoned flag that
    // leaked in from a prior tab's beforeunload beacon.
    patch.abandoned = false;
  }

  if (event_name === "account_created") {
    patch.completed = true;
    patch.abandoned = false;
  }

  // T8e — abandoned guard. Never flip `abandoned=true` when the session is
  // already completed OR when it already reached a terminal success stage
  // (`results_viewed` / `account_created`). `shouldSetAbandoned` handles the
  // completed case; this extra check defends against a lagging beforeunload
  // beacon arriving after a success stage was stamped but `completed` was
  // not yet persisted (race with the same request).
  if (event_name === "abandoned") {
    const terminalSuccess =
      session.completed === true ||
      session.final_stage === "results_viewed" ||
      session.final_stage === "account_created";

    if (terminalSuccess) {
      logger.info({ detail: {
                  session_id,
                  final_stage: session.final_stage,
                  completed: session.completed,
                } }, "[LeadgenTracking] abandoned guard prevented downgrade");
    } else if (shouldSetAbandoned(event_name, session.completed)) {
      patch.abandoned = true;
    }
  }

  await db("leadgen_sessions").where({ id: session_id }).update(patch);

  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------------------------
// POST /leadgen/event
// ---------------------------------------------------------------------------

export async function recordEvent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const result = await ingestEvent(req.body);
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
    let payload: unknown = req.body;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        // Malformed — drop silently.
        return res.status(204).end();
      }
    }
    await ingestEvent(payload);
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

async function recordServerSideEvent(
  session_id: string,
  event_name: FinalStage,
  source: string = "server"
): Promise<void> {
  // Idempotent insert: skip if a row with this (session_id, event_name)
  // already exists. Mirrors service.audit-milestone-events.ts.
  const existing = await db("leadgen_events")
    .select("id")
    .where({ session_id, event_name })
    .first();
  if (!existing) {
    await db("leadgen_events").insert({
      session_id,
      event_name,
      event_data: { source },
    });
  }
}

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

    const session = await db<ILeadgenSession>("leadgen_sessions")
      .where({ id: session_id })
      .first();
    if (!session) {
      return res.status(404).json({ ok: false, error: "session_not_found" });
    }

    // Patch session: email (write-once), audit_id (write-once), advance
    // final_stage to email_submitted if that's a forward step.
    const patch: Partial<ILeadgenSession> = {};
    if (!session.email) patch.email = email;
    if (!session.audit_id) patch.audit_id = audit_id;
    if (isLaterStage("email_submitted", session.final_stage)) {
      patch.final_stage = "email_submitted";
    }
    if (Object.keys(patch).length > 0) {
      await db("leadgen_sessions").where({ id: session_id }).update(patch);
    }

    // Server-authoritative funnel events. The FAB displaying = an email
    // gate was shown, regardless of whether the JS trackEvent landed.
    await recordServerSideEvent(session_id, "email_gate_shown", "fab-email-notify");
    await recordServerSideEvent(session_id, "email_submitted", "fab-email-notify");

    // Fire-and-forget: enqueue handles inline-send if audit is already
    // complete. Don't block the FAB response on n8n.
    enqueueEmailNotification({ session_id, audit_id, email }).catch(
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, "[LeadgenTracking] enqueueEmailNotification error:");
      }
    );

    return res.status(200).json({ ok: true });
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
    const row = await db<ILeadgenSession>("leadgen_sessions")
      .select("id")
      .where({ audit_id: auditId })
      .orderBy("first_seen_at", "asc")
      .first();

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

    const session = await db<ILeadgenSession>("leadgen_sessions")
      .where({ id: session_id })
      .first();
    if (!session) {
      return res.status(404).json({ ok: false, error: "session_not_found" });
    }

    const patch: Partial<ILeadgenSession> = {};
    if (!session.email) patch.email = email;
    if (!session.audit_id) patch.audit_id = audit_id;
    if (isLaterStage("email_submitted", session.final_stage)) {
      patch.final_stage = "email_submitted";
    }
    if (Object.keys(patch).length > 0) {
      await db("leadgen_sessions").where({ id: session_id }).update(patch);
    }

    // Server-authoritative funnel events. Idempotent — won't double-write
    // if the JS trackEvent already landed first.
    await recordServerSideEvent(session_id, "email_gate_shown", "paywall");
    await recordServerSideEvent(session_id, "email_submitted", "paywall");

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "[LeadgenTracking] submitEmailPaywall error:");
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
