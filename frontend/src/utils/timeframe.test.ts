import { describe, it, expect } from "vitest";
import {
  windowLabel,
  formatDataMonth,
  formatDataMonthShort,
  monthSortValue,
  currentMonthLabel,
} from "./timeframe";

// Pure-util regression anchor — the timeframe formatters are the single source
// of truth for how every dashboard surface labels time, so they earn a test.
describe("timeframe", () => {
  it("windowLabel spells out rolling windows and falls back to the raw key", () => {
    expect(windowLabel("90d")).toBe("3 Months");
    expect(windowLabel("28d")).toBe("28 Days");
    expect(windowLabel("mystery")).toBe("mystery");
  });

  it("formatDataMonth turns a YYYY-MM key into a named month", () => {
    expect(formatDataMonth("2026-04")).toBe("April 2026");
    expect(formatDataMonth("")).toBe("");
  });

  // Regression guard for the "upload May → shows April" bug: the old
  // `new Date("2026-05-01")` UTC-parse rendered the prior month for US
  // (negative-offset) users. These formatters build the label from parseYM +
  // a name array and never construct a Date from the key, so the month they
  // return is the key's own month in ANY timezone — never shifted.
  it("formatDataMonth/Short map the key's own month, never a timezone-shifted one", () => {
    expect(formatDataMonth("2026-05")).toBe("May 2026");
    expect(formatDataMonthShort("2026-05")).toBe("May 2026");
    expect(formatDataMonth("2026-01")).toBe("January 2026");
    expect(formatDataMonthShort("2026-12")).toBe("Dec 2026");
    expect(formatDataMonthShort("")).toBe("");
  });

  it("monthSortValue orders months chronologically", () => {
    expect(monthSortValue("2026-01")).toBe(202601);
    expect(monthSortValue("2026-04")).toBeGreaterThan(monthSortValue("2026-01"));
  });

  it("currentMonthLabel labels the injected date in UTC", () => {
    expect(currentMonthLabel(new Date("2026-06-15T12:00:00Z"))).toBe("June 2026");
  });
});
