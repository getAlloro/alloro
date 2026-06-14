/**
 * Review Apify Fetch Processor
 *
 * Scrapes reviews from Google Maps via Apify for projects that don't have
 * a Google OAuth connection. Uses the project's selected_place_ids to fetch
 * up to 50 reviews per location.
 */

import { Job } from "bullmq";
import axios from "axios";
import { ApifyReviewInput, ReviewModel } from "../../models/website-builder/ReviewModel";
import { ProjectReviewModel } from "../../models/website-builder/ProjectReviewModel";
import logger from "../../lib/logger";

const APIFY_API_TOKEN = process.env.APIFY_TOKEN;
const APIFY_API_BASE = "https://api.apify.com/v2";
const GOOGLE_MAPS_ACTOR = "compass~crawler-google-places";
const APIFY_MEMORY_MB = 4096;
const MAX_REVIEWS_PER_PLACE = 50;

type ApifyDatasetReview = {
  stars?: number | string;
  text?: string;
  name?: string;
  reviewerPhotoUrl?: string;
  publishedAtDate?: string;
  responseFromOwnerText?: string;
  responseFromOwnerDate?: string;
};

type ApifyDatasetItem = {
  reviews?: ApifyDatasetReview[];
};

export interface ApifyReviewFetchData {
  projectId: string;
  placeIds: string[];
}

function log(message: string): void {
  logger.info(`[REVIEW-APIFY] ${message}`);
}

export async function processApifyReviewFetch(job: Job<ApifyReviewFetchData>): Promise<void> {
  const { projectId, placeIds } = job.data;
  const start = Date.now();

  log(`▶ Starting Apify review fetch for project ${projectId}, ${placeIds.length} place(s)`);

  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_TOKEN not set");
  }

  if (!placeIds || placeIds.length === 0) {
    log("No place IDs provided. Skipping.");
    return;
  }

  const locationByPlaceId = await ProjectReviewModel.getPlaceLocationMap(projectId, placeIds);

  let totalSynced = 0;

  for (const placeId of placeIds) {
    try {
      const reviews = await fetchReviewsForPlace(placeId, locationByPlaceId.get(placeId) ?? null);
      const count = await ReviewModel.replaceApifyReviewsForPlace(placeId, reviews);
      totalSynced += count;
      log(`✓ Place ${placeId}: ${count} reviews replaced`);
    } catch (err: any) {
      log(`✗ Place ${placeId} failed: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`✓ Done. ${totalSynced} reviews across ${placeIds.length} place(s) in ${elapsed}s`);
}

async function fetchReviewsForPlace(placeId: string, locationId: number | null): Promise<ApifyReviewInput[]> {
  const inputBody = {
    startUrls: [
      { url: `https://www.google.com/maps/place/?q=place_id:${placeId}` },
    ],
    language: "en",
    maxCrawledPlacesPerSearch: 1,
    scrapePlaceDetailPage: true,
    maxImages: 0,
    maxReviews: MAX_REVIEWS_PER_PLACE,
  };

  log(`Starting Apify actor for place ${placeId}`);

  const runResponse = await axios.post(
    `${APIFY_API_BASE}/acts/${GOOGLE_MAPS_ACTOR}/runs`,
    inputBody,
    {
      headers: {
        Authorization: `Bearer ${APIFY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      params: { memory: APIFY_MEMORY_MB },
    },
  );

  const runId = runResponse.data?.data?.id;
  if (!runId) {
    throw new Error("Apify actor run did not return a run id");
  }
  log(`Started actor run: ${runId}`);

  const runResult = await waitForRun(runId);
  if (!runResult.datasetId) {
    throw new Error("No dataset ID returned");
  }

  const items = await fetchDatasetItems(runResult.datasetId);
  if (items.length === 0) {
    log(`No results for place ${placeId}`);
    return [];
  }

  const reviews = items[0]?.reviews || [];
  if (reviews.length === 0) {
    log(`Place ${placeId} returned 0 reviews`);
    return [];
  }

  return reviews
    .map((r) => ({
      source: r,
      stars: typeof r.stars === "number" ? r.stars : parseInt(r.stars || "", 10),
    }))
    .filter(({ stars }) => stars >= 1 && stars <= 5)
    .map((r) => ({
      place_id: placeId,
      location_id: locationId,
      stars: clampStars(r.stars),
      text: r.source.text || null,
      reviewer_name: r.source.name || null,
      reviewer_photo_url: r.source.reviewerPhotoUrl || null,
      is_anonymous: !r.source.name,
      review_created_at: r.source.publishedAtDate ? new Date(r.source.publishedAtDate) : null,
      has_reply: !!r.source.responseFromOwnerText,
      reply_text: r.source.responseFromOwnerText || null,
      reply_date: r.source.responseFromOwnerDate ? new Date(r.source.responseFromOwnerDate) : null,
    }));
}

async function waitForRun(
  runId: string,
  maxWaitMs: number = 300000,
): Promise<{ id: string; status: string; datasetId?: string }> {
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < maxWaitMs) {
    const response = await axios.get(
      `${APIFY_API_BASE}/actor-runs/${runId}`,
      { headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` } },
    );

    const run = response.data.data;
    log(`Run ${runId} status: ${run.status}`);

    if (run.status === "SUCCEEDED") {
      return { id: run.id, status: run.status, datasetId: run.defaultDatasetId };
    }

    if (run.status === "FAILED" || run.status === "ABORTED" || run.status === "TIMED-OUT") {
      throw new Error(`Apify actor run failed: ${run.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Apify actor run ${runId} timed out after ${maxWaitMs}ms`);
}

async function fetchDatasetItems(datasetId: string): Promise<ApifyDatasetItem[]> {
  const response = await axios.get(
    `${APIFY_API_BASE}/datasets/${datasetId}/items`,
    {
      headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
      params: { format: "json" },
    },
  );
  return response.data;
}

function clampStars(stars: number): number {
  if (!Number.isFinite(stars)) return 5;
  return Math.min(Math.max(stars, 1), 5);
}
