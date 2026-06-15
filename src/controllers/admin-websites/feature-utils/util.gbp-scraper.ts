/**
 * GBP Scraper Utility
 *
 * Runs the Apify Google Maps scraper against a place_id and returns the
 * first dataset item. Handles polling, timeout, and cancel.
 *
 * Extracted from service.generation-pipeline.ts so both the generation
 * pipeline and the identity warmup pipeline can reuse it.
 */

import axios from "axios";
import logger from "../../../lib/logger";

const APIFY_API_BASE = "https://api.apify.com/v2";
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const GOOGLE_MAPS_ACTOR = "compass~crawler-google-places";

function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `[GBP-Scraper] ${msg}`);
}

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Generation cancelled");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeGbp(
  placeId: string,
  practiceSearchString?: string,
  signal?: AbortSignal,
): Promise<any> {
  if (!APIFY_TOKEN) {
    throw new Error("APIFY_TOKEN not configured");
  }

  const input: Record<string, any> = {
    placeIds: [placeId],
    scrapePlaceDetailPage: true,
    maxImages: 15,
    maxReviews: 10,
    maxCrawledPlacesPerSearch: 1,
  };
  if (practiceSearchString) {
    input.searchStringsArray = [practiceSearchString];
  }

  log("Starting Apify GBP scrape", { placeId });

  const runResponse = await axios.post(
    `${APIFY_API_BASE}/acts/${GOOGLE_MAPS_ACTOR}/runs`,
    input,
    {
      headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
      params: { memory: 4096 },
      signal,
    },
  );

  const runId = runResponse.data.data.id;
  log("Apify run started", { runId });

  const maxWaitMs = 300000;
  const pollInterval = 5000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    checkCancel(signal);

    const statusResponse = await axios.get(
      `${APIFY_API_BASE}/actor-runs/${runId}`,
      { headers: { Authorization: `Bearer ${APIFY_TOKEN}` }, signal },
    );

    const run = statusResponse.data.data;

    if (run.status === "SUCCEEDED") {
      const datasetId = run.defaultDatasetId;
      const dataResponse = await axios.get(
        `${APIFY_API_BASE}/datasets/${datasetId}/items`,
        {
          headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
          params: { format: "json" },
          signal,
        },
      );
      return dataResponse.data[0] || null;
    }

    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
      throw new Error(`Apify run ${runId} failed: ${run.status}`);
    }

    await sleep(pollInterval);
  }

  throw new Error(`Apify run ${runId} timed out`);
}
