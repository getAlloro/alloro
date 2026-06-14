import express from "express";
import axios from "axios";
import { mybusinessaccountmanagement_v1 } from "@googleapis/mybusinessaccountmanagement";
import { mybusinessbusinessinformation_v1 } from "@googleapis/mybusinessbusinessinformation";
import { businessprofileperformance_v1 } from "@googleapis/businessprofileperformance";
import { AuthenticatedRequest } from "../../middleware/tokenRefresh";

// Services
import { createClients, buildAuthHeaders } from "./gbp-services/gbp-api.service";
import { listAllReviewsInRangeREST } from "./gbp-services/review-handler.service";
import { fetchPerfTimeSeries, getCallClicksTotal } from "./gbp-services/performance-handler.service";
import { getLocationProfileForRanking, getLocationProfile } from "./gbp-services/location-handler.service";
import { listLocalPostsInRange } from "./gbp-services/post-handler.service";

// Utils
import { getMonthlyRanges } from "./gbp-utils/date-helper.util";
import { safePercentageChange, calculateGBPTrendScore } from "./gbp-utils/metric-calculator.util";
import { handleError } from "./gbp-utils/error-handler.util";
import logger from "../../lib/logger";

/**
 * POST /gbp/getKeyData
 * Body: { accountId: string, locationId: string }
 * Returns: Structured response with trend score analysis
 */
export async function getKeyData(req: AuthenticatedRequest, res: express.Response): Promise<express.Response> {
  try {
    const { accountId, locationId } = req.body || {};
    if (!accountId || !locationId) {
      return res.json({
        successful: false,
        message: "Missing accountId or locationId",
      });
    }
    const { auth, perf } = createClients(req);
    const { prevMonth, prevPrevMonth } = getMonthlyRanges();

    // Reviews (prev & prev-prev)
    const [pmReviews, ppmReviews] = await Promise.all([
      listAllReviewsInRangeREST(
        auth,
        accountId,
        locationId,
        prevMonth.startDate,
        prevMonth.endDate,
      ),
      listAllReviewsInRangeREST(
        auth,
        accountId,
        locationId,
        prevPrevMonth.startDate,
        prevPrevMonth.endDate,
      ),
    ]);

    // Calls (try Business Calls API first; if not available, fallback to CALL_CLICKS)
    const getCalls = async (start: string, end: string) => {
      try {
        // Fallback to CALL_CLICKS (always available if Performance API is enabled)
        const fallback = await getCallClicksTotal(perf, locationId, start, end);
        return { source: "performance_call_clicks", ...fallback };
      } catch {
        const fallback = await getCallClicksTotal(perf, locationId, start, end);
        return { source: "performance_call_clicks", ...fallback };
      }
    };

    const [pmCalls, ppmCalls] = await Promise.all([
      getCalls(prevMonth.startDate, prevMonth.endDate),
      getCalls(prevPrevMonth.startDate, prevPrevMonth.endDate),
    ]);

    // Extract call clicks from nested structure, handle missing data
    const currentCallClicks = pmCalls.callClicksTotal || 0;
    const previousCallClicks = ppmCalls.callClicksTotal || 0;

    // Create current and previous data objects for trend calculation
    const currentData = {
      newReviews: pmReviews.newReviewsCount || 0,
      avgRating: pmReviews.avgRatingWindow || 0,
      callClicks: currentCallClicks,
    };

    const previousData = {
      newReviews: ppmReviews.newReviewsCount || 0,
      avgRating: ppmReviews.avgRatingWindow || 0,
      callClicks: previousCallClicks,
    };

    // Calculate trend score
    const trendScore = calculateGBPTrendScore(currentData, previousData);

    // Return structured response
    return res.json({
      newReviews: {
        prevMonth: previousData.newReviews,
        currMonth: currentData.newReviews,
      },
      avgRating: {
        prevMonth: previousData.avgRating,
        currMonth: currentData.avgRating,
      },
      callClicks: {
        prevMonth: previousData.callClicks,
        currMonth: currentData.callClicks,
      },
      trendScore,
    });
  } catch (error: any) {
    return handleError(res, error, "GBP monthly summary");
  }
}

