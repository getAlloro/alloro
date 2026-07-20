import logger from "../../lib/logger";
import { GoogleConnectionModel } from "../../models/GoogleConnectionModel";
import { LocationModel } from "../../models/LocationModel";
import {
  NapConsistencyObservationModel,
  RecordNapObservationInput,
} from "../../models/NapConsistencyObservationModel";
import { collectUrlAuditSnapshot } from "../ai-seo-audit/urlCollectorService";
import { collectExternalEntitySourcesWithStatus } from "../ai-seo-audit/externalEntitySearchService";
import { summarizeNapConsistency, NapSourceLike } from "./summarizer";

/**
 * NAP-consistency monitor executor — Alloro Funnel Engine A4. The scheduled
 * `nap_consistency` agent's body. Iterates onboarded locations, runs the REUSED
 * NAP measurement per location, and persists a snapshot. Observe-only; never a
 * rank claim. Seams (targetProvider/runner/record) are injectable so the logic
 * is unit-tested without network or DB.
 *
 * Two failure classes, deliberately NOT symmetric (§3.2):
 * - A MEASUREMENT failure (one site unreachable) is isolated and counted as
 *   `skipped`. The run continues and still succeeds — that is the design.
 * - A PERSISTENCE failure (the write itself rejected) is aggregated and thrown
 *   as `NapPersistenceError` after every location is attempted. The run must
 *   fail visibly; a dropped write silently reported as a completed run would
 *   leave a hole in the time series that nobody is told about.
 */

export interface NapTarget {
  organizationId: number;
  locationId: number;
  domain: string | null;
}

export type NapTargetProvider = () => Promise<NapTarget[]>;

/**
 * Typed outcome of one location's NAP check (§3.2) — four distinct states that
 * must never be collapsed:
 *
 * - `ok`      — the check ran to full coverage. `sources: []` is an HONEST zero
 *               ("we looked everywhere we meant to and found no external
 *               sources") and IS recorded.
 * - `skipped` — it could not run at all (no site → no baseline). Not recorded.
 * - `provider_unavailable` — the discovery provider could not be reached, so no
 *               measurement happened. NOT recorded: persisting it as
 *               `sources_checked: 0` would be a silent false "we checked".
 * - `partial_coverage` — the provider answered SOME queries and failed others.
 *               A measurement happened, but with a blind spot of unknown size.
 *               NOT recorded (V1): a short conflict count that reads like a
 *               finished one is a quieter lie than no row at all, and the time
 *               series is meant to be comparable day over day.
 */
export type NapCheckOutcome =
  | { status: "ok"; sources: NapSourceLike[] }
  | { status: "skipped"; reason: string }
  | { status: "provider_unavailable"; reason: string }
  | {
      status: "partial_coverage";
      reason: string;
      /** Discovery queries issued. */
      attempted: number;
      /** How many failed — the size of the blind spot. */
      failed: number;
    };

export type NapCheckRunner = (target: NapTarget) => Promise<NapCheckOutcome>;

export interface NapExecutorSummary {
  targets: number;
  /** Rows ACTUALLY inserted this run — not merely attempted (§ idempotency). */
  locationsRecorded: number;
  /** Writes the model ignored: this (location, run_date) was already logged. */
  locationsAlreadyRecorded: number;
  /** Conflicts carried by the rows counted in `locationsRecorded`. */
  totalConflicts: number;
  skipped: number;
  /** Locations whose provider was unreachable — measurement never happened. */
  providerUnavailable: number;
  /** Locations measured with an incomplete provider answer — not recorded. */
  partialCoverage: number;
  /** Locations whose measurement succeeded but whose WRITE failed. */
  persistenceFailures: number;
}

