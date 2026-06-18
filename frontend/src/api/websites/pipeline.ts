/**
 * Websites API - generation pipeline, layouts, status polling, page-gen status
 *
 * Re-exported via the `src/api/websites.ts` barrel.
 */

import { adminFetch } from "../index";
import { API_BASE } from "./_shared";
import type { GenerationProgress, GradientInput, PageGenerationStatus } from "./_shared";

// =====================================================================
// PIPELINE
// =====================================================================

export interface StartPipelineRequest {
  projectId: string;
  /** Legacy input accepted by older callers. Generation now requires project_identity. */
  placeId?: string;
  templateId?: string;
  templatePageId?: string;
  path?: string;
  websiteUrl?: string | null;
  pageContext?: string;
  practiceSearchString?: string;
  businessName?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  primaryColor?: string;
  accentColor?: string;
  scrapedData?: string | null;
  gradient?: GradientInput;
  dynamicSlotValues?: Record<string, string>;
}

/** Regenerate a single component on a page. */
export const regenerateComponent = async (
  projectId: string,
  pageId: string,
  componentName: string,
  instruction?: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/regenerate-component`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentName, instruction }),
    },
  );
  if (!response.ok) throw new Error(`Failed to regenerate: ${response.statusText}`);
  return response.json();
};

// =====================================================================
// LAYOUTS PIPELINE
// =====================================================================

export interface LayoutsStatus {
  status: "queued" | "generating" | "ready" | "failed" | "cancelled" | null;
  progress: { total: number; completed: number; current_component: string } | null;
  generated_at: string | null;
  slot_values: Record<string, string>;
  wrapper: string;
  header: string;
  footer: string;
}

/** Enqueue the Layouts generation job. */
export const startLayoutGeneration = async (
  projectId: string,
  slotValues: Record<string, string>,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/generate-layouts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotValues }),
  });
  if (!response.ok) throw new Error(`Failed to start layouts: ${response.statusText}`);
  return response.json();
};

/** Poll layouts generation status. */
export const fetchLayoutsStatus = async (
  projectId: string,
): Promise<{ success: boolean; data: LayoutsStatus }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/layouts-status`);
  if (!response.ok) throw new Error(`Failed to fetch layouts status: ${response.statusText}`);
  return response.json();
};

/** Enqueue backend page generation for a project with ready identity. */
export const startPipeline = async (
  data: StartPipelineRequest,
): Promise<{ success: boolean; message: string }> => {
  const response = await adminFetch(`${API_BASE}/start-pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to start pipeline");
  }

  return response.json();
};

// =====================================================================
// STATUS POLLING
// =====================================================================

export interface WebsiteStatusResponse {
  id: string;
  status: string;
  selected_place_id: string | null;
  selected_website_url: string | null;
  step_gbp_scrape: Record<string, unknown> | null;
  step_website_scrape: Record<string, unknown> | null;
  step_image_analysis: Record<string, unknown> | null;
  updated_at: string;
}

/**
 * Poll website project status (lightweight endpoint)
 */
export const pollWebsiteStatus = async (
  id: string,
): Promise<WebsiteStatusResponse> => {
  const response = await adminFetch(`${API_BASE}/${id}/status`);

  if (!response.ok) {
    throw new Error(`Failed to fetch website status: ${response.statusText}`);
  }

  return response.json();
};

// =====================================================================
// PAGE GENERATION STATUS
// =====================================================================

export interface PageGenerationStatusItem {
  id: string;
  path: string;
  status: string;
  generation_status: PageGenerationStatus;
  generation_progress: GenerationProgress | null;
  template_page_name: string | null;
  updated_at: string;
}

/**
 * Poll per-page generation status for a project
 */
export const fetchPagesGenerationStatus = async (
  projectId: string,
): Promise<{ success: boolean; data: PageGenerationStatusItem[] }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages/generation-status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch page generation status: ${response.statusText}`);
  }
  return response.json();
};

export interface PageProgressiveState {
  pageId: string;
  name: string | null;
  path: string | null;
  generation_status: string | null;
  generation_progress: GenerationProgress | null;
  template_sections: Array<{ name: string; content: string }>;
  generated_sections: Array<{ name: string; content: string }>;
  wrapper: string | null;
  header: string | null;
  footer: string | null;
}

/**
 * Fetch the in-flight state of a single page — template section scaffolding
 * plus whichever sections have been generated so far. Used by the
 * ProgressivePagePreview during page generation.
 */
export const fetchPageProgressiveState = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: PageProgressiveState }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/progressive-state`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch page progressive state: ${response.statusText}`,
    );
  }
  return response.json();
};

/**
 * Cancel all in-progress page generation for a project
 */
export const cancelGeneration = async (
  projectId: string,
): Promise<{ success: boolean; cancelledPages: number }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/cancel-generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to cancel generation: ${response.statusText}`);
  }
  return response.json();
};
