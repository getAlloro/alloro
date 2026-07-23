/**
 * Clarity metric extraction — rage clicks and scroll depth.
 *
 * The fixtures below are the real shapes returned by project-live-insights,
 * captured from a live call on 2026-07-22. The load-bearing case is the null
 * scroll depth: Clarity reports `averageScrollDepth: null` when it has no
 * reading, and turning that into 0 would invent a measurement that points the
 * wrong way.
 */

import { describe, it, expect } from "vitest";
import { extractMetrics } from "../controllers/clarity/feature-utils/util.clarity-metrics-extraction";
import { aggregateMetrics } from "../controllers/clarity/feature-services/service.clarity-metrics";
import type { IClarityData } from "../models/ClarityDataModel";

/** Real response shape, values substituted. */
const payload = (over: {
  sessions?: string;
  dead?: string;
  rage?: string;
  quickbackPct?: number;
  scroll?: number | null;
}) => [
  {
    metricName: "Traffic",
    information: [
      {
        totalSessionCount: over.sessions ?? "0",
        totalBotSessionCount: "0",
        distinctUserCount: "0",
        pagesPerSessionPercentage: null,
      },
    ],
  },
  {
    metricName: "DeadClickCount",
    information: [
      {
        sessionsCount: "0",
        sessionsWithMetricPercentage: 0,
        sessionsWithoutMetricPercentage: 100,
        pagesViews: "0",
        subTotal: over.dead ?? "0",
      },
    ],
  },
  {
    metricName: "RageClickCount",
    information: [
      {
        sessionsCount: "0",
        sessionsWithMetricPercentage: 0,
        sessionsWithoutMetricPercentage: 100,
        pagesViews: "0",
        subTotal: over.rage ?? "0",
      },
    ],
  },
  {
    metricName: "QuickbackClick",
    information: [
      {
        sessionsCount: "0",
        sessionsWithMetricPercentage: over.quickbackPct ?? 0,
        sessionsWithoutMetricPercentage: 100,
        pagesViews: "0",
        subTotal: "0",
      },
    ],
  },
  {
    metricName: "ScrollDepth",
    information: [
      { averageScrollDepth: over.scroll === undefined ? null : over.scroll },
    ],
  },
];

const row = (data: unknown): IClarityData =>
  ({ domain: "d", report_date: "2026-07-01", data, created_at: new Date() }) as
    IClarityData;

describe("extractMetrics — rage clicks", () => {
  it("reads RageClickCount.subTotal alongside the existing metrics", () => {
    const m = extractMetrics(
      payload({ sessions: "120", dead: "7", rage: "13", quickbackPct: 40 }),
    );
    expect(m.rageClicks).toBe(13);
    // Pre-existing metrics are untouched.
    expect(m.sessions).toBe(120);
    expect(m.deadClicks).toBe(7);
    expect(m.bounceRate).toBeCloseTo(0.4);
  });

  it("reports zero rage clicks when the metric is absent", () => {
    const m = extractMetrics([{ metricName: "Traffic", information: [{}] }]);
    expect(m.rageClicks).toBe(0);
  });
});

describe("extractMetrics — scroll depth honesty", () => {
  it("preserves a null reading as null rather than reporting 0%", () => {
    const m = extractMetrics(payload({ scroll: null }));
    expect(m.scrollDepth).toBeNull();
    expect(m.scrollDepth).not.toBe(0);
  });

  it("reads a real reading through", () => {
    const m = extractMetrics(payload({ scroll: 62.5 }));
    expect(m.scrollDepth).toBe(62.5);
  });

  it("distinguishes a genuine 0% from no reading at all", () => {
    expect(extractMetrics(payload({ scroll: 0 })).scrollDepth).toBe(0);
    expect(extractMetrics(payload({ scroll: null })).scrollDepth).toBeNull();
  });

  it("returns null when the ScrollDepth metric is missing entirely", () => {
    const m = extractMetrics([{ metricName: "Traffic", information: [{}] }]);
    expect(m.scrollDepth).toBeNull();
  });
});

describe("aggregateMetrics — monthly rollup", () => {
  it("sums rage clicks and averages only the days that carried a reading", () => {
    const rows = [
      row(payload({ rage: "3", scroll: 40 })),
      row(payload({ rage: "5", scroll: null })), // skipped, not counted as 0
      row(payload({ rage: "2", scroll: 60 })),
    ];
    const m = aggregateMetrics(rows);

    expect(m.rageClicks).toBe(10);
    expect(m.scrollDepth).toBe(50); // (40 + 60) / 2, not (40 + 0 + 60) / 3
  });

  it("reports null scroll depth for a month with no readings at all", () => {
    const m = aggregateMetrics([
      row(payload({ scroll: null })),
      row(payload({ scroll: null })),
    ]);
    expect(m.scrollDepth).toBeNull();
  });

  it("parses rows stored as JSON strings", () => {
    const m = aggregateMetrics([
      row(JSON.stringify(payload({ rage: "4", scroll: 30 }))),
    ]);
    expect(m.rageClicks).toBe(4);
    expect(m.scrollDepth).toBe(30);
  });
});
