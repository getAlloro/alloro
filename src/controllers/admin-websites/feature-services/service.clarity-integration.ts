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

export type ClarityTokenState = "valid" | "invalid" | "missing" | "error";
export type ClarityLiveTagState = "present" | "mismatch" | "absent" | "error";

export interface ClarityLiveTagCheck {
  status: ClarityLiveTagState;
  url: string | null;
  foundProjectIds: string[];
  message: string | null;
}

export interface ClarityValidationResult {
  projectIdValid: boolean;
  projectId: string | null;
  token: ClarityTokenState;
  liveTag: ClarityLiveTagCheck;
  isComplete: boolean;
  checkedAt: string;
}

export interface ClarityCompleteness {
  hasProjectId: boolean;
  hasToken: boolean;
  lastValidation: ClarityValidationResult | null;
  isComplete: boolean;
}

export interface ClarityStatus {
  integration: IWebsiteIntegrationSafe | null;
  suggestedProjectId: string | null;
  hasDataExportToken: boolean;
  legacySnippets: LegacyClaritySnippet[];
  blockingLegacySnippets: LegacyClaritySnippet[];
  canConnect: boolean;
  completeness: ClarityCompleteness;
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

  const lastValidation = readStoredValidation(integration);
  const completeness: ClarityCompleteness = {
    hasProjectId: !!getMetadataProjectId(integration),
    hasToken: hasDataExportToken,
    lastValidation,
    // Completeness is driven by the last live validation snapshot, never
    // recomputed here (the live probe is network-bound and only runs on the
    // explicit Validate action).
    isComplete: lastValidation?.isComplete === true,
  };

  return {
    integration: integration ?? null,
    suggestedProjectId: getSuggestedProjectId(integration, legacySnippets),
    hasDataExportToken,
    legacySnippets,
    blockingLegacySnippets,
    canConnect: blockingLegacySnippets.length === 0,
    completeness,
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function readStoredValidation(
  integration: IWebsiteIntegrationSafe | undefined | null,
): ClarityValidationResult | null {
  const stored = integration?.metadata?.validation;
  if (!stored || typeof stored !== "object") return null;
  return stored as ClarityValidationResult;
}

/**
 * Collects every distinct Clarity Project ID present in a page's HTML, covering
 * both the direct `clarity.ms/tag/{id}` form and the IIFE bootstrap argument.
 * Mirrors the patterns in util.clarity-snippet (the source of truth) but returns
 * all matches instead of the first.
 */
function collectClarityProjectIds(html: string): string[] {
  const ids = new Set<string>();
  const patterns = [
    /clarity\.ms\/tag\/([A-Za-z0-9_-]+)/gi,
    /["']clarity["']\s*,\s*["']script["']\s*,\s*["']([A-Za-z0-9_-]+)["']/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      if (match[1]) ids.add(match[1]);
    }
  }
  return Array.from(ids);
}

/**
 * Re-checks the stored Data Export token against the Clarity API WITHOUT
 * throwing — returns a state instead. A 401/403 means the token is bad; a 429
 * (daily limit) still proves the credentials authenticated, so it counts as
 * valid; anything else is unconfirmable ("error"), never "invalid".
 */
async function validateStoredToken(
  integrationId: string,
  clarityProjectId: string | null,
): Promise<ClarityTokenState> {
  if (!clarityProjectId) return "error";
  const token = await WebsiteIntegrationModel.getDecryptedCredentials(integrationId);
  if (!token) return "missing";
  try {
    await axios.get(CLARITY_API_BASE_URL, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      params: { projectId: clarityProjectId, numOfDays: "1" },
      timeout: 10000,
    });
    return "valid";
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) return "invalid";
    if (status === 429) return "valid";
    return "error";
  }
}

function resolvePublishedUrl(project: IProject): string | null {
  const host =
    project.custom_domain ||
    project.custom_domain_alt ||
    project.generated_hostname ||
    project.hostname ||
    null;
  if (!host) return null;
  return /^https?:\/\//i.test(host) ? host : `https://${host}`;
}

