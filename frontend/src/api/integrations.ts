import { apiGet } from "./index";

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

export interface SuccessRate {
  total: number;
  successful: number;
  failed: number;
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

const BASE = "/api/admin/websites";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
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

export const rerunHarvest = (
  projectId: string,
  integrationId: string,
  harvestDate: string,
) =>
  request<Envelope<{ queued: boolean; harvestDate: string; retryCount: number }>>(
    `/${projectId}/integrations/${integrationId}/rerun`,
    { method: "POST", body: JSON.stringify({ harvestDate }) },
  );

// =====================================================================
// GSC (Google Search Console) — admin connect flow
// =====================================================================

export interface GscConnection {
  id: number;
  email: string;
  organization_id?: number;
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
  request<Envelope<GscConnection[]>>(`/${projectId}/integrations/gsc/connections`);

export const fetchGscSites = (projectId: string, connectionId: number) =>
  request<Envelope<GscSite[]>>(`/${projectId}/integrations/gsc/sites?connectionId=${connectionId}`);

export const createGscIntegration = (
  projectId: string,
  payload: { connectionId: number; siteUrl: string },
) =>
  request<Envelope<GscIntegrationCreateResponse>>(`/${projectId}/integrations/gsc`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getReconnectUrl = (scopes: string) =>
  apiGet({
    path: `/auth/google/reconnect?scopes=${encodeURIComponent(scopes)}`,
  }) as Promise<GoogleReconnectResponse>;
