/**
 * Audit Milestone Events
 *
 * Server-authoritative leadgen funnel events. Driven by the audit worker's
 * pipeline-stage transitions rather than the client's JS `trackEvent`,
 * closing the "user closed the tab before the event fired" gap — once the
 * backend reaches a milestone, the funnel reflects it whether or not the
 * client was still connected.
 *
 * Idempotent per (session_id, event_name): safe to call on every stage
 * transition. Silent on failure (never throws up to the worker).
 *
 * Session linkage: matches every `leadgen_sessions` row where
 * `audit_id = <auditId>`. That column is stamped via the JS
 * `audit_started` event (currently) — if it's missing on the session,
 * the milestone recording quietly no-ops and client events still carry
 * the flow. Belt-and-suspenders, not a silver bullet.
 */

import { db } from "../../../database/connection";
import {
  FinalStage,
  ILeadgenSession,
} from "../../../models/LeadgenSessionModel";
import { isLaterStage } from "../feature-utils/util.event-ordering";
import logger from "../../../lib/logger";

function log(message: string): void {
  logger.info(`[LEADGEN-MILESTONE] ${message}`);
}

type SessionLite = Pick<ILeadgenSession, "id" | "final_stage" | "completed">;

/**
 * Record a pipeline-stage milestone for every leadgen session linked to the
 * given audit_id.
 *
 * - Inserts the event row only if an identical (session_id, event_name)
 *   row doesn't already exist (client-side `trackEvent` may have landed
 *   already; we don't double-count).
 * - Promotes `session.final_stage` only if the milestone is later than the
 *   session's current stage — never regresses.
 * - On `results_viewed` / `account_created`, also sets `completed=true` and
 *   `abandoned=false` (reaching the end cancels any prior beacon-driven
 *   abandon flag).
 *
 * Multi-session handling: if two browser tabs somehow triggered the same
 * audit, both sessions receive the event. In practice this is rare.
 */
export async function recordAuditMilestone(
  auditId: string,
  milestone: FinalStage,
): Promise<void> {
  try {
    const sessions: SessionLite[] = await db("leadgen_sessions")
      .select("id", "final_stage", "completed")
      .where({ audit_id: auditId });

    if (sessions.length === 0) {
      // No session linked yet — the JS `audit_started` event hasn't
      // landed, or the audit was kicked off without a leadgen tab.
      return;
    }

    for (const session of sessions) {
      const existing = await db("leadgen_events")
        .select("id")
        .where({ session_id: session.id, event_name: milestone })
        .first();
      if (existing) continue;

      await db("leadgen_events").insert({
        session_id: session.id,
        event_name: milestone,
        event_data: { source: "audit-worker" },
      });

      const patch: Record<string, unknown> = {};
      if (
        milestone !== "abandoned" &&
        isLaterStage(milestone, session.final_stage)
      ) {
        patch.final_stage = milestone;
      }
      if (milestone === "results_viewed" || milestone === "account_created") {
        patch.completed = true;
        patch.abandoned = false;
      }
      if (Object.keys(patch).length > 0) {
        await db("leadgen_sessions").where({ id: session.id }).update(patch);
      }
    }

    log(
      `recorded ${milestone} for audit_id=${auditId} (${sessions.length} session(s))`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`recordAuditMilestone(${milestone}) failed: ${msg}`);
  }
}
