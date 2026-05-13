import { google } from "googleapis";
import { getValidOAuth2ClientByConnection } from "../../../auth/oauth2Helper";
import { GoogleConnectionModel, type IGoogleConnection } from "../../../models/GoogleConnectionModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import {
  WebsiteIntegrationModel,
  type IWebsiteIntegrationSafe,
} from "../../../models/website-builder/WebsiteIntegrationModel";
import { GscDataModel } from "../../../models/website-builder/GscDataModel";
import { IntegrationHarvestLogModel } from "../../../models/website-builder/IntegrationHarvestLogModel";
import { getHarvestQueue } from "../../../workers/queues";

const GSC_SCOPE_FRAGMENT = "webmasters.readonly";
const INITIAL_HARVEST_TIMEOUT_MS = 3000;
const GSC_HISTORY_MONTHS = 16;

export interface GscConnectionSummary {
  id: number;
  email: string;
  connectionOwner: GscConnectionOwner;
  sourceLabel: string;
}

export interface GscSiteSummary {
  siteUrl: string;
  permissionLevel: string | null;
}

export interface InitialHarvestResult {
  queued: boolean;
  harvestDate: string;
  warning?: string;
}

export interface SaveGscIntegrationResult {
  integration: IWebsiteIntegrationSafe;
  initialHarvest: InitialHarvestResult;
}

export interface HistoricBackfillResult {
  queued: boolean;
  fromDate: string;
  toDate: string;
  queuedDays: number;
  clearedDataRows: number;
  clearedLogRows: number;
}

export type GscConnectionOwner = "admin" | "organization";

export type GscActorContext =
  | {
      mode: "admin";
      organizationId?: number;
      userId: number;
    }
  | {
      mode: "organization";
      organizationId: number;
      userId?: number;
    };

export class GscIntegrationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function parseScopes(scopeString: string | null | undefined): string[] {
  return (scopeString || "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function hasGscScope(connection: IGoogleConnection): boolean {
  return parseScopes(connection.scopes).some((scope) =>
    scope.includes(GSC_SCOPE_FRAGMENT),
  );
}

function getYesterday(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split("T")[0];
}

function getDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getHistoricStartDate(): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - GSC_HISTORY_MONTHS);
  return getDateString(date);
}

function addUtcDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return getDateString(date);
}

function enumerateDates(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  for (let date = fromDate; date <= toDate; date = addUtcDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Timed out while queueing initial harvest")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function requireProject(projectId: string): Promise<{ projectId: string; organizationId: number }> {
  const project = await ProjectModel.findById(projectId);
  if (!project) {
    throw new GscIntegrationError(404, "PROJECT_NOT_FOUND", "Website project not found");
  }

  if (!project.organization_id) {
    throw new GscIntegrationError(
      409,
      "PROJECT_NOT_LINKED",
      "Website project is not linked to an organization",
    );
  }

  return { projectId: project.id, organizationId: project.organization_id };
}

async function requireProjectForOrganization(
  organizationId: number,
): Promise<{ projectId: string; organizationId: number }> {
  const project = await ProjectModel.findByOrganizationId(organizationId);
  if (!project) {
    throw new GscIntegrationError(404, "PROJECT_NOT_FOUND", "Website project not found");
  }

  if (!project.organization_id) {
    throw new GscIntegrationError(
      409,
      "PROJECT_NOT_LINKED",
      "Website project is not linked to an organization",
    );
  }

  return { projectId: project.id, organizationId: project.organization_id };
}

function requireOrgActorCanUseProject(
  actor: GscActorContext,
  projectOrganizationId: number,
): void {
  if (actor.mode === "organization" && actor.organizationId !== projectOrganizationId) {
    throw new GscIntegrationError(
      403,
      "FORBIDDEN",
      "This Google connection can only be managed by the website's organization",
    );
  }
}

function summarizeConnection(
  connection: IGoogleConnection,
  owner: GscConnectionOwner,
): GscConnectionSummary {
  return {
    id: connection.id,
    email: connection.email,
    connectionOwner: owner,
    sourceLabel: owner === "admin" ? "Admin account" : "Client organization",
  };
}

function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isSuperAdminConnection(connection: IGoogleConnection): boolean {
  return getSuperAdminEmails().includes(connection.email.toLowerCase());
}

function sanitizeIntegrationForOrganization(
  integration: IWebsiteIntegrationSafe,
): IWebsiteIntegrationSafe {
  const metadata = integration.metadata ?? {};
  if (metadata.connectionOwner !== "admin") {
    return integration;
  }

  const safeMetadata = { ...metadata };
  delete safeMetadata.googleConnectionId;
  delete safeMetadata.googleEmail;

  return {
    ...integration,
    metadata: {
      ...safeMetadata,
      googleEmail: "Admin-managed account",
    },
  };
}

async function requireAllowedConnection(
  projectId: string,
  connectionId: number,
  actor: GscActorContext,
): Promise<{ connection: IGoogleConnection; owner: GscConnectionOwner }> {
  const project = await requireProject(projectId);
  requireOrgActorCanUseProject(actor, project.organizationId);

  const connection = await GoogleConnectionModel.findById(connectionId);

  if (!connection) {
    throw new GscIntegrationError(
      404,
      "CONNECTION_NOT_FOUND",
      "Google connection not found",
    );
  }

  if (!hasGscScope(connection)) {
    throw new GscIntegrationError(
      400,
      "MISSING_SCOPE",
      "This Google connection does not have Search Console scope",
    );
  }

  if (connection.organization_id === project.organizationId) {
    return { connection, owner: "organization" };
  }

  if (
    actor.mode === "admin" &&
    ((actor.organizationId &&
      connection.organization_id === actor.organizationId) ||
      isSuperAdminConnection(connection))
  ) {
    return { connection, owner: "admin" };
  }

  throw new GscIntegrationError(
    403,
    "FORBIDDEN",
    "This Google connection is not available for this website",
  );
}

async function fetchSites(connectionId: number): Promise<GscSiteSummary[]> {
  const auth = await getValidOAuth2ClientByConnection(connectionId);
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const siteRes = await searchconsole.sites.list();

  return (siteRes.data.siteEntry || [])
    .filter((site) => !!site.siteUrl)
    .map((site) => ({
      siteUrl: site.siteUrl!,
      permissionLevel: site.permissionLevel ?? null,
    }));
}

async function fetchAvailableHistoryDates(
  connectionId: number,
  siteUrl: string,
): Promise<string[]> {
  const auth = await getValidOAuth2ClientByConnection(connectionId);
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const result = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: getHistoricStartDate(),
      endDate: getDateString(new Date()),
      dimensions: ["date"],
      rowLimit: 25000,
    },
  });

  return (result.data.rows || [])
    .map((row) => row.keys?.[0])
    .filter((date): date is string => !!date)
    .sort();
}

