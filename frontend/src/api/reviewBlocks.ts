/**
 * Review Blocks API - Admin portal for managing review block templates
 */

import type { Section } from "./templates";
import { adminFetch } from "./index";

// =====================================================================
// TYPES
// =====================================================================

export interface ReviewBlock {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  description: string | null;
  sections: Section[];
  created_at: string;
  updated_at: string;
}

const TEMPLATES_BASE = "/api/admin/websites/templates";

// =====================================================================
// CRUD
// =====================================================================

export const fetchReviewBlocks = async (
  templateId: string
): Promise<{ success: boolean; data: ReviewBlock[] }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/review-blocks`);
  if (!response.ok) throw new Error(`Failed to fetch review blocks: ${response.statusText}`);
  return response.json();
};

export const fetchReviewBlock = async (
  templateId: string,
  reviewBlockId: string
): Promise<{ success: boolean; data: ReviewBlock }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/review-blocks/${reviewBlockId}`);
  if (!response.ok) throw new Error(`Failed to fetch review block: ${response.statusText}`);
  return response.json();
};

export const createReviewBlock = async (
  templateId: string,
  data: { name: string; description?: string; sections?: Section[] }
): Promise<{ success: boolean; data: ReviewBlock }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/review-blocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to create review block: ${response.statusText}`);
  }
  return response.json();
};

export const updateReviewBlock = async (
  templateId: string,
  reviewBlockId: string,
  data: Partial<Pick<ReviewBlock, "name" | "sections" | "description">>
): Promise<{ success: boolean; data: ReviewBlock }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/review-blocks/${reviewBlockId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to update review block: ${response.statusText}`);
  }
  return response.json();
};

export const deleteReviewBlock = async (
  templateId: string,
  reviewBlockId: string
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/review-blocks/${reviewBlockId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`Failed to delete review block: ${response.statusText}`);
  return response.json();
};

// =====================================================================
// SYNC
// =====================================================================

export const triggerReviewSync = async (
  projectId: string
): Promise<{ success: boolean; data: { jobId: string } }> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/reviews/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to trigger review sync: ${response.statusText}`);
  }
  return response.json();
};

export const triggerApifyReviewFetch = async (
  projectId: string,
  placeIds?: string[]
): Promise<{ success: boolean; data: { jobId: string; placeCount: number } }> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/reviews/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(placeIds ? { placeIds } : {}),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to trigger review fetch: ${response.statusText}`);
  }
  return response.json();
};

export const getReviewJobStatus = async (
  projectId: string,
  jobId: string
): Promise<{ success: boolean; data: { jobId: string; state: string; failedReason?: string } }> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/reviews/jobs/${jobId}/status`);
  if (!response.ok) throw new Error("Failed to fetch job status");
  return response.json();
};

// =====================================================================
// REVIEW MANAGEMENT
// =====================================================================

export interface ReviewItem {
  id: string;
  source: "oauth" | "apify";
  place_id: string | null;
  stars: number;
  text: string | null;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  is_anonymous: boolean;
  review_created_at: string | null;
  has_reply: boolean;
  reply_text: string | null;
  reply_date: string | null;
  hidden: boolean;
}

export interface ReviewStats {
  total: number;
  average: number;
  distribution: Record<number, number>;
  hasGbpConnection: boolean;
  hasPlaceIds: boolean;
}

export const fetchReviewStats = async (
  projectId: string
): Promise<{ success: boolean; data: ReviewStats }> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/reviews/stats`);
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.message || "Failed to fetch review stats");
  }
  return response.json();
};

export const fetchReviews = async (
  projectId: string,
  params?: { search?: string; stars?: number; showHidden?: boolean }
): Promise<{ success: boolean; data: ReviewItem[] }> => {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.stars) qs.set("stars", String(params.stars));
  if (params?.showHidden) qs.set("showHidden", "true");
  const response = await adminFetch(`/api/admin/websites/${projectId}/reviews?${qs.toString()}`);
  if (!response.ok) throw await readReviewApiError(response, "Failed to fetch reviews");
  return response.json();
};

export const toggleReviewHidden = async (
  projectId: string,
  reviewId: string,
  hidden: boolean
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/reviews/${reviewId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hidden }),
  });
  if (!response.ok) throw await readReviewApiError(response, "Failed to toggle review");
  return response.json();
};

export const deleteReview = async (
  projectId: string,
  reviewId: string
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/reviews/${reviewId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw await readReviewApiError(response, "Failed to delete review");
  return response.json();
};

async function readReviewApiError(response: Response, fallback: string): Promise<Error> {
  const err = await response.json().catch(() => null);
  return new Error(err?.message || `${fallback}: ${response.statusText}`);
}
