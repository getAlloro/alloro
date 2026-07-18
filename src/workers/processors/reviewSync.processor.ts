/**
 * Review Sync Processor
 *
 * Fetches all GBP reviews for connected locations and upserts them
 * into the website_builder.reviews table. Runs on a daily schedule
 * and can be triggered manually via the API.
 */

import { Job } from "bullmq";
import axios from "axios";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import { GbpSyncHealthModel, GbpSyncSource } from "../../models/GbpSyncHealthModel";
import { ReviewModel } from "../../models/website-builder/ReviewModel";
import { getValidOAuth2ClientByConnection } from "../../auth/oauth2Helper";
import { buildAuthHeaders } from "../../controllers/gbp/gbp-services/gbp-api.service";
import { GbpReviewInsightService } from "../../controllers/gbp-automation/feature-services/GbpReviewInsightService";
import { GbpReviewReplyAutoDraftService } from "../../controllers/gbp-automation/feature-services/GbpReviewReplyAutoDraftService";
import { IReview } from "../../models/website-builder/ReviewModel";
import logger from "../../lib/logger";

const STAR_TO_NUM: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export interface ReviewSyncData {
  organizationId?: number; // if provided, only sync this org's locations
  locationId?: number; // if provided, only sync this location
  syncSource?: GbpSyncSource;
}

type ReviewSyncProperty = {
  google_property_id: number;
  location_id: number;
  external_id: string;
  account_id: string | null;
  google_connection_id: number;
  organization_id: number;
};

function jobMetadata(job: Job<ReviewSyncData>, syncSource: GbpSyncSource): Record<string, unknown> {
  return { jobId: job.id || null, jobName: job.name, syncSource };
}

function errorCode(err: any, fallback = "REVIEW_SYNC_FAILED"): string {
  if (isUnauthorizedGoogleError(err)) return "GBP_GOOGLE_UNAUTHORIZED";
  return err?.code || fallback;
}

function errorMessage(err: any, fallback = "Review sync failed."): string {
  return err?.message || fallback;
}

function isUnauthorizedGoogleError(err: any): boolean {
  return err?.response?.status === 401 || err?.status === 401;
}

async function markConnectionAuthFailed(props: ReviewSyncProperty[], job: Job<ReviewSyncData>, syncSource: GbpSyncSource, err: any): Promise<void> {
  for (const prop of props) {
    const health = await GbpSyncHealthModel.markStarted({
      organizationId: prop.organization_id,
      locationId: prop.location_id,
      googlePropertyId: prop.google_property_id,
      metadata: jobMetadata(job, syncSource),
    });

    await GbpSyncHealthModel.markFailed(
      health.id,
      errorCode(err, "REVIEW_SYNC_AUTH_FAILED"),
      errorMessage(err, "Google review sync authentication failed."),
      jobMetadata(job, syncSource)
    );
  }
}

