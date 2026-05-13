import axios from "axios";
import { db } from "../../../database/connection";
import { HeaderFooterCodeModel, type IHeaderFooterCode } from "../../../models/website-builder/HeaderFooterCodeModel";
import { ProjectModel, type IProject } from "../../../models/website-builder/ProjectModel";
import {
  WebsiteIntegrationModel,
  type IntegrationConnectedBy,
  type IWebsiteIntegrationSafe,
} from "../../../models/website-builder/WebsiteIntegrationModel";
import {
  compactClaritySnippetCode,
  extractClarityProjectId,
  isClaritySnippetCode,
} from "../feature-utils/util.clarity-snippet";

const CLARITY_API_BASE_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

export type ClaritySnippetScope = "project" | "template";

export interface LegacyClaritySnippet {
  id: string;
  scope: ClaritySnippetScope;
  name: string;
  location: string;
  isEnabled: boolean;
  orderIndex: number;
  projectId: string | null;
  codePreview: string;
  canDisable: boolean;
}

export interface ClarityStatus {
  integration: IWebsiteIntegrationSafe | null;
  suggestedProjectId: string | null;
  hasDataExportToken: boolean;
  legacySnippets: LegacyClaritySnippet[];
  blockingLegacySnippets: LegacyClaritySnippet[];
  canConnect: boolean;
}

export class ClarityIntegrationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
  }
}

function sanitizeProjectId(value: unknown): string {
  const projectId = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(projectId)) {
    throw new ClarityIntegrationError(
      400,
      "INVALID_PROJECT_ID",
      "A valid Clarity Project ID is required",
    );
  }
  return projectId;
}

function sanitizeOptionalToken(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const token = typeof value === "string" ? value.trim() : "";
  if (!token) return null;
  if (token.length < 8) {
    throw new ClarityIntegrationError(
      400,
      "INVALID_API_TOKEN",
      "A valid Clarity API token is required",
    );
  }
  return token;
}

function getMetadataProjectId(
  integration: IWebsiteIntegrationSafe | undefined | null,
): string | null {
  const projectId = integration?.metadata?.projectId;
  return typeof projectId === "string" && projectId.trim()
    ? projectId.trim()
    : null;
}

function toLegacySnippet(
  snippet: IHeaderFooterCode,
  scope: ClaritySnippetScope,
): LegacyClaritySnippet {
  return {
    id: snippet.id,
    scope,
    name: snippet.name,
    location: snippet.location,
    isEnabled: snippet.is_enabled,
    orderIndex: snippet.order_index,
    projectId: extractClarityProjectId(snippet.code),
    codePreview: compactClaritySnippetCode(snippet.code),
    canDisable: scope === "project",
  };
}

async function requireProject(projectId: string): Promise<IProject> {
  const project = await ProjectModel.findById(projectId);
  if (!project) {
    throw new ClarityIntegrationError(404, "PROJECT_NOT_FOUND", "Website project not found");
  }
  return project;
}

async function getLegacySnippets(project: IProject): Promise<LegacyClaritySnippet[]> {
  const [projectSnippets, templateSnippets] = await Promise.all([
    HeaderFooterCodeModel.findByProjectId(project.id),
    project.template_id
      ? HeaderFooterCodeModel.findByTemplateId(project.template_id)
      : Promise.resolve([]),
  ]);

  return [
    ...projectSnippets
      .filter((snippet) => isClaritySnippetCode(snippet.code))
      .map((snippet) => toLegacySnippet(snippet, "project")),
    ...templateSnippets
      .filter((snippet) => isClaritySnippetCode(snippet.code))
      .map((snippet) => toLegacySnippet(snippet, "template")),
  ];
}

function getSuggestedProjectId(
  integration: IWebsiteIntegrationSafe | undefined,
  legacySnippets: LegacyClaritySnippet[],
): string | null {
  const metadataProjectId = getMetadataProjectId(integration);
  if (metadataProjectId) return metadataProjectId;
  return legacySnippets.find((snippet) => !!snippet.projectId)?.projectId ?? null;
}

async function validateApiToken(projectId: string, apiToken: string): Promise<void> {
  try {
    await axios.get(CLARITY_API_BASE_URL, {
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      params: { projectId, numOfDays: "1" },
    });
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      throw new ClarityIntegrationError(
        401,
        "INVALID_API_TOKEN",
        "Clarity API token is invalid or expired",
      );
    }
    if (status === 429) {
      throw new ClarityIntegrationError(
        429,
        "RATE_LIMITED",
        "Clarity daily API limit exceeded for this project",
      );
    }
    throw new ClarityIntegrationError(
      502,
      "CLARITY_API_ERROR",
      error?.message || "Failed to validate Clarity API token",
    );
  }
}

