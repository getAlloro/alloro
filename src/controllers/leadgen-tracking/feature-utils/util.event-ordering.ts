/**
 * Event ordering helpers for the leadgen funnel.
 *
 * `STAGE_ORDER` (from `LeadgenSessionModel`) is the source of truth for
 * ordinal comparisons. The controller never downgrades a session's
 * `final_stage` — it only advances when a later-ordinal event arrives.
 *
 * `abandoned` sits at ordinal 99 on purpose: it's a terminal flag, not a
 * position, so if an `abandoned` beacon arrives AFTER the session already
 * reached `results_viewed`, the session-level `completed` flag is used to
 * short-circuit the abandonment (see `shouldSetAbandoned`).
 */

import { STAGE_ORDER, FinalStage } from "../../../models/LeadgenSessionModel";

/**
 * Non-stage interaction events that enrich the timeline but are NOT part
 * of the linear progression. These fire as many times as they happen —
 * click a CTA 5 times, the timeline records 5 events. Dedup / ordering
 * rules DO NOT apply to these names.
 *
 * Keep in sync with the LeadgenEventName union in the leadgen-tool's
 * tracking lib.
 */
const NON_STAGE_EVENTS = new Set<string>([
  "cta_clicked_strategy_call",
  "cta_clicked_create_account",
  "email_field_focused",
  "email_field_blurred_empty",
  "audit_retried",
]);

/**
 * Is `event` a progression-stage event (eligible for dedup + ordering
 * enforcement)? Abandoned is treated as non-stage here because it's a
 * terminal boolean flag — its own server-side guard (`shouldSetAbandoned`)
 * handles it separately.
 */
export function isProgressionStage(event: string): event is FinalStage {
  if (NON_STAGE_EVENTS.has(event)) return false;
  if (event === "abandoned") return false;
  // hasOwnProperty, not `in`: `"toString" in STAGE_ORDER` is true via the
  // prototype chain, which would wrongly accept inherited Object members.
  return Object.prototype.hasOwnProperty.call(STAGE_ORDER, event);
}

/**
 * Is `event` a recognized leadgen event the API should accept — either a
 * progression stage (in STAGE_ORDER) or a declared non-stage interaction event
 * (CTA clicks, email-field focus/blur, audit retries)? The boundary validator
 * on /event + /beacon uses this so legitimate interaction events are recorded
 * instead of 400-rejected. Keep NON_STAGE_EVENTS in sync with the leadgen-tool
 * LeadgenEventName union.
 */
export function isAcceptedEventName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (Object.prototype.hasOwnProperty.call(STAGE_ORDER, value) ||
      NON_STAGE_EVENTS.has(value))
  );
}

export type StageEventDecision =
  | { allow: true }
  | { allow: false; reason: "duplicate" | "regression" | "not_a_stage" };

/**
 * Gate applied before inserting a stage-progression event row in
 * `leadgen_events`. Rejects duplicates (exact match on session's current
 * `final_stage`) and regressions (ordinal < current). Always allows CTA
 * events and forward progression.
 *
 * Called from ingestEvent AFTER the session has been located but BEFORE
 * the insert. Returning allow=false → controller logs the suppression
 * and returns `{ok: true}` without writing.
 */
export function shouldRecordStageEvent(
  incoming: FinalStage,
  session: { final_stage: FinalStage }
): StageEventDecision {
  if (!isProgressionStage(incoming)) {
    return { allow: false, reason: "not_a_stage" };
  }
  const incomingOrd = STAGE_ORDER[incoming];
  const currentOrd = STAGE_ORDER[session.final_stage];

  // Abandoned at 99 shouldn't cause every real stage to look like a
  // "regression" — if the session is stuck at `abandoned`, allow forward
  // progress (the controller will also clear the abandoned flag via its
  // existing recovery path).
  if (session.final_stage === "abandoned") {
    return { allow: true };
  }

  if (incoming === session.final_stage) {
    return { allow: false, reason: "duplicate" };
  }
  if (incomingOrd < currentOrd) {
    return { allow: false, reason: "regression" };
  }
  return { allow: true };
}

/**
 * Returns true when `incoming` is later in the funnel than `current`.
 * Used to decide whether to update `leadgen_sessions.final_stage`.
 */
export function isLaterStage(
  incoming: FinalStage,
  current: FinalStage
): boolean {
  return STAGE_ORDER[incoming] > STAGE_ORDER[current];
}

/**
 * Abandonment is only recorded when the session has not already completed
 * (reached `results_viewed`). This guards against the common false-positive
 * where a user who finishes the audit navigates away and fires a beforeunload
 * beacon — that beacon should NOT flip them to abandoned.
 */
export function shouldSetAbandoned(
  incoming: FinalStage,
  sessionCompleted: boolean
): boolean {
  return incoming === "abandoned" && sessionCompleted === false;
}
