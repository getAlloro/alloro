import { describe, expect, it } from "vitest";

import type { OwnerReceiptActionItem } from "../../../api/ownerReceipt";
import {
  addDays,
  buildWindowPresets,
  daysInclusive,
  deriveAdjacentWindows,
  deriveWindowsFromPost,
  filterActionItems,
  isoDayLocal,
  isValidIsoDay,
  matchPresetId,
  windowsEqual,
} from "./ownerReceiptControls";

/**
 * The pure control logic behind the Owner Receipt transparency controls.
 *
 * The controls' whole point is honesty: the owner picks the window and watches
 * the number recompute. So the arithmetic that turns a choice into two fair,
 * equal-length windows must be exact and deterministic — no clock inside a pure
 * function, adjacency and equal length guaranteed, invalid ranges rejected
 * rather than silently querying a broken pair.
 */
describe("date helpers", () => {
  it("isoDayLocal reads a Date in the local calendar", () => {
    // Constructed from local parts, so this is stable regardless of the runner's TZ.
    expect(isoDayLocal(new Date(2026, 6, 4))).toBe("2026-07-04");
    expect(isoDayLocal(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("addDays does exact UTC day math across month and year boundaries", () => {
    expect(addDays("2026-07-24", 1)).toBe("2026-07-25");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
  });

  it("isValidIsoDay rejects malformed and impossible days", () => {
    expect(isValidIsoDay("2026-07-24")).toBe(true);
    expect(isValidIsoDay("2026-02-30")).toBe(false);
    expect(isValidIsoDay("2026-7-4")).toBe(false);
    expect(isValidIsoDay("")).toBe(false);
    expect(isValidIsoDay("not-a-day")).toBe(false);
  });

  it("daysInclusive counts both ends and rejects reversed/invalid ranges", () => {
    expect(daysInclusive("2026-07-01", "2026-07-28")).toBe(28);
    expect(daysInclusive("2026-07-24", "2026-07-24")).toBe(1);
    expect(daysInclusive("2026-07-28", "2026-07-01")).toBeNull(); // reversed
    expect(daysInclusive("2026-13-01", "2026-07-01")).toBeNull(); // invalid
  });
});

describe("deriveAdjacentWindows", () => {
  it("builds two equal-length windows that sit immediately back to back", () => {
    const w = deriveAdjacentWindows("2026-07-28", 28);
    expect(w.postEnd).toBe("2026-07-28");
    expect(w.postStart).toBe("2026-07-01"); // 28 inclusive days
    expect(w.preEnd).toBe("2026-06-30"); // day before post starts
    expect(w.preStart).toBe("2026-06-03"); // 28 inclusive days
    expect(daysInclusive(w.postStart, w.postEnd)).toBe(28);
    expect(daysInclusive(w.preStart, w.preEnd)).toBe(28);
    // adjacency: pre ends exactly one day before post begins
    expect(addDays(w.preEnd, 1)).toBe(w.postStart);
  });
});

describe("deriveWindowsFromPost (custom range)", () => {
  it("derives an equal-length pre window immediately before a custom post range", () => {
    const w = deriveWindowsFromPost("2026-07-10", "2026-07-24");
    expect(w).not.toBeNull();
    expect(w!.postStart).toBe("2026-07-10");
    expect(w!.postEnd).toBe("2026-07-24");
    const len = daysInclusive("2026-07-10", "2026-07-24")!; // 15
    expect(daysInclusive(w!.preStart, w!.preEnd)).toBe(len);
    expect(addDays(w!.preEnd, 1)).toBe(w!.postStart);
  });

  it("returns null for an invalid or reversed custom range", () => {
    expect(deriveWindowsFromPost("2026-07-24", "2026-07-10")).toBeNull();
    expect(deriveWindowsFromPost("2026-02-30", "2026-07-10")).toBeNull();
  });
});

describe("buildWindowPresets", () => {
  it("produces the 28- and 90-day presets ending today, longest last", () => {
    const presets = buildWindowPresets("2026-07-24");
    expect(presets.map((p) => p.id)).toEqual(["28", "90"]);
    expect(presets[0].days).toBe(28);
    expect(presets[0].windows.postEnd).toBe("2026-07-24");
    expect(presets[1].days).toBe(90);
    expect(presets[1].windows.postEnd).toBe("2026-07-24");
    // each preset's two windows are equal length
    for (const p of presets) {
      expect(daysInclusive(p.windows.postStart, p.windows.postEnd)).toBe(p.days);
      expect(daysInclusive(p.windows.preStart, p.windows.preEnd)).toBe(p.days);
    }
  });
});

describe("matchPresetId / windowsEqual", () => {
  const presets = buildWindowPresets("2026-07-24");

  it("lights up the preset whose four days match exactly", () => {
    expect(matchPresetId(presets[0].windows, presets)).toBe("28");
    expect(matchPresetId(presets[1].windows, presets)).toBe("90");
  });

  it("returns null for a custom range that matches no preset", () => {
    const custom = deriveWindowsFromPost("2026-07-10", "2026-07-20")!;
    expect(matchPresetId(custom, presets)).toBeNull();
  });

  it("windowsEqual is exact on all four bounds", () => {
    const a = presets[0].windows;
    expect(windowsEqual(a, { ...a })).toBe(true);
    expect(windowsEqual(a, { ...a, postEnd: "2026-07-23" })).toBe(false);
  });
});

describe("filterActionItems", () => {
  const label = (item: OwnerReceiptActionItem): string =>
    item.type === "review_reply" ? "Replied to a review" : "Published a post";
  const items: OwnerReceiptActionItem[] = [
    { type: "review_reply", at: "2026-07-10", workItemId: "a", locationId: 5 },
    { type: "local_post", at: "2026-07-12", workItemId: "b", locationId: 5 },
    { type: "review_reply", at: "2026-07-15", workItemId: "c", locationId: 8 },
  ];

  it("returns every item unchanged for an empty or whitespace query", () => {
    expect(filterActionItems(items, "", label)).toBe(items);
    expect(filterActionItems(items, "   ", label)).toBe(items);
  });

  it("matches case-insensitively against the on-screen label", () => {
    const replies = filterActionItems(items, "review", label);
    expect(replies.map((i) => i.workItemId)).toEqual(["a", "c"]);
    const posts = filterActionItems(items, "PUBLISHED", label);
    expect(posts.map((i) => i.workItemId)).toEqual(["b"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterActionItems(items, "zzz", label)).toEqual([]);
  });
});
