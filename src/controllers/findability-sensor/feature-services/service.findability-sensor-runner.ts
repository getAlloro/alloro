/**
 * Findability Sensor — sampling runner (A5, slice 1)
 *
 * Composes the pure core into one honest scan: for each tracked keyword-family,
 * generate a geo-grid, sample local-Maps rank at each pin via an INJECTED
 * per-point provider (the real SerpApi Maps call in prod; a fake in tests),
 * aggregate into a SoLV reading, and persist an idempotent snapshot.
 *
 * Design notes:
 *   - The provider is injected so the whole runner is testable with no network
 *     and no SerpApi key. In prod, pass `getSearchPositionViaSerpApiMaps`.
 *   - Per-(keyword) failure isolation: one keyword blowing up never fails the
 *     scan; we record what succeeded and skip the rest (spec Constraints).
 *   - Anti-fabrication (spec Rev 2): the provider's three states map to the
 *     three honest pin outcomes and never collapse. A scan with ZERO known pins
 *     (grid empty, or provider down for every pin) is SKIPPED, not persisted as
 *     a fake zero — "never fabricate; skip honestly".
 *   - Pins are sampled sequentially to stay gentle on the provider's rate/quota;
 *     this is a background scan, so latency is acceptable.
 *
 * Spec: plans/07152026-findability-sensor/spec.html
 */

import logger from "../../../lib/logger";
import type { SerpApiMapsSearchPositionResult } from "../../practice-ranking/feature-services/service.serpapi-maps";
import {
  generateGeoGrid,
  DEFAULT_GRID_SIZE,
  DEFAULT_RADIUS_MILES,
} from "../feature-utils/util.geo-grid";
import { aggregateSolv } from "../feature-utils/util.solv-aggregator";
import type {
  GeoPoint,
  KeywordFamily,
  PinObservation,
  PinRankOutcome,
} from "../../../types/findability-sensor";
import {
  FindabilitySensorReadingModel,
  type FindabilitySensorReadingInput,
} from "../../../models/FindabilitySensorModel";

/** The injected per-point rank lookup — signature matches getSearchPositionViaSerpApiMaps. */
export type PerPointRankProvider = (
  searchQuery: string,
  clientPlaceId: string,
  origin: GeoPoint,
) => Promise<SerpApiMapsSearchPositionResult>;

export interface FindabilitySensorScanInput {
  organizationId: number;
  locationId: number | null;
  /** The business's Google place id — used to find it in each pin's results. */
  clientPlaceId: string;
  /** The grid center (the practice's own coordinates). */
  center: GeoPoint;
  /** The tracked keyword-families (already service-not-name filtered). */
  keywordFamilies: KeywordFamily[];
  gridSize?: number;
  radiusMiles?: number;
  /** The run's date key (YYYY-MM-DD) for idempotency. Supplied by the caller. */
  runDate: string;
  /** Whether the scan is known to run during the business's open hours (Paige caveat). */
  openHoursKnown?: boolean;
  /** The per-point provider (real in prod, fake in tests). */
  provider: PerPointRankProvider;
  /** When false, aggregate but do not write (dry run). Defaults to true. */
  persist?: boolean;
}

export interface ScanKeywordResult {
  keyword: string;
  solvPercent: number | null;
  coverage: number;
  knownPins: number;
  totalPins: number;
}

export interface ScanSkip {
  keyword: string;
  reason: "empty_grid" | "no_known_pins" | "error";
}

export interface FindabilitySensorScanSummary {
  organizationId: number;
  locationId: number | null;
  written: ScanKeywordResult[];
  skipped: ScanSkip[];
}

function log(message: string): void {
  logger.info(`[FINDABILITY-SENSOR] ${message}`);
}

/**
 * Map one provider result to an honest pin outcome. The three states stay
 * distinct forever (spec Rev 2):
 *   ok w/ a real position (finite, >= 1) -> ranked; not_in_top_20 -> not_ranking;
 *   else unknown.
 * A malformed "ok" (non-finite, zero, or negative position) degrades to unknown,
 * never a fabricated rank — this is the injected-provider anti-fabrication
 * boundary, so it must be at least as strict as its own promise.
 */
function toPinOutcome(result: SerpApiMapsSearchPositionResult): PinRankOutcome {
  if (
    result.status === "ok" &&
    typeof result.position === "number" &&
    Number.isFinite(result.position) &&
    result.position >= 1
  ) {
    return { state: "ranked", position: result.position };
  }
  if (result.status === "not_in_top_20") {
    return { state: "not_ranking" };
  }
  // api_error, or an "ok" with no usable position — we could not read this pin.
  return { state: "unknown" };
}

