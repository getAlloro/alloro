import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./index";

export type GbpReadinessStatus =
  | "ready"
  | "feature_disabled"
  | "location_not_found"
  | "reconnect_required"
  | "missing_gbp_property"
  | "missing_business_manage_scope"
  | "no_replyable_reviews"
  | "maps_only_reviews";

export type GbpWorkItemStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "deploying"
  | "published"
  | "rejected";

export type GbpReview = {
  id: string;
  stars: number;
  text: string | null;
  reviewer_name: string | null;
  review_created_at: string | null;
  source: "oauth" | "apify";
  has_reply: boolean;
  reply_text: string | null;
  reply_date: string | null;
  insight?: GbpReviewInsight | null;
  escalation?: GbpReviewEscalation | null;
};

export type GbpReviewMonthBucket = {
  month: string;
  label: string;
  count: number;
};

export type GbpAutomationQueryOptions = {
  needsReplyMonth?: string | null;
  repliedMonth?: string | null;
};

export type GbpDeploymentAttempt = {
  id: string;
  attempt_number: number;
  status: "pending" | "running" | "succeeded" | "failed";
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type GbpAutomationSettings = {
  id: string;
  review_reply_enabled: boolean;
  review_reply_customizations: string | null;
  local_post_customizations: string | null;
  review_reply_voice_examples?: string[];
  local_post_voice_examples?: string[];
  reply_rules?: string[];
  post_rules?: string[];
  local_post_generation_enabled: boolean;
  local_post_frequency: "twice_monthly";
  next_post_generation_at: string | null;
  default_featured_image_url: string | null;
};

export type GbpSafetyStatus = "safe" | "needs_review" | "blocked";

export type GbpContentSafety = {
  isSafe: boolean;
  status: GbpSafetyStatus;
  reasonCodes: string[];
  reasons: string[];
  byteLength: number;
  confidence: number;
};

export type GbpReviewInsight = {
  id: string;
  review_id: string;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  themes: string[];
  urgency: "normal" | "watch" | "urgent";
  post_candidate: boolean;
};

export type GbpReviewEscalation = {
  id: string;
  review_id: string;
  status: "open" | "resolved" | "dismissed";
  reason: string;
  note: string | null;
};

export type GbpWorkItem = {
  id: string;
  status: GbpWorkItemStatus;
  draft_content: string;
  approved_content: string | null;
  published_content: string | null;
  content_type?: "review_reply" | "local_post";
  source_review_id: string | null;
  local_post_payload?: Record<string, unknown> | null;
  featured_image_url?: string | null;
  google_resource_name: string | null;
  safety_status?: GbpSafetyStatus | null;
  safety_reason_codes?: string[];
  safety_reasons?: string[];
  safety_confidence?: number | null;
  deploy_preview_payload?: GbpDeployPreview | null;
  metadata?: Record<string, unknown> | null;
  last_error_code: string | null;
  last_error_message: string | null;
  retry_count: number;
  created_at: string;
  approved_at: string | null;
  published_at: string | null;
  attempts?: GbpDeploymentAttempt[];
};

export type GbpPublishedLocalPost = {
  name: string;
  postId: string;
  summary: string;
  topicType: string;
  state: string;
  createTime: string | null;
  updateTime: string | null;
  searchUrl: string | null;
  featuredImageUrl: string | null;
  media: Array<Record<string, unknown>>;
  callToAction: Record<string, unknown> | null;
  lastSyncedAt: string | null;
};

export type GbpPublishedLocalPostsResponse = {
  posts: GbpPublishedLocalPost[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  syncHealth: GbpSyncHealth | null;
};

export type GbpPublishedLocalPostInput = {
  name: string;
  summary: string;
  // Empty/null = text-only post (an existing image can only be replaced).
  featuredImageUrl: string | null;
};

export type GbpPostMediaUpload = {
  projectId: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  media: {
    id: string;
    project_id: string;
    display_name: string;
    s3_url: string;
    thumbnail_s3_url: string | null;
    mime_type: string;
    width?: number | null;
    height?: number | null;
  };
};

export type GbpReplyOpsMetrics = {
  totalOauthReviews: number;
  totalUnreplied: number;
  unrepliedLast30d: number;
  unrepliedOver7d: number;
  unrepliedOver30d: number;
  oldestUnrepliedAt: string | null;
  averageReplyHours: number | null;
  averageReplyDays: number | null;
  medianReplyDays: number | null;
  replyCoveragePercent: number;
};

export type GbpSyncHealth = {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  started_at: string | null;
  completed_at: string | null;
  synced_count: number;
  error_code: string | null;
  error_message: string | null;
  metadata?: Record<string, unknown> | null;
};

export type GbpDeployPreview = {
  workItem: {
    id: string;
    status: GbpWorkItemStatus;
    content_type: "review_reply" | "local_post";
    google_property_id: number;
  };
  review: {
    id: string;
    google_review_name: string | null;
    reviewer_name: string | null;
    stars: number;
    review_created_at: string | null;
  } | null;
  content: string;
  featuredImageUrl?: string | null;
  safety: GbpContentSafety;
  googleProperty: {
    id: number;
    account_id: string | null;
    external_id: string | null;
    display_name: string | null;
  } | null;
  canDeploy: boolean;
  warnings: string[];
};

export type GbpReadiness = {
  status: GbpReadinessStatus;
  ready: boolean;
  actions: string[];
  checks: Record<string, boolean>;
  counts: {
    total: number;
    replyable_oauth: number;
    replyable_oauth_last_30d: number;
    oauth_already_replied: number;
    maps_only: number;
    hidden: number;
  };
  replyOps: GbpReplyOpsMetrics;
  nextPostGenerationAt: string | null;
  syncHealth: GbpSyncHealth | null;
  postSyncHealth: GbpSyncHealth | null;
};

export type GbpAutomationResponse = {
  readiness: GbpReadiness;
  settings: GbpAutomationSettings;
  workItems: GbpWorkItem[];
  eligibleReviews: GbpReview[];
  repliedReviews: GbpReview[];
  reviewMonths?: {
    needsReply: GbpReviewMonthBucket[];
    replied: GbpReviewMonthBucket[];
  };
};

export type GbpReviewSyncJob = {
  jobId: string | null;
  organizationId: number;
  locationId: number;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: { code: string; message: string; details?: unknown } | null;
};

function unwrap<T>(response: ApiEnvelope<T>): T {
  if (!response?.success) {
    throw new Error(response?.error?.message || "GBP automation request failed.");
  }
  return response.data;
}

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

export async function getGbpAutomation(
  locationId: number,
  params?: GbpAutomationQueryOptions
) {
  return unwrap<GbpAutomationResponse>(
    await apiGet({
      path: withReviewMonthParams(
        withLocation("/gbp-automation/work-items", locationId),
        params
      ),
    })
  );
}

export async function generateGbpReplyDraft(reviewId: string, locationId: number) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `/gbp-automation/reviews/${reviewId}/draft`,
      passedData: { locationId },
    })
  );
}

