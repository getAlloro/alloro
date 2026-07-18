import logger from "../../../lib/logger";
import {
  INapConsistencyObservation,
  NapConsistencyObservationModel,
} from "../../../models/NapConsistencyObservationModel";
import { NapConsistencyError } from "../feature-utils/NapConsistencyError";

/**
 * Read surface for the NAP-consistency monitor — Alloro Funnel Engine A4. The
 * monitor's executor writes `nap_consistency_observation` rows; NOTHING read
 * them until this service. It is the reader the seam was missing: a detected
 * NAP conflict is now consumable instead of sitting in a log nobody opens.
 *
 * Honesty (staked bar): this surfaces ONLY what the monitor actually measured
 * and stored. No fabrication, no zero-fill. A location the monitor has never
 * run for has NO observations, and this returns `latest: null` with an empty
 * history — absent, never a manufactured "0 conflicts, all clear".
 *
 * Business logic lives here, not in the controller (§7.3). The only DB access
 * is through the tenant-scoped model read (§7.4 / §11.7); `listForLocation`
 * REQUIRES organizationId, so one tenant can never read another's rows.
 */

/** One conflicting external listing, as stored by the summarizer. */
export interface NapConflictView {
  source: string;
  sourceHost: string;
  matchState: string;
}

/** A single recorded observation, shaped for the client (camelCase, no DB ids). */
export interface NapObservationView {
  runDate: string;
  sourcesChecked: number;
  consistentCount: number;
  conflictCount: number;
  conflicts: NapConflictView[];
  observedAt: Date;
}

export interface NapConsistencyReadResult {
  /** The most recent observation, or null if the monitor has never recorded one. */
  latest: NapObservationView | null;
  /** Whether the latest observation carries at least one real conflict. */
  hasConflicts: boolean;
  /** Newest-first history (bounded by `limit`). Empty when never measured. */
  history: NapObservationView[];
}

/** Default and maximum history rows returned to a client. */
const DEFAULT_HISTORY_LIMIT = 30;
const MAX_HISTORY_LIMIT = 100;

/**
 * Narrow one stored conflict (persisted as jsonb, read back as `unknown`) to
 * {@link NapConflictView}. §4.5: `unknown` + explicit field checks, never `any`.
 * A malformed row is dropped rather than coerced into a lie.
 */
function toConflictView(raw: unknown): NapConflictView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const source = record.source;
  const sourceHost = record.sourceHost;
  const matchState = record.matchState;
  if (
    typeof source !== "string" ||
    typeof sourceHost !== "string" ||
    typeof matchState !== "string"
  ) {
    return null;
  }
  return { source, sourceHost, matchState };
}

function toObservationView(row: INapConsistencyObservation): NapObservationView {
  const conflicts = Array.isArray(row.conflicts)
    ? row.conflicts
        .map(toConflictView)
        .filter((c): c is NapConflictView => c !== null)
    : [];
  return {
    runDate: row.run_date,
    sourcesChecked: row.sources_checked,
    consistentCount: row.consistent_count,
    conflictCount: row.conflict_count,
    conflicts,
    observedAt: row.observed_at,
  };
}

function clampLimit(requested: number | null): number {
  if (requested === null || requested <= 0) return DEFAULT_HISTORY_LIMIT;
  return Math.min(requested, MAX_HISTORY_LIMIT);
}

export class NapConsistencyReadService {
  /**
   * Read a location's NAP-consistency observations for the CALLER's tenant.
   * organizationId and locationId are both server-derived (§5.5 / §11.7) and
   * passed straight to the tenant-scoped model read.
   */
  static async getForLocation(
    organizationId: number,
    locationId: number,
    requestedLimit: number | null
  ): Promise<NapConsistencyReadResult> {
    const limit = clampLimit(requestedLimit);
    let rows: INapConsistencyObservation[];
    try {
      rows = await NapConsistencyObservationModel.listForLocation(
        organizationId,
        locationId,
        limit
      );
    } catch (err) {
      logger.error(
        {
          route: "nap-consistency",
          organizationId,
          locationId,
          err: (err as Error)?.message,
        },
        "[NAP-MONITOR] failed to read observations for a location"
      );
      throw new NapConsistencyError(
        "NAP_CONSISTENCY_READ_FAILED",
        "Could not read NAP consistency observations."
      );
    }

    const history = rows.map(toObservationView);
    const latest = history[0] ?? null;
    return {
      latest,
      hasConflicts: latest !== null && latest.conflictCount > 0,
      history,
    };
  }
}