/**
 * Exported function for direct programmatic use (bypassing HTTP).
 * Aggregates all AI-ready data: performance, reviews, profile.
 */
export async function getGBPAIReadyData(
  oauth2Client: any,
  accountId: string,
  locationId: string,
  startDate?: string,
  endDate?: string,
) {
  const perf = new businessprofileperformance_v1.Businessprofileperformance({
    auth: oauth2Client,
  });

  const { prevMonth } = getMonthlyRanges();
  const finalStartDate = startDate || prevMonth.startDate;
  const finalEndDate = endDate || prevMonth.endDate;

  const metrics = [
    "CALL_CLICKS",
    "WEBSITE_CLICKS",
    "BUSINESS_DIRECTION_REQUESTS",
    "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
    "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
    "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
    "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  ];

  // Fetch all data in parallel for better performance
  const [timeSeries, reviewsPage, windowStats, profileData] = await Promise.all(
    [
      fetchPerfTimeSeries(
        perf,
        locationId,
        metrics,
        finalStartDate,
        finalEndDate,
      ),
      // Reviews all-time stats
      (async () => {
        const parentPath = `accounts/${accountId}/locations/${locationId}`;
        const headers = await buildAuthHeaders(oauth2Client);
        const firstPage = await axios.get(
          `https://mybusiness.googleapis.com/v4/${parentPath}/reviews`,
          { params: { pageSize: 1 }, headers },
        );
        return {
          allTimeAvg: firstPage.data?.averageRating || 0,
          allTimeCount: firstPage.data?.totalReviewCount || 0,
        };
      })(),
      // Reviews in date window
      listAllReviewsInRangeREST(
        oauth2Client,
        accountId,
        locationId,
        finalStartDate,
        finalEndDate,
      ),
      // Profile data (website, phone, hours, category)
      getLocationProfileForRanking(oauth2Client, accountId, locationId),
    ],
  );

  return {
    meta: {
      accountId,
      locationId,
      dateRange: { startDate: finalStartDate, endDate: finalEndDate },
    },
    reviews: {
      allTime: {
        averageRating: reviewsPage.allTimeAvg,
        totalReviewCount: reviewsPage.allTimeCount,
      },
      window: {
        averageRating: windowStats.avgRatingWindow,
        newReviews: windowStats.newReviewsCount,
        reviewDetails: windowStats.reviewDetails,
      },
    },
    performance: {
      series: timeSeries, // includes CALL_CLICKS (unique-user-per-day)
    },
    // Profile data for NAP consistency scoring and location identification
    profile: {
      title: profileData?.title || null,
      description: profileData?.profile?.description || null,
      websiteUri: profileData?.websiteUri || null,
      phoneNumber: profileData?.phoneNumbers?.primaryPhone || null,
      primaryCategory:
        profileData?.categories?.primaryCategory?.displayName || null,
      additionalCategories:
        profileData?.categories?.additionalCategories?.map(
          (c: any) => c.displayName,
        ) || [],
      regularHours: profileData?.regularHours || null,
      hasHours: !!(
        profileData?.regularHours?.periods &&
        profileData.regularHours.periods.length > 0
      ),
      // Storefront address for location identification (used by Identifier Agent)
      storefrontAddress: profileData?.storefrontAddress || null,
    },
  };
}

/**
 * POST /gbp/getAIReadyData
 * Body: { accountId: string, locationId: string, startDate?: "YYYY-MM-DD", endDate?: "YYYY-MM-DD" }
 */
export async function getAIReadyData(req: AuthenticatedRequest, res: express.Response): Promise<express.Response> {
  try {
    const { accountId, locationId } = req.body || {};
    if (!accountId || !locationId) {
      return res.json({
        successful: false,
        message: "Missing accountId or locationId",
      });
    }

    const { prevMonth } = getMonthlyRanges();
    const startDate = req.body.startDate || prevMonth.startDate;
    const endDate = req.body.endDate || prevMonth.endDate;

    const aiReadyData = await getGBPAIReadyData(
      req.oauth2Client,
      accountId,
      locationId,
      startDate,
      endDate,
    );

    return res.json(aiReadyData);
  } catch (error: any) {
    return handleError(res, error, "GBP AI data");
  }
}

/**
 * Exported function for programmatic use (bypassing HTTP).
 * Gets text sources for all GBP locations for a given Google account.
 */
export async function getGBPTextSources(
  oauth2Client: any,
  googleAccountId: number,
  startDate?: string,
  endDate?: string,
  options?: {
    maxPostsPerLocation?: number;
    includeEmptyLocations?: boolean;
  },
) {
  const { maxPostsPerLocation = 50, includeEmptyLocations = true } =
    options || {};

  // Import db here to avoid circular dependency
  const { db } = await import("../../database/connection");

  logger.info(
    `[GBP TextSources Export] Starting for googleAccountId ${googleAccountId}`,
  );

  // Query database for property IDs
  const account = await db("google_connections")
    .where({ id: googleAccountId })
    .first();

  if (!account?.google_property_ids?.gbp) {
    throw new Error(
      `No GBP properties configured for googleAccountId ${googleAccountId}`,
    );
  }

  const gbpLocations = Array.isArray(account.google_property_ids.gbp)
    ? account.google_property_ids.gbp
    : [];

  if (gbpLocations.length === 0) {
    return {
      locations: [],
      summary: {
        googleAccountId,
        totalLocations: 0,
        dateRange: { startDate: "", endDate: "" },
        message: "No GBP locations configured",
      },
    };
  }

  logger.info(
    `[GBP TextSources Export] Processing ${gbpLocations.length} locations`,
  );

  // Rate limiting check
  if (gbpLocations.length > 20) {
    throw new Error(
      `Too many locations to process at once (${gbpLocations.length}). Maximum 20 locations per request.`,
    );
  }

  // Create API clients
  const bizInfo =
    new mybusinessbusinessinformation_v1.Mybusinessbusinessinformation({
      auth: oauth2Client,
    });
  const auth = oauth2Client;

  // Get date range
  const { prevMonth } = getMonthlyRanges();
  const finalStartDate = startDate || prevMonth.startDate;
  const finalEndDate = endDate || prevMonth.endDate;

  logger.info(
    `[GBP TextSources Export] Date range: ${finalStartDate} to ${finalEndDate}`,
  );

  // Process locations in batches of 5 to avoid overwhelming the API
  const batchSize = 5;
  const locationResults: any[] = [];
  const errors: any[] = [];

  for (let i = 0; i < gbpLocations.length; i += batchSize) {
    const batch = gbpLocations.slice(i, i + batchSize);
    logger.info(
      `[GBP TextSources Export] Processing batch ${
        Math.floor(i / batchSize) + 1
      }/${Math.ceil(gbpLocations.length / batchSize)}`,
    );

    const batchResults = await Promise.all(
      batch.map(async (location: any) => {
        try {
          // Fetch posts (required)
          const posts = await listLocalPostsInRange(
            auth,
            location.accountId,
            location.locationId,
            finalStartDate,
            finalEndDate,
            maxPostsPerLocation,
          );

          // Fetch profile (optional - graceful fallback)
          const profile = await getLocationProfile(
            auth,
            location.accountId,
            location.locationId,
          );

          // Skip locations with no posts if configured
          if (!includeEmptyLocations && posts.length === 0) {
            return null;
          }

          return {
            gbp_profile: {
              businessName: profile?.title || location.displayName,
              locationId: location.locationId,
              accountId: location.accountId,
              description: profile?.profile?.description || "",
              websiteUrl: profile?.websiteUri || "",
              phoneNumber: profile?.phoneNumbers?.primaryPhone || "",
              categories:
                profile?.categories?.primaryCategory?.displayName || "",
              adPhone: profile?.adWordsLocationExtensions?.adPhone || "",
            },
            gbp_posts: posts,
            meta: {
              displayName: location.displayName,
              postsCount: posts.length,
            },
          };
        } catch (error: any) {
          logger.error({ err: error.message }, `[GBP TextSources Export] Failed for location ${location.locationId}:`);
          errors.push({
            locationId: location.locationId,
            displayName: location.displayName,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          return null;
        }
      }),
    );

    locationResults.push(...batchResults);

    // Add delay between batches to respect rate limits
    if (i + batchSize < gbpLocations.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Filter out failed locations
  const locations = locationResults.filter((loc) => loc !== null);

  logger.info(
    `[GBP TextSources Export] ✓ Completed: ${locations.length} successful, ${errors.length} errors`,
  );

  return {
    locations,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      googleAccountId,
      totalLocations: locations.length,
      totalErrors: errors.length,
      successRate:
        gbpLocations.length > 0
          ? Number((locations.length / gbpLocations.length).toFixed(2))
          : 0,
      dateRange: { startDate: finalStartDate, endDate: finalEndDate },
    },
  };
}

/**
 * POST /gbp/getTextSources
 * Headers: googleAccountId (from tokenRefreshMiddleware)
 * Body: { startDate?, endDate?, maxPostsPerLocation?, includeEmptyLocations? }
 */
export async function getTextSources(req: AuthenticatedRequest, res: express.Response): Promise<express.Response> {
  const startTime = Date.now();

  try {
    const googleAccountId = (req as any).googleAccountId;

    if (!googleAccountId) {
      return res.status(400).json({
        successful: false,
        message: "Missing googleAccountId header",
      });
    }

    logger.info(
      `[GBP TextSources] Starting for googleAccountId ${googleAccountId}`,
    );

    // Import db here
    const { db } = await import("../../database/connection");

    // Query database for property IDs
    const account = await db("google_connections")
      .where({ id: googleAccountId })
      .first();

    // Validation
    if (!account) {
      return res.status(404).json({
        successful: false,
        message: `Google account ${googleAccountId} not found`,
      });
    }

    if (!account.google_property_ids) {
      return res.status(400).json({
        successful: false,
        message: "Google properties not configured for this account",
        hint: "Please connect Google Business Profile first",
      });
    }

    const gbpLocations = Array.isArray(account.google_property_ids.gbp)
      ? account.google_property_ids.gbp
      : [];

    if (gbpLocations.length === 0) {
      return res.json({
        locations: [],
        summary: {
          googleAccountId,
          totalLocations: 0,
          dateRange: { startDate: "", endDate: "" },
          message: "No GBP locations configured",
        },
      });
    }

    logger.info(
      `[GBP TextSources] Processing ${gbpLocations.length} locations`,
    );

    // Rate limiting check
    if (gbpLocations.length > 20) {
      return res.status(400).json({
        successful: false,
        message: `Too many locations to process at once (${gbpLocations.length})`,
        hint: "Maximum 20 locations per request. Consider batching or contacting support.",
      });
    }

    // Get options from body (handle empty body)
    const body = req.body || {};
    const maxPostsPerLocation = body.maxPostsPerLocation || 50;
    const includeEmptyLocations = body.includeEmptyLocations !== false;

    // Get date range
    const { prevMonth } = getMonthlyRanges();
    const startDate = body.startDate || prevMonth.startDate;
    const endDate = body.endDate || prevMonth.endDate;

    logger.info(`[GBP TextSources] Date range: ${startDate} to ${endDate}`);
    logger.info(
      `[GBP TextSources] Max posts per location: ${maxPostsPerLocation}`,
    );

    // Create API clients
    const { bizInfo, auth } = createClients(req);

    // Process locations in batches of 5 to avoid overwhelming the API
    const batchSize = 5;
    const locationResults: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < gbpLocations.length; i += batchSize) {
      const batch = gbpLocations.slice(i, i + batchSize);
      logger.info(
        `[GBP TextSources] Processing batch ${
          Math.floor(i / batchSize) + 1
        }/${Math.ceil(gbpLocations.length / batchSize)}`,
      );

      const batchResults = await Promise.all(
        batch.map(async (location: any) => {
          try {
            // Fetch posts (required)
            const posts = await listLocalPostsInRange(
              auth,
              location.accountId,
              location.locationId,
              startDate,
              endDate,
              maxPostsPerLocation,
            );

            // Fetch profile (optional - graceful fallback)
            const profile = await getLocationProfile(
              auth,
              location.accountId,
              location.locationId,
            );

            // Skip locations with no posts if configured
            if (!includeEmptyLocations && posts.length === 0) {
              return null;
            }

            return {
              gbp_profile: {
                businessName: profile?.title || location.displayName,
                locationId: location.locationId,
                accountId: location.accountId,
                description: profile?.profile?.description || "",
                websiteUrl: profile?.websiteUri || "",
                phoneNumber: profile?.phoneNumbers?.primaryPhone || "",
                categories:
                  profile?.categories?.primaryCategory?.displayName || "",
                adPhone: profile?.adWordsLocationExtensions?.adPhone || "",
              },
              gbp_posts: posts,
              meta: {
                displayName: location.displayName,
                postsCount: posts.length,
              },
            };
          } catch (error: any) {
            logger.error({ err: error.message }, `[GBP TextSources] Failed for location ${location.locationId}:`);
            errors.push({
              locationId: location.locationId,
              displayName: location.displayName,
              error: error.message,
              timestamp: new Date().toISOString(),
            });
            return null;
          }
        }),
      );

      locationResults.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < gbpLocations.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Filter out failed locations
    const locations = locationResults.filter((loc) => loc !== null);

    const duration = Date.now() - startTime;
    logger.info(`[GBP TextSources] ✓ Completed in ${duration}ms`);
    logger.info(
      `[GBP TextSources] Success: ${locations.length}, Errors: ${errors.length}`,
    );

    return res.json({
      locations,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        googleAccountId,
        totalLocations: locations.length,
        totalErrors: errors.length,
        successRate:
          gbpLocations.length > 0
            ? Number((locations.length / gbpLocations.length).toFixed(2))
            : 0,
        dateRange: { startDate, endDate },
        processingTimeMs: duration,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ err: error.message }, `[GBP TextSources] ✗ Failed after ${duration}ms:`);
    return handleError(res, error, "GBP text sources");
  }
}

/** GET /gbp/diag/accounts — Diagnostic: list all GBP accounts */
export async function diagAccounts(req: AuthenticatedRequest, res: express.Response): Promise<express.Response> {
  try {
    if (!req.oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }
    const auth = req.oauth2Client;
    const acctMgmt =
      new mybusinessaccountmanagement_v1.Mybusinessaccountmanagement({ auth });
    const { data } = await acctMgmt.accounts.list({});
    return res.json(data.accounts ?? []);
  } catch (err: any) {
    logger.error({ err: err?.response?.data || err?.message || err }, "List accounts Error:");
    return res.status(500).json({ error: "Failed to list accounts" });
  }
}

/** GET /gbp/diag/locations — Diagnostic: list locations for an account */
export async function diagLocations(req: AuthenticatedRequest, res: express.Response): Promise<express.Response> {
  try {
    if (!req.oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }
    const auth = req.oauth2Client;
    const acctMgmt =
      new mybusinessaccountmanagement_v1.Mybusinessaccountmanagement({ auth });
    const bizInfo =
      new mybusinessbusinessinformation_v1.Mybusinessbusinessinformation({
        auth,
      });

    let { accountName } = req.query as { accountName?: string };
    if (!accountName) {
      const { data: acctData } = await acctMgmt.accounts.list({});
      accountName = acctData.accounts?.[0]?.name ?? undefined;
      if (!accountName) return res.json([]);
    }

    const locations: Array<Record<string, any>> = [];
    let pageToken: string | undefined;

    do {
      const { data } = await bizInfo.accounts.locations.list({
        parent: accountName,
        readMask: "name,title,storeCode,metadata",
        pageSize: 100,
        pageToken,
      });
      for (const loc of data.locations ?? []) {
        locations.push({
          name: loc.name,
          title: (loc as any).title,
          storeCode: (loc as any).storeCode,
          metadata: (loc as any).metadata,
        });
      }
      pageToken = data.nextPageToken || undefined;
    } while (pageToken);

    return res.json(locations);
  } catch (e: any) {
    logger.error({ err: e?.response?.data || e?.message || e }, "List locations Error:");
    return res.status(500).json({ error: "Failed to list locations" });
  }
}
