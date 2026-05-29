import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./index";
import type {
  GbpAutomationResponse,
  GbpAutomationQueryOptions,
  GbpAutomationSettings,
  GbpDeployPreview,
  GbpPostMediaUpload,
  GbpPublishedLocalPost,
  GbpPublishedLocalPostInput,
  GbpPublishedLocalPostsResponse,
  GbpReviewEscalation,
  GbpReviewSyncJob,
  GbpReview,
  GbpSyncHealth,
  GbpWorkItem,
} from "./gbpAutomation";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: { code: string; message: string; details?: unknown } | null;
};

function unwrap<T>(response: ApiEnvelope<T>): T {
  if (!response?.success) {
    throw new Error(response?.error?.message || "Admin GBP automation request failed.");
  }
  return response.data;
}

const base = (organizationId: number) =>
  `/admin/gbp-automation/organizations/${organizationId}`;

const withLocation = (path: string, locationId: number) =>
  `${path}${path.includes("?") ? "&" : "?"}locationId=${locationId}`;

function withReviewMonthParams(
  path: string,
  params?: GbpAutomationQueryOptions
): string {
  const search = new URLSearchParams();
  if (params?.needsReplyMonth) search.set("needsReplyMonth", params.needsReplyMonth);
  if (params?.repliedMonth) search.set("repliedMonth", params.repliedMonth);
  const query = search.toString();
  return query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path;
}

export async function getAdminGbpAutomation(
  organizationId: number,
  locationId: number,
  params?: GbpAutomationQueryOptions
) {
  return unwrap<GbpAutomationResponse>(
    await apiGet({
      path: withReviewMonthParams(
        withLocation(`${base(organizationId)}/work-items`, locationId),
        params
      ),
    })
  );
}

export async function updateAdminGbpSettings(
  organizationId: number,
  locationId: number,
  data: Partial<GbpAutomationSettings>
) {
  return unwrap<GbpAutomationSettings>(
    await apiPut({
      path: withLocation(`${base(organizationId)}/settings`, locationId),
      passedData: { ...data, locationId },
    })
  );
}

export async function generateAdminGbpDraft(
  organizationId: number,
  locationId: number,
  reviewId: string
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `${base(organizationId)}/reviews/${reviewId}/draft`,
      passedData: { locationId },
    })
  );
}

export async function createAdminGbpPostDraftFromReview(
  organizationId: number,
  locationId: number,
  reviewId: string,
  featuredImageUrl: string
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `${base(organizationId)}/reviews/${reviewId}/post-draft`,
      passedData: { locationId, featuredImageUrl },
    })
  );
}

export async function generateAdminGbpPostDraftNow(
  organizationId: number,
  locationId: number,
  featuredImageUrl: string
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `${base(organizationId)}/posts/generate`,
      passedData: { locationId, featuredImageUrl },
    })
  );
}

export async function uploadAdminGbpPostImage(
  organizationId: number,
  locationId: number,
  file: File
) {
  const formData = new FormData();
  formData.append("locationId", String(locationId));
  formData.append("file", file);
  return unwrap<GbpPostMediaUpload>(
    await apiPost({
      path: `${base(organizationId)}/posts/media`,
      passedData: formData,
    })
  );
}

export async function getAdminGbpPublishedLocalPosts(
  organizationId: number,
  locationId: number,
  params?: { page?: number; limit?: number }
) {
  const search = new URLSearchParams();
  search.set("page", String(params?.page || 1));
  search.set("limit", String(params?.limit || 10));
  return unwrap<GbpPublishedLocalPostsResponse>(
    await apiGet({
      path: withLocation(
        `${base(organizationId)}/posts/published?${search.toString()}`,
        locationId
      ),
    })
  );
}

export async function triggerAdminGbpPostsSync(
  organizationId: number,
  locationId: number
) {
  return unwrap<{ syncedCount: number; syncHealth: GbpSyncHealth }>(
    await apiPost({
      path: `${base(organizationId)}/posts/published/sync`,
      passedData: { locationId },
    })
  );
}

export async function updateAdminGbpPublishedLocalPost(
  organizationId: number,
  locationId: number,
  input: GbpPublishedLocalPostInput
) {
  return unwrap<GbpPublishedLocalPost>(
    await apiPatch({
      path: `${base(organizationId)}/posts/published`,
      passedData: { locationId, ...input },
    })
  );
}

