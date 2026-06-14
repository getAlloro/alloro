/**
 * Ranking Pipeline Helpers
 *
 * Pure data-shaping helpers and shared types for the ranking pipeline.
 * Extracted verbatim from service.ranking-pipeline.ts so individual stage
 * modules share one definition of the pipeline's intermediate shapes.
 *
 * Behavior-preserving: identical logic, no side-effects, no DB or network.
 */

export interface PrefetchedClientGbpData {
  accountId: string;
  locationId: string;
  displayName: string;
  startDate: string;
  endDate: string;
  data: any;
}

export interface ProcessLocationRankingOptions {
  prefetchedClientGbpData?: PrefetchedClientGbpData;
}

// Location parameters for competitor discovery (from Identifier Agent)
export interface LocationParams {
  county?: string | null;
  state?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

export interface LocationRankingResult {
  rankingId: number;
  gbpLocationId: string;
  gbpLocationName: string;
  rankScore: number;
  rankPosition: number;
}

export interface SearchResultPayloadEntry {
  placeId: string;
  name: string;
  position: number;
  rating: number;
  reviewCount: number;
  primaryType: string;
  types: string[];
  isClient: boolean;
}

export type SearchStatus =
  | "ok"
  | "not_in_top_20"
  | "bias_unavailable"
  | "api_error";

export type SelectedCompetitorMapsStatus =
  | "measured"
  | "not_in_top_20"
  | "not_measured";

export interface SelectedCompetitorMapsContext {
  selected_order: number;
  place_id: string;
  name: string;
  maps_position: number | null;
  maps_status: SelectedCompetitorMapsStatus;
  rating: number | null;
  review_count: number | null;
  primary_type: string | null;
}

export type ReviewVelocitySource = "apify" | "cache" | "not_measured";

export interface ReviewVelocityMeasurement {
  reviewsLast30d: number;
  reviewsLast90d: number | null;
  source: ReviewVelocitySource;
  measuredAt: string;
}

export const SELECTED_COMPETITOR_VELOCITY_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export const POST_FRESHNESS_WINDOW_DAYS = 15;

export function daysSinceDate(
  value: Date | string | null | undefined,
): number | null {
  if (!value) return null;
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

export function isMatchingPrefetchedClientGbpData(
  prefetched: PrefetchedClientGbpData | undefined,
  targetLocation: { accountId: string; locationId: string },
  startDate: string,
  endDate: string,
): prefetched is PrefetchedClientGbpData {
  return (
    !!prefetched?.data &&
    prefetched.accountId === targetLocation.accountId &&
    prefetched.locationId === targetLocation.locationId &&
    prefetched.startDate === startDate &&
    prefetched.endDate === endDate
  );
}

export function buildClientGbpDataFromPrefetch(
  prefetched: PrefetchedClientGbpData,
): any {
  return {
    locations: [
      {
        accountId: prefetched.accountId,
        locationId: prefetched.locationId,
        displayName: prefetched.displayName,
        data: prefetched.data,
      },
    ],
    totalLocations: 1,
  };
}

export function normalizeAuditWebsiteUrl(
  candidate: string | null | undefined,
): string | null {
  if (!candidate || typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveAuditWebsite(
  gbpWebsiteUri: string | null | undefined,
  domain: string,
): string {
  return (
    normalizeAuditWebsiteUrl(gbpWebsiteUri) ||
    normalizeAuditWebsiteUrl(domain) ||
    `https://${domain}`
  );
}

export function hasFreshCuratedCompetitorMetadata(competitor: any): boolean {
  const checkedAt =
    competitor.discoveryCheckedAt instanceof Date
      ? competitor.discoveryCheckedAt
      : competitor.discoveryCheckedAt
        ? new Date(competitor.discoveryCheckedAt)
        : null;
  const maxAgeMs = 24 * 60 * 60 * 1000;
  const isFresh =
    checkedAt !== null &&
    !Number.isNaN(checkedAt.getTime()) &&
    Date.now() - checkedAt.getTime() <= maxAgeMs;

  return (
    isFresh &&
    !!competitor.placeId &&
    !!competitor.name &&
    !!competitor.address &&
    !!(competitor.primaryType || competitor.category) &&
    typeof competitor.totalScore === "number" &&
    Number.isFinite(competitor.totalScore) &&
    typeof competitor.reviewsCount === "number" &&
    Number.isFinite(competitor.reviewsCount)
  );
}

export function buildCompetitorDetailFromDiscovery(
  competitor: any,
  specialtyKeywords: string[],
): any {
  const primaryCategory =
    competitor.category || competitor.primaryType || "Unknown";
  const hasKeywordInName = specialtyKeywords.some((keyword) =>
    (competitor.name || "").toLowerCase().includes(keyword.toLowerCase()),
  );

  return {
    placeId: competitor.placeId,
    name: competitor.name,
    address: competitor.address || "",
    categories:
      Array.isArray(competitor.types) && competitor.types.length > 0
        ? competitor.types
        : [primaryCategory],
    primaryCategory,
    totalReviews: competitor.reviewsCount ?? 0,
    averageRating: competitor.totalScore ?? 0,
    reviewsLast30d: null,
    reviewsLast90d: null,
    reviewVelocitySource: "not_measured" as ReviewVelocitySource,
    reviewVelocityMeasuredAt: null,
    photosCount: competitor.photosCount ?? 0,
    postsLast90d: 0,
    hasWebsite: !!competitor.website,
    hasPhone: !!competitor.phone,
    hasHours: !!competitor.hasHours,
    hoursComplete: !!competitor.hoursComplete,
    descriptionLength: 0,
    hasKeywordInName,
    website: competitor.website,
    phone: competitor.phone,
  };
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function markVelocityMeasured(
  detail: any,
  source: ReviewVelocitySource,
  measuredAt: string,
): any {
  return {
    ...detail,
    reviewsLast30d: finiteNumber(detail?.reviewsLast30d) ?? 0,
    reviewsLast90d: finiteNumber(detail?.reviewsLast90d),
    reviewVelocitySource: source,
    reviewVelocityMeasuredAt: measuredAt,
  };
}

export function markVelocityNotMeasured(detail: any): any {
  return {
    ...detail,
    reviewsLast30d: null,
    reviewsLast90d: null,
    reviewVelocitySource: "not_measured" as ReviewVelocitySource,
    reviewVelocityMeasuredAt: null,
  };
}

export function hasMeasuredReviewVelocity(detail: any): boolean {
  const source = detail?.reviewVelocitySource;
  return (
    (source === "apify" || source === "cache") &&
    finiteNumber(detail?.reviewsLast30d) !== null
  );
}

export function parseVelocityMeasuredAt(
  value: unknown,
  fallback: Date,
): Date | null {
  const measuredAt =
    typeof value === "string" && value.trim() ? new Date(value) : fallback;
  return Number.isNaN(measuredAt.getTime()) ? null : measuredAt;
}

export function buildSelectedCompetitorMapsContext(
  competitors: any[],
  searchResults: SearchResultPayloadEntry[],
  searchStatus: "ok" | "not_in_top_20" | "bias_unavailable" | "api_error",
): SelectedCompetitorMapsContext[] {
  const searchByPlaceId = new Map(
    searchResults
      .filter((entry) => entry.placeId)
      .map((entry) => [entry.placeId, entry]),
  );

  return competitors.map((competitor, index) => {
    const match = searchByPlaceId.get(competitor.placeId);
    const mapsStatus: SelectedCompetitorMapsStatus = match
      ? "measured"
      : searchStatus === "api_error" || searchStatus === "bias_unavailable"
        ? "not_measured"
        : "not_in_top_20";
    return {
      selected_order: index + 1,
      place_id: competitor.placeId,
      name: competitor.name,
      maps_position: match?.position ?? null,
      maps_status: mapsStatus,
      rating: match?.rating ?? competitor.totalScore ?? null,
      review_count: match?.reviewCount ?? competitor.reviewsCount ?? null,
      primary_type: match?.primaryType ?? competitor.primaryType ?? null,
    };
  });
}

/**
 * Sum values from GBP performance time series data
 */
export function sumPerformanceMetric(
  performanceSeries: any[],
  metricName: string,
): number {
  if (!performanceSeries || !Array.isArray(performanceSeries)) return 0;

  for (const multiSeries of performanceSeries) {
    const dailyMetricList = multiSeries?.dailyMetricTimeSeries || [];
    for (const series of dailyMetricList) {
      if (series.dailyMetric === metricName) {
        const datedValues = series?.timeSeries?.datedValues || [];
        return datedValues.reduce((sum: number, dv: any) => {
          const value = dv?.value !== undefined ? parseInt(dv.value, 10) : 0;
          return sum + (isNaN(value) ? 0 : value);
        }, 0);
      }
    }
  }
  return 0;
}

/**
 * Extract performance metrics from GBP data
 */
export function extractPerformanceMetrics(gbpData: any): {
  calls: number;
  directions: number;
  clicks: number;
} {
  const performanceSeries = gbpData?.performance?.series || [];
  return {
    calls: sumPerformanceMetric(performanceSeries, "CALL_CLICKS"),
    directions: sumPerformanceMetric(
      performanceSeries,
      "BUSINESS_DIRECTION_REQUESTS",
    ),
    clicks: sumPerformanceMetric(performanceSeries, "WEBSITE_CLICKS"),
  };
}