async function disableProjectSnippets(
  projectId: string,
  snippetIds: string[],
): Promise<number> {
  const uniqueIds = Array.from(new Set(snippetIds));
  if (uniqueIds.length === 0) return 0;

  const snippets = await HeaderFooterCodeModel.findByProjectAndSnippetIds(
    projectId,
    uniqueIds,
  );
  const snippetMap = new Map(snippets.map((snippet) => [snippet.id, snippet]));
  const invalidIds = uniqueIds.filter((id) => !snippetMap.has(id));
  if (invalidIds.length > 0) {
    throw new ClarityIntegrationError(
      400,
      "INVALID_SNIPPET",
      "One or more snippets cannot be disabled from this website",
      { snippetIds: invalidIds },
    );
  }

  const nonClarityIds = snippets
    .filter((snippet) => !isClaritySnippetCode(snippet.code))
    .map((snippet) => snippet.id);
  if (nonClarityIds.length > 0) {
    throw new ClarityIntegrationError(
      400,
      "INVALID_SNIPPET",
      "Only detected Clarity snippets can be disabled from this flow",
      { snippetIds: nonClarityIds },
    );
  }

  return HeaderFooterCodeModel.setProjectSnippetsEnabled(
    projectId,
    uniqueIds,
    false,
  );
}

export async function getStatus(projectId: string): Promise<ClarityStatus> {
  const project = await requireProject(projectId);
  const [integration, legacySnippets] = await Promise.all([
    WebsiteIntegrationModel.findByProjectAndPlatform(projectId, "clarity"),
    getLegacySnippets(project),
  ]);
  const blockingLegacySnippets = legacySnippets.filter((snippet) => snippet.isEnabled);
  const hasDataExportToken = integration
    ? await WebsiteIntegrationModel.hasCredentials(integration.id)
    : false;

  return {
    integration: integration ?? null,
    suggestedProjectId: getSuggestedProjectId(integration, legacySnippets),
    hasDataExportToken,
    legacySnippets,
    blockingLegacySnippets,
    canConnect: blockingLegacySnippets.length === 0,
  };
}

export async function disableLegacySnippets(
  projectId: string,
  snippetIds: string[],
): Promise<ClarityStatus> {
  await requireProject(projectId);
  await disableProjectSnippets(projectId, snippetIds);
  return getStatus(projectId);
}

export async function saveIntegration(
  projectId: string,
  projectIdInput: unknown,
  options: {
    apiToken?: unknown;
    disableSnippetIds?: string[];
    connectedBy?: IntegrationConnectedBy;
  } = {},
): Promise<{ integration: IWebsiteIntegrationSafe; status: ClarityStatus }> {
  const clarityProjectId = sanitizeProjectId(projectIdInput);
  const apiToken = sanitizeOptionalToken(options.apiToken);
  const connectedBy = options.connectedBy ?? "admin";
  const disableSnippetIds = options.disableSnippetIds ?? [];

  if (disableSnippetIds.length > 0) {
    await disableProjectSnippets(projectId, disableSnippetIds);
  }

  const preflight = await getStatus(projectId);
  if (preflight.blockingLegacySnippets.length > 0) {
    throw new ClarityIntegrationError(
      409,
      "LEGACY_SCRIPT_PRESENT",
      "Remove or disable the existing Clarity header/footer script before connecting the integration",
      { legacySnippets: preflight.blockingLegacySnippets },
    );
  }

  if (apiToken) {
    await validateApiToken(clarityProjectId, apiToken);
  }

  const integration = await db.transaction(async (trx) => {
    const existing = await WebsiteIntegrationModel.findByProjectAndPlatform(
      projectId,
      "clarity",
      trx,
    );
    const existingProjectId = getMetadataProjectId(existing);
    const shouldPreserveToken =
      !apiToken &&
      !!existing &&
      existingProjectId === clarityProjectId &&
      (await WebsiteIntegrationModel.hasCredentials(existing.id, trx));
    const type = apiToken || shouldPreserveToken ? "hybrid" : "script_injection";
    const credentials = apiToken ? apiToken : shouldPreserveToken ? undefined : null;
    const metadata = {
      ...(existing?.metadata ?? {}),
      projectId: clarityProjectId,
    };

    const saved = existing
      ? await WebsiteIntegrationModel.update(existing.id, {
          type,
          credentials,
          metadata,
          status: "active",
          connected_by: connectedBy,
          last_validated_at: apiToken ? new Date() : existing.last_validated_at,
          last_error: null,
        }, trx)
      : await WebsiteIntegrationModel.create({
          project_id: projectId,
          platform: "clarity",
          type,
          credentials: apiToken,
          connected_by: connectedBy,
          metadata,
          status: "active",
        }, trx);

    if (!saved) {
      throw new ClarityIntegrationError(
        500,
        "SAVE_FAILED",
        "Failed to save Clarity integration",
      );
    }

    return saved;
  });

  return {
    integration,
    status: await getStatus(projectId),
  };
}