export async function processReviewSync(job: Job<ReviewSyncData>): Promise<void> {
  const { organizationId, locationId } = job.data || {};
  const syncSource: GbpSyncSource =
    job.data?.syncSource || (job.name === "daily-review-sync" ? "auto" : "manual");
  const start = Date.now();

  logger.info(
    `[REVIEW-SYNC] ▶ Starting review sync${
      locationId
        ? ` for location ${locationId}`
        : organizationId
          ? ` for org ${organizationId}`
          : " (all orgs)"
    }`
  );

  try {
    // Get all selected GBP properties with their connections
    const properties = (await GooglePropertyModel.findSelectedGbpForSync({
      organizationId,
      locationId,
    })) as ReviewSyncProperty[];

    if (properties.length === 0) {
      logger.info("[REVIEW-SYNC] No GBP properties found. Skipping.");
      return;
    }

    logger.info(`[REVIEW-SYNC] Found ${properties.length} GBP properties to sync`);

    // Group by connection to reuse OAuth2 clients
    const byConnection = new Map<number, ReviewSyncProperty[]>();
    for (const prop of properties) {
      const list = byConnection.get(prop.google_connection_id) || [];
      list.push(prop);
      byConnection.set(prop.google_connection_id, list);
    }

    let totalSynced = 0;
    let totalLocations = 0;

    for (const [connectionId, props] of byConnection) {
      let auth;
      let hasForcedTokenRefresh = false;
      try {
        auth = await getValidOAuth2ClientByConnection(connectionId);
      } catch (err: any) {
        await markConnectionAuthFailed(props, job, syncSource, err);
        logger.error({ err: err.message }, `[REVIEW-SYNC] Failed to create OAuth2 client for connection ${connectionId}:`);
        continue;
      }

      // Process in batches of 5 with 1s delay between batches
      for (let i = 0; i < props.length; i += 5) {
        const batch = props.slice(i, i + 5);

        for (const prop of batch) {
          const health = await GbpSyncHealthModel.markStarted({
            organizationId: prop.organization_id,
            locationId: prop.location_id,
            googlePropertyId: prop.google_property_id,
            metadata: jobMetadata(job, syncSource),
          });
          try {
            const count = await syncLocationReviews({
              auth,
              connectionId,
              prop,
              hasForcedTokenRefresh,
              setAuth: (nextAuth) => {
                auth = nextAuth;
              },
              markForcedTokenRefreshUsed: () => {
                hasForcedTokenRefresh = true;
              },
            });
            await GbpSyncHealthModel.markSucceeded(health.id, count, {
              ...jobMetadata(job, syncSource),
              tokenRefreshRetry: hasForcedTokenRefresh,
            });
            totalSynced += count;
            totalLocations++;
            logger.info(`[REVIEW-SYNC] ✓ Location ${prop.location_id}: ${count} reviews synced`);
          } catch (err: any) {
            await GbpSyncHealthModel.markFailed(
              health.id,
              errorCode(err),
              errorMessage(err),
              jobMetadata(job, syncSource)
            );
            logger.error({ err: err.message }, `[REVIEW-SYNC] ✗ Location ${prop.location_id} failed:`);
          }
        }

        // Rate limit: 1s delay between batches
        if (i + 5 < props.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    logger.info(`[REVIEW-SYNC] ✓ Done. ${totalSynced} reviews across ${totalLocations} locations in ${elapsed}s`);
  } catch (err: any) {
    logger.error({ err: err }, "[REVIEW-SYNC] ✗ Fatal error:");
    throw err;
  }
}

async function syncLocationReviews(
  params: {
    auth: any;
    connectionId: number;
    prop: ReviewSyncProperty;
    hasForcedTokenRefresh: boolean;
    setAuth: (nextAuth: any) => void;
    markForcedTokenRefreshUsed: () => void;
  }
): Promise<number> {
  const {
    auth,
    connectionId,
    prop,
    hasForcedTokenRefresh,
    setAuth,
    markForcedTokenRefreshUsed,
  } = params;

  try {
    return await fetchAndStoreLocationReviews(auth, prop);
  } catch (err: any) {
    if (!isUnauthorizedGoogleError(err) || hasForcedTokenRefresh) {
      throw err;
    }

    logger.warn(
      `[REVIEW-SYNC] Unauthorized Google response for connection ${connectionId}; forcing token refresh and retrying once`
    );
    markForcedTokenRefreshUsed();
    const refreshedAuth = await getValidOAuth2ClientByConnection(connectionId, {
      forceRefresh: true,
    });
    setAuth(refreshedAuth);
    return fetchAndStoreLocationReviews(refreshedAuth, prop);
  }
}

async function fetchAndStoreLocationReviews(auth: any, prop: ReviewSyncProperty): Promise<number> {
  if (!prop.account_id) {
    logger.warn(`[REVIEW-SYNC] No account_id for location ${prop.location_id}, skipping`);
    return 0;
  }

  const parentPath = `accounts/${prop.account_id}/locations/${prop.external_id}`;
  const headers = await buildAuthHeaders(auth);

  let synced = 0;
  let pageToken: string | undefined;
  const upsertedReviews: IReview[] = [];

  do {
    const { data } = await axios.get(
      `https://mybusiness.googleapis.com/v4/${parentPath}/reviews`,
      {
        params: { pageSize: 50, pageToken, orderBy: "updateTime desc" },
        headers,
      }
    );

    for (const r of data.reviews || []) {
      const starRating = typeof r.starRating === "number"
        ? r.starRating
        : (STAR_TO_NUM[r.starRating] ?? null);

      if (!starRating || !r.name) continue;

      const review = await ReviewModel.upsertByGoogleName({
        source: "oauth",
        place_id: null,
        location_id: prop.location_id,
        google_review_name: r.name,
        stars: starRating,
        text: r.comment || null,
        reviewer_name: r.reviewer?.displayName || null,
        reviewer_photo_url: r.reviewer?.profilePhotoUrl || null,
        is_anonymous: r.reviewer?.isAnonymous || false,
        review_created_at: r.createTime ? new Date(r.createTime) : null,
        has_reply: !!(r.reviewReply?.comment),
        reply_text: r.reviewReply?.comment || null,
        reply_date: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null,
      });
      await GbpReviewInsightService.ensureForReviews([review]);
      upsertedReviews.push(review);

      synced++;
    }

    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  // Owner-approved outbound: stage held reply DRAFTS for any newly-ingested
  // replyable reviews. Best-effort and gated on the same readiness the manual
  // path uses; never throws, so a draft failure cannot break review ingestion.
  await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
    organizationId: prop.organization_id,
    locationId: prop.location_id,
    reviews: upsertedReviews,
  });

  return synced;
}