async function queueInitialHarvest(
  integrationId: string,
): Promise<InitialHarvestResult> {
  const harvestDate = getYesterday();

  try {
    const queue = getHarvestQueue("daily");
    await withTimeout(
      queue.add(
        "initial-gsc-harvest",
        { integrationId, harvestDate },
        {
          jobId: `initial-gsc-${integrationId}-${harvestDate}-${Date.now()}`,
          attempts: 1,
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 50 },
        },
      ),
      INITIAL_HARVEST_TIMEOUT_MS,
    );

    return { queued: true, harvestDate };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown queue error";
    return {
      queued: false,
      harvestDate,
      warning: `Search Console was connected, but initial harvest was not queued: ${message}`,
    };
  }
}

export async function listConnections(
  projectId: string,
  actor: GscActorContext,
): Promise<GscConnectionSummary[]> {
  const project = await requireProject(projectId);
  requireOrgActorCanUseProject(actor, project.organizationId);

  const projectConnections = await GoogleConnectionModel.findByOrgWithScope(
    project.organizationId,
    GSC_SCOPE_FRAGMENT,
  );

  const summaries = projectConnections.map((connection) =>
    summarizeConnection(connection, "organization"),
  );

  if (
    actor.mode === "admin" &&
    actor.organizationId &&
    actor.organizationId !== project.organizationId
  ) {
    const adminConnections = await GoogleConnectionModel.findByOrgWithScope(
      actor.organizationId,
      GSC_SCOPE_FRAGMENT,
    );
    summaries.push(
      ...adminConnections.map((connection) =>
        summarizeConnection(connection, "admin"),
      ),
    );
  }

  if (actor.mode === "admin") {
    const superAdminConnections = await GoogleConnectionModel.findByEmailsWithScope(
      getSuperAdminEmails(),
      GSC_SCOPE_FRAGMENT,
    );
    summaries.push(
      ...superAdminConnections.map((connection) =>
        summarizeConnection(connection, "admin"),
      ),
    );
  }

  const unique = new Map<number, GscConnectionSummary>();
  for (const summary of summaries) {
    if (!unique.has(summary.id)) {
      unique.set(summary.id, summary);
    }
  }

  return Array.from(unique.values());
}

export async function listSites(
  projectId: string,
  connectionId: number,
  actor: GscActorContext,
): Promise<GscSiteSummary[]> {
  await requireAllowedConnection(projectId, connectionId, actor);
  return fetchSites(connectionId);
}

