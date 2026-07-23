/**
 * Agent Input Builder Service
 *
 * Pure functions that build payloads for each agent type.
 * No side effects, no DB calls, no logging.
 */

import { log } from "../feature-utils/agentLogger";
import {
  metricValue,
  type ResolvedMetricDay,
} from "../feature-utils/gbpWindowSelector";

// =====================================================================
// PROOFLINE (DAILY)
// =====================================================================

/** Extract profile data from the first location in GBP response */
function extractProfile(data: any): any {
  return data?.gbpData?.locations?.[0]?.data?.profile || {};
}

/** Extract reviews data from the first location in GBP response */
function extractReviews(data: any): any {
  return data?.gbpData?.locations?.[0]?.data?.reviews || {};
}

/** Build a human-readable address string from storefrontAddress */
function buildAddressString(storefrontAddress: any): string | null {
  if (!storefrontAddress) return null;
  const lines = storefrontAddress.addressLines || [];
  const parts = [
    lines[0],
    storefrontAddress.locality,
    storefrontAddress.administrativeArea,
    storefrontAddress.postalCode,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Keep only reviews created on or after `since` (YYYY-MM-DD).
 *
 * The GBP fetch scopes its review list to the requested range, so widening the
 * fetch to a 7-day window silently widened "new reviews" from 2 days to 7 —
 * inflating the daily narrative ~3.5x and re-reporting the same review for a
 * week. A review with no readable createdAt is KEPT: dropping a real review to
 * tidy a list is a worse error than showing one an extra day.
 */
function filterReviewsSince(reviewDetails: unknown, since: string): unknown[] {
  if (!Array.isArray(reviewDetails)) return [];
  return reviewDetails.filter((review) => {
    const createdAt = (review as { createdAt?: unknown } | null)?.createdAt;
    if (typeof createdAt !== "string" || createdAt.length < 10) return true;
    return createdAt.slice(0, 10) >= since;
  });
}

/** Visibility figures for one resolved day, or null when no day reported. */
function visibilityForDay(day: ResolvedMetricDay | null): Record<string, unknown> | null {
  if (!day) return null;
  return {
    date: day.date,
    impressions_search_desktop: metricValue(day, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"),
    impressions_search_mobile: metricValue(day, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"),
    impressions_maps_desktop: metricValue(day, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"),
    impressions_maps_mobile: metricValue(day, "BUSINESS_IMPRESSIONS_MOBILE_MAPS"),
  };
}

/** Engagement figures for one resolved day, or null when no day reported. */
function engagementForDay(day: ResolvedMetricDay | null): Record<string, unknown> | null {
  if (!day) return null;
  return {
    date: day.date,
    call_clicks: metricValue(day, "CALL_CLICKS"),
    website_clicks: metricValue(day, "WEBSITE_CLICKS"),
    direction_requests: metricValue(day, "BUSINESS_DIRECTION_REQUESTS"),
  };
}

export function buildProoflinePayload(params: {
  domain: string;
  googleAccountId: number;
  /** The trailing window actually requested from the API. */
  window: { startDate: string; endDate: string };
  /** Days the IMPRESSION metrics covered, newest first (may be empty). */
  impressionDays: ResolvedMetricDay[];
  /** Days the INTERACTION metrics covered — resolved separately, see selector. */
  interactionDays: ResolvedMetricDay[];
  /** Reviews newer than this date are "new" (keeps the pre-window 2-day meaning). */
  reviewsSince: string;
  /** The single window response (profile/reviews are window-level, not per-day). */
  windowData: any;
  locationName?: string | null;
  websiteAnalytics?: { yesterday: any; dayBefore: any } | null;
}): any {
  const {
    domain,
    window,
    impressionDays,
    interactionDays,
    reviewsSince,
    windowData,
    locationName,
    websiteAnalytics,
  } = params;

  const latest = impressionDays[0] ?? null;
  const previous = impressionDays[1] ?? null;

  const profile = extractProfile(windowData) || {};
  const reviews = extractReviews(windowData);
  // The review list arrives scoped to the whole fetch window, which is now 7
  // days instead of 2. Left alone the daily agent would report ~3.5x the "new"
  // reviews and repeat the same one for a week. Re-narrow it here so "new"
  // keeps meaning what it meant before the window change.
  const allNewReviews = filterReviewsSince(reviews?.window?.reviewDetails, reviewsSince);
  const allTimeCount = reviews?.allTime?.totalReviewCount ?? 0;
  const allTimeAvg = reviews?.allTime?.averageRating ?? 0;

  return {
    agent: "proofline",
    domain,
    additional_data: {
      location: {
        name: locationName || profile.title || null,
        category: profile.primaryCategory || null,
        address: buildAddressString(profile.storefrontAddress),
      },
      period: {
        // The window we ASKED for, and the days Google actually published in it.
        // These differ by the API's reporting lag, and saying so is the point:
        // the old payload reported yesterday's date beside a fabricated 0.
        window_start: window.startDate,
        window_end: window.endDate,
        latest_data_date: latest?.date ?? null,
        previous_data_date: previous?.date ?? null,
        /** False = Google published nothing in the window. NOT "zero activity". */
        has_recent_data: latest !== null,
      },
      // null (not 0) when the window carried no data at all — an owner is told
      // "we don't have recent data", never "you had zero impressions".
      visibility: {
        latest: visibilityForDay(latest),
        previous: visibilityForDay(previous),
      },
      engagement: {
        latest: engagementForDay(interactionDays[0] ?? null),
        previous: engagementForDay(interactionDays[1] ?? null),
      },
      reviews: {
        allTime: {
          count: allTimeCount,
          average: typeof allTimeAvg === "number" ? Number(allTimeAvg.toFixed(2)) : 0,
        },
        newReviews: allNewReviews,
      },
      ...(websiteAnalytics ? { website_analytics: websiteAnalytics } : {}),
    },
  };
}

// =====================================================================
// DAILY GBP DATA FLATTENER (for google_data_store)
// =====================================================================

/**
 * Flatten one RESOLVED day into the stored shape.
 *
 * `visibility` is omitted entirely when no day reported. That is deliberate and
 * load-bearing downstream: stageReaders' mapsImpressionsForVisibility returns
 * null for a side with no `visibility` object ("a missing metric, not a measured
 * zero", and excluded from day-coverage), while a present object with zeros is a
 * real measured zero. Writing zeros here instead would relaunch the exact bug
 * this change fixes, one layer lower and harder to see.
 */
function flattenResolvedDayGbp(
  impressionDay: ResolvedMetricDay | null,
  interactionDay: ResolvedMetricDay | null,
  windowData: any,
  reviewsSince: string,
): any {
  const profile = extractProfile(windowData) || {};
  const reviews = extractReviews(windowData) || {};

  return {
    // The impressions date is the row's date: impressions are the funnel gate
    // this row is read for (stageReaders.readImpressions). Interactions resolve
    // on their own dates and carry them inline.
    data_date: impressionDay?.date ?? null,
    ...(impressionDay
      ? {
          visibility: {
            impressions_search_desktop: metricValue(impressionDay, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"),
            impressions_search_mobile: metricValue(impressionDay, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"),
            impressions_maps_desktop: metricValue(impressionDay, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"),
            impressions_maps_mobile: metricValue(impressionDay, "BUSINESS_IMPRESSIONS_MOBILE_MAPS"),
          },
        }
      : {}),
    ...(interactionDay
      ? {
          engagement: {
            data_date: interactionDay.date,
            call_clicks: metricValue(interactionDay, "CALL_CLICKS"),
            website_clicks: metricValue(interactionDay, "WEBSITE_CLICKS"),
            direction_requests: metricValue(interactionDay, "BUSINESS_DIRECTION_REQUESTS"),
          },
        }
      : {}),
    reviews: {
      allTime: {
        count: reviews?.allTime?.totalReviewCount ?? 0,
        average: typeof reviews?.allTime?.averageRating === "number"
          ? Number(reviews.allTime.averageRating.toFixed(2))
          : 0,
      },
      newReviews: filterReviewsSince(reviews?.window?.reviewDetails, reviewsSince),
    },
    profile: {
      title: profile.title || null,
      category: profile.primaryCategory || null,
      address: buildAddressString(profile.storefrontAddress),
      phone: profile.phoneNumber || null,
      website: profile.websiteUri || null,
    },
  };
}

/**
 * Flatten daily GBP data for storage in google_data_store.
 * Converts deeply nested Google API response into compact format.
 */
/**
 * Flatten the window's resolved days for google_data_store.
 *
 * The `yesterday` / `dayBefore` key names are kept because the stored rows and
 * their model projection are read elsewhere; what changed is their MEANING, now
 * recorded in each side's `data_date`: they are the most-recent and
 * second-most-recent days Google actually published, not literal calendar
 * yesterday. Renaming the keys would be a wider migration than this fix needs
 * (Revision Log, Rev 1).
 */
export function flattenDailyGbpData(
  impressionDays: ResolvedMetricDay[],
  interactionDays: ResolvedMetricDay[],
  windowData: any,
  reviewsSince: string,
): any {
  return {
    yesterday: flattenResolvedDayGbp(
      impressionDays[0] ?? null,
      interactionDays[0] ?? null,
      windowData,
      reviewsSince,
    ),
    dayBefore: flattenResolvedDayGbp(
      impressionDays[1] ?? null,
      interactionDays[1] ?? null,
      windowData,
      reviewsSince,
    ),
  };
}

// =====================================================================
// SUMMARY (MONTHLY)
// =====================================================================

export function buildSummaryPayload(params: {
  domain: string;
  googleAccountId: number;
  startDate: string;
  endDate: string;
  monthData: any;
  pmsData?: any;
  websiteAnalytics?: { currentMonth: any; previousMonth: any } | null;
  /** Plan 1: Summary v2 also receives RE's full output (Chief-of-Staff role). */
  referralEngineOutput?: any;
  /** Plan 1: Summary v2 receives the deterministic metrics dictionary computed
   *  by service.dashboard-metrics.ts. Used to ground supporting_metrics[*] picks. */
  dashboardMetrics?: any;
  /** Latest LLM-curated ranking recommendations (top_recommendations[]) from
   *  the most recent completed practice_ranking for this location. Sibling
   *  to dashboard_metrics: interpretive (not deterministic), so values must
   *  not be cited via supporting_metrics[*].source_field. */
  rankingRecommendations?: any[] | null;
}): any {
  return {
    agent: "summary",
    domain: params.domain,
    googleAccountId: params.googleAccountId,
    dateRange: {
      start: params.startDate,
      end: params.endDate,
    },
    additional_data: {
      ...params.monthData,
      pms: params.pmsData || null,
      ...(params.websiteAnalytics ? { website_analytics: params.websiteAnalytics } : {}),
      ...(params.referralEngineOutput ? { referral_engine_output: params.referralEngineOutput } : {}),
      ...(params.dashboardMetrics ? { dashboard_metrics: params.dashboardMetrics } : {}),
      ...(params.rankingRecommendations && params.rankingRecommendations.length > 0
        ? { ranking_recommendations: params.rankingRecommendations }
        : {}),
    },
  };
}

// =====================================================================
// OPPORTUNITY (MONTHLY)
// =====================================================================

export function buildOpportunityPayload(params: {
  domain: string;
  googleAccountId: number;
  startDate: string;
  endDate: string;
  summaryOutput: any;
}): any {
  return {
    agent: "opportunity",
    domain: params.domain,
    googleAccountId: params.googleAccountId,
    dateRange: {
      start: params.startDate,
      end: params.endDate,
    },
    additional_data: params.summaryOutput,
  };
}

// =====================================================================
// REFERRAL ENGINE (MONTHLY)
// =====================================================================

export function buildReferralEnginePayload(params: {
  domain: string;
  googleAccountId: number;
  startDate: string;
  endDate: string;
  pmsData?: any;
  websiteAnalytics?: any;
}): any {
  // GBP intentionally excluded. ReferralEngineAnalysis.md grounding rules
  // permit citing only PMS-shaped fields (source names, months, referral
  // counts, production figures); GBP outputs (reviews, posts, calls) are
  // never cited in RE's deliverables. Including GBP just inflates input
  // tokens and Claude latency without affecting the output schema.
  return {
    agent: "referral_engine",
    domain: params.domain,
    googleAccountId: params.googleAccountId,
    dateRange: {
      start: params.startDate,
      end: params.endDate,
    },
    additional_data: {
      pms: params.pmsData ?? null,
      website_analytics: params.websiteAnalytics ?? null,
    },
  };
}

// =====================================================================
// CRO OPTIMIZER (MONTHLY)
// =====================================================================

export function buildCroOptimizerPayload(params: {
  domain: string;
  googleAccountId: number;
  startDate: string;
  endDate: string;
  summaryOutput: any;
}): any {
  return {
    agent: "cro_optimizer",
    domain: params.domain,
    googleAccountId: params.googleAccountId,
    dateRange: {
      start: params.startDate,
      end: params.endDate,
    },
    additional_data: params.summaryOutput,
  };
}

/**
 * Build payload for Copy Companion agent from GBP data
 */
export function buildCopyCompanionPayload(
  gbpData: any,
  domain: string,
  googleAccountId: number,
): any {
  log(`  [GBP-OPTIMIZER] Building Copy Companion payload for ${domain}`);

  const textSources = [];

  for (const location of gbpData.locations) {
    const locationName = location.meta?.businessName || "Unknown Location";
    log(`    \u2192 Processing location: ${locationName}`);

    const profile = location.gbp_profile;
    const posts = location.gbp_posts;

    // Add profile fields
    if (profile?.description) {
      textSources.push({
        field: "business_description",
        text: profile.description,
      });
      log(
        `      \u2713 Added business_description (${profile.description.length} chars)`,
      );
    }

    if (profile?.profile?.description) {
      textSources.push({
        field: "bio",
        text: profile.profile.description,
      });
      log(`      \u2713 Added bio (${profile.profile.description.length} chars)`);
    }

    if (profile?.callToAction?.actionType) {
      const ctaText = `${profile.callToAction.actionType}: ${
        profile.callToAction.url || ""
      }`;
      textSources.push({
        field: "cta",
        text: ctaText,
      });
      log(`      \u2713 Added CTA: ${profile.callToAction.actionType}`);
    }

    // Add posts
    log(`      \u2192 Processing ${posts.length} posts`);
    posts.forEach((post: any, index: number) => {
      if (post.summary) {
        textSources.push({
          field: `gbp_post_${index + 1}`,
          text: post.summary,
          metadata: {
            postId: post.postId,
            createTime: post.createTime,
            topicType: post.topicType,
            locationName: locationName,
          },
        });
      }
    });
    log(`      \u2713 Added ${posts.length} posts`);
  }

  log(
    `  [GBP-OPTIMIZER] \u2713 Built payload with ${textSources.length} text sources`,
  );

  return {
    additional_data: {
      text_sources: textSources,
    },
    domain: domain,
    googleAccountId: googleAccountId,
  };
}
