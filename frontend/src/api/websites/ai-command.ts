/**
 * Websites API - AI command batches + recommendations
 *
 * Re-exported via the `src/api/websites.ts` barrel.
 */

import { adminFetch } from "../index";
import { API_BASE } from "./_shared";

// =====================================================================
// AI COMMAND
// =====================================================================

export interface AiCommandTargets {
  pages?: string[] | "all";
  posts?: string[] | "all";
  layouts?: string[] | "all";
}

export interface AiCommandBatchStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
  failed: number;
}

export interface AiCommandBatch {
  id: string;
  project_id: string;
  prompt: string;
  targets: AiCommandTargets;
  status: "analyzing" | "ready" | "executing" | "completed" | "failed";
  summary: string | null;
  stats: AiCommandBatchStats;
  created_at: string;
  updated_at: string;
}

export interface AiCommandRecommendation {
  id: string;
  batch_id: string;
  target_type: "page_section" | "layout" | "post" | "create_redirect" | "update_redirect" | "delete_redirect" | "create_page" | "create_post" | "create_menu" | "update_menu" | "update_post_meta" | "update_page_path";
  target_id: string;
  target_label: string;
  target_meta: Record<string, unknown>;
  recommendation: string;
  instruction: string;
  current_html: string;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  execution_result: { success: boolean; error?: string; edited_html?: string } | null;
  sort_order: number;
  created_at: string;
}

export const createAiCommandBatch = async (
  projectId: string,
  data: { prompt?: string; targets?: AiCommandTargets; batch_type?: "ai_editor" | "ui_checker" | "link_checker" },
): Promise<{ success: boolean; data: AiCommandBatch }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/ai-command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create AI command batch");
  return response.json();
};

export const fetchAiCommandBatch = async (
  projectId: string,
  batchId: string,
): Promise<{ success: boolean; data: AiCommandBatch }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/ai-command/${batchId}`);
  if (!response.ok) throw new Error("Failed to fetch AI command batch");
  return response.json();
};

export const fetchAiCommandRecommendations = async (
  projectId: string,
  batchId: string,
  filters?: { status?: string; target_type?: string },
): Promise<{ success: boolean; data: AiCommandRecommendation[] }> => {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.target_type) params.append("target_type", filters.target_type);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/recommendations${qs}`,
  );
  if (!response.ok) throw new Error("Failed to fetch recommendations");
  return response.json();
};

export const updateAiCommandRecommendation = async (
  projectId: string,
  batchId: string,
  recId: string,
  status: "approved" | "rejected",
  referenceData?: { reference_url?: string; reference_content?: string },
): Promise<{ success: boolean; data: AiCommandRecommendation }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/recommendations/${recId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...referenceData }),
    },
  );
  if (!response.ok) throw new Error("Failed to update recommendation");
  return response.json();
};

export const bulkUpdateAiCommandRecommendations = async (
  projectId: string,
  batchId: string,
  status: "approved" | "rejected",
  filters?: { target_type?: string },
): Promise<{ success: boolean; data: { updated: number } }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/recommendations/bulk`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...filters }),
    },
  );
  if (!response.ok) throw new Error("Failed to bulk update recommendations");
  return response.json();
};

export const executeAiCommandBatch = async (
  projectId: string,
  batchId: string,
): Promise<{ success: boolean; data: { status: string } }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/execute`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error("Failed to execute AI command batch");
  return response.json();
};
