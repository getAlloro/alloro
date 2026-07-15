/**
 * Findability Sensor — shared types
 *
 * A5 (slice 1) of the funnel engine: the honest sensor under the future fuel
 * gauge. Samples local-Maps rank across a grid of vantage points for the
 * service keywords that bring new customers, and aggregates into an honest
 * Share-of-Local-Voice (SoLV) reading.
 *
 * Spec: plans/07152026-findability-sensor/spec.html
 * Grounding: research/rank-geo-grid-mechanism.md (SoLV/ARP/ATRP, the honesty
 * line), research/rank-findability-voc-and-fuel-gauge.md (the ICP/design).
 *
 * Pure types only — no I/O.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** One vantage point in the sampling grid. row/col are 0-indexed from NW. */
export interface GridPin extends GeoPoint {
  row: number;
  col: number;
  index: number;
}

/**
 * The honest three-state outcome for a single pin. These map 1:1 to the reused
 * per-point provider's status and MUST stay distinct forever (spec Rev 2,
 * anti-fabrication):
 *   - "ranked"      → the business appeared; `position` is its real rank.
 *   - "not_ranking" → we looked and the business was not in the top results
 *                     (a genuine absence — it counts against SoLV).
 *   - "unknown"     → we could NOT look (provider/quota/error). Excluded from
 *                     every denominator; NEVER scored as "not ranking".
 */
export type PinRankOutcome =
  | { state: "ranked"; position: number }
  | { state: "not_ranking" }
  | { state: "unknown" };

export interface PinObservation {
  pin: GridPin;
  outcome: PinRankOutcome;
  /** Count of local results the provider returned at this pin (0 when unknown). */
  competitorsSeen: number;
}

/**
 * The aggregated, owner-legible reading for one keyword-family over one grid.
 *
 * SoLV is the headline (research: "the clearest indicator of your dominance
 * within the Local 3-Pack"). Every value is honest about confidence:
 *   - `solvPercent` is null when there is NO known pin to read (all unknown) —
 *     distinct from 0, which means "we looked everywhere and you are nowhere in
 *     the top three". A null is "we don't know"; a 0 is a real, unflattering fact.
 *   - `coverage` (knownPins / totalPins) is the confidence signal: a low
 *     coverage means many pins errored, so the reading is low-confidence, not a
 *     confident number computed over a handful of pins.
 */
export interface SolvAggregate {
  /** % of KNOWN pins in the top 3. null when knownPins === 0 (no honest reading). */
  solvPercent: number | null;
  /** Average rank across pins where the business ranked (present-only). null if none ranked. */
  arp: number | null;
  /** Average total rank across KNOWN pins (absent pins default to the cutoff). null if no known pins. */
  atrp: number | null;
  totalPins: number;
  /** Pins we could actually measure: ranked + not_ranking. The SoLV/ATRP denominator. */
  knownPins: number;
  /** Pins we could not measure (provider error). Excluded from denominators. */
  unknownPins: number;
  /** Pins where the business ranked in the top 20. */
  rankedPins: number;
  /** Pins where the business ranked in the top 3 (the SoLV numerator). */
  topThreePins: number;
  /** knownPins / totalPins — the confidence of this reading (0..1). */
  coverage: number;
}

/** A tracked keyword, tagged with where it came from. */
export interface KeywordFamily {
  keyword: string;
  source: "gsc_demand" | "service_list";
}