async function sampleKeyword(
  keyword: string,
  input: FindabilitySensorScanInput,
): Promise<PinObservation[]> {
  const pins = generateGeoGrid(input.center, {
    size: input.gridSize ?? DEFAULT_GRID_SIZE,
    radiusMiles: input.radiusMiles ?? DEFAULT_RADIUS_MILES,
  });

  const observations: PinObservation[] = [];
  for (const pin of pins) {
    let outcome: PinRankOutcome;
    let competitorsSeen = 0;
    try {
      const result = await input.provider(keyword, input.clientPlaceId, {
        lat: pin.lat,
        lng: pin.lng,
      });
      outcome = toPinOutcome(result);
      competitorsSeen = Number.isFinite(result.resultCount) ? result.resultCount : 0;
    } catch (error: unknown) {
      // The reused provider never throws, but a future/alternate provider might.
      // A thrown pin is unknown, never "not ranking".
      const message = error instanceof Error ? error.message : String(error);
      log(`pin ${pin.index} for "${keyword}" threw (${message}) — recording unknown`);
      outcome = { state: "unknown" };
    }
    observations.push({ pin, outcome, competitorsSeen });
  }
  return observations;
}

/**
 * Run the sensor for one location across all its tracked keyword-families.
 * Returns a summary of what was written and what was honestly skipped.
 */
export async function runFindabilitySensorScan(
  input: FindabilitySensorScanInput,
): Promise<FindabilitySensorScanSummary> {
  const persist = input.persist !== false;
  const written: ScanKeywordResult[] = [];
  const skipped: ScanSkip[] = [];

  if (!input.keywordFamilies || input.keywordFamilies.length === 0) {
    log(
      `org=${input.organizationId} loc=${input.locationId ?? "null"}: no tracked keywords — nothing to sample (honest skip)`,
    );
    return { organizationId: input.organizationId, locationId: input.locationId ?? null, written, skipped };
  }

  for (const family of input.keywordFamilies) {
    try {
      const observations = await sampleKeyword(family.keyword, input);

      if (observations.length === 0) {
        // No geo / empty grid — record nothing rather than a fake reading.
        log(`"${family.keyword}": empty grid (no geo) — skipped`);
        skipped.push({ keyword: family.keyword, reason: "empty_grid" });
        continue;
      }

      const aggregate = aggregateSolv(observations);

      if (aggregate.knownPins === 0) {
        // Every pin errored (provider down/unconfigured) — skip, never fabricate a zero.
        log(`"${family.keyword}": 0 of ${aggregate.totalPins} pins measurable — skipped (no fabricated reading)`);
        skipped.push({ keyword: family.keyword, reason: "no_known_pins" });
        continue;
      }

      const reading: FindabilitySensorReadingInput = {
        organization_id: input.organizationId,
        location_id: input.locationId ?? null,
        keyword: family.keyword,
        keyword_source: family.source,
        grid_size: input.gridSize ?? DEFAULT_GRID_SIZE,
        radius_miles: input.radiusMiles ?? DEFAULT_RADIUS_MILES,
        center_lat: input.center.lat,
        center_lng: input.center.lng,
        solv_percent: aggregate.solvPercent,
        arp: aggregate.arp,
        atrp: aggregate.atrp,
        total_pins: aggregate.totalPins,
        known_pins: aggregate.knownPins,
        unknown_pins: aggregate.unknownPins,
        ranked_pins: aggregate.rankedPins,
        top_three_pins: aggregate.topThreePins,
        coverage: aggregate.coverage,
        per_pin: observations,
        open_hours_known: input.openHoursKnown === true,
        observed_at: new Date(),
        run_date: input.runDate,
      };

      if (persist) {
        await FindabilitySensorReadingModel.upsertReading(reading);
      }

      written.push({
        keyword: family.keyword,
        solvPercent: aggregate.solvPercent,
        coverage: aggregate.coverage,
        knownPins: aggregate.knownPins,
        totalPins: aggregate.totalPins,
      });
      log(
        `"${family.keyword}": SoLV=${aggregate.solvPercent ?? "n/a"}% coverage=${aggregate.coverage} (${aggregate.knownPins}/${aggregate.totalPins} pins)`,
      );
    } catch (error: unknown) {
      // Per-keyword isolation: one keyword failing never fails the whole scan.
      const message = error instanceof Error ? error.message : String(error);
      log(`"${family.keyword}": scan failed (${message}) — skipped, continuing`);
      skipped.push({ keyword: family.keyword, reason: "error" });
    }
  }

  return {
    organizationId: input.organizationId,
    locationId: input.locationId ?? null,
    written,
    skipped,
  };
}
