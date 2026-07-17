/**
 * Findability Sensor (A5, slice 1) — unit tests.
 *
 * Pure core (grid + aggregator + keyword selection) and the injectable runner,
 * all hermetic: no network, no SerpApi key, no live Postgres. The model is
 * mocked at the seam so the runner's compose/persist path is asserted without a
 * DB. The load-bearing honesty invariant (spec Rev 2) is tested directly: the
 * three per-point states stay distinct and `api_error` never becomes a rank or
 * a "not ranking".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the persistence seam so the runner never touches a DB.
const upsertReading = vi.fn(async (input: unknown) => input);
vi.mock("../models/FindabilitySensorModel", () => ({
  FindabilitySensorReadingModel: {
    upsertReading: (input: unknown) => upsertReading(input),
  },
}));

import {
  generateGeoGrid,
  DEFAULT_GRID_SIZE,
  DEFAULT_RADIUS_MILES,
} from "../controllers/findability-sensor/feature-utils/util.geo-grid";
import {
  aggregateSolv,
  NOT_RANKING_RANK,
} from "../controllers/findability-sensor/feature-utils/util.solv-aggregator";
import {
  resolveServiceKeywordFamilies,
  MAX_KEYWORD_FAMILIES,
} from "../controllers/findability-sensor/feature-utils/util.keyword-selection";
import { distanceMiles } from "../controllers/practice-ranking/feature-utils/util.competitor-geo";
import type {
  GridPin,
  PinObservation,
} from "../types/findability-sensor";
import type { SerpApiMapsSearchPositionResult } from "../controllers/practice-ranking/feature-services/service.serpapi-maps";
import { runFindabilitySensorScan } from "../controllers/findability-sensor/feature-services/service.findability-sensor-runner";

// ── helpers ──────────────────────────────────────────────────────────

function fakePin(index: number): GridPin {
  return { lat: 0, lng: 0, row: 0, col: index, index };
}

function ranked(position: number): PinObservation {
  return { pin: fakePin(0), outcome: { state: "ranked", position }, competitorsSeen: 10 };
}
function notRanking(): PinObservation {
  return { pin: fakePin(0), outcome: { state: "not_ranking" }, competitorsSeen: 10 };
}
function unknown(): PinObservation {
  return { pin: fakePin(0), outcome: { state: "unknown" }, competitorsSeen: 0 };
}

const okResult = (position: number, resultCount = 10): SerpApiMapsSearchPositionResult => ({
  position,
  status: "ok",
  resultCount,
  orderedPlaceIds: [],
  orderedResults: [],
});
const notInTopResult = (resultCount = 10): SerpApiMapsSearchPositionResult => ({
  position: null,
  status: "not_in_top_20",
  resultCount,
  orderedPlaceIds: [],
  orderedResults: [],
});
const apiErrorResult = (): SerpApiMapsSearchPositionResult => ({
  position: null,
  status: "api_error",
  resultCount: 0,
  orderedPlaceIds: [],
  orderedResults: [],
});

const CENTER = { lat: 40.7128, lng: -74.006 };
const SCAN_BASE = {
  organizationId: 1,
  locationId: 42,
  clientPlaceId: "place-me",
  center: CENTER,
  gridSize: 3,
  radiusMiles: 2,
  runDate: "2026-07-15",
};

beforeEach(() => {
  upsertReading.mockClear();
});

// ── aggregator ───────────────────────────────────────────────────────

describe("aggregateSolv — honest SoLV/ARP/ATRP", () => {
  it("computes SoLV as % of KNOWN pins in the top 3", () => {
    // 2 top-3, 1 rank-8, 1 not-ranking → 2/4 known = 50% SoLV.
    const agg = aggregateSolv([ranked(1), ranked(3), ranked(8), notRanking()]);
    expect(agg.solvPercent).toBe(50);
    expect(agg.topThreePins).toBe(2);
    expect(agg.knownPins).toBe(4);
    expect(agg.coverage).toBe(1);
  });

  it("ARP averages present-only; ATRP averages the whole known grid with the absent default", () => {
    const agg = aggregateSolv([ranked(2), ranked(4), notRanking()]);
    // ARP = (2+4)/2 = 3 (ranked pins only)
    expect(agg.arp).toBe(3);
    // ATRP = (2 + 4 + NOT_RANKING_RANK) / 3
    expect(agg.atrp).toBe(Math.round(((2 + 4 + NOT_RANKING_RANK) / 3) * 100) / 100);
  });

  it("all-not-ranking is an HONEST zero (SoLV 0, not null), full coverage", () => {
    const agg = aggregateSolv([notRanking(), notRanking(), notRanking()]);
    expect(agg.solvPercent).toBe(0); // we looked everywhere; you're nowhere in top-3
    expect(agg.coverage).toBe(1);
    expect(agg.arp).toBeNull(); // never ranked
    expect(agg.atrp).toBe(NOT_RANKING_RANK);
  });

  it("all-unknown is 'we don't know' (SoLV null, NOT 0) with zero coverage — the Rev 2 crux", () => {
    const agg = aggregateSolv([unknown(), unknown()]);
    expect(agg.solvPercent).toBeNull(); // <-- must be null, never 0
    expect(agg.knownPins).toBe(0);
    expect(agg.unknownPins).toBe(2);
    expect(agg.coverage).toBe(0);
    expect(agg.arp).toBeNull();
    expect(agg.atrp).toBeNull();
  });

  it("excludes unknown pins from the denominator (coverage < 1)", () => {
    // 1 top-3 known, 3 unknown → SoLV over the 1 known pin = 100%, coverage 1/4.
    const agg = aggregateSolv([ranked(1), unknown(), unknown(), unknown()]);
    expect(agg.solvPercent).toBe(100);
    expect(agg.knownPins).toBe(1);
    expect(agg.unknownPins).toBe(3);
    expect(agg.coverage).toBe(0.25);
  });

  it("an empty observation set is null/zero, never a fabricated number", () => {
    const agg = aggregateSolv([]);
    expect(agg.solvPercent).toBeNull();
    expect(agg.totalPins).toBe(0);
    expect(agg.coverage).toBe(0);
  });

  it("treats a rank beyond the cutoff as a measured absence, not a rank that beats 'not ranking'", () => {
    // A rank of 25 is "essentially invisible" — it must NOT count as ranked, and
    // must NOT pull ATRP below a genuinely-absent pin (regression: adversary #4).
    const agg = aggregateSolv([ranked(25), notRanking()]);
    expect(agg.rankedPins).toBe(0); // 25 is not a top-20 rank
    expect(agg.arp).toBeNull(); // never counted as present
    expect(agg.atrp).toBe(NOT_RANKING_RANK); // both pins default to the absent rank
    expect(agg.topThreePins).toBe(0);
    expect(agg.knownPins).toBe(2); // still a measured pin (we looked)
  });
});

// ── grid generator ───────────────────────────────────────────────────

describe("generateGeoGrid", () => {
  it("produces N*N pins with correct row/col/index for an NxN grid", () => {
    const pins = generateGeoGrid(CENTER, { size: 7, radiusMiles: 2 });
    expect(pins).toHaveLength(49);
    expect(pins[0]).toMatchObject({ row: 0, col: 0, index: 0 });
    expect(pins[48]).toMatchObject({ row: 6, col: 6, index: 48 });
  });

  it("centers the middle pin on the practice for an odd grid", () => {
    const pins = generateGeoGrid(CENTER, { size: 5, radiusMiles: 3 });
    const middle = pins[Math.floor(pins.length / 2)];
    expect(distanceMiles(CENTER, middle)).toBeLessThan(0.01);
  });

  it("spans roughly the requested radius edge-to-center", () => {
    const radiusMiles = 2.5;
    const pins = generateGeoGrid(CENTER, { size: 3, radiusMiles });
    // The mid-edge pin (row 0, mid col) sits ~radiusMiles due north of center.
    const midTop = pins.find((p) => p.row === 0 && p.col === 1)!;
    expect(distanceMiles(CENTER, midTop)).toBeGreaterThan(radiusMiles * 0.9);
    expect(distanceMiles(CENTER, midTop)).toBeLessThan(radiusMiles * 1.1);
  });

  it("size 1 yields a single center pin", () => {
    const pins = generateGeoGrid(CENTER, { size: 1 });
    expect(pins).toHaveLength(1);
    expect(distanceMiles(CENTER, pins[0])).toBeLessThan(0.01);
  });

  it("returns [] for a business with no/invalid geo (honest skip, not a fake grid)", () => {
    expect(generateGeoGrid({ lat: NaN, lng: 0 })).toEqual([]);
    expect(generateGeoGrid(undefined as unknown as { lat: number; lng: number })).toEqual([]);
    expect(generateGeoGrid(CENTER, { size: 0 })).toEqual([]);
    expect(generateGeoGrid(CENTER, { radiusMiles: 0 })).toEqual([]);
  });

  it("applies the Goldilocks defaults when unspecified", () => {
    const pins = generateGeoGrid(CENTER);
    expect(pins).toHaveLength(DEFAULT_GRID_SIZE * DEFAULT_GRID_SIZE);
    expect(DEFAULT_RADIUS_MILES).toBeGreaterThan(0);
  });
});

// ── keyword selection ────────────────────────────────────────────────

describe("resolveServiceKeywordFamilies — service-not-name", () => {
  const gsc = (key: string, impressions = 100) => ({
    key,
    impressions,
    clicks: 0,
    ctr: 0,
    position: 0,
  });

  it("excludes branded/name searches and keeps service demand", () => {
    const families = resolveServiceKeywordFamilies({
      businessName: "Garrison Orthodontics",
      serviceList: [],
      gscTopQueries: [gsc("garrison orthodontics"), gsc("orthodontist near me"), gsc("invisalign millburn")],
    });
    const keywords = families.map((f) => f.keyword);
    expect(keywords).not.toContain("garrison orthodontics"); // branded vanity — excluded
    expect(keywords).toContain("orthodontist near me"); // generic service token NOT over-excluded
    expect(keywords).toContain("invisalign millburn");
  });

  it("always includes owner-declared services, tagged as service_list", () => {
    const families = resolveServiceKeywordFamilies({
      businessName: "Garrison Orthodontics",
      serviceList: ["braces for kids"],
      gscTopQueries: [],
    });
    expect(families).toContainEqual({ keyword: "braces for kids", source: "service_list" });
  });

  it("preserves accented / non-Latin service keywords instead of mangling them (adversary #2)", () => {
    const families = resolveServiceKeywordFamilies({
      businessName: "Garrison Orthodontics",
      serviceList: ["ortodoncista para niños", "牙医", "café dentaire"],
      gscTopQueries: [],
    });
    const keywords = families.map((f) => f.keyword);
    expect(keywords).toContain("ortodoncista para niños"); // ñ survives, not "ni os"
    expect(keywords).toContain("牙医"); // CJK survives, not dropped
    expect(keywords).toContain("café dentaire"); // é survives, not "caf"
  });

  it("excludes the exact full business name even when the name has no distinctive token (adversary #5)", () => {
    const families = resolveServiceKeywordFamilies({
      businessName: "Family Dental Care", // all generic tokens → no distinctive token
      serviceList: [],
      gscTopQueries: [
        { key: "family dental care", impressions: 500, clicks: 0, ctr: 0, position: 0 },
        { key: "dentist near me", impressions: 100, clicks: 0, ctr: 0, position: 0 },
      ],
    });
    const keywords = families.map((f) => f.keyword);
    expect(keywords).not.toContain("family dental care"); // exact-name vanity excluded
    expect(keywords).toContain("dentist near me"); // real service demand kept
  });

  it("returns empty when there is no demand and no services (honest skip)", () => {
    const families = resolveServiceKeywordFamilies({
      businessName: "Garrison Orthodontics",
      serviceList: [],
      gscTopQueries: [],
    });
    expect(families).toEqual([]);
  });

  it("caps the keyword count (cost knob) and de-dupes", () => {
    const many = Array.from({ length: 12 }, (_, i) => gsc(`service ${i}`));
    const families = resolveServiceKeywordFamilies({
      businessName: "Acme Co",
      serviceList: ["service 0"], // duplicate of a gsc query after normalization
      gscTopQueries: many,
    });
    expect(families.length).toBeLessThanOrEqual(MAX_KEYWORD_FAMILIES);
    const unique = new Set(families.map((f) => f.keyword));
    expect(unique.size).toBe(families.length);
  });
});

// ── runner (injected fake provider) ──────────────────────────────────

describe("runFindabilitySensorScan — injectable, honest, isolated", () => {
  it("samples the grid, persists one snapshot per keyword, maps states honestly", async () => {
    // Provider returns top-3 for every pin → SoLV 100 over a full 3x3 grid.
    const provider = vi.fn(async () => okResult(2));
    const summary = await runFindabilitySensorScan({
      ...SCAN_BASE,
      keywordFamilies: [{ keyword: "orthodontist near me", source: "gsc_demand" }],
      provider,
    });

    expect(provider).toHaveBeenCalledTimes(9); // 3x3 grid
    expect(summary.written).toHaveLength(1);
    expect(summary.written[0]).toMatchObject({ keyword: "orthodontist near me", solvPercent: 100, coverage: 1 });
    expect(upsertReading).toHaveBeenCalledTimes(1);
    const persisted = upsertReading.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted).toMatchObject({
      organization_id: 1,
      location_id: 42,
      keyword: "orthodontist near me",
      run_date: "2026-07-15",
      solv_percent: 100,
    });
    // per-pin raw persisted for the future map
    expect((persisted.per_pin as unknown[]).length).toBe(9);
  });

  it("isolates a single failed pin as unknown and keeps sampling", async () => {
    let call = 0;
    const provider = vi.fn(async () => {
      call += 1;
      if (call === 2) throw new Error("boom"); // one pin throws
      return okResult(1);
    });
    const summary = await runFindabilitySensorScan({
      ...SCAN_BASE,
      keywordFamilies: [{ keyword: "invisalign", source: "gsc_demand" }],
      provider,
    });
    expect(summary.written).toHaveLength(1);
    const persisted = upsertReading.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted.unknown_pins).toBe(1); // the thrown pin
    expect(persisted.known_pins).toBe(8); // the rest still counted
    expect(persisted.coverage as number).toBeLessThan(1);
  });

  it("SKIPS (never persists a fabricated zero) when every pin errors", async () => {
    const provider = vi.fn(async () => apiErrorResult());
    const summary = await runFindabilitySensorScan({
      ...SCAN_BASE,
      keywordFamilies: [{ keyword: "dentist", source: "gsc_demand" }],
      provider,
    });
    expect(summary.written).toHaveLength(0);
    expect(summary.skipped).toEqual([{ keyword: "dentist", reason: "no_known_pins" }]);
    expect(upsertReading).not.toHaveBeenCalled(); // nothing fabricated
  });

  it("distinguishes not_in_top_20 (honest not-ranking, SoLV 0) from api_error (skip)", async () => {
    const provider = vi.fn(async () => notInTopResult());
    const summary = await runFindabilitySensorScan({
      ...SCAN_BASE,
      keywordFamilies: [{ keyword: "endodontist", source: "gsc_demand" }],
      provider,
    });
    expect(summary.written).toHaveLength(1);
    const persisted = upsertReading.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted.solv_percent).toBe(0); // real zero — we looked, you weren't there
    expect(persisted.known_pins).toBe(9);
    expect(persisted.unknown_pins).toBe(0);
  });

  it("treats a malformed 'ok' with position 0 as unknown, never a fabricated top-3 (adversary #3)", async () => {
    const provider = vi.fn(async () => okResult(0)); // status ok but position 0
    const summary = await runFindabilitySensorScan({
      ...SCAN_BASE,
      keywordFamilies: [{ keyword: "dentist", source: "gsc_demand" }],
      provider,
    });
    // Every pin is unknown → no known pins → honest skip, nothing fabricated.
    expect(summary.written).toHaveLength(0);
    expect(summary.skipped).toEqual([{ keyword: "dentist", reason: "no_known_pins" }]);
    expect(upsertReading).not.toHaveBeenCalled();
  });

  it("does nothing when there are no tracked keywords", async () => {
    const provider = vi.fn(async () => okResult(1));
    const summary = await runFindabilitySensorScan({
      ...SCAN_BASE,
      keywordFamilies: [],
      provider,
    });
    expect(summary.written).toHaveLength(0);
    expect(provider).not.toHaveBeenCalled();
    expect(upsertReading).not.toHaveBeenCalled();
  });

  it("isolates a keyword whose persist throws, so others still get written (reason 'error')", async () => {
    // Persistence fails for the first keyword only — exercises the outer
    // per-keyword try/catch (reason "error"), distinct from the per-pin path.
    upsertReading.mockImplementationOnce(async () => {
      throw new Error("db write blew up");
    });
    const provider = vi.fn(async () => okResult(1));
    const summary = await runFindabilitySensorScan({
      ...SCAN_BASE,
      keywordFamilies: [
        { keyword: "bad", source: "gsc_demand" },
        { keyword: "good", source: "gsc_demand" },
      ],
      provider,
    });
    expect(summary.written.map((w) => w.keyword)).toEqual(["good"]);
    expect(summary.skipped).toEqual([{ keyword: "bad", reason: "error" }]);
  });

  it("isolates a keyword whose every pin errors (reason 'no_known_pins'), others still written", async () => {
    const provider = vi.fn(async (query: string) => {
      if (query === "bad") return apiErrorResult();
      return okResult(1);
    });
    const summary = await runFindabilitySensorScan({
      ...SCAN_BASE,
      keywordFamilies: [
        { keyword: "bad", source: "gsc_demand" },
        { keyword: "good", source: "gsc_demand" },
      ],
      provider,
    });
    expect(summary.written.map((w) => w.keyword)).toEqual(["good"]);
    expect(summary.skipped).toEqual([{ keyword: "bad", reason: "no_known_pins" }]);
  });

  it("skips honestly (empty grid) when the business has no geo", async () => {
    const provider = vi.fn(async () => okResult(1));
    const summary = await runFindabilitySensorScan({
      ...SCAN_BASE,
      center: { lat: NaN, lng: NaN },
      keywordFamilies: [{ keyword: "dentist", source: "gsc_demand" }],
      provider,
    });
    expect(summary.skipped).toEqual([{ keyword: "dentist", reason: "empty_grid" }]);
    expect(provider).not.toHaveBeenCalled();
    expect(upsertReading).not.toHaveBeenCalled();
  });

  it("supports a dry run (persist:false) that aggregates without writing", async () => {
    const provider = vi.fn(async () => okResult(1));
    const summary = await runFindabilitySensorScan({
      ...SCAN_BASE,
      keywordFamilies: [{ keyword: "dentist", source: "gsc_demand" }],
      provider,
      persist: false,
    });
    expect(summary.written).toHaveLength(1);
    expect(upsertReading).not.toHaveBeenCalled();
  });
});
