import { isDataForSeoConfigured } from "../../../config/dataforseo";
import logger from "../../../lib/logger";
import { MarketKeywordModel, type MarketKeywordHarvestRow } from "../../../models/MarketKeywordModel";
import { MarketKeywordSearchVolumeModel, type MarketKeywordVolumeUpsert } from "../../../models/MarketKeywordSearchVolumeModel";
import {
  fetchSearchVolume,
  type KeywordVolumeResult,
} from "../../../services/integrations/search-volume/dataForSeoClient";
import { normalizeKeyword } from "../feature-utils/keywordNormalization";

const BATCH_SIZE = 100;
const DATAFORSEO_BATCH_DELAY_MS = 5_200;
const DEFAULT_LOCATION_NAME = "United States";
const SOURCE = "dataforseo";

function currentReportMonth(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export interface MarketSearchVolumeHarvestOptions {
  reportMonth?: string;
  throttleMs?: number;
}

export interface MarketSearchVolumeHarvestResult {
  organizationId: number;
  reportMonth: string;
  keywordsRequested: number;
  rowsUpserted: number;
  failedBatches: number;
  skipped: boolean;
  error: string | null;
}

function groupByLocation(
  keywords: MarketKeywordHarvestRow[],
): Map<number, MarketKeywordHarvestRow[]> {
  const grouped = new Map<number, MarketKeywordHarvestRow[]>();
  for (const keyword of keywords) {
    const rows = grouped.get(keyword.location_id) ?? [];
    rows.push(keyword);
    grouped.set(keyword.location_id, rows);
  }
  return grouped;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resultByKeyword(results: KeywordVolumeResult[]): Map<string, KeywordVolumeResult> {
  return new Map(results.map((result) => [normalizeKeyword(result.keyword), result]));
}

function toVolumeRows(
  keywords: MarketKeywordHarvestRow[],
  results: KeywordVolumeResult[],
  reportMonth: string,
  providerLocationName: string,
): MarketKeywordVolumeUpsert[] {
  const lookup = resultByKeyword(results);
  return keywords.map((keyword) => {
    const result = lookup.get(keyword.normalized_keyword);
    return {
      marketKeywordId: keyword.id,
      organizationId: keyword.organization_id,
      locationId: keyword.location_id,
      reportMonth,
      searchVolume: result?.searchVolume ?? null,
      source: SOURCE,
      provider: SOURCE,
      providerLocationName,
      providerMetadata: {
        keywordSource: keyword.source,
        cluster: keyword.cluster,
        requestedKeyword: keyword.keyword,
        providerKeyword: result?.keyword ?? null,
      },
    };
  });
}

export async function harvestMarketSearchVolumeForOrganization(
  organizationId: number,
  options: MarketSearchVolumeHarvestOptions = {},
): Promise<MarketSearchVolumeHarvestResult> {
  const reportMonth = options.reportMonth ?? currentReportMonth();
  if (!isDataForSeoConfigured()) {
    return {
      organizationId,
      reportMonth,
      keywordsRequested: 0,
      rowsUpserted: 0,
      failedBatches: 0,
      skipped: true,
      error: "DataForSEO is not configured",
    };
  }

  const keywords = await MarketKeywordModel.findApprovedForHarvest(organizationId);
  const throttleMs = options.throttleMs ?? DATAFORSEO_BATCH_DELAY_MS;
  let rowsUpserted = 0;
  let failedBatches = 0;
  let batchesProcessed = 0;
  for (const [, locationKeywords] of groupByLocation(keywords)) {
    const providerLocationName =
      locationKeywords.find((keyword) => keyword.location_name)?.location_name
      ?? DEFAULT_LOCATION_NAME;
    for (const batch of chunk(locationKeywords, BATCH_SIZE)) {
      if (batchesProcessed > 0 && throttleMs > 0) {
        await sleep(throttleMs);
      }
      batchesProcessed += 1;
      const outcome = await fetchSearchVolume(
        batch.map((keyword) => keyword.keyword),
        providerLocationName,
      );
      if (!outcome.ok) {
        failedBatches += 1;
        logger.warn(
          { organizationId, providerLocationName, error: outcome.error },
          "[market-intelligence] DataForSEO market batch failed",
        );
        continue;
      }
      const rows = toVolumeRows(batch, outcome.results, reportMonth, providerLocationName);
      await MarketKeywordSearchVolumeModel.upsertMany(rows);
      rowsUpserted += rows.length;
    }
  }

  return {
    organizationId,
    reportMonth,
    keywordsRequested: keywords.length,
    rowsUpserted,
    failedBatches,
    skipped: false,
    error: failedBatches > 0 ? `${failedBatches} DataForSEO batch(es) failed` : null,
  };
}