export interface NapExecutorDeps {
  targetProvider?: NapTargetProvider;
  runner?: NapCheckRunner;
  /**
   * Tenant-scoped preflight for the stable logical run key. Returning true
   * skips the paid runner because an earlier BullMQ attempt already landed.
   */
  hasObservationForLogicalRun?: (
    organizationId: number,
    locationId: number,
    runDate: string
  ) => Promise<boolean>;
  /** Resolves TRUE when a row was inserted, FALSE when the write was a
   * same-run-day no-op the model ignored. */
  record?: (input: RecordNapObservationInput) => Promise<boolean>;
  /** Run day "YYYY-MM-DD" — part of the idempotency key. */
  runDate?: string;
  observedAt?: Date;
}

/**
 * Thrown when the run measured locations successfully but could not PERSIST one
 * or more of them (§3.2). A measurement failure is a per-location fact the run
 * survives; a database failure means the run did not do its job, so it must not
 * resolve.
 *
 * What throwing this now buys (round 3, §21.2): the scheduler's exec processor
 * (`workers/processors/scheduleExec.processor.ts`) marks the run FAILED and
 * RETHROWS, so BullMQ retries with bounded backoff and retains an exhausted job
 * in the failed set for inspection. Persistence failures are typically
 * transient (a connection blip), which is exactly what a retry is for. Before
 * that fix the processor swallowed this error, so throwing it marked a row
 * failed and nothing else — no retry, no signal. Do not weaken this to a
 * warning: the throw is the only thing that makes a dropped write visible.
 *
 * Carries the summary so an operator sees what did land.
 */
export class NapPersistenceError extends Error {
  readonly code = "NAP_PERSISTENCE_FAILED";
  constructor(
    message: string,
    readonly summary: NapExecutorSummary,
    readonly failedLocationIds: number[]
  ) {
    super(message);
    this.name = "NapPersistenceError";
  }
}

/**
 * Dedupe targets by locationId. An org with more than one google_connection
 * would otherwise yield its locations once per connection (there is no unique
 * constraint on google_connections.organization_id) — which would run the
 * SerpApi measurement twice for the same location (double cost) and over-count
 * the run summary. First occurrence wins.
 */
export function dedupeTargetsByLocation(targets: NapTarget[]): NapTarget[] {
  const seen = new Set<number>();
  const out: NapTarget[] = [];
  for (const t of targets) {
    if (seen.has(t.locationId)) continue;
    seen.add(t.locationId);
    out.push(t);
  }
  return out;
}

async function defaultTargetProvider(): Promise<NapTarget[]> {
  const accounts = await GoogleConnectionModel.findOnboardedOrgConnectionsForRanking();
  const raw: NapTarget[] = [];
  for (const account of accounts) {
    const locations = await LocationModel.findNonCancelledByOrganizationId(
      account.organization_id
    );
    for (const location of locations) {
      raw.push({
        organizationId: account.organization_id,
        locationId: location.id,
        domain: location.domain,
      });
    }
  }
  return dedupeTargetsByLocation(raw);
}

async function defaultRunner(target: NapTarget): Promise<NapCheckOutcome> {
  if (!target.domain) {
    return { status: "skipped", reason: "no domain → no baseline" };
  }
  const url = /^https?:\/\//i.test(target.domain)
    ? target.domain
    : `https://${target.domain}`;
  const snapshot = await collectUrlAuditSnapshot(url);
  const result = await collectExternalEntitySourcesWithStatus(snapshot, snapshot.identity);
  if (result.status === "provider_unavailable") {
    return { status: "provider_unavailable", reason: result.reason };
  }
  if (result.status === "partial_coverage") {
    return {
      status: "partial_coverage",
      reason: result.reason,
      attempted: result.attempted,
      failed: result.failed,
    };
  }
  return { status: "ok", sources: result.sources };
}

/** The one outcome that represents a complete, recordable measurement. */
type RecordableOutcome = Extract<NapCheckOutcome, { status: "ok" }>;

function isRecordable(outcome: NapCheckOutcome): outcome is RecordableOutcome {
  return outcome.status === "ok";
}

/** Mutable tallies for one run, folded into the summary at the end. */
interface RunCounters {
  locationsRecorded: number;
  locationsAlreadyRecorded: number;
  totalConflicts: number;
  skipped: number;
  providerUnavailable: number;
  partialCoverage: number;
}

