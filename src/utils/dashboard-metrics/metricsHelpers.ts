/**
 * Dashboard Metrics — Pure Helpers
 *
 * Deterministic, dependency-free helpers used by the dashboard-metrics
 * section builders: time math, numeric coercion, month enumeration, and
 * GBP time-series extraction.
 *
 * Extracted verbatim from `service.dashboard-metrics.ts` as a
 * behavior-preserving structural split (file-size ceiling). No LLM calls,
 * no DB access.
 */

export const MS_PER_HOUR = 1000 * 60 * 60;
export const MS_PER_DAY = MS_PER_HOUR * 24;

export function hoursBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / MS_PER_HOUR));
}

export function daysBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY));
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function safeIso(date: string): Date | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Extract a list of YYYY-MM month keys spanning [start, end] inclusive.
 */
export function enumerateMonthsInPeriod(start: string, end: string): string[] {
  const startDate = safeIso(start);
  const endDate = safeIso(end);
  if (!startDate || !endDate || endDate < startDate) return [];

  const months: string[] = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const stop = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cursor <= stop) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

/**
 * Sum a GBP performance metric across all locations for a metric key
 * (e.g. CALL_CLICKS, BUSINESS_DIRECTION_REQUESTS). Returns null if no
 * usable data was returned.
 *
 * The shape of `gbpData` from `fetchGBPDataForRange()` is:
 *   { locations: [{ locationId, displayName, data: { performance: { series: [...] }, ... } }] }
 */
export function sumGbpMetricFromTimeSeries(
  gbpData: any,
  metricName: string
): number | null {
  if (!gbpData || !Array.isArray(gbpData.locations)) return null;
  let total = 0;
  let sawAny = false;

  for (const loc of gbpData.locations) {
    const series = loc?.data?.performance?.series;
    if (!Array.isArray(series)) continue;
    for (const block of series) {
      const dmtList = block?.dailyMetricTimeSeries ?? [];
      for (const entry of dmtList) {
        if (entry?.dailyMetric !== metricName) continue;
        sawAny = true;
        const dated = entry?.timeSeries?.datedValues ?? [];
        for (const dv of dated) {
          const v = toFiniteNumber(dv?.value);
          if (v !== null) total += v;
        }
      }
    }
  }

  return sawAny ? total : null;
}

/**
 * Pull average rating + review count from `gbpData` (across all locations).
 * Uses an unweighted mean of per-location averages. Returns nulls if no data.
 */
export function extractReviewSummary(gbpData: any): {
  currentRating: number | null;
  totalReviewCount: number | null;
  reviewsThisMonth: number;
  reviewDetails: Array<{
    stars: number | null;
    createdAt: string | null;
    hasReply: boolean;
    replyDate: string | null;
    reviewerName: string | null;
  }>;
} {
  if (!gbpData || !Array.isArray(gbpData.locations)) {
    return {
      currentRating: null,
      totalReviewCount: null,
      reviewsThisMonth: 0,
      reviewDetails: [],
    };
  }

  const ratings: number[] = [];
  let totalReviewCount: number | null = null;
  let reviewsThisMonth = 0;
  const reviewDetails: Array<{
    stars: number | null;
    createdAt: string | null;
    hasReply: boolean;
    replyDate: string | null;
    reviewerName: string | null;
  }> = [];

  for (const loc of gbpData.locations) {
    const allTime = loc?.data?.reviews?.allTime;
    if (allTime && typeof allTime.averageRating === "number" && allTime.averageRating > 0) {
      ratings.push(allTime.averageRating);
    }
    // Sum the all-time total review count across locations (multi-location
    // practices). Stays null until at least one location reports a count.
    if (
      allTime &&
      typeof allTime.totalReviewCount === "number" &&
      Number.isFinite(allTime.totalReviewCount)
    ) {
      totalReviewCount = (totalReviewCount ?? 0) + allTime.totalReviewCount;
    }

    const win = loc?.data?.reviews?.window;
    if (win) {
      reviewsThisMonth += Number(win.newReviews ?? 0);
      const details = Array.isArray(win.reviewDetails) ? win.reviewDetails : [];
      for (const r of details) {
        reviewDetails.push({
          stars: typeof r.stars === "number" ? r.stars : null,
          createdAt: r.createdAt ?? null,
          hasReply: Boolean(r.hasReply),
          replyDate: r.replyDate ?? null,
          reviewerName: r.reviewerName ?? null,
        });
      }
    }
  }

  const currentRating = ratings.length
    ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
    : null;

  return { currentRating, totalReviewCount, reviewsThisMonth, reviewDetails };
}
