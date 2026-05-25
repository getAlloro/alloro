/**
 * Review Sync Processor
 *
 * Fetches all GBP reviews for connected locations and upserts them
 * into the website_builder.reviews table. Runs on a daily schedule
 * and can be triggered manually via the API.
 */

import { Job } from "bullmq";
import axios from "axios";
import { db } from "../../database/connection";
import { GbpSyncHealthModel } from "../../models/GbpSyncHealthModel";
import { ReviewModel } from "../../models/website-builder/ReviewModel";
import { createOAuth2ClientForConnection } from "../../auth/oauth2Helper";
import { buildAuthHeaders } from "../../controllers/gbp/gbp-services/gbp-api.service";
import { GbpReviewInsightService } from "../../controllers/gbp-automation/feature-services/GbpReviewInsightService";

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
}

export async function processReviewSync(job: Job<ReviewSyncData>): Promise<void> {
  const { organizationId, locationId } = job.data || {};
  const start = Date.now();

  console.log(
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
    let query = db("google_properties as gp")
      .join("google_connections as gc", "gp.google_connection_id", "gc.id")
      .where("gp.type", "gbp")
      .where("gp.selected", true)
      .select(
        "gp.id as google_property_id",
        "gp.location_id",
        "gp.external_id",
        "gp.account_id",
        "gp.google_connection_id",
        "gc.organization_id"
      );

    if (organizationId) {
      query = query.where("gc.organization_id", organizationId);
    }
    if (locationId) {
      query = query.where("gp.location_id", locationId);
    }

    const properties = await query;

    if (properties.length === 0) {
      console.log("[REVIEW-SYNC] No GBP properties found. Skipping.");
      return;
    }

    console.log(`[REVIEW-SYNC] Found ${properties.length} GBP properties to sync`);

    // Group by connection to reuse OAuth2 clients
    const byConnection = new Map<number, typeof properties>();
    for (const prop of properties) {
      const list = byConnection.get(prop.google_connection_id) || [];
      list.push(prop);
      byConnection.set(prop.google_connection_id, list);
    }

    let totalSynced = 0;
    let totalLocations = 0;

    for (const [connectionId, props] of byConnection) {
      let auth;
      try {
        auth = await createOAuth2ClientForConnection(connectionId);
      } catch (err: any) {
        console.error(`[REVIEW-SYNC] Failed to create OAuth2 client for connection ${connectionId}:`, err.message);
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
            metadata: { jobId: job.id || null },
          });
          try {
            const count = await syncLocationReviews(auth, prop);
            await GbpSyncHealthModel.markSucceeded(health.id, count, {
              jobId: job.id || null,
            });
            totalSynced += count;
            totalLocations++;
            console.log(`[REVIEW-SYNC] ✓ Location ${prop.location_id}: ${count} reviews synced`);
          } catch (err: any) {
            await GbpSyncHealthModel.markFailed(
              health.id,
              err?.code || "REVIEW_SYNC_FAILED",
              err?.message || "Review sync failed.",
              { jobId: job.id || null }
            );
            console.error(`[REVIEW-SYNC] ✗ Location ${prop.location_id} failed:`, err.message);
          }
        }

        // Rate limit: 1s delay between batches
        if (i + 5 < props.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[REVIEW-SYNC] ✓ Done. ${totalSynced} reviews across ${totalLocations} locations in ${elapsed}s`);
  } catch (err: any) {
    console.error("[REVIEW-SYNC] ✗ Fatal error:", err);
    throw err;
  }
}

async function syncLocationReviews(
  auth: any,
  prop: {
    google_property_id: number;
    location_id: number;
    external_id: string;
    account_id: string | null;
  }
): Promise<number> {
  if (!prop.account_id) {
    console.warn(`[REVIEW-SYNC] No account_id for location ${prop.location_id}, skipping`);
    return 0;
  }

  const parentPath = `accounts/${prop.account_id}/locations/${prop.external_id}`;
  const headers = await buildAuthHeaders(auth);

  let synced = 0;
  let pageToken: string | undefined;

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

      synced++;
    }

    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  return synced;
}
