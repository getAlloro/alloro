/**
 * Findability Sensor — honest SoLV / ARP / ATRP aggregator
 *
 * Pure. Reduces a set of per-pin observations into the owner-legible reading.
 * Metric definitions are lifted verbatim from research/rank-geo-grid-mechanism.md
 * §A.3 (Local Falcon's category-standard vocabulary):
 *   - SoLV  — Share of Local Voice: % of grid points ranking in the top 3.
 *   - ARP   — Average Rank Position: average rank across pins where present.
 *   - ATRP  — Average Total Rank Position: average across the whole grid, with
 *             absent pins defaulted to just beyond the cutoff.
 *
 * The Alloro honesty upgrade (spec Rev 2, anti-fabrication): "unknown" pins
 * (provider error) are EXCLUDED from every denominator. They are neither a rank
 * nor an absence — we simply could not look. This is the difference between a
 * missing reading (honest) and a fabricated one (poisons the whole loop).
 */

import type { PinObservation, SolvAggregate } from "../../../types/findability-sensor";

/** Top-3 = the local pack (research §A.3). The SoLV numerator tier. */
export const RANK_TOP_TIER = 3;
/** Beyond position 20 = "essentially invisible / not found" (research §A.3). */
export const RANK_CUTOFF = 20;
/** ATRP default assigned to a pin the business was measured-absent from. */
export const NOT_RANKING_RANK = RANK_CUTOFF + 1;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Aggregate per-pin observations into one honest SoLV reading.
 *
 * Denominator rule (the load-bearing honesty):
 *   knownPins = ranked + not_ranking   (pins we could actually measure)
 *   unknownPins are excluded entirely.
 *   solvPercent is null when knownPins === 0 (no honest reading) — NOT 0.
 */
export function aggregateSolv(observations: PinObservation[]): SolvAggregate {
  const totalPins = observations.length;

  let knownPins = 0;
  let unknownPins = 0;
  let rankedPins = 0;
  let topThreePins = 0;
  let rankedRankSum = 0; // for ARP (present-only)
  let atrpRankSum = 0; // for ATRP (known pins, absent defaulted to NOT_RANKING_RANK)

  for (const obs of observations) {
    switch (obs.outcome.state) {
      case "ranked": {
        knownPins++;
        // A position beyond the cutoff is "essentially invisible / not found"
        // (research §A.3) — treat it as a measured absence, NOT a rank. Without
        // this, a rank of 25 would pull ATRP DOWN toward a better-looking number
        // than a pin the business didn't appear on at all (NOT_RANKING_RANK=21).
        if (obs.outcome.position > RANK_CUTOFF) {
          atrpRankSum += NOT_RANKING_RANK;
          break;
        }
        rankedPins++;
        rankedRankSum += obs.outcome.position;
        atrpRankSum += obs.outcome.position;
        if (obs.outcome.position <= RANK_TOP_TIER) topThreePins++;
        break;
      }
      case "not_ranking": {
        knownPins++;
        atrpRankSum += NOT_RANKING_RANK;
        break;
      }
      case "unknown": {
        unknownPins++;
        break;
      }
    }
  }

  const solvPercent = knownPins > 0 ? round2((topThreePins / knownPins) * 100) : null;
  const arp = rankedPins > 0 ? round2(rankedRankSum / rankedPins) : null;
  const atrp = knownPins > 0 ? round2(atrpRankSum / knownPins) : null;
  const coverage = totalPins > 0 ? round2(knownPins / totalPins) : 0;

  return {
    solvPercent,
    arp,
    atrp,
    totalPins,
    knownPins,
    unknownPins,
    rankedPins,
    topThreePins,
    coverage,
  };
}
