/**
 * Agent Input Builder Service
 *
 * Pure functions that build payloads for each agent type.
 * No side effects, no DB calls, no logging.
 */

import { log } from "../feature-utils/agentLogger";

// =====================================================================
// PROOFLINE (DAILY)
// =====================================================================

/**
 * Extract a single metric's total value from the nested GBP performance series.
 * Path: data.gbpData.locations[0].data.performance.series[0].dailyMetricTimeSeries[]
 * When Google returns no interactions, datedValues[].value is undefined (= 0).
 */
function extractMetricTotal(data: any, metricName: string): number {
  const performanceSeries =
    data?.gbpData?.locations?.[0]?.data?.performance?.series || [];
  for (const multiSeries of performanceSeries) {
    const dailyMetricList = multiSeries?.dailyMetricTimeSeries || [];
    for (const series of dailyMetricList) {
      if (series.dailyMetric === metricName) {
        const datedValues = series?.timeSeries?.datedValues || [];
        return datedValues.reduce((sum: number, dv: any) => {
          const v = dv?.value !== undefined ? parseInt(dv.value, 10) : 0;
          return sum + (isNaN(v) ? 0 : v);
        }, 0);
      }
    }
  }
  return 0;
}

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

export function buildProoflinePayload(params: {
  domain: string;
  googleAccountId: number;
  dates: { yesterday: string; dayBeforeYesterday: string };
  dayBeforeYesterdayData: any;
  yesterdayData: any;
  locationName?: string | null;
  websiteAnalytics?: { yesterday: any; dayBefore: any } | null;
}): any {
  const { domain, dates, yesterdayData, dayBeforeYesterdayData, locationName, websiteAnalytics } = params;

  // Profile: extract once from yesterday (fallback to dayBefore)
  const profile = extractProfile(yesterdayData) || extractProfile(dayBeforeYesterdayData) || {};

  // Reviews: combine new reviews from both days (2-day window)
  const yesterdayReviews = extractReviews(yesterdayData);
  const dayBeforeReviews = extractReviews(dayBeforeYesterdayData);
  const allNewReviews = [
    ...(yesterdayReviews?.window?.reviewDetails || []),
    ...(dayBeforeReviews?.window?.reviewDetails || []),
  ];
  const allTimeCount = yesterdayReviews?.allTime?.totalReviewCount
    ?? dayBeforeReviews?.allTime?.totalReviewCount ?? 0;
  const allTimeAvg = yesterdayReviews?.allTime?.averageRating
    ?? dayBeforeReviews?.allTime?.averageRating ?? 0;

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
        yesterday: dates.yesterday,
        dayBefore: dates.dayBeforeYesterday,
      },
      visibility: {
        yesterday: {
          impressions_search_desktop: extractMetricTotal(yesterdayData, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"),
          impressions_search_mobile: extractMetricTotal(yesterdayData, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"),
          impressions_maps_desktop: extractMetricTotal(yesterdayData, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"),
          impressions_maps_mobile: extractMetricTotal(yesterdayData, "BUSINESS_IMPRESSIONS_MOBILE_MAPS"),
        },
        dayBefore: {
          impressions_search_desktop: extractMetricTotal(dayBeforeYesterdayData, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"),
          impressions_search_mobile: extractMetricTotal(dayBeforeYesterdayData, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"),
          impressions_maps_desktop: extractMetricTotal(dayBeforeYesterdayData, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"),
          impressions_maps_mobile: extractMetricTotal(dayBeforeYesterdayData, "BUSINESS_IMPRESSIONS_MOBILE_MAPS"),
        },
      },
      engagement: {
        yesterday: {
          call_clicks: extractMetricTotal(yesterdayData, "CALL_CLICKS"),
          website_clicks: extractMetricTotal(yesterdayData, "WEBSITE_CLICKS"),
          direction_requests: extractMetricTotal(yesterdayData, "BUSINESS_DIRECTION_REQUESTS"),
        },
        dayBefore: {
          call_clicks: extractMetricTotal(dayBeforeYesterdayData, "CALL_CLICKS"),
          website_clicks: extractMetricTotal(dayBeforeYesterdayData, "WEBSITE_CLICKS"),
          direction_requests: extractMetricTotal(dayBeforeYesterdayData, "BUSINESS_DIRECTION_REQUESTS"),
        },
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

/** Flatten a single day's raw GBP response into a compact storage format */
function flattenSingleDayGbp(data: any): any {
  const profile = extractProfile(data) || {};
  const reviews = extractReviews(data) || {};

  return {
    visibility: {
      impressions_search_desktop: extractMetricTotal(data, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"),
      impressions_search_mobile: extractMetricTotal(data, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"),
      impressions_maps_desktop: extractMetricTotal(data, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"),
      impressions_maps_mobile: extractMetricTotal(data, "BUSINESS_IMPRESSIONS_MOBILE_MAPS"),
    },
    engagement: {
      call_clicks: extractMetricTotal(data, "CALL_CLICKS"),
      website_clicks: extractMetricTotal(data, "WEBSITE_CLICKS"),
      direction_requests: extractMetricTotal(data, "BUSINESS_DIRECTION_REQUESTS"),
    },
    reviews: {
      allTime: {
        count: reviews?.allTime?.totalReviewCount ?? 0,
        average: typeof reviews?.allTime?.averageRating === "number"
          ? Number(reviews.allTime.averageRating.toFixed(2))
          : 0,
      },
      newReviews: reviews?.window?.reviewDetails || [],
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
export function flattenDailyGbpData(yesterdayData: any, dayBeforeData: any): any {
  return {
    yesterday: flattenSingleDayGbp(yesterdayData),
    dayBefore: flattenSingleDayGbp(dayBeforeData),
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