/**
 * Account for an outcome that must NOT reach the database (§3.2). Each state
 * gets its own counter: collapsing them would hide *why* a location has no row
 * — the difference between "no site to check", "we never reached the provider",
 * and "we only saw part of the picture".
 */
function countNonRecordable(
  target: NapTarget,
  outcome: Exclude<NapCheckOutcome, RecordableOutcome>,
  counters: RunCounters
): void {
  if (outcome.status === "skipped") {
    counters.skipped++;
    return;
  }
  if (outcome.status === "provider_unavailable") {
    counters.providerUnavailable++;
    logger.warn(
      { locationId: target.locationId, reason: outcome.reason },
      "[NAP-MONITOR] provider unavailable — not recording an observation"
    );
    return;
  }
  // partial_coverage: a conflict count drawn from a subset of the queries would
  // land in the time series looking exactly like a complete one. V1: say nothing.
  counters.partialCoverage++;
  logger.warn(
    {
      locationId: target.locationId,
      reason: outcome.reason,
      attempted: outcome.attempted,
      failed: outcome.failed,
    },
    "[NAP-MONITOR] partial provider coverage — not recording an observation"
  );
}

/**
 * Persist one location's measurement and tally what actually landed. Throws on
 * a write failure so the caller can aggregate it into a visible run failure.
 */
async function recordMeasurement(
  record: NonNullable<NapExecutorDeps["record"]>,
  target: NapTarget,
  outcome: RecordableOutcome,
  runDate: string,
  observedAt: Date,
  counters: RunCounters
): Promise<void> {
  const measurement = summarizeNapConsistency(outcome.sources);
  const inserted = await record({
    organizationId: target.organizationId,
    locationId: target.locationId,
    runDate,
    sourcesChecked: measurement.sourcesChecked,
    consistentCount: measurement.consistentCount,
    conflictCount: measurement.conflictCount,
    conflicts: measurement.conflicts,
    observedAt,
  });
  // The model ignores a duplicate (location, run_date). Count what actually
  // landed — incrementing on an ignored write would report rows we don't have.
  if (inserted) {
    counters.locationsRecorded++;
    counters.totalConflicts += measurement.conflictCount;
    return;
  }
  counters.locationsAlreadyRecorded++;
  logger.info(
    { locationId: target.locationId, runDate },
    "[NAP-MONITOR] observation already recorded for this run day — no-op"
  );
}

/**
 * Returns true only when this location still needs paid measurement. Both an
 * already-landed row and a failed preflight stop before the provider call; the
 * latter is recorded as a run-level persistence failure.
 */
async function shouldMeasureLogicalRun(
  target: NapTarget,
  runDate: string,
  hasObservationForLogicalRun: NonNullable<
    NapExecutorDeps["hasObservationForLogicalRun"]
  >,
  counters: RunCounters,
  failedLocationIds: number[]
): Promise<boolean> {
  try {
    const wasRecorded = await hasObservationForLogicalRun(
      target.organizationId,
      target.locationId,
      runDate
    );
    if (!wasRecorded) return true;
    counters.locationsAlreadyRecorded++;
    logger.info(
      { locationId: target.locationId, runDate },
      "[NAP-MONITOR] observation already recorded for this logical run — skipping measurement"
    );
    return false;
  } catch (err) {
    failedLocationIds.push(target.locationId);
    logger.error(
      { locationId: target.locationId, runDate, err: (err as Error)?.message },
      "[NAP-MONITOR] FAILED to check the logical run key — measurement skipped and the run will be failed"
    );
    return false;
  }
}