export async function deleteAdminGbpPublishedLocalPost(
  organizationId: number,
  locationId: number,
  name: string
) {
  const path = withLocation(
    `${base(organizationId)}/posts/published?name=${encodeURIComponent(name)}`,
    locationId
  );
  return unwrap<{ deleted: true; postName: string }>(
    await apiDelete({ path })
  );
}

export async function triggerAdminGbpReviewsSync(
  organizationId: number,
  locationId: number
) {
  return unwrap<GbpReviewSyncJob>(
    await apiPost({
      path: `${base(organizationId)}/reviews/sync`,
      passedData: { locationId },
    })
  );
}

export async function saveAdminGbpReviewDraftSlot(
  organizationId: number,
  locationId: number,
  reviewId: string,
  draftContent: string
) {
  return unwrap<GbpWorkItem>(
    await apiPatch({
      path: `${base(organizationId)}/reviews/${reviewId}/draft-slot`,
      passedData: { locationId, draftContent },
    })
  );
}

export async function updateAdminGbpPublishedReply(
  organizationId: number,
  locationId: number,
  reviewId: string,
  replyContent: string
) {
  return unwrap<GbpReview>(
    await apiPatch({
      path: `${base(organizationId)}/reviews/${reviewId}/published-reply`,
      passedData: { locationId, replyContent },
    })
  );
}

export async function deleteAdminGbpPublishedReply(
  organizationId: number,
  locationId: number,
  reviewId: string
) {
  return unwrap<GbpReview>(
    await apiDelete({
      path: withLocation(`${base(organizationId)}/reviews/${reviewId}/published-reply`, locationId),
    })
  );
}

export async function updateAdminGbpDraft(
  organizationId: number,
  locationId: number,
  workItemId: string,
  draftContent: string,
  featuredImageUrl?: string | null
) {
  return unwrap<GbpWorkItem>(
    await apiPatch({
      path: `${base(organizationId)}/work-items/${workItemId}`,
      passedData: { locationId, draftContent, featuredImageUrl },
    })
  );
}

export async function regenerateAdminGbpPostDraft(
  organizationId: number,
  locationId: number,
  workItemId: string
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `${base(organizationId)}/work-items/${workItemId}/regenerate-post`,
      passedData: { locationId },
    })
  );
}

export async function getAdminGbpDeployPreview(
  organizationId: number,
  locationId: number,
  workItemId: string
) {
  return unwrap<GbpDeployPreview>(
    await apiGet({
      path: withLocation(
        `${base(organizationId)}/work-items/${workItemId}/deploy-preview`,
        locationId
      ),
    })
  );
}

export async function approveAdminGbpReply(
  organizationId: number,
  locationId: number,
  workItemId: string,
  approvedContent: string
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `${base(organizationId)}/work-items/${workItemId}/approve`,
      passedData: { locationId, approvedContent },
    })
  );
}

export async function rejectAdminGbpReplyDraft(
  organizationId: number,
  locationId: number,
  workItemId: string,
  reason: string
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `${base(organizationId)}/work-items/${workItemId}/reject`,
      passedData: { locationId, reason },
    })
  );
}

export async function deployAdminGbpReply(
  organizationId: number,
  locationId: number,
  workItemId: string,
  confirmNeedsReview = false
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `${base(organizationId)}/work-items/${workItemId}/deploy`,
      passedData: { locationId, confirmNeedsReview },
    })
  );
}

export async function retryAdminGbpReply(
  organizationId: number,
  locationId: number,
  workItemId: string
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `${base(organizationId)}/work-items/${workItemId}/retry`,
      passedData: { locationId },
    })
  );
}

export async function updateAdminGbpReviewEscalation(
  organizationId: number,
  locationId: number,
  reviewId: string,
  data: { status: "open" | "resolved" | "dismissed"; reason: string; note?: string | null }
) {
  return unwrap<GbpReviewEscalation>(
    await apiPut({
      path: `${base(organizationId)}/reviews/${reviewId}/escalation`,
      passedData: { locationId, ...data },
    })
  );
}
