import { Job } from "bullmq";
import {
  WebsiteIntegrationModel,
  type IntegrationPlatform,
  type IntegrationType,
} from "../../models/website-builder/WebsiteIntegrationModel";
import { IntegrationHarvestLogModel } from "../../models/website-builder/IntegrationHarvestLogModel";
import { ClarityDataModelV2 } from "../../models/website-builder/ClarityDataModelV2";
import { RybbitDataModel } from "../../models/website-builder/RybbitDataModel";
import { GscDataModel } from "../../models/website-builder/GscDataModel";
import { getHarvestAdapter } from "../../services/integrations/harvest-registry";
import { recordHarvestComplete } from "../workerHealth";

export interface DataHarvestJobData {
  integrationId?: string;
  harvestDate?: string;
}

const LOG_PREFIX = "[DATA-HARVEST]";
const MAX_RETRIES = 3;
const GSC_FRESHNESS_DAYS = 4;
const RYBBIT_FRESHNESS_DAYS = 3;
const CLARITY_FRESHNESS_DAYS = 1;

const PROVIDER_FRESHNESS_DAYS: Partial<Record<IntegrationPlatform, number>> = {
  gsc: GSC_FRESHNESS_DAYS,
  rybbit: RYBBIT_FRESHNESS_DAYS,
  clarity: CLARITY_FRESHNESS_DAYS,
};

const DATA_MODELS: Record<string, { upsert: (projectId: string, date: string, data: unknown) => Promise<void> }> = {
  clarity: ClarityDataModelV2,
  rybbit: RybbitDataModel,
  gsc: GscDataModel,
};

function getYesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

function addUtcDays(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function getHarvestDatesForPlatform(
  platform: IntegrationPlatform,
  latestDate: string = getYesterday(),
): string[] {
  const windowDays = PROVIDER_FRESHNESS_DAYS[platform] ?? 1;
  return Array.from({ length: windowDays }, (_, index) =>
    addUtcDays(latestDate, -index),
  );
}

export async function processDataHarvest(job: Job<DataHarvestJobData>): Promise<void> {
  const { integrationId, harvestDate } = job.data;

  if (integrationId && harvestDate) {
    await harvestSingle(integrationId, harvestDate);
    return;
  }

  const harvestTypes: IntegrationType[] = ["data_harvest", "hybrid"];
  const integrations = await WebsiteIntegrationModel.findActiveByTypes(harvestTypes);
  const latestDate = harvestDate || getYesterday();

  console.log(`${LOG_PREFIX} Starting daily harvest for ${integrations.length} integrations (latestDate=${latestDate})`);

  for (const integration of integrations) {
    const dates = getHarvestDatesForPlatform(integration.platform, latestDate);

    for (const date of dates) {
      try {
        await harvestSingle(integration.id, date);
      } catch (err) {
        console.error(`${LOG_PREFIX} Unexpected error for integration ${integration.id} date=${date}:`, err);
      }
    }
  }

  console.log(`${LOG_PREFIX} Daily harvest complete`);
  recordHarvestComplete();
}

async function harvestSingle(integrationId: string, date: string): Promise<void> {
  const integration = await WebsiteIntegrationModel.findActiveById(integrationId);
  if (!integration || integration.status !== "active") {
    console.warn(`${LOG_PREFIX} Integration ${integrationId} not active or archived — skipping`);
    return;
  }

  const existingRetries = await IntegrationHarvestLogModel.getLatestRetryCount(integrationId, date);
  if (existingRetries >= MAX_RETRIES) {
    console.warn(`${LOG_PREFIX} Integration ${integrationId} date=${date} has ${existingRetries} retries — skipping`);
    return;
  }

  let adapter;
  try {
    adapter = getHarvestAdapter(integration.platform);
  } catch {
    console.warn(`${LOG_PREFIX} No harvest adapter for platform ${integration.platform} — skipping`);
    return;
  }

  const result = await adapter.fetchData(integration, date);

  if (result.ok) {
    const model = DATA_MODELS[integration.platform];
    if (model) {
      await model.upsert(integration.project_id, date, result.data);
    }

    await IntegrationHarvestLogModel.create({
      integration_id: integrationId,
      platform: integration.platform,
      harvest_date: date,
      outcome: "success",
      rows_fetched: result.rowCount,
      retry_count: existingRetries,
    });

    await WebsiteIntegrationModel.updateLastValidated(integrationId, new Date());

    console.log(`${LOG_PREFIX} ${integration.platform} harvest OK for project ${integration.project_id} date=${date} (${result.rowCount} rows)`);
  } else {
    await IntegrationHarvestLogModel.create({
      integration_id: integrationId,
      platform: integration.platform,
      harvest_date: date,
      outcome: "failed",
      rows_fetched: 0,
      error: result.error ?? "Unknown error",
      error_details: result.errorDetails ?? null,
      retry_count: existingRetries + 1,
    });

    await WebsiteIntegrationModel.updateLastValidated(
      integrationId,
      new Date(),
      result.error ?? "Harvest failed",
    );

    console.error(`${LOG_PREFIX} ${integration.platform} harvest FAILED for project ${integration.project_id} date=${date}: ${result.error}`);
  }
}
