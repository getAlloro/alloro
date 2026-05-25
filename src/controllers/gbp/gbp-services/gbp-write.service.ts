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
  if (payload.summary.length > 1500) {
    throw new GbpAutomationError(
      "GBP_GOOGLE_BAD_REQUEST",
      "Google rejected this request. Review the content and try again.",
      { operation: "validate_local_post_summary", transient: false }
    );
  }

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
