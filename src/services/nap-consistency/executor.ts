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
 * rank claim. Per-location failures are isolated. Seams (targetProvider/runner/
 * record) are injectable so the logic is unit-tested without network or DB.
 */

export interface NapTarget {
  organizationId: number;
  locationId: number;
  domain: string | null;
}

export type NapTargetProvider = () => Promise<NapTarget[]>;

/**
 * Typed outcome of one location's NAP check (§3.2) — three distinct states that
 * must never be collapsed:
 *
 * - `ok`      — the check ran. `sources: []` is an HONEST zero ("we looked and
 *               found no external sources") and IS recorded.
 * - `skipped` — it could not run at all (no site → no baseline). Not recorded.
 * - `provider_unavailable` — the discovery provider could not be reached, so no
 *               measurement happened. NOT recorded: persisting it as
 *               `sources_checked: 0` would be a silent false "we checked".
 */
export type NapCheckOutcome =
  | { status: "ok"; sources: NapSourceLike[] }
  | { status: "skipped"; reason: string }
  | { status: "provider_unavailable"; reason: string };

export type NapCheckRunner = (target: NapTarget) => Promise<NapCheckOutcome>;

export interface NapExecutorSummary {
  targets: number;
  locationsRecorded: number;
  totalConflicts: number;
  skipped: number;
  /** Locations whose provider was unreachable — measurement never happened. */
  providerUnavailable: number;
}

export interface NapExecutorDeps {
  targetProvider?: NapTargetProvider;
  runner?: NapCheckRunner;
  record?: (input: RecordNapObservationInput) => Promise<void>;
  /** Run day "YYYY-MM-DD" — part of the idempotency key. */
  runDate?: string;
  observedAt?: Date;
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
  return { status: "ok", sources: result.sources };
}

export async function executeNapConsistencyAgent(
  deps: NapExecutorDeps = {}
): Promise<{ summary: NapExecutorSummary }> {
  const targetProvider = deps.targetProvider ?? defaultTargetProvider;
  const runner = deps.runner ?? defaultRunner;
  const record =
    deps.record ?? ((input) => NapConsistencyObservationModel.record(input));
  const runDate = deps.runDate ?? new Date().toISOString().slice(0, 10);
  const observedAt = deps.observedAt ?? new Date();

  const targets = await targetProvider();
  let locationsRecorded = 0;
  let totalConflicts = 0;
  let skipped = 0;
  let providerUnavailable = 0;

  for (const target of targets) {
    try {
      const outcome = await runner(target);
      if (outcome.status === "skipped") {
        skipped++;
        continue;
      }
      // §3.2: a provider outage is NOT a zero-result. Skip persistence entirely
      // so the time series never carries a fabricated "we checked, found none".
      if (outcome.status === "provider_unavailable") {
        providerUnavailable++;
        logger.warn(
          { locationId: target.locationId, reason: outcome.reason },
          "[NAP-MONITOR] provider unavailable — not recording an observation"
        );
        continue;
      }
      const summary = summarizeNapConsistency(outcome.sources);
      await record({
        organizationId: target.organizationId,
        locationId: target.locationId,
        runDate,
        sourcesChecked: summary.sourcesChecked,
        consistentCount: summary.consistentCount,
        conflictCount: summary.conflictCount,
        conflicts: summary.conflicts,
        observedAt,
      });
      locationsRecorded++;
      totalConflicts += summary.conflictCount;
    } catch (err) {
      skipped++;
      logger.warn(
        { locationId: target.locationId, err: (err as Error)?.message },
        "[NAP-MONITOR] location check failed — skipping"
      );
    }
  }

  const summary: NapExecutorSummary = {
    targets: targets.length,
    locationsRecorded,
    totalConflicts,
    skipped,
    providerUnavailable,
  };
  logger.info(
    { checker: "nap-consistency", ...summary },
    "[NAP-MONITOR] run complete"
  );
  return { summary };
}
