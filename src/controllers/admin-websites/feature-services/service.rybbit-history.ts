import {
  WebsiteIntegrationModel,
  type IWebsiteIntegrationSafe,
} from "../../../models/website-builder/WebsiteIntegrationModel";
import { RybbitDataModel } from "../../../models/website-builder/RybbitDataModel";
import { IntegrationHarvestLogModel } from "../../../models/website-builder/IntegrationHarvestLogModel";
import { getHarvestQueue } from "../../../workers/queues";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { resolveRybbitTimeZone } from "../../../utils/rybbit/rybbit-time-zone";

const RYBBIT_API_URL = process.env.RYBBIT_API_URL || "";
const RYBBIT_API_KEY = process.env.RYBBIT_API_KEY || "";

type RybbitSiteMetadata = {
  id?: string;
  createdAt?: string;
};

export type RybbitBackfillSkip = {
  integrationId: string;
  projectId: string;
  siteId: string | null;
  code: string;
  reason: string;
};

export type RybbitHistoricBackfillResult = {
  queued: boolean;
  integrationId: string;
  projectId: string;
  siteId: string;
  fromDate: string;
  toDate: string;
  queuedDays: number;
  clearedDataRows: number;
  clearedLogRows: number;
  message?: string;
};

export type RybbitAllHistoricBackfillResult = {
  queued: boolean;
  projectsTotal: number;
  projectsQueued: number;
  queuedDays: number;
  clearedDataRows: number;
  clearedLogRows: number;
  results: RybbitHistoricBackfillResult[];
  skipped: RybbitBackfillSkip[];
};

export class RybbitHistoryError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function requireRybbitConfig(): void {
  if (!RYBBIT_API_URL || !RYBBIT_API_KEY) {
    throw new RybbitHistoryError(
      500,
      "MISSING_CONFIG",
      "Rybbit API configuration is missing",
    );
  }
}

function getSiteId(integration: IWebsiteIntegrationSafe): string | null {
  const value = integration.metadata?.siteId;
  const siteId = typeof value === "string" ? value.trim() : "";
  if (!siteId || !/^[A-Za-z0-9_-]{1,128}$/.test(siteId)) return null;
  return siteId;
}

function getDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addUtcDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return getDateString(date);
}

function getDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function getLatestCompleteRybbitReportDate(
  timeZone: string,
  now: Date = new Date(),
): string {
  const todayInRybbitZone = getDateInTimeZone(now, timeZone);
  return addUtcDays(todayInRybbitZone, -1);
}

