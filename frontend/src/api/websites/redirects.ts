/**
 * Websites API - redirects, AI command batch list/rename/delete, AI costs
 *
 * Re-exported via the `src/api/websites.ts` barrel.
 */

import { adminFetch } from "../index";
import { API_BASE } from "./_shared";
import type { AiCommandBatch } from "./ai-command";

// =====================================================================
// REDIRECTS
// =====================================================================

export interface Redirect {
  id: string;
  project_id: string;
  from_path: string;
  to_path: string;
  type: number;
  is_wildcard: boolean;
  created_at: string;
  updated_at: string;
}

export const listRedirects = async (
  projectId: string,
): Promise<{ success: boolean; data: Redirect[] }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/redirects`);
  if (!response.ok) throw new Error("Failed to list redirects");
  return response.json();
};

export const createRedirect = async (
  projectId: string,
  data: { from_path: string; to_path: string; type?: number },
): Promise<{ success: boolean; data: Redirect }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/redirects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to create redirect");
  }
  return response.json();
};

export const updateRedirect = async (
  projectId: string,
  redirectId: string,
  data: Partial<{ from_path: string; to_path: string; type: number }>,
): Promise<{ success: boolean; data: Redirect }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/redirects/${redirectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update redirect");
  return response.json();
};

export const deleteRedirect = async (
  projectId: string,
  redirectId: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/redirects/${redirectId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete redirect");
  return response.json();
};

export const listAiCommandBatches = async (
  projectId: string,
): Promise<{ success: boolean; data: AiCommandBatch[] }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/ai-command`);
  if (!response.ok) throw new Error("Failed to list AI command batches");
  return response.json();
};

export const renameAiCommandBatch = async (
  projectId: string,
  batchId: string,
  summary: string,
): Promise<{ success: boolean; data: AiCommandBatch }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    },
  );
  if (!response.ok) throw new Error("Failed to rename batch");
  return response.json();
};

export const deleteAiCommandBatch = async (
  projectId: string,
  batchId: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error("Failed to delete AI command batch");
  return response.json();
};

// =====================================================================
// AI COSTS — per-project rollup of LLM spend
// =====================================================================

export interface AiCostEvent {
  id: string;
  event_type: string;
  vendor: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  estimated_cost_usd: number;
  metadata: Record<string, unknown> | null;
  parent_event_id: string | null;
  created_at: string;
}

export interface ProjectCostsResponse {
  success: boolean;
  data: {
    total_cost_usd: number;
    total_events: number;
    total_tokens: {
      input: number;
      output: number;
      cache_creation: number;
      cache_read: number;
    };
    events: AiCostEvent[];
  };
}

/** Fetch the Anthropic cost rollup for a project (100 most-recent events). */
export const fetchProjectCosts = async (
  projectId: string,
): Promise<ProjectCostsResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/costs`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch project costs");
  }
  return response.json();
};
