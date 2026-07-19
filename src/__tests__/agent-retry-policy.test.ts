import { describe, it, expect } from "vitest";
import {
  getAgentRetryPolicy,
  getRegisteredAgents,
} from "../services/agentRegistry";

/**
 * Retry is opt-in PER AGENT (§21.1), never queue-wide (Dave review #166 round 3
 * item 2, second-order).
 *
 * Fixing §21.2 by rethrowing is only half the job. The exec queue
 * (`minds-schedule-exec`) is SHARED by every scheduled agent, and a BullMQ retry
 * re-runs the whole handler — so a blanket `attempts: 3` on the tick's enqueue
 * would impose retries on handlers that are not repeat-safe. §21.1 is explicit:
 * "a job may run more than once (retries, at-least-once delivery); design every
 * job so a repeat run is safe". Retry is therefore a property an agent EARNS.
 *
 * The concrete danger this guards, which is not hypothetical:
 * `executeRankingAgent` has no top-level try/catch, and `setupRankingBatches`
 * runs first — minting a fresh `batch_id = uuidv4()` and blind-inserting one
 * `practice_rankings` row per location via `PracticeRankingModel.insertReturningId`
 * (`.insert()`, no `onConflict`, no covering unique constraint). A later throw
 * would, on retry, re-run from the top and lay down a SECOND full batch of
 * orphaned `pending` rows. That schedule is seeded `enabled: true` and has been
 * live in production since `20260315000001_create_schedules_tables.ts`, so a
 * blanket retry here would corrupt production data.
 *
 * NOTE ON THIS FILE'S EXISTENCE: these assertions live apart from
 * `schedule-exec-failure-contract.test.ts` deliberately — that file
 * `vi.mock`s `../services/agentRegistry`, so an import of it there resolves to
 * the mock and would assert nothing about the real declared policy. Here the
 * registry is imported for real, with no mocks at all.
 */

describe("agent retry policy — opt-in per agent, default off (§21.1)", () => {
  it("does NOT retry `ranking` — it blind-inserts a fresh batch per run and is live in prod", () => {
    // attempts: 1 means the exec processor's catch is terminal on the first
    // failure: same execution behaviour as before the §21.2 fix (exactly one
    // batch), except the failure is now visible and retained instead of
    // swallowed. That is the whole point — visibility without duplication.
    expect(getAgentRetryPolicy("ranking").attempts).toBe(1);
  });

  it("does NOT retry `proofline` — not proven repeat-safe", () => {
    expect(getAgentRetryPolicy("proofline").attempts).toBe(1);
  });

  it("DOES retry `nap_consistency` — it earned it: UNIQUE(location_id, run_date) + onConflict ignore", () => {
    // The one agent whose repeat run is safe BY DESIGN, not by luck: the
    // observation table carries UNIQUE (location_id, run_date) and the model
    // records with onConflict(...).ignore(). The scheduler persists one logical
    // run date across every attempt, and the executor preflights that key before
    // paid work, so retries skip locations that already landed even at midnight.
    expect(getAgentRetryPolicy("nap_consistency")).toEqual({
      attempts: 3,
      backoffMs: 60000,
    });
  });

  it("defaults an unknown agent to NO retry — opt-in, never opt-out", () => {
    // A future agent added without a stated §21.1 justification must not
    // silently inherit retries from the queue.
    expect(getAgentRetryPolicy("some_future_agent_that_does_not_exist")).toEqual({
      attempts: 1,
      backoffMs: 0,
    });
  });

  it("ONLY agents with a recorded §21.1 reason carry attempts > 1 (whole-registry sweep)", () => {
    const retried = getRegisteredAgents()
      .map((a) => a.key)
      .filter((key) => getAgentRetryPolicy(key).attempts > 1);

    // A sweep, not a spot check: if anyone opts a new agent into retries, or
    // re-introduces a blanket policy, this fails until it is done deliberately.
    expect(retried).toEqual(["nap_consistency"]);
  });

  it("the registry is non-empty — the sweep above must not pass vacuously", () => {
    // Guards the sweep: if getRegisteredAgents() ever returned [], the filter
    // would be trivially satisfied and prove nothing.
    const keys = getRegisteredAgents().map((a) => a.key);
    expect(keys).toContain("ranking");
    expect(keys).toContain("proofline");
    expect(keys).toContain("nap_consistency");
  });
});
