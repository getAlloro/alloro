import { google } from "googleapis";
import { getValidOAuth2ClientByConnection } from "../../../auth/oauth2Helper";
import { GoogleConnectionModel, type IGoogleConnection } from "../../../models/GoogleConnectionModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import {
  WebsiteIntegrationModel,
  type IWebsiteIntegrationSafe,
} from "../../../models/website-builder/WebsiteIntegrationModel";
import { getHarvestQueue } from "../../../workers/queues";

const GSC_SCOPE_FRAGMENT = "webmasters.readonly";
const INITIAL_HARVEST_TIMEOUT_MS = 3000;

export interface GscConnectionSummary {
  id: number;
  email: string;
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

async function requireProjectOrganization(projectId: string): Promise<number> {
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

  return project.organization_id;
}

async function requireOrgConnection(
  projectId: string,
  connectionId: number,
): Promise<IGoogleConnection> {
  const organizationId = await requireProjectOrganization(projectId);
  const connection = await GoogleConnectionModel.findByIdForOrganization(
    connectionId,
    organizationId,
  );

  if (!connection) {
    throw new GscIntegrationError(
      404,
      "CONNECTION_NOT_FOUND",
      "Google connection not found for this website's organization",
    );
  }

  if (!hasGscScope(connection)) {
    throw new GscIntegrationError(
      400,
      "MISSING_SCOPE",
      "This Google connection does not have Search Console scope",
    );
  }

  return connection;
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

export async function listConnections(projectId: string): Promise<GscConnectionSummary[]> {
  const organizationId = await requireProjectOrganization(projectId);
  const connections = await GoogleConnectionModel.findByOrgWithScope(
    organizationId,
    GSC_SCOPE_FRAGMENT,
  );

  return connections.map((connection) => ({
    id: connection.id,
    email: connection.email,
  }));
}

export async function listSites(
  projectId: string,
  connectionId: number,
): Promise<GscSiteSummary[]> {
  await requireOrgConnection(projectId, connectionId);
  return fetchSites(connectionId);
}

export async function saveIntegration(
  projectId: string,
  connectionId: number,
  siteUrl: string,
): Promise<SaveGscIntegrationResult> {
  if (!siteUrl.trim()) {
    throw new GscIntegrationError(400, "INVALID_INPUT", "siteUrl is required");
  }

  const connection = await requireOrgConnection(projectId, connectionId);
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
        connected_by: "admin",
        last_validated_at: new Date(),
        last_error: null,
      })
    : await WebsiteIntegrationModel.create({
        project_id: projectId,
        platform: "gsc",
        type: "data_harvest",
        connected_by: "admin",
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
