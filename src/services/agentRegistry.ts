/**
 * Agent Registry
 *
 * Code-defined map of agent_key → handler.
 * The scheduler worker looks up handlers here.
 * The admin API exposes available keys for the "create schedule" dropdown.
 */

import { executeProoflineAgent } from "../controllers/agents/feature-services/service.proofline-executor";
import { executeRankingAgent } from "../controllers/agents/feature-services/service.ranking-executor";
import { executeNapConsistencyAgent } from "./nap-consistency/executor";

/**
 * Retry policy for a FAILED scheduled run (§21.2, gated by §21.1).
 *
 * A retry re-runs the WHOLE handler from the top. §21.1 — "a job may run more
 * than once; design every job so a repeat run is safe" — therefore makes
 * `attempts > 1` a property an agent has to EARN, not a queue-wide default.
 * The exec queue is shared by every agent, so a blanket `attempts: 3` on the
 * enqueue would silently impose retries on handlers that are not repeat-safe
 * and duplicate their writes. Hence: per-agent, opt-in, default off.
 */
export interface AgentRetryPolicy {
  /** Total attempts including the first. 1 = no retry. */
  attempts: number;
  /** Exponential backoff base, ms. Ignored when attempts === 1. */
  backoffMs: number;
}

/** No retry. The conservative default for an agent that has not proven §21.1. */
const NO_RETRY: AgentRetryPolicy = { attempts: 1, backoffMs: 0 };

/**
 * Stable identity for one logical scheduled run. The scheduler derives this
 * once from the due window and persists it in BullMQ job data; retries must
 * receive the same values even when the wall clock crosses UTC midnight.
 */
export interface AgentRunContext {
  logicalRunAt: string;
  logicalRunDate: string;
}

export function createAgentRunContext(logicalRunAt: Date): AgentRunContext {
  if (Number.isNaN(logicalRunAt.getTime())) {
    throw new Error("Cannot create an agent run context from an invalid date.");
  }
  const logicalRunAtIso = logicalRunAt.toISOString();
  return {
    logicalRunAt: logicalRunAtIso,
    logicalRunDate: logicalRunAtIso.slice(0, 10),
  };
}

export interface AgentHandler {
  displayName: string;
  description: string;
  handler: (context: AgentRunContext) => Promise<{ summary: Record<string, unknown> }>;
  /**
   * Omit to inherit NO_RETRY. Only set `attempts > 1` with a stated reason why
   * a repeat run of THIS handler is safe (§21.1).
   */
  retry?: AgentRetryPolicy;
}

const registry: Record<string, AgentHandler> = {
  proofline: {
    displayName: "Proofline Agent",
    description: "Daily proofline analysis — generates Win/Risk data points from GBP and website analytics for all onboarded locations.",
    handler: async () => {
      const result = await executeProoflineAgent();
      return { summary: result.summary as unknown as Record<string, unknown> };
    },
    // NO RETRY — not proven repeat-safe (§21.1), so it does not get attempts > 1.
  },
  ranking: {
    displayName: "Practice Ranking",
    description: "Competitive ranking analysis — discovers competitors, scores, and generates LLM analysis for all onboarded locations.",
    handler: async () => {
      const result = await executeRankingAgent();
      return { summary: result.summary as unknown as Record<string, unknown> };
    },
    // NO RETRY — deliberate, and load-bearing. `executeRankingAgent` is NOT
    // idempotent (§21.1): it has no top-level try/catch, and
    // `setupRankingBatches` runs first, minting a fresh `batch_id = uuidv4()`
    // and blind-inserting one `practice_rankings` row per location via
    // `PracticeRankingModel.insertReturningId` — `.insert()` with no
    // `onConflict` and no covering unique constraint. A later throw (e.g. the
    // unguarded `OrganizationModel.findById` in `processRankingWork`'s per-org
    // loop) would, on retry, re-run from the top and lay down a SECOND full
    // batch of orphaned `pending` rows — plus another round of paid
    // SerpApi/Gemini calls. This schedule is seeded `enabled: true` and has
    // been live in production since 20260315000001, so that would be real data
    // corruption in prod. Making ranking repeat-safe (upsert on a natural key,
    // or minting the batch only after the work succeeds) is the prerequisite
    // for ever giving it attempts > 1; it is a follow-on, not this PR.
  },
  nap_consistency: {
    displayName: "Citations & NAP Consistency Monitor",
    // Operator-facing: served by GET /api/admin/schedules/registry and rendered
    // in the admin Schedules page's create form (frontend Schedules.tsx) right
    // where the operator picks an agent. It must describe what is TRUE at this
    // head: no schedule is seeded for this agent (see
    // 20260715140000_create_nap_consistency_observation.ts), and that create
    // form hardcodes `enabled: true` with no toggle and defaults to a DAILY
    // cron — so the two defaults the old seed carried (disabled, every 14 days)
    // are exactly what an operator must now supply by hand. Say so here rather
    // than let the defaults bite.
    description:
      "Recurring NAP-consistency check across external listings for all onboarded locations — observe + flag conflicts to fix, never a rank promise. NOT scheduled by default: no schedule is seeded, so nothing runs until you create one here. When you do: it starts running IMMEDIATELY (this form creates schedules enabled), and every run incurs SerpApi cost — so set it to an interval of 14 days rather than accepting the daily default.",
    handler: async (context) => {
      const result = await executeNapConsistencyAgent({
        runDate: context.logicalRunDate,
        observedAt: new Date(context.logicalRunAt),
      });
      return { summary: result.summary as unknown as Record<string, unknown> };
    },
    // RETRY EARNED (§21.1 → §21.2). Unlike ranking/proofline, a repeat run of
    // this handler is safe, and that is a designed property rather than a hope:
    // `nap_consistency_observation` carries UNIQUE (location_id, run_date) and
    // `NapConsistencyObservationModel.record` inserts with `onConflict(...).ignore()`,
    // returning whether a row actually landed. The scheduler also passes one
    // stable logicalRunDate through every BullMQ attempt, and the executor
    // checks that key BEFORE provider work. A retry therefore skips locations
    // already recorded by an earlier attempt, including across UTC midnight;
    // only locations whose write did not land are measured again. Retrying is
    // worth doing because the failure this survives is a rejected write
    // (NapPersistenceError), typically a transient connection blip. Bounded at
    // 3 because failed writes can still require another paid measurement.
    retry: { attempts: 3, backoffMs: 60000 },
  },
};

/**
 * The retry policy for an agent's scheduled run. Unknown or unset → NO_RETRY:
 * an agent must opt IN to being retried, because the exec queue is shared and
 * a retry re-runs the whole handler (§21.1).
 */
export function getAgentRetryPolicy(agentKey: string): AgentRetryPolicy {
  return registry[agentKey]?.retry ?? NO_RETRY;
}

export function getAgentHandler(agentKey: string): AgentHandler | undefined {
  return registry[agentKey];
}

export function getRegisteredAgents(): Array<{ key: string; displayName: string; description: string }> {
  return Object.entries(registry).map(([key, { displayName, description }]) => ({
    key,
    displayName,
    description,
  }));
}