function finishRun(
  targetCount: number,
  counters: RunCounters,
  failedLocationIds: number[]
): { summary: NapExecutorSummary } {
  const summary: NapExecutorSummary = {
    targets: targetCount,
    ...counters,
    persistenceFailures: failedLocationIds.length,
  };
  if (failedLocationIds.length === 0) {
    logger.info(
      { checker: "nap-consistency", ...summary },
      "[NAP-MONITOR] run complete"
    );
    return { summary };
  }

  logger.error(
    { checker: "nap-consistency", ...summary, failedLocationIds },
    "[NAP-MONITOR] run FAILED — one or more observations could not be persisted"
  );
  const operationCount =
    failedLocationIds.length +
    counters.locationsRecorded +
    counters.locationsAlreadyRecorded;
  throw new NapPersistenceError(
    `NAP consistency run failed ${failedLocationIds.length} of ` +
      `${operationCount} observation persistence operations ` +
      `(locations: ${failedLocationIds.join(", ")})`,
    summary,
    failedLocationIds
  );
}

export async function executeNapConsistencyAgent(
  deps: NapExecutorDeps = {}
): Promise<{ summary: NapExecutorSummary }> {
  const targetProvider = deps.targetProvider ?? defaultTargetProvider;
  const runner = deps.runner ?? defaultRunner;
  const hasInjectedExecutionSeam = Boolean(
    deps.targetProvider || deps.runner || deps.record
  );
  // Existing unit callers inject an entirely in-memory execution path. Keep
  // that path DB-free unless they explicitly inject this new preflight seam;
  // production injects nothing and therefore always uses the model check.
  const hasObservationForLogicalRun =
    deps.hasObservationForLogicalRun ??
    (hasInjectedExecutionSeam
      ? async () => false
      : (organizationId, locationId, runDate) =>
          NapConsistencyObservationModel.hasObservationForLogicalRun(
            organizationId,
            locationId,
            runDate
          ));
  const record =
    deps.record ?? ((input) => NapConsistencyObservationModel.record(input));
  const runDate = deps.runDate ?? new Date().toISOString().slice(0, 10);
  const observedAt = deps.observedAt ?? new Date();

  const targets = await targetProvider();
  const counters: RunCounters = {
    locationsRecorded: 0,
    locationsAlreadyRecorded: 0,
    totalConflicts: 0,
    skipped: 0,
    providerUnavailable: 0,
    partialCoverage: 0,
  };
  const failedLocationIds: number[] = [];

  for (const target of targets) {
    // ---- Idempotency preflight. BullMQ carries one stable runDate through all
    // attempts, so rows that landed before a later failure are skipped before
    // another paid provider measurement (§21.1). A preflight DB failure is a
    // persistence failure, not permission to spend and hope the insert dedupes.
    const shouldMeasure = await shouldMeasureLogicalRun(
      target,
      runDate,
      hasObservationForLogicalRun,
      counters,
      failedLocationIds
    );
    if (!shouldMeasure) continue;

    // ---- Measurement. A failure here is isolated: one bad site must not cost
    // the whole run, and the location is honestly counted as skipped.
    let outcome: NapCheckOutcome;
    try {
      outcome = await runner(target);
    } catch (err) {
      counters.skipped++;
      logger.warn(
        { locationId: target.locationId, err: (err as Error)?.message },
        "[NAP-MONITOR] location check failed — skipping"
      );
      continue;
    }

    // §3.2: an outage or partial coverage is NOT a zero-result. Skip persistence
    // so the time series never carries a fabricated "we checked, found none".
    if (!isRecordable(outcome)) {
      countNonRecordable(target, outcome, counters);
      continue;
    }

    // ---- Persistence. A failure here is NOT the same class of event: the
    // measurement worked and the database dropped it. Aggregate and fail the
    // run below rather than logging a warning the scheduler reports as success.
    try {
      await recordMeasurement(record, target, outcome, runDate, observedAt, counters);
    } catch (err) {
      failedLocationIds.push(target.locationId);
      logger.error(
        { locationId: target.locationId, runDate, err: (err as Error)?.message },
        "[NAP-MONITOR] FAILED to persist an observation — the run will be failed"
      );
    }
  }

  // Every location was attempted before this point, so one failed write does not
  // cost the others their measurement. But the run did NOT do its job, so it
  // must not resolve into a green "completed" run (§3.2).
  return finishRun(targets.length, counters, failedLocationIds);
}
