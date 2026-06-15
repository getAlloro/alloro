import { adminFetch, apiGet, apiPost } from "./index";

/**
 * Website Integrations API — admin portal client for per-website connectors.
 *
 * Adapter-agnostic types so future vendors slot in.
 */

// =====================================================================
// TYPES
// =====================================================================

export type IntegrationStatus = "active" | "revoked" | "broken";
export type IntegrationType = "crm_push" | "script_injection" | "data_harvest" | "hybrid";
export type IntegrationPlatform = "hubspot" | "rybbit" | "clarity" | "gsc";
export type MappingStatus = "active" | "broken";
export type CrmSyncOutcome = "success" | "skipped_flagged" | "failed" | "no_mapping";
export type HarvestOutcome = "success" | "failed";

export interface Integration {
  id: string;
  project_id: string;
  platform: IntegrationPlatform;
  type: IntegrationType;
  label: string | null;
  metadata: Record<string, unknown>;
  status: IntegrationStatus;
  connected_by: string | null;
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface HarvestLog {
  id: string;
  integration_id: string | null;
  platform: string | null;
  harvest_date: string;
  outcome: HarvestOutcome;
  rows_fetched: number | null;
  error: string | null;
  error_details: string | null;
  retry_count: number;
  attempted_at: string;
}

export interface HarvestLogPayload {
  platform: IntegrationPlatform;
  harvestDate: string;
  payloadKind: "stored_data" | "harvest_log";
  payloadSizeBytes: number;
  log: {
    id: string;
    outcome: HarvestOutcome;
    rowsFetched: number | null;
    error: string | null;
    errorDetails: string | null;
    attemptedAt: string;
  };
  data: unknown;
}

export interface SuccessRate {
  total: number;
  successful: number;
  failed: number;
}

export interface GscMetricSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscDailyPoint extends GscMetricSummary {
  date: string;
  sourceRows: number;
}

export interface GscDimensionRow extends GscMetricSummary {
  key: string;
}

export interface GscPerformanceDashboard {
  rangeDays: number;
  fromDate: string | null;
  toDate: string | null;
  latestReportDate: string | null;
  dataDays: number;
  totals: GscMetricSummary;
  daily: GscDailyPoint[];
  topQueries: GscDimensionRow[];
  topPages: GscDimensionRow[];
  topCountries: GscDimensionRow[];
  topDevices: GscDimensionRow[];
  limitations: string[];
}

export interface RybbitLegacySnippet {
  id: string;
  scope: "project" | "template";
  name: string;
  location: string;
  isEnabled: boolean;
  orderIndex: number;
  siteId: string | null;
  codePreview: string;
  canDisable: boolean;
}

export interface RybbitStatus {
  integration: Integration | null;
  projectSiteId: string | null;
  projectTimeZone: string | null;
  suggestedSiteId: string | null;
  legacySnippets: RybbitLegacySnippet[];
  blockingLegacySnippets: RybbitLegacySnippet[];
  canConnect: boolean;
}

export interface ClarityLegacySnippet {
  id: string;
  scope: "project" | "template";
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
  integration: Integration | null;
  suggestedProjectId: string | null;
  hasDataExportToken: boolean;
  legacySnippets: ClarityLegacySnippet[];
  blockingLegacySnippets: ClarityLegacySnippet[];
  canConnect: boolean;
  completeness: ClarityCompleteness;
}

export interface RybbitMetricSummary {
  sessions: number;
  pageviews: number;
  users: number;
  bounceRate: number;
  pagesPerSession: number;
  sessionDuration: number;
}

export interface RybbitDailyPoint extends RybbitMetricSummary {
  date: string;
}

export interface RybbitRawRow extends RybbitDailyPoint {
  id: string;
  raw: Record<string, unknown>;
}

export interface RybbitDashboard {
  rangeDays: number;
  fromDate: string | null;
  toDate: string | null;
  latestReportDate: string | null;
  dataDays: number;
  totals: RybbitMetricSummary;
  daily: RybbitDailyPoint[];
  rows: RybbitRawRow[];
  rowsTotal: number;
  rowsLimit: number;
  rowsOffset: number;
  limitations: string[];
}

export interface RybbitBackfillSkip {
  integrationId: string;
  projectId: string;
  siteId: string | null;
  code: string;
  reason: string;
}

export interface RybbitHistoricBackfillResult {
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
}

export interface RybbitAllHistoricBackfillResult {
  queued: boolean;
  projectsTotal: number;
  projectsQueued: number;
  queuedDays: number;
  clearedDataRows: number;
  clearedLogRows: number;
  results: RybbitHistoricBackfillResult[];
  skipped: RybbitBackfillSkip[];
}

export interface IntegrationFormMapping {
  id: string;
  integration_id: string;
  website_form_name: string;
  vendor_form_id: string;
  vendor_form_name: string | null;
  field_mapping: Record<string, string>;
  status: MappingStatus;
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DetectedForm {
  form_name: string;
  submission_count: number;
  last_seen: string;
}

export interface FieldShapeEntry {
  key: string;
  occurrence_count: number;
  sample_value: string | null;
}

export interface VendorFormField {
  name: string;
  label: string;
  fieldType: string;
  required: boolean;
}

export interface VendorForm {
  id: string;
  name: string;
  fields: VendorFormField[];
}

export interface SyncLog {
  id: string;
  integration_id: string | null;
  mapping_id: string | null;
  submission_id: string | null;
  platform: string | null;
  vendor_form_id: string | null;
  outcome: CrmSyncOutcome;
  vendor_response_status: number | null;
  vendor_response_body: string | null;
  error: string | null;
  attempted_at: string;
}

export interface InferMappingResponse {
  vendor_form: VendorForm;
  website_fields: FieldShapeEntry[];
  inferred_mapping: Record<string, string>;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  pagination?: { limit: number; offset: number; total: number };
}

interface ApiFailure {
  success?: boolean;
  successful?: boolean;
  message?: string;
  error?: string;
  errorMessage?: string;
}

const BASE = "/api/admin/websites";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await adminFetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
      else if (body?.error) msg = body.error;
    } catch {
      /* swallow */
    }
    throw new Error(msg);
  }
  return res.json();
}

