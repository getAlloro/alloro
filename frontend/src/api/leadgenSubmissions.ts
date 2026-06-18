/**
 * Leadgen Submissions API — admin-gated endpoints for leadgen tool session
 * tracking. Uses the same apiGet pattern as admin-organizations.ts (Bearer
 * token via getPriorityItem). CSV export is fetched as a blob so the auth
 * header is preserved, then triggered via an anchor download.
 */

import { adminFetch, apiDelete, apiGet, apiPost } from "./index";
import type {
  ListFilters,
  ListResponse,
  SubmissionDetail,
  FunnelResponse,
  LeadgenStats,
} from "../types/leadgen";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

function buildQuery(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "boolean") {
      params.set(key, value ? "true" : "false");
      return;
    }
    params.set(key, String(value));
  });
  const q = params.toString();
  return q ? `?${q}` : "";
}

/**
 * GET /admin/leadgen-submissions — paginated list of sessions.
 */
export async function listSubmissions(
  filters: ListFilters = {}
): Promise<ListResponse> {
  const query = buildQuery({
    page: filters.page,
    pageSize: filters.pageSize,
    search: filters.search,
    status: filters.status,
    from: filters.from,
    to: filters.to,
    hasEmail: filters.hasEmail,
  });
  const data = await apiGet({
    path: `/admin/leadgen-submissions${query}`,
  });
  // Backend contract is { items, total, page, pageSize } on success; preserve
  // defensive defaults so the admin UI never crashes on empty/errored responses.
  if (data && Array.isArray(data.items)) {
    return {
      items: data.items,
      total: typeof data.total === "number" ? data.total : 0,
      page: typeof data.page === "number" ? data.page : filters.page ?? 1,
      pageSize:
        typeof data.pageSize === "number"
          ? data.pageSize
          : filters.pageSize ?? 25,
    };
  }
  return {
    items: [],
    total: 0,
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 25,
  };
}

/**
 * GET /admin/leadgen-submissions/:id — full detail with events + audit.
 */
export async function getSubmission(id: string): Promise<SubmissionDetail> {
  const data = await apiGet({ path: `/admin/leadgen-submissions/${id}` });
  if (data && data.session) {
    return {
      session: data.session,
      events: Array.isArray(data.events) ? data.events : [],
      audit: data.audit ?? null,
    };
  }
  throw new Error(data?.errorMessage || "Failed to load submission");
}

/**
 * GET /admin/leadgen-submissions/stats — four headline conversion metrics
 * for the admin stats strip. Respects the from/to date filter.
 */
export async function getStats(
  filters: Pick<ListFilters, "from" | "to"> = {}
): Promise<LeadgenStats> {
  const query = buildQuery({ from: filters.from, to: filters.to });
  const data = await apiGet({
    path: `/admin/leadgen-submissions/stats${query}`,
  });
  if (data && typeof data.total_sessions === "number") {
    return {
      total_sessions: data.total_sessions,
      total_conversions:
        typeof data.total_conversions === "number"
          ? data.total_conversions
          : 0,
      conversion_rate_pct:
        typeof data.conversion_rate_pct === "number"
          ? data.conversion_rate_pct
          : null,
      median_time_to_convert_ms:
        typeof data.median_time_to_convert_ms === "number"
          ? data.median_time_to_convert_ms
          : null,
    };
  }
  return {
    total_sessions: 0,
    total_conversions: 0,
    conversion_rate_pct: null,
    median_time_to_convert_ms: null,
  };
}

/**
 * GET /admin/leadgen-submissions/funnel — stage counts with drop-off %.
 */
export async function getFunnel(
  filters: Pick<ListFilters, "from" | "to"> = {}
): Promise<FunnelResponse> {
  const query = buildQuery({ from: filters.from, to: filters.to });
  const data = await apiGet({
    path: `/admin/leadgen-submissions/funnel${query}`,
  });
  if (data && Array.isArray(data.stages)) {
    return { stages: data.stages };
  }
  return { stages: [] };
}

/**
 * DELETE /admin/leadgen-submissions/:id — removes a session and cascades to
 * its leadgen_events (FK ON DELETE CASCADE). Associated audit_processes rows
 * have audit_id null'd but are preserved.
 */
export async function deleteSubmission(
  id: string
): Promise<{ deleted: true; id: string }> {
  const data = await apiDelete({ path: `/admin/leadgen-submissions/${id}` });
  if (data && data.deleted === true) {
    return { deleted: true, id: data.id ?? id };
  }
  throw new Error(data?.errorMessage || "Failed to delete submission");
}

/**
 * POST /admin/leadgen-submissions/bulk-delete — cascade-delete many sessions.
 * Returns the actual count of rows deleted (may be less than requested if
 * some were already gone).
 */
export async function bulkDeleteSubmissions(
  ids: string[]
): Promise<{ deleted: number }> {
  const data = await apiPost({
    path: `/admin/leadgen-submissions/bulk-delete`,
    passedData: { ids },
  });
  if (data && typeof data.deleted === "number") {
    return { deleted: data.deleted };
  }
  throw new Error(data?.errorMessage || "Failed to bulk delete");
}

/**
 * POST /admin/leadgen-submissions/:id/rerun — re-enqueue a failed audit.
 *
 * Bypasses the 3-retry cap the public endpoint enforces, and does NOT
 * increment the audit's `retry_count` (admin is an out-of-band override).
 * Resolves on 2xx; throws on any non-ok response so the caller can surface
 * a toast.
 */
export async function rerunSubmission(
  id: string
): Promise<{ ok: true; audit_id: string; retry_count: number }> {
  const data = await apiPost({
    path: `/admin/leadgen-submissions/${id}/rerun`,
    passedData: {},
  });
  if (data && data.ok === true && typeof data.audit_id === "string") {
    return {
      ok: true,
      audit_id: data.audit_id,
      retry_count:
        typeof data.retry_count === "number" ? data.retry_count : 0,
    };
  }
  throw new Error(data?.errorMessage || data?.message || "Failed to rerun audit");
}

/**
 * GET /admin/leadgen-submissions/export — streams CSV.
 *
 * Uses fetch + blob so the Authorization header is preserved (a plain
 * window.location.href redirect would drop it). The downloaded file is
 * named with today's date so repeat exports don't collide.
 */
export async function exportSubmissionsCsv(
  filters: ListFilters = {}
): Promise<void> {
  const query = buildQuery({
    search: filters.search,
    status: filters.status,
    from: filters.from,
    to: filters.to,
    hasEmail: filters.hasEmail,
  });

  const res = await adminFetch(
    `${API_BASE}/admin/leadgen-submissions/export${query}`,
    { credentials: "include" }
  );
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `leadgen-submissions-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
