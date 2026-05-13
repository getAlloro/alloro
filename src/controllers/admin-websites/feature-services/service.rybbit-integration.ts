import { db } from "../../../database/connection";
import { HeaderFooterCodeModel, type IHeaderFooterCode } from "../../../models/website-builder/HeaderFooterCodeModel";
import { ProjectModel, type IProject } from "../../../models/website-builder/ProjectModel";
import {
  WebsiteIntegrationModel,
  type IntegrationConnectedBy,
  type IWebsiteIntegrationSafe,
} from "../../../models/website-builder/WebsiteIntegrationModel";
import {
  compactSnippetCode,
  extractRybbitSiteId,
  isRybbitSnippetCode,
} from "../feature-utils/util.rybbit-snippet";

const RYBBIT_API_URL = process.env.RYBBIT_API_URL || "";
const RYBBIT_API_KEY = process.env.RYBBIT_API_KEY || "";

export type RybbitSnippetScope = "project" | "template";

export interface LegacyRybbitSnippet {
  id: string;
  scope: RybbitSnippetScope;
  name: string;
  location: string;
  isEnabled: boolean;
  orderIndex: number;
  siteId: string | null;
  codePreview: string;
  canDisable: boolean;
}

export interface RybbitStatus {
  integration: IWebsiteIntegrationSafe | null;
  projectSiteId: string | null;
  suggestedSiteId: string | null;
  legacySnippets: LegacyRybbitSnippet[];
  blockingLegacySnippets: LegacyRybbitSnippet[];
  canConnect: boolean;
}

export class RybbitIntegrationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
  }
}

function sanitizeSiteId(value: unknown): string {
  const siteId = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(siteId)) {
    throw new RybbitIntegrationError(
      400,
      "INVALID_SITE_ID",
      "A valid Rybbit site ID is required",
    );
  }
  return siteId;
}

function toLegacySnippet(
  snippet: IHeaderFooterCode,
  scope: RybbitSnippetScope,
): LegacyRybbitSnippet {
  return {
    id: snippet.id,
    scope,
    name: snippet.name,
    location: snippet.location,
    isEnabled: snippet.is_enabled,
    orderIndex: snippet.order_index,
    siteId: extractRybbitSiteId(snippet.code),
    codePreview: compactSnippetCode(snippet.code),
    canDisable: scope === "project",
  };
}

async function requireProject(projectId: string): Promise<IProject> {
  const project = await ProjectModel.findById(projectId);
  if (!project) {
    throw new RybbitIntegrationError(404, "PROJECT_NOT_FOUND", "Website project not found");
  }
  return project;
}

async function getLegacySnippets(
  project: IProject,
): Promise<LegacyRybbitSnippet[]> {
  const [projectSnippets, templateSnippets] = await Promise.all([
    HeaderFooterCodeModel.findByProjectId(project.id),
    project.template_id
      ? HeaderFooterCodeModel.findByTemplateId(project.template_id)
      : Promise.resolve([]),
  ]);

  return [
    ...projectSnippets
      .filter((snippet) => isRybbitSnippetCode(snippet.code))
      .map((snippet) => toLegacySnippet(snippet, "project")),
    ...templateSnippets
      .filter((snippet) => isRybbitSnippetCode(snippet.code))
      .map((snippet) => toLegacySnippet(snippet, "template")),
  ];
}

function getSuggestedSiteId(
  integration: IWebsiteIntegrationSafe | undefined,
  project: IProject,
  legacySnippets: LegacyRybbitSnippet[],
): string | null {
  const metadataSiteId = integration?.metadata?.siteId;
  if (typeof metadataSiteId === "string" && metadataSiteId.trim()) {
    return metadataSiteId.trim();
  }
  if (project.rybbit_site_id) return project.rybbit_site_id;
  return legacySnippets.find((snippet) => !!snippet.siteId)?.siteId ?? null;
}

export async function getStatus(projectId: string): Promise<RybbitStatus> {
  const project = await requireProject(projectId);
  const [integration, legacySnippets] = await Promise.all([
    WebsiteIntegrationModel.findByProjectAndPlatform(projectId, "rybbit"),
    getLegacySnippets(project),
  ]);
  const blockingLegacySnippets = legacySnippets.filter((snippet) => snippet.isEnabled);

  return {
    integration: integration ?? null,
    projectSiteId: project.rybbit_site_id ?? null,
    suggestedSiteId: getSuggestedSiteId(integration, project, legacySnippets),
    legacySnippets,
    blockingLegacySnippets,
    canConnect: blockingLegacySnippets.length === 0,
  };
}