function assertApiSuccess<T extends ApiFailure>(response: T): T {
  const hasFailureFlag =
    response.success === false || response.successful === false;
  const hasErrorPayload =
    response.success !== true && !!(response.error || response.errorMessage);

  if (hasFailureFlag || hasErrorPayload) {
    throw new Error(
      response.message ||
        response.error ||
        response.errorMessage ||
        "Request failed",
    );
  }
  return response;
}

async function authedGet<T extends ApiFailure>(path: string): Promise<T> {
  return assertApiSuccess((await apiGet({ path })) as T);
}

async function authedPost<T extends ApiFailure>(
  path: string,
  payload: object,
): Promise<T> {
  return assertApiSuccess((await apiPost({ path, passedData: payload })) as T);
}

// =====================================================================
// INTEGRATIONS CRUD
// =====================================================================

export const fetchIntegrations = (projectId: string) =>
  request<Envelope<Integration[]>>(`/${projectId}/integrations`);

export const getIntegration = (projectId: string, integrationId: string) =>
  request<Envelope<Integration>>(`/${projectId}/integrations/${integrationId}`);

export const createIntegration = (
  projectId: string,
  payload: { platform: string; label?: string | null; credentials: string },
) =>
  request<Envelope<Integration>>(`/${projectId}/integrations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateIntegration = (
  projectId: string,
  integrationId: string,
  payload: { label?: string | null; credentials?: string },
) =>
  request<Envelope<Integration>>(`/${projectId}/integrations/${integrationId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteIntegration = (projectId: string, integrationId: string) =>
  request<Envelope<{ deleted: boolean }>>(`/${projectId}/integrations/${integrationId}`, {
    method: "DELETE",
  });

export const revokeIntegration = (projectId: string, integrationId: string) =>
  request<Envelope<Integration>>(`/${projectId}/integrations/${integrationId}/revoke`, {
    method: "POST",
  });

// =====================================================================
// VENDOR FORMS + VALIDATION
// =====================================================================

export const fetchVendorForms = (projectId: string, integrationId: string) =>
  request<Envelope<VendorForm[]>>(`/${projectId}/integrations/${integrationId}/vendor-forms`);

export const validateMappings = (projectId: string, integrationId: string) =>
  request<Envelope<IntegrationFormMapping[]>>(
    `/${projectId}/integrations/${integrationId}/validate-mappings`,
    { method: "POST" },
  );

// =====================================================================
// DETECTED FORMS (from form_submissions)
// =====================================================================

export const fetchDetectedForms = (projectId: string) =>
  request<Envelope<DetectedForm[]>>(`/${projectId}/detected-forms`);

export const fetchDetectedFormFieldShape = (
  projectId: string,
  formName: string,
  sampleSize = 20,
) =>
  request<Envelope<FieldShapeEntry[]>>(
    `/${projectId}/detected-forms/${encodeURIComponent(formName)}/field-shape?sampleSize=${sampleSize}`,
  );

// =====================================================================
// MAPPINGS CRUD
// =====================================================================

export const fetchMappings = (projectId: string, integrationId: string) =>
  request<Envelope<IntegrationFormMapping[]>>(
    `/${projectId}/integrations/${integrationId}/mappings`,
  );

export const createMapping = (
  projectId: string,
  integrationId: string,
  payload: {
    website_form_name: string;
    vendor_form_id: string;
    vendor_form_name?: string | null;
    field_mapping?: Record<string, string>;
  },
) =>
  request<Envelope<IntegrationFormMapping>>(
    `/${projectId}/integrations/${integrationId}/mappings`,
    { method: "POST", body: JSON.stringify(payload) },
  );

export const updateMapping = (
  projectId: string,
  integrationId: string,
  mappingId: string,
  payload: {
    vendor_form_id?: string;
    vendor_form_name?: string | null;
    field_mapping?: Record<string, string>;
    status?: MappingStatus;
  },
) =>
  request<Envelope<IntegrationFormMapping>>(
    `/${projectId}/integrations/${integrationId}/mappings/${mappingId}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );

export const deleteMapping = (
  projectId: string,
  integrationId: string,
  mappingId: string,
) =>
  request<Envelope<{ deleted: boolean }>>(
    `/${projectId}/integrations/${integrationId}/mappings/${mappingId}`,
    { method: "DELETE" },
  );

export const inferMapping = (
  projectId: string,
  integrationId: string,
  payload: { website_form_name: string; vendor_form_id: string },
) =>
  request<Envelope<InferMappingResponse>>(
    `/${projectId}/integrations/${integrationId}/infer-mapping`,
    { method: "POST", body: JSON.stringify(payload) },
  );

// =====================================================================
// SYNC LOGS
// =====================================================================

export const fetchSyncLogs = (
  projectId: string,
  integrationId: string,
  opts: { limit?: number; offset?: number } = {},
) => {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<Envelope<SyncLog[]> & { pagination: { limit: number; offset: number; total: number } }>(
    `/${projectId}/integrations/${integrationId}/sync-logs${suffix}`,
  );
};

// =====================================================================
// HARVEST INTEGRATIONS (Rybbit, Clarity, GSC)
// =====================================================================

export const validateHarvestIntegration = (projectId: string, integrationId: string) =>
  request<Envelope<{ valid: boolean; error?: string; message?: string }>>(
    `/${projectId}/integrations/${integrationId}/validate`,
    { method: "POST" },
  );

export const fetchHarvestLogs = (
  projectId: string,
  integrationId: string,
  opts: { limit?: number; offset?: number } = {},
) => {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<Envelope<HarvestLog[]> & { data: { data: HarvestLog[]; total: number; successRate: SuccessRate } }>(
    `/${projectId}/integrations/${integrationId}/harvest-logs${suffix}`,
  );
};

export const fetchHarvestLogPayload = (
  projectId: string,
  integrationId: string,
  logId: string,
) =>
  request<Envelope<HarvestLogPayload>>(
    `/${projectId}/integrations/${integrationId}/harvest-logs/${logId}/payload`,
  );

export const rerunHarvest = (
  projectId: string,
  integrationId: string,
  harvestDate: string,
) =>
  authedPost<Envelope<{ queued: boolean; harvestDate: string; retryCount: number }>>(
    `/admin/websites/${projectId}/integrations/${integrationId}/rerun`,
    { harvestDate },
  );

export const fetchGscPerformance = (
  projectId: string,
  integrationId: string,
  rangeDays: number,
) =>
  authedGet<Envelope<GscPerformanceDashboard>>(
    `/admin/websites/${projectId}/integrations/${integrationId}/gsc/performance?rangeDays=${rangeDays}`,
  );

export const fetchRybbitStatus = (projectId: string) =>
  authedGet<Envelope<RybbitStatus>>(
    `/admin/websites/${projectId}/integrations/rybbit/status`,
  );

export const createRybbitIntegration = (
  projectId: string,
  payload: { siteId: string; disableSnippetIds?: string[]; timeZone?: string | null },
) =>
  authedPost<Envelope<{ integration: Integration; status: RybbitStatus }>>(
    `/admin/websites/${projectId}/integrations/rybbit`,
    payload,
  );

export const disableRybbitLegacySnippets = (
  projectId: string,
  snippetIds: string[],
) =>
  authedPost<Envelope<RybbitStatus>>(
    `/admin/websites/${projectId}/integrations/rybbit/legacy-snippets/disable`,
    { snippetIds },
  );

export const fetchRybbitPerformance = (
  projectId: string,
  integrationId: string,
  opts: { rangeDays: number; limit?: number; offset?: number },
) => {
  const params = new URLSearchParams({ rangeDays: String(opts.rangeDays) });
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  return authedGet<Envelope<RybbitDashboard>>(
    `/admin/websites/${projectId}/integrations/${integrationId}/rybbit/performance?${params.toString()}`,
  );
};

export const backfillRybbitHistory = (
  projectId: string,
  integrationId: string,
) =>
  authedPost<Envelope<RybbitHistoricBackfillResult>>(
    `/admin/websites/${projectId}/integrations/${integrationId}/rybbit/backfill`,
    {},
  );

export const backfillAllRybbitHistory = () =>
  authedPost<Envelope<RybbitAllHistoricBackfillResult>>(
    "/admin/websites/integrations/rybbit/backfill-all",
    {},
  );

export const fetchClarityStatus = (projectId: string) =>
  authedGet<Envelope<ClarityStatus>>(
    `/admin/websites/${projectId}/integrations/clarity/status`,
  );

export const saveClarityIntegration = (
  projectId: string,
  payload: {
    projectId: string;
    apiToken?: string;
    disableSnippetIds?: string[];
  },
) =>
  authedPost<Envelope<{ integration: Integration; status: ClarityStatus }>>(
    `/admin/websites/${projectId}/integrations/clarity`,
    payload,
  );

export const disableClarityLegacySnippets = (
  projectId: string,
  snippetIds: string[],
) =>
  authedPost<Envelope<ClarityStatus>>(
    `/admin/websites/${projectId}/integrations/clarity/legacy-snippets/disable`,
    { snippetIds },
  );

export const validateClarityIntegration = (projectId: string) =>
  authedPost<Envelope<ClarityValidationResult>>(
    `/admin/websites/${projectId}/integrations/clarity/validate`,
    {},
  );

// =====================================================================
// GSC (Google Search Console) — admin connect flow
// =====================================================================

export interface GscConnection {
  id: number;
  email: string;
  organization_id?: number;
  connectionOwner: "admin" | "organization";
  sourceLabel: string;
}

export interface GscSite {
  siteUrl: string;
  permissionLevel: string | null;
}

export interface InitialHarvestResult {
  queued: boolean;
  harvestDate: string;
  warning?: string;
}

export interface GscHistoricBackfillResponse {
  queued: boolean;
  fromDate: string;
  toDate: string;
  queuedDays: number;
  clearedDataRows: number;
  clearedLogRows: number;
}

export interface GscIntegrationCreateResponse {
  integration: Integration;
  initialHarvest: InitialHarvestResult;
}

export interface GoogleReconnectResponse {
  success: boolean;
  authUrl?: string;
  state?: string;
  requestedScopes?: string[];
  message?: string;
  error?: string;
}

export const fetchGscConnections = (projectId: string) =>
  authedGet<Envelope<GscConnection[]>>(
    `/admin/websites/${projectId}/integrations/gsc/connections`,
  );

export const fetchGscSites = (projectId: string, connectionId: number) =>
  authedGet<Envelope<GscSite[]>>(
    `/admin/websites/${projectId}/integrations/gsc/sites?connectionId=${connectionId}`,
  );

export const createGscIntegration = (
  projectId: string,
  payload: { connectionId: number; siteUrl: string },
) =>
  authedPost<Envelope<GscIntegrationCreateResponse>>(
    `/admin/websites/${projectId}/integrations/gsc`,
    payload,
  );

export const backfillGscHistory = (
  projectId: string,
  integrationId: string,
) =>
  authedPost<Envelope<GscHistoricBackfillResponse>>(
    `/admin/websites/${projectId}/integrations/${integrationId}/gsc/backfill`,
    {},
  );

export const fetchUserGscIntegration = () =>
  authedGet<Envelope<Integration | null>>("/user/website/gsc");

export const fetchUserGscConnections = () =>
  authedGet<Envelope<GscConnection[]>>("/user/website/gsc/connections");

export const fetchUserGscSites = (connectionId: number) =>
  authedGet<Envelope<GscSite[]>>(
    `/user/website/gsc/sites?connectionId=${connectionId}`,
  );

export const saveUserGscIntegration = (payload: {
  connectionId: number;
  siteUrl: string;
}) => authedPost<Envelope<GscIntegrationCreateResponse>>("/user/website/gsc", payload);

export const getReconnectUrl = (scopes: string) =>
  apiGet({
    path: `/auth/google/reconnect?scopes=${encodeURIComponent(scopes)}`,
  }) as Promise<GoogleReconnectResponse>;
