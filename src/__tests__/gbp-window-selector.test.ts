import { describe, expect, it } from "vitest";

import { DAILY_TRAILING_WINDOW_DAYS } from "../config/dailyAgents";
import {
  getDailyDates,
  getDailyTrailingWindow,
} from "../controllers/agents/feature-utils/dateHelpers";
import {
  collectCoveredDays,
  IMPRESSION_METRICS,
  INTERACTION_METRICS,
  metricValue,
  selectRecentDaysWithData,
} from "../controllers/agents/feature-utils/gbpWindowSelector";
import { buildProoflinePayload, flattenDailyGbpData } from "../controllers/agents/feature-services/service.agent-input-builder";

/**
 * Zero-Maps trailing-window fix (plans/07202026-zero-maps-fix, T1–T3).
 *
 * The bug: the daily agent fetched exactly yesterday and the day before. The
 * GBP Performance API trails several days, so those dates were absent from the
 * response, `datedValues` was empty, and summing an empty array reported `0`.
 * A live practice's Get Found number — the top funnel gate — read zero for
 * months.
 *
 * The rule these tests defend: a date with an ENTRY is data (even a zero one);
 * a date with NO entry is unknown. Never conflate them.
 */

/** Build a GBP response covering the given per-date values for one metric set. */
function gbpResponse(
  perDate: Array<{ date: string; maps?: number; search?: number; omitValue?: boolean }>,
): unknown {
  const dv = (d: { date: string; n?: number; omitValue?: boolean }) => {
    const [year, month, day] = d.date.split("-").map(Number);
    return d.omitValue
      ? { date: { year, month, day } } // `value` omitted = a reported ZERO day
      : { date: { year, month, day }, value: String(d.n ?? 0) };
  };

  return {
    gbpData: {
      locations: [
        {
          data: {
            performance: {
              series: [
                {
                  dailyMetricTimeSeries: [
                    {
                      dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
                      timeSeries: {
                        datedValues: perDate.map((p) =>
                          dv({ date: p.date, n: p.maps, omitValue: p.omitValue }),
                        ),
                      },
                    },
                    {
                      dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
                      timeSeries: {
                        datedValues: perDate.map((p) =>
                          dv({ date: p.date, n: p.search, omitValue: p.omitValue }),
                        ),
                      },
                    },
                  ],
                },
              ],
            },
            profile: { title: "Test Practice" },
            reviews: { allTime: { totalReviewCount: 10, averageRating: 4.8 } },
          },
        },
      ],
    },
  };
}

// =====================================================================
// T1 — the trailing-window helper
// =====================================================================

describe("T1 getDailyTrailingWindow", () => {
  it("spans the configured number of days, ending yesterday", () => {
    const w = getDailyTrailingWindow("2026-07-22");
    expect(w.endDate).toBe("2026-07-21");
    expect(w.startDate).toBe("2026-07-15"); // 7 days inclusive of the end date
  });

  it("takes the window size from the named config constant, not a literal", () => {
    const w = getDailyTrailingWindow("2026-07-22", DAILY_TRAILING_WINDOW_DAYS);
    expect(w).toEqual(getDailyTrailingWindow("2026-07-22"));
    expect(DAILY_TRAILING_WINDOW_DAYS).toBeGreaterThan(4); // must clear the ~3–4 day lag
  });

  it("honours an explicit window size", () => {
    const w = getDailyTrailingWindow("2026-07-22", 3);
    expect(w.startDate).toBe("2026-07-19");
    expect(w.endDate).toBe("2026-07-21");
  });

  it("crosses a month boundary", () => {
    const w = getDailyTrailingWindow("2026-07-03");
    expect(w.endDate).toBe("2026-07-02");
    expect(w.startDate).toBe("2026-06-26");
  });

  it("leaves getDailyDates' shape intact (blast-radius mitigation)", () => {
    expect(getDailyDates("2026-07-22")).toEqual({
      yesterday: "2026-07-21",
      dayBeforeYesterday: "2026-07-20",
    });
  });
});

// =====================================================================
// T2 — the selector
// =====================================================================

