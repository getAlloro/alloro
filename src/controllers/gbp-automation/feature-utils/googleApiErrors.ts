import axios from "axios";
import { GbpAutomationError } from "./GbpAutomationError";

type GoogleErrorCode =
  | "GBP_GOOGLE_RECONNECT_REQUIRED"
  | "GBP_GOOGLE_PERMISSION_DENIED"
  | "GBP_GOOGLE_REVIEW_NOT_FOUND"
  | "GBP_GOOGLE_RATE_LIMITED"
  | "GBP_GOOGLE_TRANSIENT_FAILURE"
  | "GBP_GOOGLE_BAD_REQUEST"
  | "GBP_GOOGLE_WRITE_FAILED";

const TRANSIENT_CODES = new Set([
  "GBP_GOOGLE_RATE_LIMITED",
  "GBP_GOOGLE_TRANSIENT_FAILURE",
]);

function codeForStatus(status?: number): GoogleErrorCode {
  if (status === 401) return "GBP_GOOGLE_RECONNECT_REQUIRED";
  if (status === 403) return "GBP_GOOGLE_PERMISSION_DENIED";
  if (status === 404) return "GBP_GOOGLE_REVIEW_NOT_FOUND";
  if (status === 408 || status === 429) return "GBP_GOOGLE_RATE_LIMITED";
  if (status && status >= 500) return "GBP_GOOGLE_TRANSIENT_FAILURE";
  if (status && status >= 400) return "GBP_GOOGLE_BAD_REQUEST";
  return "GBP_GOOGLE_WRITE_FAILED";
}

function messageForCode(code: GoogleErrorCode): string {
  const messages: Record<GoogleErrorCode, string> = {
    GBP_GOOGLE_RECONNECT_REQUIRED:
      "Google rejected the connection. Reconnect Google and try again.",
    GBP_GOOGLE_PERMISSION_DENIED:
      "Google denied permission for this Business Profile action.",
    GBP_GOOGLE_REVIEW_NOT_FOUND:
      "Google could not find this review. Sync reviews and try again.",
    GBP_GOOGLE_RATE_LIMITED:
      "Google is rate limiting this action. Alloro will retry shortly.",
    GBP_GOOGLE_TRANSIENT_FAILURE:
      "Google is temporarily unavailable. Alloro will retry shortly.",
    GBP_GOOGLE_BAD_REQUEST:
      "Google rejected this request. Review the content and try again.",
    GBP_GOOGLE_WRITE_FAILED:
      "Google Business Profile action failed. Try again later.",
  };
  return messages[code];
}

export function classifyGoogleApiError(
  error: unknown,
  operation: string
): GbpAutomationError {
  if (error instanceof GbpAutomationError) return error;

  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const code = codeForStatus(status);
  return new GbpAutomationError(code, messageForCode(code), {
    operation,
    status: status || null,
    transient: TRANSIENT_CODES.has(code),
  });
}

export function isTransientGoogleError(error: unknown): boolean {
  return Boolean(
    error instanceof GbpAutomationError &&
      error.details?.transient === true &&
      TRANSIENT_CODES.has(error.code)
  );
}