export async function createGbpPostDraftFromReview(
  reviewId: string,
  locationId: number,
  featuredImageUrl: string | null
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `/gbp-automation/reviews/${reviewId}/post-draft`,
      passedData: { locationId, featuredImageUrl },
    })
  );
}

export async function generateGbpPostDraftNow(
  locationId: number,
  // Photo is optional — posts can be text-only.
  featuredImageUrl: string | null
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: "/gbp-automation/posts/generate",
      passedData: { locationId, featuredImageUrl },
    })
  );
}

export async function uploadGbpPostImage(locationId: number, file: File) {
  const formData = new FormData();
  formData.append("locationId", String(locationId));
  formData.append("file", file);
  return unwrap<GbpPostMediaUpload>(
    await apiPost({
      path: "/gbp-automation/posts/media",
      passedData: formData,
    })
  );
}

export async function getGbpPublishedLocalPosts(
  locationId: number,
  params?: { page?: number; limit?: number }
) {
  const search = new URLSearchParams();
  search.set("page", String(params?.page || 1));
  search.set("limit", String(params?.limit || 10));
  return unwrap<GbpPublishedLocalPostsResponse>(
    await apiGet({
      path: withLocation(`/gbp-automation/posts/published?${search.toString()}`, locationId),
    })
  );
}

export async function triggerGbpPostsSync(locationId: number) {
  return unwrap<{ syncedCount: number; syncHealth: GbpSyncHealth }>(
    await apiPost({
      path: "/gbp-automation/posts/published/sync",
      passedData: { locationId },
    })
  );
}

