/**
 * Websites API - SEO data, generation, analysis, bulk jobs
 *
 * Re-exported via the `src/api/websites.ts` barrel.
 */

import { adminFetch } from "../index";
import { API_BASE } from "./_shared";
import type { SeoData, WebsitePage } from "./_shared";

// =====================================================================
// SEO
// =====================================================================

/**
 * Update page SEO data
 */
export const updatePageSeo = async (
  projectId: string,
  pageId: string,
  seoData: SeoData,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages/${pageId}/seo`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seo_data: seoData }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update SEO data");
  }
  return response.json();
};

/**
 * Update post SEO data
 */
export const updatePostSeo = async (
  projectId: string,
  postId: string,
  seoData: SeoData,
): Promise<{ success: boolean; data: unknown }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/posts/${postId}/seo`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seo_data: seoData }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update post SEO data");
  }
  return response.json();
};

/**
 * AI-generate SEO data for a specific section
 */
export const generateSeo = async (
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: Record<string, unknown>,
): Promise<{ success: boolean; section: string; generated: Record<string, unknown>; insight: string }> => {
  const path = entityType === "page"
    ? `${API_BASE}/${projectId}/pages/${entityId}/seo/generate`
    : `${API_BASE}/${projectId}/posts/${entityId}/seo/generate`;
  const response = await adminFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to generate SEO data");
  }
  return response.json();
};

/**
 * Generate ALL SEO sections in a single request (fetches shared context once)
 */
export const generateAllSeo = async (
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: Record<string, unknown>,
): Promise<{ success: boolean; results: Array<{ section: string; generated: Record<string, unknown>; insight: string }> }> => {
  const path = entityType === "page"
    ? `${API_BASE}/${projectId}/pages/${entityId}/seo/generate-all`
    : `${API_BASE}/${projectId}/posts/${entityId}/seo/generate-all`;
  const response = await adminFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to generate all SEO data");
  }
  return response.json();
};

/**
 * Analyze existing SEO data for a page or post section (insights only, no regeneration)
 */
export const analyzeSeo = async (
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: Record<string, unknown>,
): Promise<{ success: boolean; section: string; insight: string }> => {
  const path = entityType === "page"
    ? `${API_BASE}/${projectId}/pages/${entityId}/seo/analyze`
    : `${API_BASE}/${projectId}/posts/${entityId}/seo/analyze`;
  const response = await adminFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to analyze SEO data");
  }
  return response.json();
};

/**
 * Start a bulk SEO generation job
 */
export const aiGeneratePostContent = async (
  projectId: string,
  data: { post_type_id: string; title: string; reference_url?: string; reference_content?: string },
): Promise<{ success: boolean; data: { content: string } }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/posts/ai-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to generate post content");
  }
  return response.json();
};

export const updatePageDisplayName = async (
  projectId: string,
  path: string,
  displayName: string | null,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages/display-name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, display_name: displayName }),
  });
  if (!response.ok) throw new Error("Failed to update display name");
  return response.json();
};

export const startBulkSeoGenerate = async (
  projectId: string,
  entityType: "page" | "post",
  postTypeId?: string,
  pagePaths?: string[],
): Promise<{ success: boolean; job_id: string; already_active?: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/seo/bulk-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_type: entityType, post_type_id: postTypeId, page_paths: pagePaths }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to start bulk SEO generation");
  }
  return response.json();
};

/**
 * Poll bulk SEO generation progress
 */
export interface BulkSeoStatus {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  total_count: number;
  completed_count: number;
  failed_count: number;
  failed_items: Array<{ id: string; title: string; error: string }> | null;
}

export const getBulkSeoStatus = async (
  projectId: string,
  jobId: string,
): Promise<{ success: boolean; data: BulkSeoStatus }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/seo/bulk-generate/${jobId}/status`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch bulk SEO status");
  }
  return response.json();
};

/**
 * Check for an active bulk SEO job
 */
export const getActiveBulkSeoJob = async (
  projectId: string,
  entityType: "page" | "post",
  postTypeId?: string,
): Promise<{ success: boolean; data: BulkSeoStatus | null }> => {
  const params = new URLSearchParams({ entity_type: entityType });
  if (postTypeId) params.set("post_type_id", postTypeId);
  const response = await adminFetch(`${API_BASE}/${projectId}/seo/bulk-generate/active?${params.toString()}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to check active SEO job");
  }
  return response.json();
};

/**
 * Fetch all page/post SEO meta for uniqueness checking
 */
export const fetchAllSeoMeta = async (
  projectId: string,
): Promise<{
  success: boolean;
  data: {
    pages: Array<{ id: string; path: string; meta_title: string | null; meta_description: string | null }>;
    posts: Array<{ id: string; title: string; slug: string; meta_title: string | null; meta_description: string | null }>;
  };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/seo/all-meta`);
  if (!response.ok) throw new Error("Failed to fetch SEO meta");
  return response.json();
};