async function validateSiteId(siteId: string): Promise<void> {
  if (!RYBBIT_API_URL || !RYBBIT_API_KEY) {
    throw new RybbitIntegrationError(
      500,
      "MISSING_CONFIG",
      "Rybbit API configuration is missing",
    );
  }

  const response = await fetch(`${RYBBIT_API_URL}/api/sites/${siteId}`, {
    headers: { Authorization: `Bearer ${RYBBIT_API_KEY}` },
  });

  if (response.ok) return;

  if (response.status === 404) {
    throw new RybbitIntegrationError(
      404,
      "SITE_NOT_FOUND",
      `Rybbit site ${siteId} was not found`,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new RybbitIntegrationError(
      401,
      "AUTH_FAILED",
      "Rybbit API key is invalid or expired",
    );
  }

  throw new RybbitIntegrationError(
    502,
    "RYBBIT_API_ERROR",
    `Rybbit returned ${response.status} while validating the site`,
  );
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
    throw new RybbitIntegrationError(
      400,
      "INVALID_SNIPPET",
      "One or more snippets cannot be disabled from this website",
      { snippetIds: invalidIds },
    );
  }

  const nonRybbitIds = snippets
    .filter((snippet) => !isRybbitSnippetCode(snippet.code))
    .map((snippet) => snippet.id);
  if (nonRybbitIds.length > 0) {
    throw new RybbitIntegrationError(
      400,
      "INVALID_SNIPPET",
      "Only detected Rybbit snippets can be disabled from this flow",
      { snippetIds: nonRybbitIds },
    );
  }

  return HeaderFooterCodeModel.setProjectSnippetsEnabled(
    projectId,
    uniqueIds,
    false,
  );
}

export async function disableLegacySnippets(
  projectId: string,
  snippetIds: string[],
): Promise<RybbitStatus> {
  await requireProject(projectId);
  await disableProjectSnippets(projectId, snippetIds);
  return getStatus(projectId);
}

export async function saveIntegration(
  projectId: string,
  siteIdInput: unknown,
  options: {
    disableSnippetIds?: string[];
    connectedBy?: IntegrationConnectedBy;
    skipValidation?: boolean;
  } = {},
): Promise<{ integration: IWebsiteIntegrationSafe; status: RybbitStatus }> {
  const siteId = sanitizeSiteId(siteIdInput);
  const connectedBy = options.connectedBy ?? "admin";
  const disableSnippetIds = options.disableSnippetIds ?? [];

  if (disableSnippetIds.length > 0) {
    await disableProjectSnippets(projectId, disableSnippetIds);
  }

  const preflight = await getStatus(projectId);
  if (preflight.blockingLegacySnippets.length > 0) {
    throw new RybbitIntegrationError(
      409,
      "LEGACY_SCRIPT_PRESENT",
      "Remove or disable the existing Rybbit header/footer script before connecting the integration",
      { legacySnippets: preflight.blockingLegacySnippets },
    );
  }

  if (!options.skipValidation) {
    await validateSiteId(siteId);
  }

  const integration = await db.transaction(async (trx) => {
    const existing = await WebsiteIntegrationModel.findByProjectAndPlatform(
      projectId,
      "rybbit",
      trx,
    );
    const metadata = {
      ...(existing?.metadata ?? {}),
      siteId,
    };

    const saved = existing
      ? await WebsiteIntegrationModel.update(existing.id, {
          type: "hybrid",
          metadata,
          status: "active",
          connected_by: connectedBy,
          last_error: null,
        }, trx)
      : await WebsiteIntegrationModel.create({
          project_id: projectId,
          platform: "rybbit",
          type: "hybrid",
          connected_by: connectedBy,
          metadata,
          status: "active",
        }, trx);

    await ProjectModel.updateRybbitSiteId(projectId, siteId, trx);

    if (!saved) {
      throw new RybbitIntegrationError(
        500,
        "SAVE_FAILED",
        "Failed to save Rybbit integration",
      );
    }

    return saved;
  });

  return {
    integration,
    status: await getStatus(projectId),
  };
}
