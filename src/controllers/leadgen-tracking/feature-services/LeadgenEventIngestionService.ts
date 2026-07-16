import { parseUserAgent } from "../../../lib/userAgent";
import logger from "../../../lib/logger";
import { LeadgenEventModel } from "../../../models/LeadgenEventModel";
import {
  FinalStage,
  ILeadgenSession,
  LeadgenSessionModel,
} from "../../../models/LeadgenSessionModel";
import type { QueryContext } from "../../../models/BaseModel";
import type { LeadgenEventPayload } from "../../../validation/leadgenTracking.schemas";
import {
  isLaterStage,
  isProgressionStage,
  isReportSurfaceEvent,
  shouldRecordStageEvent,
  shouldSetAbandoned,
} from "../feature-utils/util.event-ordering";

export interface LeadgenIngestionResult {
  status: number;
  body: Record<string, unknown>;
}

export interface LeadgenEmailSubmissionInput {
  sessionId: string;
  auditId: string;
  email: string;
  source: "fab-email-notify" | "paywall";
}

class LeadgenEventRejectedError extends Error {
  constructor(public readonly result: LeadgenIngestionResult) {
    super(String(result.body.error ?? "leadgen_event_rejected"));
  }
}

type WriteOnceFields = Pick<
  LeadgenEventPayload,
  | "audit_id"
  | "email"
  | "domain"
  | "practice_search_string"
  | "referrer"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "utm_term"
  | "utm_content"
>;

const WRITE_ONCE_FIELDS: ReadonlyArray<keyof WriteOnceFields> = [
  "audit_id",
  "email",
  "domain",
  "practice_search_string",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

/** Build the sticky identity/acquisition patch shared with legacy /session. */
export function buildWriteOnceSessionPatch(
  current: ILeadgenSession,
  incoming: Partial<WriteOnceFields>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of WRITE_ONCE_FIELDS) {
    const value = incoming[field];
    if (
      typeof value === "string" &&
      value.length > 0 &&
      current[field] == null
    ) {
      patch[field] = value;
    }
  }
  return patch;
}

function buildSessionCreateData(
  payload: LeadgenEventPayload,
  userAgent: string | undefined,
  now: Date
): Record<string, unknown> {
  const parsed = parseUserAgent(userAgent ?? null);
  return {
    id: payload.session_id,
    user_agent: userAgent ?? null,
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
  };
}

function buildUserAgentPatch(
  session: ILeadgenSession,
  userAgent: string | undefined
): Record<string, unknown> {
  if (!userAgent) return {};
  const parsed = parseUserAgent(userAgent);
  const patch: Record<string, unknown> = {};
  if (!session.user_agent) patch.user_agent = userAgent;
  if (!session.browser && parsed.browser) patch.browser = parsed.browser;
  if (!session.os && parsed.os) patch.os = parsed.os;
  if (!session.device_type && parsed.device_type) {
    patch.device_type = parsed.device_type;
  }
  return patch;
}

function validateSemanticPrerequisites(
  payload: LeadgenEventPayload,
  session: ILeadgenSession
): LeadgenIngestionResult | null {
  if (
    session.audit_id &&
    payload.audit_id &&
    session.audit_id !== payload.audit_id
  ) {
    return { status: 409, body: { ok: false, error: "audit_id_conflict" } };
  }

  const resolvedAuditId = session.audit_id ?? payload.audit_id ?? null;
  if (isReportSurfaceEvent(payload.event_name) && !resolvedAuditId) {
    return { status: 400, body: { ok: false, error: "audit_id_required" } };
  }

  const resolvedEmail = session.email ?? payload.email ?? null;
  if (payload.event_name === "email_submitted" && !resolvedEmail) {
    return { status: 400, body: { ok: false, error: "email_required" } };
  }

  return null;
}

function applyStageTransition(
  patch: Record<string, unknown>,
  eventName: string,
  session: ILeadgenSession
): void {
  if (isProgressionStage(eventName)) {
    if (
      isLaterStage(eventName, session.final_stage) ||
      (session.final_stage === "abandoned" && isLaterStage(eventName, "landed"))
    ) {
      patch.final_stage = eventName;
    }
  }

  if (eventName === "results_viewed" || eventName === "account_created") {
    patch.completed = true;
    patch.abandoned = false;
  }

  if (eventName !== "abandoned") return;
  const hasTerminalSuccess =
    session.completed ||
    session.final_stage === "results_viewed" ||
    session.final_stage === "account_created";
  if (!hasTerminalSuccess && shouldSetAbandoned("abandoned", session.completed)) {
    patch.abandoned = true;
  }
}

async function insertEventIfMissing(
  sessionId: string,
  eventName: FinalStage,
  source: string,
  trx: QueryContext
): Promise<void> {
  const exists = await LeadgenEventModel.existsForSessionEvent(
    sessionId,
    eventName,
    trx
  );
  if (exists) return;
  await LeadgenEventModel.insertRow(
    {
      session_id: sessionId,
      event_name: eventName,
      event_data: JSON.stringify({ source }),
    },
    trx
  );
}

