import { describe, expect, it } from "vitest";
import {
  buildGbpImpressionsDiagnostic,
  summarizeGbpImpressionsDiagnostic,
  IMPRESSION_METRICS,
} from "../controllers/agents/feature-utils/gbpImpressionsDiagnostic";

/**
 * Build a GBP service result fixture in the exact nested shape produced by
 * fetchAllServiceData → getGBPAIReadyData:
 *   data.gbpData.locations[0].data.performance.series[]
 *     .dailyMetricTimeSeries[].timeSeries.datedValues[]
 */
function fixture(
  seriesByMetric: Record<string, Array<{ date?: { year: number; month: number; day: number }; value?: string }>>,
) {
  const dailyMetricTimeSeries = Object.entries(seriesByMetric).map(
    ([dailyMetric, datedValues]) => ({
      dailyMetric,
      timeSeries: { datedValues },
    }),
  );
  return {
    gbpData: {
      locations: [
        {
          locationId: "loc-1",
          data: { performance: { series: [{ dailyMetricTimeSeries }] } },
        },
      ],
    },
  };
}

const d = (year: number, month: number, day: number) => ({ year, month, day });

describe("buildGbpImpressionsDiagnostic", () => {
  it("captures per-date values and totals for a present metric", () => {
    const data = fixture({
      BUSINESS_IMPRESSIONS_DESKTOP_MAPS: [
        { date: d(2026, 7, 15), value: "12" },
        { date: d(2026, 7, 16), value: "8" },
      ],
    });

    const diag = buildGbpImpressionsDiagnostic(data, "yesterday 2026-07-16");
    const maps = diag.metrics.find(
      (m) => m.metric === "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
    )!;

    expect(maps.present).toBe(true);
    expect(maps.total).toBe(20);
    expect(maps.datedValues).toEqual([
      { date: "2026-07-15", value: 12 },
      { date: "2026-07-16", value: 8 },
    ]);
    expect(diag.window).toBe("yesterday 2026-07-16");
    expect(diag.locationCount).toBe(1);
    expect(diag.hasPerformanceSeries).toBe(true);
  });

  it("distinguishes a present-but-empty recent day (the hypothesis) — value omitted counts as 0, series still present", () => {
    // The API omits `value` on a zero/no-interaction day. present=true means the
    // metric IS reported for this date; total 0 is a real-but-empty day, NOT
    // 'metric missing'.
    const data = fixture({
      BUSINESS_IMPRESSIONS_DESKTOP_MAPS: [{ date: d(2026, 7, 19) }],
    });

    const maps = buildGbpImpressionsDiagnostic(data, "yesterday").metrics.find(
      (m) => m.metric === "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
    )!;

    expect(maps.present).toBe(true);
    expect(maps.total).toBe(0);
    expect(maps.datedValues).toEqual([{ date: "2026-07-19", value: 0 }]);
  });

  it("marks a metric absent from the series as present=false with no dated values", () => {
    const data = fixture({
      BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: [{ date: d(2026, 7, 15), value: "5" }],
    });

    const maps = buildGbpImpressionsDiagnostic(data, "w").metrics.find(
      (m) => m.metric === "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
    )!;

    expect(maps.present).toBe(false);
    expect(maps.total).toBe(0);
    expect(maps.datedValues).toEqual([]);
  });

  it("always reports all four impression metrics", () => {
    const diag = buildGbpImpressionsDiagnostic(fixture({}), "w");
    expect(diag.metrics.map((m) => m.metric)).toEqual([...IMPRESSION_METRICS]);
  });

  it("reports no performance series and zero locations for empty/garbage input", () => {
    for (const bad of [null, undefined, {}, { gbpData: {} }, "nope", 42]) {
      const diag = buildGbpImpressionsDiagnostic(bad, "w");
      expect(diag.hasPerformanceSeries).toBe(false);
      expect(diag.metrics.every((m) => !m.present && m.total === 0)).toBe(true);
    }
    expect(buildGbpImpressionsDiagnostic({}, "w").locationCount).toBe(0);
    expect(buildGbpImpressionsDiagnostic(fixture({}), "w").locationCount).toBe(1);
  });

  it("treats a non-numeric value string as 0 rather than NaN", () => {
    const data = fixture({
      BUSINESS_IMPRESSIONS_MOBILE_MAPS: [{ date: d(2026, 7, 15), value: "oops" }],
    });
    const m = buildGbpImpressionsDiagnostic(data, "w").metrics.find(
      (x) => x.metric === "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
    )!;
    expect(m.total).toBe(0);
    expect(m.datedValues[0].value).toBe(0);
  });

  it("emits null date when the date object is missing or malformed", () => {
    const data = fixture({
      BUSINESS_IMPRESSIONS_MOBILE_SEARCH: [{ value: "3" }],
    });
    const m = buildGbpImpressionsDiagnostic(data, "w").metrics.find(
      (x) => x.metric === "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
    )!;
    expect(m.datedValues).toEqual([{ date: null, value: 3 }]);
  });
});

describe("summarizeGbpImpressionsDiagnostic", () => {
  it("renders a header plus one line per metric with per-date detail", () => {
    const data = fixture({
      BUSINESS_IMPRESSIONS_DESKTOP_MAPS: [
        { date: d(2026, 7, 15), value: "12" },
        { date: d(2026, 7, 16), value: "8" },
      ],
    });
    const out = summarizeGbpImpressionsDiagnostic(
      buildGbpImpressionsDiagnostic(data, "yesterday 2026-07-16"),
    );

    expect(out).toContain("[GBP-IMPRESSIONS-DIAG]");
    expect(out).toContain("window=yesterday 2026-07-16");
    expect(out).toContain("perfSeries=yes");
    expect(out).toContain("BUSINESS_IMPRESSIONS_DESKTOP_MAPS: present=yes total=20");
    expect(out).toContain("2026-07-15=12");
    // A metric with no series prints the empty marker.
    expect(out).toContain("BUSINESS_IMPRESSIONS_MOBILE_SEARCH: present=no total=0 [(no datedValues)]");
  });
});
