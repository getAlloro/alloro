import { ClarityDataModelV2 } from "../../../models/website-builder/ClarityDataModelV2";
import { GscDataModel } from "../../../models/website-builder/GscDataModel";
import type { IIntegrationHarvestLog } from "../../../models/website-builder/IntegrationHarvestLogModel";
import { RybbitDataModel } from "../../../models/website-builder/RybbitDataModel";
import type {
  IntegrationPlatform,
  IWebsiteIntegrationSafe,
} from "../../../models/website-builder/WebsiteIntegrationModel";

export type HarvestPayloadKind = "stored_data" | "harvest_log";

export type HarvestLogPayload = {
  platform: IntegrationPlatform;
  harvestDate: string;
  payloadKind: HarvestPayloadKind;
  payloadSizeBytes: number;
  log: {
    id: string;
    outcome: string;
    rowsFetched: number | null;
    error: string | null;
    errorDetails: string | null;
    attemptedAt: Date;
  };
  data: unknown;
};

type StoredRow = {
  data: Record<string, unknown>;
};

function getReportDate(value: string): string {
  return String(value).split("T")[0];
}

async function findStoredPayload(
  integration: IWebsiteIntegrationSafe,
  reportDate: string,
): Promise<StoredRow | undefined> {
  if (integration.platform === "gsc") {
    return GscDataModel.findByProjectAndDate(integration.project_id, reportDate);
  }
  if (integration.platform === "rybbit") {
    return RybbitDataModel.findByProjectAndDate(integration.project_id, reportDate);
  }
  if (integration.platform === "clarity") {
    return ClarityDataModelV2.findByProjectAndDate(integration.project_id, reportDate);
  }
  return undefined;
}

function buildLogPayload(log: IIntegrationHarvestLog): Record<string, unknown> {
  return {
    id: log.id,
    integrationId: log.integration_id,
    platform: log.platform,
    harvestDate: getReportDate(log.harvest_date),
    outcome: log.outcome,
    rowsFetched: log.rows_fetched,
    error: log.error,
    errorDetails: log.error_details,
    retryCount: log.retry_count,
    attemptedAt: log.attempted_at,
  };
}

function getPayloadSizeBytes(data: unknown): number {
  return Buffer.byteLength(JSON.stringify(data ?? null), "utf8");
}

export async function getPayload(
  integration: IWebsiteIntegrationSafe,
  log: IIntegrationHarvestLog,
): Promise<HarvestLogPayload> {
  const harvestDate = getReportDate(log.harvest_date);
  const storedRow = await findStoredPayload(integration, harvestDate);
  const data = storedRow?.data ?? buildLogPayload(log);
  const payloadKind: HarvestPayloadKind = storedRow ? "stored_data" : "harvest_log";

  return {
    platform: integration.platform,
    harvestDate,
    payloadKind,
    payloadSizeBytes: getPayloadSizeBytes(data),
    log: {
      id: log.id,
      outcome: log.outcome,
      rowsFetched: log.rows_fetched,
      error: log.error,
      errorDetails: log.error_details,
      attemptedAt: log.attempted_at,
    },
    data,
  };
}