export async function saveIntegration(
  projectId: string,
  connectionId: number,
  siteUrl: string,
  actor: GscActorContext,
): Promise<SaveGscIntegrationResult> {
  if (!siteUrl.trim()) {
    throw new GscIntegrationError(400, "INVALID_INPUT", "siteUrl is required");
  }

  const { connection, owner } = await requireAllowedConnection(
    projectId,
    connectionId,
    actor,
  );
  const sites = await fetchSites(connectionId);
  const selectedSite = sites.find((site) => site.siteUrl === siteUrl);

  if (!selectedSite) {
    throw new GscIntegrationError(
      400,
      "SITE_NOT_FOUND",
      `Site ${siteUrl} not found in this Google account's Search Console`,
    );
  }

  const metadata = {
    googleConnectionId: connectionId,
    googleEmail: connection.email,
    siteUrl: selectedSite.siteUrl,
    permissionLevel: selectedSite.permissionLevel,
    connectionOwner: owner,
  };

  const existing = await WebsiteIntegrationModel.findByProjectAndPlatform(
    projectId,
    "gsc",
  );

  const integration = existing
    ? await WebsiteIntegrationModel.update(existing.id, {
        type: "data_harvest",
        metadata,
        status: "active",
        connected_by: actor.mode === "admin" ? "admin" : "user",
        last_validated_at: new Date(),
        last_error: null,
      })
    : await WebsiteIntegrationModel.create({
        project_id: projectId,
        platform: "gsc",
        type: "data_harvest",
        connected_by: actor.mode === "admin" ? "admin" : "user",
        metadata,
        status: "active",
      });

  if (!integration) {
    throw new GscIntegrationError(
      500,
      "SAVE_FAILED",
      "Failed to save Search Console integration",
    );
  }

  const initialHarvest = await queueInitialHarvest(integration.id);

  return { integration, initialHarvest };
}

export async function queueHistoricBackfill(
  integration: IWebsiteIntegrationSafe,
): Promise<HistoricBackfillResult> {
  if (integration.platform !== "gsc") {
    throw new GscIntegrationError(
      400,
      "UNSUPPORTED_PLATFORM",
      "Historic refresh is only available for Search Console integrations",
    );
  }

  const metadata = integration.metadata ?? {};
  const connectionId = Number(metadata.googleConnectionId);
  const siteUrl = typeof metadata.siteUrl === "string" ? metadata.siteUrl : "";

  if (!Number.isInteger(connectionId) || connectionId <= 0 || !siteUrl) {
    throw new GscIntegrationError(
      400,
      "INVALID_METADATA",
      "Search Console integration is missing googleConnectionId or siteUrl",
    );
  }

  const availableDates = await fetchAvailableHistoryDates(connectionId, siteUrl);
  if (availableDates.length === 0) {
    throw new GscIntegrationError(
      409,
      "NO_HISTORY_FOUND",
      "Search Console did not return any historical dates for this property",
    );
  }

  const fromDate = availableDates[0];
  const toDate = availableDates[availableDates.length - 1];
  const dates = enumerateDates(fromDate, toDate);
  const newestFirstDates = [...dates].reverse();
  const clearedLogRows = await IntegrationHarvestLogModel.deleteByIntegrationId(
    integration.id,
  );
  const clearedDataRows = await GscDataModel.deleteByProjectId(
    integration.project_id,
  );

  const queue = getHarvestQueue("daily");
  const runId = Date.now();
  await queue.addBulk(
    newestFirstDates.map((harvestDate) => ({
      name: "historic-gsc-backfill",
      data: { integrationId: integration.id, harvestDate },
      opts: {
        jobId: `historic-gsc-${integration.id}-${harvestDate}-${runId}`,
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    })),
  );

  return {
    queued: true,
    fromDate,
    toDate,
    queuedDays: dates.length,
    clearedDataRows,
    clearedLogRows,
  };
}

export async function getIntegrationForOrganization(
  organizationId: number,
): Promise<IWebsiteIntegrationSafe | null> {
  const project = await requireProjectForOrganization(organizationId);
  const integration = await WebsiteIntegrationModel.findByProjectAndPlatform(
    project.projectId,
    "gsc",
  );
  return integration ? sanitizeIntegrationForOrganization(integration) : null;
}

export async function listConnectionsForOrganization(
  organizationId: number,
): Promise<GscConnectionSummary[]> {
  const project = await requireProjectForOrganization(organizationId);
  return listConnections(project.projectId, {
    mode: "organization",
    organizationId,
  });
}

export async function listSitesForOrganization(
  organizationId: number,
  connectionId: number,
): Promise<GscSiteSummary[]> {
  const project = await requireProjectForOrganization(organizationId);
  return listSites(project.projectId, connectionId, {
    mode: "organization",
    organizationId,
  });
}

export async function saveIntegrationForOrganization(
  organizationId: number,
  connectionId: number,
  siteUrl: string,
): Promise<SaveGscIntegrationResult> {
  const project = await requireProjectForOrganization(organizationId);
  return saveIntegration(project.projectId, connectionId, siteUrl, {
    mode: "organization",
    organizationId,
  });
}
