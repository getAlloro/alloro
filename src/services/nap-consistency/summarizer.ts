/**
 * NAP-consistency summarizer — Alloro Funnel Engine A4. Pure: no IO.
 * Folds the per-source match states (from the reused `compareExternalIdentity`,
 * carried on each external source as `entityMatchState`) into one snapshot.
 *
 * Honesty: only a `conflicting` state is counted as a conflict (a real
 * disagreement worth double-checking). Weak/uncertain states
 * (ambiguous_entity, external_candidate, missing_on_site, unavailable) are NOT
 * conflicts — the existing scorer treats them as noise, never a confirmed
 * error, and so do we. Never a rank claim.
 */

const STATE_CONSISTENT = "consistent";
const STATE_CONFLICTING = "conflicting";

/** Minimal shape of a compared external source (subset of ExternalEntitySourceInput). */
export interface NapSourceLike {
  url: string;
  sourceHost: string;
  entityMatchState: string;
}

export interface NapConflict {
  source: string;
  sourceHost: string;
  matchState: string;
}

export interface NapConsistencySummary {
  sourcesChecked: number;
  consistentCount: number;
  conflictCount: number;
  conflicts: NapConflict[];
}

export function summarizeNapConsistency(
  sources: NapSourceLike[] | null | undefined
): NapConsistencySummary {
  const list = Array.isArray(sources) ? sources : [];
  const conflicts: NapConflict[] = list
    .filter((s) => s && s.entityMatchState === STATE_CONFLICTING)
    .map((s) => ({
      source: s.url,
      sourceHost: s.sourceHost,
      matchState: s.entityMatchState,
    }));
  const consistentCount = list.filter(
    (s) => s && s.entityMatchState === STATE_CONSISTENT
  ).length;
  return {
    sourcesChecked: list.length,
    consistentCount,
    conflictCount: conflicts.length,
    conflicts,
  };
}