export async function updateGbpPublishedLocalPost(
  locationId: number,
  input: GbpPublishedLocalPostInput
) {
  return unwrap<GbpPublishedLocalPost>(
    await apiPatch({
      path: "/gbp-automation/posts/published",
      passedData: { locationId, ...input },
    })
  );
}

export async function deleteGbpPublishedLocalPost(locationId: number, name: string) {
  const path = withLocation(
    `/gbp-automation/posts/published?name=${encodeURIComponent(name)}`,
    locationId
  );
  return unwrap<{ deleted: true; postName: string }>(
    await apiDelete({ path })
  );
}

export async function triggerGbpReviewsSync(locationId: number) {
  return unwrap<GbpReviewSyncJob>(
    await apiPost({
      path: "/gbp-automation/reviews/sync",
      passedData: { locationId },
    })
  );
}

export async function saveGbpReviewDraftSlot(
  reviewId: string,
  locationId: number,
  draftContent: string
) {
  return unwrap<GbpWorkItem>(
    await apiPatch({
      path: `/gbp-automation/reviews/${reviewId}/draft-slot`,
      passedData: { locationId, draftContent },
    })
  );
}

export async function updateGbpReplyDraft(
  workItemId: string,
  locationId: number,
  draftContent: string,
  featuredImageUrl?: string | null
) {
  return unwrap<GbpWorkItem>(
    await apiPatch({
      path: `/gbp-automation/work-items/${workItemId}`,
      passedData: { locationId, draftContent, featuredImageUrl },
    })
  );
}

export async function regenerateGbpPostDraft(workItemId: string, locationId: number) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `/gbp-automation/work-items/${workItemId}/regenerate-post`,
      passedData: { locationId },
    })
  );
}

export async function approveGbpReply(
  workItemId: string,
  locationId: number,
  approvedContent: string
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `/gbp-automation/work-items/${workItemId}/approve`,
      passedData: { locationId, approvedContent },
    })
  );
}

export async function rejectGbpReplyDraft(
  workItemId: string,
  locationId: number,
  reason: string
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `/gbp-automation/work-items/${workItemId}/reject`,
      passedData: { locationId, reason },
    })
  );
}

export async function getGbpDeployPreview(workItemId: string, locationId: number) {
  return unwrap<GbpDeployPreview>(
    await apiGet({
      path: withLocation(`/gbp-automation/work-items/${workItemId}/deploy-preview`, locationId),
    })
  );
}

export async function deployGbpReply(
  workItemId: string,
  locationId: number,
  confirmNeedsReview = false
) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `/gbp-automation/work-items/${workItemId}/deploy`,
      passedData: { locationId, confirmNeedsReview },
    })
  );
}

export async function retryGbpReply(workItemId: string, locationId: number) {
  return unwrap<GbpWorkItem>(
    await apiPost({
      path: `/gbp-automation/work-items/${workItemId}/retry`,
      passedData: { locationId },
    })
  );
}

export async function updateGbpAutomationSettings(
  locationId: number,
  data: Partial<GbpAutomationSettings>
) {
  return unwrap<GbpAutomationSettings>(
    await apiPut({
      path: "/gbp-automation/settings",
      passedData: { ...data, locationId },
    })
  );
}

export async function updateGbpReviewEscalation(
  reviewId: string,
  locationId: number,
  data: { status: "open" | "resolved" | "dismissed"; reason: string; note?: string | null }
) {
  return unwrap<GbpReviewEscalation>(
    await apiPut({
      path: `/gbp-automation/reviews/${reviewId}/escalation`,
      passedData: { locationId, ...data },
    })
  );
}

export async function updateGbpPublishedReply(
  reviewId: string,
  locationId: number,
  replyContent: string
) {
  return unwrap<GbpReview>(
    await apiPatch({
      path: `/gbp-automation/reviews/${reviewId}/published-reply`,
      passedData: { locationId, replyContent },
    })
  );
}

export async function deleteGbpPublishedReply(reviewId: string, locationId: number) {
  return unwrap<GbpReview>(
    await apiDelete({
      path: withLocation(`/gbp-automation/reviews/${reviewId}/published-reply`, locationId),
    })
  );
}