function enumerateDates(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  for (let date = fromDate; date <= toDate; date = addUtcDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function getCreatedDate(site: RybbitSiteMetadata): string {
  const match = site.createdAt?.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    throw new RybbitHistoryError(
      502,
      "INVALID_SITE_METADATA",
      "Rybbit site metadata is missing createdAt",
    );
  }
  return match[1];
}

async function fetchSiteMetadata(siteId: string): Promise<RybbitSiteMetadata> {
  requireRybbitConfig();
  const response = await fetch(
    `${RYBBIT_API_URL}/api/sites/${encodeURIComponent(siteId)}`,
    { headers: { Authorization: `Bearer ${RYBBIT_API_KEY}` } },
  );

  if (response.ok) {
    return response.json() as Promise<RybbitSiteMetadata>;
  }

  if (response.status === 404) {
    throw new RybbitHistoryError(
      404,
      "SITE_NOT_FOUND",
      `Rybbit site ${siteId} was not found`,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new RybbitHistoryError(
      401,
      "AUTH_FAILED",
      "Rybbit API key is invalid or expired",
    );
  }

  throw new RybbitHistoryError(
    502,
    "RYBBIT_API_ERROR",
    `Rybbit returned ${response.status} while loading site metadata`,
  );
}

async function clearExistingHistory(
  integration: IWebsiteIntegrationSafe,
): Promise<{ clearedDataRows: number; clearedLogRows: number }> {
  const clearedLogRows =
    await IntegrationHarvestLogModel.deleteByIntegrationAndPlatform(
      integration.id,
      "rybbit",
    );
  const clearedDataRows = await RybbitDataModel.deleteByProjectId(
    integration.project_id,
  );
  return { clearedDataRows, clearedLogRows };
}

async function queueDates(
  integrationId: string,
  dates: string[],
): Promise<void> {
  const queue = getHarvestQueue("daily");
  const runId = Date.now();
  await queue.addBulk(
    dates.map((harvestDate) => ({
      name: "historic-rybbit-backfill",
      data: { integrationId, harvestDate },
      opts: {
        jobId: `historic-rybbit-${integrationId}-${harvestDate}-${runId}`,
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    })),
  );
}

export async function queueHistoricBackfill(
  integration: IWebsiteIntegrationSafe,
): Promise<RybbitHistoricBackfillResult> {
  if (integration.platform !== "rybbit") {
    throw new RybbitHistoryError(
      400,
      "UNSUPPORTED_PLATFORM",
      "Historic refresh is only available for Rybbit integrations",
    );
  }

  const siteId = getSiteId(integration);
  if (!siteId) {
    throw new RybbitHistoryError(
      400,
      "INVALID_METADATA",
      "Rybbit integration is missing a valid siteId",
    );
  }

  const site = await fetchSiteMetadata(siteId);
  const fromDate = getCreatedDate(site);
  const timeZone = resolveRybbitTimeZone(
    await ProjectModel.getRybbitTimeZone(integration.project_id),
  );
  const toDate = getLatestCompleteRybbitReportDate(timeZone);
  if (fromDate > toDate) {
    const cleared = await clearExistingHistory(integration);
    return {
      queued: false,
      integrationId: integration.id,
      projectId: integration.project_id,
      siteId,
      fromDate,
      toDate,
      queuedDays: 0,
      message: "Rybbit does not have a complete historical day for this site yet",
      ...cleared,
    };
  }

  const dates = enumerateDates(fromDate, toDate);
  const newestFirstDates = [...dates].reverse();
  const cleared = await clearExistingHistory(integration);
  await queueDates(integration.id, newestFirstDates);

  return {
    queued: true,
    integrationId: integration.id,
    projectId: integration.project_id,
    siteId,
    fromDate,
    toDate,
    queuedDays: dates.length,
    ...cleared,
  };
}

function toSkip(
  integration: IWebsiteIntegrationSafe,
  siteId: string | null,
  error: unknown,
): RybbitBackfillSkip {
  if (error instanceof RybbitHistoryError) {
    return {
      integrationId: integration.id,
      projectId: integration.project_id,
      siteId,
      code: error.code,
      reason: error.message,
    };
  }
  return {
    integrationId: integration.id,
    projectId: integration.project_id,
    siteId,
    code: "UNKNOWN_ERROR",
    reason: error instanceof Error ? error.message : String(error),
  };
}

export async function queueAllHistoricBackfills(): Promise<RybbitAllHistoricBackfillResult> {
  const integrations = await WebsiteIntegrationModel.findActiveByPlatform("rybbit");
  const results: RybbitHistoricBackfillResult[] = [];
  const skipped: RybbitBackfillSkip[] = [];

  for (const integration of integrations) {
    const siteId = getSiteId(integration);
    try {
      results.push(await queueHistoricBackfill(integration));
    } catch (error) {
      skipped.push(toSkip(integration, siteId, error));
    }
  }

  return {
    queued: results.some((result) => result.queued),
    projectsTotal: integrations.length,
    projectsQueued: results.filter((result) => result.queued).length,
    queuedDays: results.reduce((sum, result) => sum + result.queuedDays, 0),
    clearedDataRows: results.reduce((sum, result) => sum + result.clearedDataRows, 0),
    clearedLogRows: results.reduce((sum, result) => sum + result.clearedLogRows, 0),
    results,
    skipped,
  };
}
