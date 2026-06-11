import { apiDelete, apiGet, apiPost } from "./index";

export type AiSeoAuditScope = "url_only" | "organization" | "sitewide" | "location";
export type AiSeoAuditStatus = "queued" | "running" | "completed" | "failed";
export type AiSeoConfidence = "low" | "medium" | "high";
export type AiSeoResultStatus =
  | "pass"
  | "partial"
  | "fail"
  | "unavailable"
  | "not_applicable";
export type AiSeoCategoryId =
  | "access_indexability"
  | "page_source_readiness"
  | "entity_external_consistency"
  | "connected_performance"
  | "authority_market";
export type AiSeoExternalMatchState =
  | "consistent"
  | "conflicting"
  | "missing_on_site"
  | "external_candidate"
  | "ambiguous_entity"
  | "unavailable";

export type AiSeoCategorySummary = {
  id: AiSeoCategoryId;
  label: string;
  weight: number;
  score: number | null;
  availablePoints: number;
  awardedPoints: number;
};

export type AiSeoHardCap = {
  code: string;
  label: string;
  maxScore: number;
  evidence: Record<string, unknown>;
};

export type AiSeoAuditRun = {
  id: string;
  scope: AiSeoAuditScope;
  status: AiSeoAuditStatus;
  organization_id: number | null;
  project_id: string | null;
  requested_url: string | null;
  normalized_url: string | null;
  score: string | number | null;
  data_coverage: string | number | null;
  confidence: AiSeoConfidence | null;
  rule_version: string;
  hard_caps: AiSeoHardCap[];
  summary: {
    categories?: AiSeoCategorySummary[];
    targetCount?: number;
    completedTargetCount?: number;
    totalPages?: number;
    message?: string;
    progress?: {
      step: string;
      detail?: Record<string, unknown>;
      updatedAt?: string;
    };
    [key: string]: unknown;
  };
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AiSeoAuditTarget = {
  id: string;
  run_id: string;
  target_type: "page" | "location" | "site";
  page_id: string | null;
  location_id: number | null;
  url: string;
  label: string | null;
  score: string | number | null;
  data_coverage: string | number | null;
  confidence: AiSeoConfidence | null;
  mapping_confidence: string | number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AiSeoAuditResult = {
  id: string;
  run_id: string;
  target_id: string | null;
  category: AiSeoCategoryId;
  check_id: string;
  status: AiSeoResultStatus;
  weight: string | number;
  points_awarded: string | number;
  method: "deterministic" | "llm_assisted" | "integration";
  data_scope: "url" | "organization" | "location" | "external";
  remediation: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type AiSeoAuditEvidence = {
  id: string;
  result_id: string;
  evidence_type: string;
  source: string;
  excerpt: string | null;
  value: Record<string, unknown>;
  created_at: string;
};

export type AiSeoAuditExternalSource = {
  id: string;
  run_id: string;
  target_id: string | null;
  query: string;
  url: string;
  title: string | null;
  source_host: string;
  source_type: string | null;
  reliability_score: string | number | null;
  entity_match_state: AiSeoExternalMatchState;
  extracted_fields: Record<string, unknown>;
  compared_fields: Record<string, unknown>;
  metadata: Record<string, unknown>;
  fetched_at: string | null;
  created_at: string;
};

export type AiSeoAuditDetail = {
  run: AiSeoAuditRun;
  targets: AiSeoAuditTarget[];
  results: AiSeoAuditResult[];
  evidence: AiSeoAuditEvidence[];
  externalSources: AiSeoAuditExternalSource[];
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: { code: string; message: string; details?: unknown } | null;
};

function unwrap<T>(response: ApiEnvelope<T>): T {
  if (!response?.success) {
    throw new Error(response?.error?.message || "AI/SEO audit request failed.");
  }
  return response.data;
}

export type AiSeoAuditRunFilters = {
  organizationId?: number | null;
  scope?: AiSeoAuditScope | null;
};

export async function adminListAiSeoAuditRuns(
  filters: AiSeoAuditRunFilters = {},
) {
  const search = new URLSearchParams();
  search.set("limit", "25");
  if (filters.organizationId) {
    search.set("organizationId", String(filters.organizationId));
  }
  if (filters.scope) search.set("scope", filters.scope);
  return unwrap<{ runs: AiSeoAuditRun[] }>(
    await apiGet({ path: `/admin/ai-seo-audit/runs?${search.toString()}` })
  );
}

export async function adminGetAiSeoAuditRun(runId: string) {
  return unwrap<AiSeoAuditDetail>(
    await apiGet({ path: `/admin/ai-seo-audit/runs/${runId}` })
  );
}

export async function adminCreateUrlAiSeoAudit(url: string) {
  return unwrap<AiSeoAuditDetail>(
    await apiPost({
      path: "/admin/ai-seo-audit/url",
      passedData: { url },
    })
  );
}

export async function adminCreateOrganizationAiSeoAudit(organizationId: number) {
  return unwrap<AiSeoAuditDetail>(
    await apiPost({
      path: `/admin/ai-seo-audit/organizations/${organizationId}`,
      passedData: {},
    })
  );
}

export async function adminListAuditableOrganizationIds() {
  return unwrap<{ organizationIds: number[] }>(
    await apiGet({ path: "/admin/ai-seo-audit/auditable-organizations" })
  );
}

export async function adminDeleteAiSeoAuditRun(runId: string) {
  return unwrap<{ id: string }>(
    await apiDelete({ path: `/admin/ai-seo-audit/runs/${runId}` })
  );
}

export async function adminDeleteAiSeoAuditRuns(filters: AiSeoAuditRunFilters = {}) {
  const search = new URLSearchParams();
  if (filters.organizationId) {
    search.set("organizationId", String(filters.organizationId));
  }
  if (filters.scope) search.set("scope", filters.scope);
  const query = search.toString();
  return unwrap<{ deletedCount: number }>(
    await apiDelete({
      path: `/admin/ai-seo-audit/runs${query ? `?${query}` : ""}`,
    })
  );
}