describe("T2 selectRecentDaysWithData", () => {
  it("THE FIXTURE: last 2 days empty, day-4 has data → resolves to day-4", () => {
    // Exactly the production shape: the API simply does not return the newest
    // dates yet. The old code asked for 07-21 alone, got nothing, and said 0.
    const data = gbpResponse([
      { date: "2026-07-16", maps: 40, search: 11 },
      { date: "2026-07-17", maps: 55, search: 12 },
      { date: "2026-07-18", maps: 63, search: 14 },
    ]);

    const days = selectRecentDaysWithData(data, 2);

    expect(days).toHaveLength(2);
    expect(days[0].date).toBe("2026-07-18");
    expect(metricValue(days[0], "BUSINESS_IMPRESSIONS_DESKTOP_MAPS")).toBe(63);
    expect(days[1].date).toBe("2026-07-17");
    expect(metricValue(days[1], "BUSINESS_IMPRESSIONS_DESKTOP_MAPS")).toBe(55);
  });

  it("orders newest-first regardless of the order the API returned", () => {
    const data = gbpResponse([
      { date: "2026-07-18", maps: 63 },
      { date: "2026-07-16", maps: 40 },
      { date: "2026-07-17", maps: 55 },
    ]);
    expect(collectCoveredDays(data).map((d) => d.date)).toEqual([
      "2026-07-18",
      "2026-07-17",
      "2026-07-16",
    ]);
  });

  it("treats a reported day with `value` omitted as a REAL zero, not missing", () => {
    // This is the distinction the whole fix rests on: the entry exists, so the
    // day reported; the omitted value means zero interactions.
    const data = gbpResponse([
      { date: "2026-07-17", maps: 55 },
      { date: "2026-07-18", omitValue: true },
    ]);

    const days = selectRecentDaysWithData(data, 1);
    expect(days[0].date).toBe("2026-07-18");
    expect(metricValue(days[0], "BUSINESS_IMPRESSIONS_DESKTOP_MAPS")).toBe(0);
  });

  it("returns nothing when the window is genuinely empty — the 'no recent data' signal", () => {
    expect(selectRecentDaysWithData(gbpResponse([]), 2)).toEqual([]);
    expect(selectRecentDaysWithData({}, 2)).toEqual([]);
    expect(selectRecentDaysWithData(null, 2)).toEqual([]);
  });

  it("drops entries whose date cannot be read rather than guessing a day", () => {
    const data = {
      gbpData: {
        locations: [
          {
            data: {
              performance: {
                series: [
                  {
                    dailyMetricTimeSeries: [
                      {
                        dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
                        timeSeries: {
                          datedValues: [
                            { value: "99" }, // no date at all
                            { date: { year: 2026, month: 7, day: 18 }, value: "63" },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    };
    const days = selectRecentDaysWithData(data, 5);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-07-18");
  });
});

// =====================================================================
// T3 — payload and stored shape stay honest
// =====================================================================

describe("T3 payload distinguishes '0 interactions' from 'no recent data'", () => {
  const window = { startDate: "2026-07-15", endDate: "2026-07-21" };

  it("reports the resolved day and ITS date, not the date we asked for", () => {
    const data = gbpResponse([
      { date: "2026-07-17", maps: 55, search: 12 },
      { date: "2026-07-18", maps: 63, search: 14 },
    ]);
    const payload = buildProoflinePayload({
      domain: "example.com",
      googleAccountId: 1,
      window,
      impressionDays: selectRecentDaysWithData(data, 2, IMPRESSION_METRICS),
      interactionDays: selectRecentDaysWithData(data, 2, INTERACTION_METRICS),
      reviewsSince: "2026-07-20",
      windowData: data,
    });

    const period = payload.additional_data.period;
    expect(period.latest_data_date).toBe("2026-07-18");
    expect(period.previous_data_date).toBe("2026-07-17");
    expect(period.has_recent_data).toBe(true);
    // The window we asked for is reported separately — never as the data's date.
    expect(period.window_end).toBe("2026-07-21");

    const latest = payload.additional_data.visibility.latest;
    expect(latest.date).toBe("2026-07-18");
    expect(latest.impressions_maps_desktop).toBe(63);
  });

  it("says 'no recent data' rather than reporting zero impressions", () => {
    const empty = gbpResponse([]);
    const payload = buildProoflinePayload({
      domain: "example.com",
      googleAccountId: 1,
      window,
      impressionDays: selectRecentDaysWithData(empty, 2, IMPRESSION_METRICS),
      interactionDays: selectRecentDaysWithData(empty, 2, INTERACTION_METRICS),
      reviewsSince: "2026-07-20",
      windowData: empty,
    });

    expect(payload.additional_data.period.has_recent_data).toBe(false);
    expect(payload.additional_data.period.latest_data_date).toBeNull();
    // null, NOT 0 — the whole point. A 0 here is the bug.
    expect(payload.additional_data.visibility.latest).toBeNull();
    expect(payload.additional_data.engagement.latest).toBeNull();
  });

  it("still reports a genuine zero day as a measured zero", () => {
    const data = gbpResponse([{ date: "2026-07-18", omitValue: true }]);
    const payload = buildProoflinePayload({
      domain: "example.com",
      googleAccountId: 1,
      window,
      impressionDays: selectRecentDaysWithData(data, 2, IMPRESSION_METRICS),
      interactionDays: selectRecentDaysWithData(data, 2, INTERACTION_METRICS),
      reviewsSince: "2026-07-20",
      windowData: data,
    });

    expect(payload.additional_data.period.has_recent_data).toBe(true);
    expect(payload.additional_data.visibility.latest.date).toBe("2026-07-18");
    expect(payload.additional_data.visibility.latest.impressions_maps_desktop).toBe(0);
  });
});

describe("T3 stored shape keeps the dashboard's reader honest", () => {
  it("stores the resolved day's values under the keys stageReaders reads", () => {
    const data = gbpResponse([
      { date: "2026-07-17", maps: 55 },
      { date: "2026-07-18", maps: 63 },
    ]);
    const stored = flattenDailyGbpData(
      selectRecentDaysWithData(data, 2, IMPRESSION_METRICS),
      selectRecentDaysWithData(data, 2, INTERACTION_METRICS),
      data,
      "2026-07-20",
    );

    expect(stored.yesterday.data_date).toBe("2026-07-18");
    expect(stored.yesterday.visibility.impressions_maps_desktop).toBe(63);
    expect(stored.dayBefore.data_date).toBe("2026-07-17");
    expect(stored.dayBefore.visibility.impressions_maps_desktop).toBe(55);
  });

  it("OMITS visibility entirely when no day reported, so the reader sees missing, not zero", () => {
    // stageReaders' mapsImpressionsForVisibility returns null for a side with no
    // `visibility` object (missing, excluded from day-coverage) and 0 for a
    // present-but-zero one. Writing zeros here would relaunch the bug one layer
    // lower, where it is much harder to see.
    const empty = gbpResponse([]);
    const stored = flattenDailyGbpData(
      selectRecentDaysWithData(empty, 2, IMPRESSION_METRICS),
      selectRecentDaysWithData(empty, 2, INTERACTION_METRICS),
      empty,
      "2026-07-20",
    );

    expect(stored.yesterday.visibility).toBeUndefined();
    expect(stored.yesterday.data_date).toBeNull();
    expect(stored.dayBefore.visibility).toBeUndefined();
  });

  it("keeps a present-but-zero day as a present visibility object", () => {
    const data = gbpResponse([{ date: "2026-07-18", omitValue: true }]);
    const stored = flattenDailyGbpData(
      selectRecentDaysWithData(data, 2, IMPRESSION_METRICS),
      selectRecentDaysWithData(data, 2, INTERACTION_METRICS),
      data,
      "2026-07-20",
    );

    expect(stored.yesterday.visibility).toBeDefined();
    expect(stored.yesterday.visibility.impressions_maps_desktop).toBe(0);
    // Only one day reported, so the second side is honestly empty.
    expect(stored.dayBefore.visibility).toBeUndefined();
  });
});

// =====================================================================
// Cross-metric lag skew — the adversary's finding
// =====================================================================

/** A response where the interaction metrics publish AHEAD of the impressions. */
function skewedResponse(): unknown {
  const dv = (date: string, n: number) => {
    const [year, month, day] = date.split("-").map(Number);
    return { date: { year, month, day }, value: String(n) };
  };
  return {
    gbpData: {
      locations: [
        {
          data: {
            performance: {
              series: [
                {
                  dailyMetricTimeSeries: [
                    {
                      // impressions published only through 07-18
                      dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
                      timeSeries: { datedValues: [dv("2026-07-17", 55), dv("2026-07-18", 63)] },
                    },
                    {
                      // interactions published through 07-20 — two days ahead
                      dailyMetric: "CALL_CLICKS",
                      timeSeries: {
                        datedValues: [dv("2026-07-19", 3), dv("2026-07-20", 4)],
                      },
                    },
                  ],
                },
              ],
            },
            profile: { title: "Test Practice" },
            reviews: { allTime: { totalReviewCount: 10, averageRating: 4.8 } },
          },
        },
      ],
    },
  };
}

describe("cross-metric lag skew must not fabricate a zero", () => {
  /**
   * The original bug, re-entering through an assumption: if "covered" means
   * "ANY metric reported", the newest covered day is 07-20 (interactions only),
   * impressions are ABSENT for it and read 0, and we stamp a measured zero on a
   * real date — which looks verified. Each family must resolve on its own dates.
   */
  it("resolves impressions on the impressions' own newest published day", () => {
    const days = selectRecentDaysWithData(skewedResponse(), 2, IMPRESSION_METRICS);
    expect(days[0].date).toBe("2026-07-18");
    expect(metricValue(days[0], "BUSINESS_IMPRESSIONS_DESKTOP_MAPS")).toBe(63);
  });

  it("resolves interactions on their own newest day, which may be later", () => {
    const days = selectRecentDaysWithData(skewedResponse(), 2, INTERACTION_METRICS);
    expect(days[0].date).toBe("2026-07-20");
    expect(metricValue(days[0], "CALL_CLICKS")).toBe(4);
  });

  it("never reports zero impressions for an interactions-only day", () => {
    const data = skewedResponse();
    const payload = buildProoflinePayload({
      domain: "example.com",
      googleAccountId: 1,
      window: { startDate: "2026-07-15", endDate: "2026-07-21" },
      impressionDays: selectRecentDaysWithData(data, 2, IMPRESSION_METRICS),
      interactionDays: selectRecentDaysWithData(data, 2, INTERACTION_METRICS),
      reviewsSince: "2026-07-20",
      windowData: data,
    });

    const latest = payload.additional_data.visibility.latest;
    expect(latest.date).toBe("2026-07-18");
    expect(latest.impressions_maps_desktop).toBe(63);
    // The interactions-only day must never appear as an impressions date.
    expect(latest.date).not.toBe("2026-07-20");
    expect(payload.additional_data.engagement.latest.date).toBe("2026-07-20");
  });

  it("stores the impressions day as the row's date, not the interactions day", () => {
    const data = skewedResponse();
    const stored = flattenDailyGbpData(
      selectRecentDaysWithData(data, 2, IMPRESSION_METRICS),
      selectRecentDaysWithData(data, 2, INTERACTION_METRICS),
      data,
      "2026-07-20",
    );
    expect(stored.yesterday.data_date).toBe("2026-07-18");
    expect(stored.yesterday.visibility.impressions_maps_desktop).toBe(63);
    expect(stored.yesterday.engagement.data_date).toBe("2026-07-20");
  });
});

describe("the review window keeps its pre-change meaning", () => {
  function withReviews(details: unknown[]): unknown {
    return {
      gbpData: {
        locations: [
          {
            data: {
              performance: { series: [] },
              profile: { title: "Test Practice" },
              reviews: {
                allTime: { totalReviewCount: 10, averageRating: 4.8 },
                window: { reviewDetails: details },
              },
            },
          },
        ],
      },
    };
  }

  it("drops reviews older than the 2-day cutoff the 7-day fetch dragged in", () => {
    const data = withReviews([
      { createdAt: "2026-07-16T10:00:00Z", comment: "old, inside the 7-day fetch" },
      { createdAt: "2026-07-20T10:00:00Z", comment: "genuinely new" },
      { createdAt: "2026-07-21T10:00:00Z", comment: "genuinely new" },
    ]);
    const payload = buildProoflinePayload({
      domain: "example.com",
      googleAccountId: 1,
      window: { startDate: "2026-07-15", endDate: "2026-07-21" },
      impressionDays: [],
      interactionDays: [],
      reviewsSince: "2026-07-20",
      windowData: data,
    });
    expect(payload.additional_data.reviews.newReviews).toHaveLength(2);
  });

  it("keeps a review whose date cannot be read rather than dropping a real one", () => {
    const data = withReviews([{ comment: "no createdAt" }]);
    const payload = buildProoflinePayload({
      domain: "example.com",
      googleAccountId: 1,
      window: { startDate: "2026-07-15", endDate: "2026-07-21" },
      impressionDays: [],
      interactionDays: [],
      reviewsSince: "2026-07-20",
      windowData: data,
    });
    expect(payload.additional_data.reviews.newReviews).toHaveLength(1);
  });
});
