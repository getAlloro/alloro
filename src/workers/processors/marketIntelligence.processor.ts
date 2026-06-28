import { Job } from "bullmq";
import { OrganizationModel } from "../../models/OrganizationModel";
import {
  bootstrapMarketKeywordsForOrganization,
  type MarketKeywordBootstrapResult,
} from "../../controllers/market-intelligence/feature-services/MarketKeywordBootstrapService";
import {
  enrichMarketKeywordsFromGsc,
  type GscMarketKeywordEnrichmentResult,
} from "../../controllers/market-intelligence/feature-services/GscMarketKeywordEnrichmentService";
import {
  harvestMarketSearchVolumeForOrganization,
  type MarketSearchVolumeHarvestResult,
} from "../../controllers/market-intelligence/feature-services/MarketSearchVolumeHarvestService";
import logger from "../../lib/logger";

const LOG_PREFIX = "[MARKET-INTELLIGENCE]";

export type MarketIntelligenceMode =
  | "bootstrap"
  | "enrich-gsc"
  | "harvest-volume"
  | "full";

export interface MarketIntelligenceJobData {
  mode?: MarketIntelligenceMode;
  organizationId?: number;
  reportMonth?: string;
  skipAgent?: boolean;
  fetchFreshGbp?: boolean;
  gscLookbackDays?: number;
}

interface OrganizationRunResult {
  organizationId: number;
  bootstrap?: MarketKeywordBootstrapResult;
  gsc?: GscMarketKeywordEnrichmentResult;
  harvest?: MarketSearchVolumeHarvestResult;
  error?: string;
}

async function targetOrganizationIds(data: MarketIntelligenceJobData): Promise<number[]> {
  if (typeof data.organizationId === "number") return [data.organizationId];
  const organizations = await OrganizationModel.listAll({ view: "active" });
  return organizations.map((organization) => organization.id);
}

async function processOrganization(
  organizationId: number,
  data: MarketIntelligenceJobData,
): Promise<OrganizationRunResult> {
  const mode = data.mode ?? "full";
  const result: OrganizationRunResult = { organizationId };
  if (mode === "enrich-gsc" || mode === "full") {
    result.gsc = await enrichMarketKeywordsFromGsc(organizationId, {
      gscLookbackDays: data.gscLookbackDays,
    });
  }
  if (mode === "bootstrap" || mode === "full") {
    result.bootstrap = await bootstrapMarketKeywordsForOrganization(organizationId, {
      gscLookbackDays: data.gscLookbackDays,
      fetchFreshGbp: data.fetchFreshGbp,
      skipAgent: data.skipAgent,
    });
  }
  if (mode === "harvest-volume" || mode === "full") {
    result.harvest = await harvestMarketSearchVolumeForOrganization(organizationId, {
      reportMonth: data.reportMonth,
    });
  }
  return result;
}

export async function processMarketIntelligence(
  job: Job<MarketIntelligenceJobData>,
): Promise<void> {
  const data = job.data ?? {};
  const organizationIds = await targetOrganizationIds(data);
  logger.info(
    {
      mode: data.mode ?? "full",
      organizationCount: organizationIds.length,
      reportMonth: data.reportMonth,
    },
    `${LOG_PREFIX} starting job`,
  );

  const results: OrganizationRunResult[] = [];
  for (const organizationId of organizationIds) {
    try {
      results.push(await processOrganization(organizationId, data));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ organizationId, error: message });
      logger.error(
        { err: message, organizationId },
        `${LOG_PREFIX} organization run failed`,
      );
    }
  }

  const failures = results.filter((result) => result.error).length;
  logger.info(
    {
      mode: data.mode ?? "full",
      organizationCount: organizationIds.length,
      failures,
      results,
    },
    `${LOG_PREFIX} job complete`,
  );
}
