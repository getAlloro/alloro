import { describe, it, expect } from "vitest";
import { summarizeNapConsistency } from "../services/nap-consistency/summarizer";
import {
  executeNapConsistencyAgent,
  dedupeTargetsByLocation,
  NapTarget,
} from "../services/nap-consistency/executor";
import { RecordNapObservationInput } from "../models/NapConsistencyObservationModel";

/**
 * Alloro Funnel Engine A4 (Citations & NAP Consistency Monitor) proofs. Locks the
 * pure summarizer (only real 'conflicting' counts as a conflict) and the executor
 * (per-location run + persist, no-baseline skip, honest 0-sources record, and
 * per-location failure isolation) — all without network or DB via injected seams.
 */

describe("summarizeNapConsistency", () => {
  it("counts consistent and only 'conflicting' as conflicts, and lists them", () => {
    const s = summarizeNapConsistency([
      { url: "https://yelp.com/x", sourceHost: "yelp.com", entityMatchState: "consistent" },
      { url: "https://healthgrades.com/x", sourceHost: "healthgrades.com", entityMatchState: "conflicting" },
      { url: "https://maps.google.com/x", sourceHost: "maps.google.com", entityMatchState: "ambiguous_entity" },
    ]);
    expect(s.sourcesChecked).toBe(3);
    expect(s.consistentCount).toBe(1);
    expect(s.conflictCount).toBe(1);
    expect(s.conflicts).toEqual([
      { source: "https://healthgrades.com/x", sourceHost: "healthgrades.com", matchState: "conflicting" },
    ]);
  });
  it("does not count weak/uncertain states as conflicts", () => {
    const s = summarizeNapConsistency([
      { url: "a", sourceHost: "a", entityMatchState: "external_candidate" },
      { url: "b", sourceHost: "b", entityMatchState: "missing_on_site" },
    ]);
    expect(s.conflictCount).toBe(0);
  });
  it("empty / nullish → all zeros", () => {
    const zero = { sourcesChecked: 0, consistentCount: 0, conflictCount: 0, conflicts: [] };
    expect(summarizeNapConsistency([])).toEqual(zero);
    expect(summarizeNapConsistency(null)).toEqual(zero);
  });
});

describe("dedupeTargetsByLocation (adversary regression: >1 connection per org)", () => {
  it("keeps one target per locationId (no double SerpApi cost / over-count)", () => {
    const dupes: NapTarget[] = [
      { organizationId: 5, locationId: 50, domain: "a.com" },
      { organizationId: 5, locationId: 50, domain: "a.com" }, // same location via a 2nd connection
      { organizationId: 5, locationId: 51, domain: "b.com" },
    ];
    const out = dedupeTargetsByLocation(dupes);
    expect(out.map((t) => t.locationId)).toEqual([50, 51]);
  });
});

describe("executeNapConsistencyAgent", () => {
  const targets: NapTarget[] = [
    { organizationId: 1, locationId: 10, domain: "a.com" },
    { organizationId: 1, locationId: 11, domain: "b.com" },
    { organizationId: 2, locationId: 20, domain: null }, // no baseline → skip
  ];

  it("records a snapshot per runnable location and skips no-baseline targets", async () => {
    const recorded: RecordNapObservationInput[] = [];
    const res = await executeNapConsistencyAgent({
      targetProvider: async () => targets,
      runner: async (t) =>
        t.domain
          ? [
              { url: `https://yelp.com/${t.locationId}`, sourceHost: "yelp.com", entityMatchState: "consistent" },
              { url: `https://hg.com/${t.locationId}`, sourceHost: "hg.com", entityMatchState: "conflicting" },
            ]
          : null,
      record: async (i) => {
        recorded.push(i);
      },
      runDate: "2026-07-15",
      observedAt: new Date("2026-07-15T00:00:00Z"),
    });
    expect(res.summary.targets).toBe(3);
    expect(res.summary.locationsRecorded).toBe(2);
    expect(res.summary.skipped).toBe(1);
    expect(res.summary.totalConflicts).toBe(2);
    expect(recorded).toHaveLength(2);
    expect(recorded[0].conflictCount).toBe(1);
    expect(recorded[0].sourcesChecked).toBe(2);
  });

  it("isolates a location failure — one throw doesn't abort the run", async () => {
    const recorded: RecordNapObservationInput[] = [];
    const res = await executeNapConsistencyAgent({
      targetProvider: async () => [targets[0], targets[1]],
      runner: async (t) => {
        if (t.locationId === 10) throw new Error("fetch failed");
        return []; // ran, found no external sources
      },
      record: async (i) => {
        recorded.push(i);
      },
      runDate: "2026-07-15",
      observedAt: new Date(),
    });
    expect(res.summary.skipped).toBe(1);
    expect(res.summary.locationsRecorded).toBe(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].sourcesChecked).toBe(0); // honest "0 sources checked"
  });
});
