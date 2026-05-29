import axios from "axios";
import { GbpAutomationError } from "../../gbp-automation/feature-utils/GbpAutomationError";
import { classifyGoogleApiError } from "../../gbp-automation/feature-utils/googleApiErrors";
import { buildAuthHeaders } from "./gbp-api.service";

export interface GbpReviewReplyResult {
  resourceName: string | null;
  response: Record<string, unknown>;
}

export interface GbpLocalPostPayload {
  topicType: "STANDARD" | "EVENT" | "OFFER" | "ALERT";
  summary: string;
  languageCode?: string;
  callToAction?: {
    actionType: string;
    url?: string;
  };
  media?: Array<{
    mediaFormat: "PHOTO";
    sourceUrl: string;
  }>;
}

export interface GbpLocalPostListResult {
  posts: Record<string, unknown>[];
  nextPageToken: string | null;
}

function assertGoogleReviewName(value: string): void {
  if (!/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/.test(value)) {
    throw new GbpAutomationError(
      "GBP_GOOGLE_BAD_REQUEST",
      "Google rejected this request. Review the content and try again.",
      { operation: "validate_review_resource", transient: false }
    );
  }
}

function assertGoogleLocationName(value: string, label: string): void {
  if (!/^accounts\/[^/]+\/locations\/[^/]+$/.test(value)) {
    throw new GbpAutomationError(
      "GBP_GOOGLE_BAD_REQUEST",
      "Google rejected this request. Review the content and try again.",
      { operation: `validate_${label.replace(/ /g, "_")}_resource`, transient: false }
    );
  }
}

function assertGoogleLocalPostName(value: string): void {
  if (!/^accounts\/[^/]+\/locations\/[^/]+\/localPosts\/[^/]+$/.test(value)) {
    throw new GbpAutomationError(
      "GBP_GOOGLE_BAD_REQUEST",
      "Google rejected this request. Review the content and try again.",
      { operation: "validate_local_post_resource", transient: false }
    );
  }
}

function assertLocalPostSummary(summary: string): void {
  if (summary.length > 1500) {
    throw new GbpAutomationError(
      "GBP_GOOGLE_BAD_REQUEST",
      "Google rejected this request. Review the content and try again.",
      { operation: "validate_local_post_summary", transient: false }
    );
  }
}

export async function replyToGbpReview(
  auth: unknown,
  googleReviewName: string,
  comment: string
): Promise<GbpReviewReplyResult> {
  assertGoogleReviewName(googleReviewName);

  const headers = await buildAuthHeaders(auth);
  let data: Record<string, unknown> | undefined;
  try {
    const response = await axios.put(
      `https://mybusiness.googleapis.com/v4/${googleReviewName}/reply`,
      { comment },
      { headers }
    );
    data = response.data;
  } catch (error) {
    throw classifyGoogleApiError(error, "reply_to_review");
  }

  return {
    resourceName: googleReviewName,
    response: data || {},
  };
}

export async function deleteGbpReviewReply(
  auth: unknown,
  googleReviewName: string
): Promise<GbpReviewReplyResult> {
  assertGoogleReviewName(googleReviewName);

  const headers = await buildAuthHeaders(auth);
  let data: Record<string, unknown> | undefined;
  try {
    const response = await axios.delete(
      `https://mybusiness.googleapis.com/v4/${googleReviewName}/reply`,
      { headers }
    );
    data = response.data;
  } catch (error) {
    throw classifyGoogleApiError(error, "delete_review_reply");
  }

  return {
    resourceName: googleReviewName,
    response: data || {},
  };
}

export async function createGbpLocalPost(
  auth: unknown,
  parentName: string,
  payload: GbpLocalPostPayload
): Promise<Record<string, unknown>> {
  assertGoogleLocationName(parentName, "local post parent");
  assertLocalPostSummary(payload.summary);

  const headers = await buildAuthHeaders(auth);
  try {
    const { data } = await axios.post(
      `https://mybusiness.googleapis.com/v4/${parentName}/localPosts`,
      payload,
      { headers }
    );

    return data || {};
  } catch (error) {
    throw classifyGoogleApiError(error, "create_local_post");
  }
}

export async function listGbpLocalPosts(
  auth: unknown,
  parentName: string,
  pageToken?: string | null,
  pageSize = 100
): Promise<GbpLocalPostListResult> {
  assertGoogleLocationName(parentName, "local post parent");
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const headers = await buildAuthHeaders(auth);
  try {
    const { data } = await axios.get(
      `https://mybusiness.googleapis.com/v4/${parentName}/localPosts`,
      {
        params: {
          pageSize: safePageSize,
          ...(pageToken ? { pageToken } : {}),
        },
        headers,
      }
    );

    return {
      posts: Array.isArray(data?.localPosts) ? data.localPosts : [],
      nextPageToken: typeof data?.nextPageToken === "string" ? data.nextPageToken : null,
    };
  } catch (error) {
    throw classifyGoogleApiError(error, "list_local_posts");
  }
}

export async function updateGbpLocalPost(
  auth: unknown,
  postName: string,
  payload: GbpLocalPostPayload,
  options: { updateMedia?: boolean } = {}
): Promise<Record<string, unknown>> {
  assertGoogleLocalPostName(postName);
  assertLocalPostSummary(payload.summary);

  const headers = await buildAuthHeaders(auth);
  try {
    const shouldUpdateMedia = options.updateMedia !== false;
    const updateMaskParts = ["summary"];
    const patchPayload: Partial<GbpLocalPostPayload> = {
      summary: payload.summary,
    };

    if (shouldUpdateMedia) updateMaskParts.push("media");
    if (shouldUpdateMedia) patchPayload.media = payload.media || [];
    if (payload.callToAction) {
      updateMaskParts.push("callToAction");
      patchPayload.callToAction = payload.callToAction;
    }

    const { data } = await axios.patch(
      `https://mybusiness.googleapis.com/v4/${postName}`,
      patchPayload,
      {
        params: { updateMask: updateMaskParts.join(",") },
        headers,
      }
    );

    return data || {};
  } catch (error) {
    throw classifyGoogleApiError(error, "update_local_post");
  }
}

export async function deleteGbpLocalPost(
  auth: unknown,
  postName: string
): Promise<Record<string, unknown>> {
  assertGoogleLocalPostName(postName);
  const headers = await buildAuthHeaders(auth);
  try {
    const { data } = await axios.delete(
      `https://mybusiness.googleapis.com/v4/${postName}`,
      { headers }
    );
    return data || {};
  } catch (error) {
    throw classifyGoogleApiError(error, "delete_local_post");
  }
}