async function requirePriorResultsViewed(
  payload: LeadgenEventPayload,
  trx: QueryContext
): Promise<void> {
  if (payload.event_name !== "report_engaged_1min") return;
  const hasViewedResults = await LeadgenEventModel.existsForSessionEvent(
    payload.session_id,
    "results_viewed",
    trx
  );
  if (!hasViewedResults) {
    throw new LeadgenEventRejectedError({
      status: 409,
      body: { ok: false, error: "results_viewed_required" },
    });
  }
}

async function getProgressionSuppression(
  payload: LeadgenEventPayload,
  session: ILeadgenSession,
  trx: QueryContext
): Promise<LeadgenIngestionResult | null> {
  if (!isProgressionStage(payload.event_name)) return null;
  const hasRecordedStage = await LeadgenEventModel.existsForSessionEvent(
    payload.session_id,
    payload.event_name,
    trx
  );
  const decision = shouldRecordStageEvent(
    payload.event_name,
    session,
    hasRecordedStage
  );
  if (decision.allow) return null;
  logger.info(
    {
      session_id: payload.session_id,
      event_name: payload.event_name,
      reason: decision.reason,
      current_stage: session.final_stage,
    },
    "[LeadgenTracking] suppressed event"
  );
  return {
    status: 200,
    body: { ok: true, suppressed: decision.reason },
  };
}

async function ingestWithinTransaction(
  payload: LeadgenEventPayload,
  userAgent: string | undefined,
  now: Date,
  trx: QueryContext
): Promise<LeadgenIngestionResult> {
  const { session } = await LeadgenSessionModel.findOrCreateLockedForEvent(
    payload.session_id,
    buildSessionCreateData(payload, userAgent, now),
    trx
  );
  const semanticError = validateSemanticPrerequisites(payload, session);
  if (semanticError) throw new LeadgenEventRejectedError(semanticError);
  await requirePriorResultsViewed(payload, trx);

  const suppression = await getProgressionSuppression(payload, session, trx);
  if (suppression) return suppression;

  await LeadgenEventModel.insertRow(
    {
      session_id: payload.session_id,
      event_name: payload.event_name,
      event_data:
        payload.event_data == null ? null : JSON.stringify(payload.event_data),
      created_at: now,
    },
    trx
  );

  const patch: Record<string, unknown> = {
    last_seen_at: now,
    updated_at: now,
    ...buildWriteOnceSessionPatch(session, payload),
    ...buildUserAgentPatch(session, userAgent),
  };
  applyStageTransition(patch, payload.event_name, session);
  await LeadgenSessionModel.patchById(payload.session_id, patch, trx);
  return { status: 200, body: { ok: true } };
}

export class LeadgenEventIngestionService {
  static async ingest(
    payload: LeadgenEventPayload,
    userAgent?: string
  ): Promise<LeadgenIngestionResult> {
    const now = new Date();

    try {
      return await LeadgenSessionModel.transaction((trx) =>
        ingestWithinTransaction(payload, userAgent, now, trx)
      );
    } catch (error) {
      if (error instanceof LeadgenEventRejectedError) return error.result;
      throw error;
    }
  }

  static async recordEmailSubmission(
    input: LeadgenEmailSubmissionInput
  ): Promise<LeadgenIngestionResult> {
    try {
      return await LeadgenSessionModel.transaction(async (trx) => {
        const session = await LeadgenSessionModel.findByIdForUpdate(
          input.sessionId,
          trx
        );
        if (!session) {
          throw new LeadgenEventRejectedError({
            status: 404,
            body: { ok: false, error: "session_not_found" },
          });
        }
        if (session.audit_id && session.audit_id !== input.auditId) {
          throw new LeadgenEventRejectedError({
            status: 409,
            body: { ok: false, error: "audit_id_conflict" },
          });
        }

        await insertEventIfMissing(
          input.sessionId,
          "email_gate_shown",
          input.source,
          trx
        );
        await insertEventIfMissing(
          input.sessionId,
          "email_submitted",
          input.source,
          trx
        );

        const now = new Date();
        const patch: Record<string, unknown> = {
          last_seen_at: now,
          updated_at: now,
        };
        if (!session.email) patch.email = input.email;
        if (!session.audit_id) patch.audit_id = input.auditId;
        if (isLaterStage("email_submitted", session.final_stage)) {
          patch.final_stage = "email_submitted";
        }
        await LeadgenSessionModel.patchById(input.sessionId, patch, trx);

        return { status: 200, body: { ok: true } };
      });
    } catch (error) {
      if (error instanceof LeadgenEventRejectedError) return error.result;
      throw error;
    }
  }
}