/**
 * Fetches the project's published page and checks whether the renderer-injected
 * Clarity tag for THIS integration's Project ID is live. Read-only network probe
 * against the project's own stored hostnames only.
 */
async function probeLiveTag(
  project: IProject,
  recordProjectId: string | null,
): Promise<ClarityLiveTagCheck> {
  const url = resolvePublishedUrl(project);
  if (!url) {
    return {
      status: "error",
      url: null,
      foundProjectIds: [],
      message: "This project has no published URL to probe",
    };
  }

  let html = "";
  try {
    const response = await axios.get(url, {
      timeout: 12000,
      maxContentLength: 5 * 1024 * 1024,
      maxRedirects: 3,
      responseType: "text",
      transformResponse: (data) => data,
      headers: { "User-Agent": "AlloroClarityValidator/1.0" },
      validateStatus: (statusCode) => statusCode >= 200 && statusCode < 400,
    });
    html = typeof response.data === "string" ? response.data : String(response.data ?? "");
  } catch (error: any) {
    return {
      status: "error",
      url,
      foundProjectIds: [],
      message: error?.message ? `Failed to fetch site: ${error.message}` : "Failed to fetch site",
    };
  }

  const foundProjectIds = collectClarityProjectIds(html);
  if (!recordProjectId) {
    return {
      status: "error",
      url,
      foundProjectIds,
      message: "Integration has no Project ID",
    };
  }
  if (foundProjectIds.includes(recordProjectId)) {
    return { status: "present", url, foundProjectIds, message: null };
  }
  if (foundProjectIds.length > 0) {
    return {
      status: "mismatch",
      url,
      foundProjectIds,
      message: `Live page serves a different Clarity project: ${foundProjectIds.join(", ")}`,
    };
  }
  return {
    status: "absent",
    url,
    foundProjectIds,
    message: "No Clarity tag detected on the published page",
  };
}

/**
 * Runs the three completeness checks (Project ID valid, token authenticates,
 * live tag present) and persists a snapshot. IMPORTANT: this never mutates the
 * integration `status` column — the renderer injects only `status='active'`
 * rows, so flipping to `broken`/`revoked` on a failed check would silently stop
 * live tracking. Only metadata.validation / last_validated_at / last_error move.
 */
export async function validateInstallation(
  projectId: string,
): Promise<ClarityValidationResult> {
  const project = await requireProject(projectId);
  const integration = await WebsiteIntegrationModel.findByProjectAndPlatform(
    projectId,
    "clarity",
  );
  if (!integration) {
    throw new ClarityIntegrationError(
      404,
      "NOT_CONNECTED",
      "Connect Clarity before validating the installation",
    );
  }

  const recordProjectId = getMetadataProjectId(integration);
  const projectIdValid = !!recordProjectId && /^[A-Za-z0-9_-]{4,64}$/.test(recordProjectId);

  const [token, liveTag] = await Promise.all([
    validateStoredToken(integration.id, recordProjectId),
    probeLiveTag(project, recordProjectId),
  ]);

  const isComplete = projectIdValid && token === "valid" && liveTag.status === "present";
  const result: ClarityValidationResult = {
    projectIdValid,
    projectId: recordProjectId,
    token,
    liveTag,
    isComplete,
    checkedAt: new Date().toISOString(),
  };

  const lastError = !projectIdValid
    ? "Integration is missing a valid Clarity Project ID"
    : token === "invalid"
      ? "Clarity API token is invalid or expired"
      : token === "missing"
        ? "Clarity API token not set"
        : liveTag.status === "mismatch"
          ? liveTag.message
          : liveTag.status === "absent"
            ? "Clarity tag not detected on the published site"
            : null;

  await WebsiteIntegrationModel.update(integration.id, {
    metadata: { ...(integration.metadata ?? {}), validation: result },
    last_validated_at: new Date(),
    last_error: lastError,
  });

  return result;
}
