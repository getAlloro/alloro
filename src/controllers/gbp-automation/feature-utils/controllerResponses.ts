import { Response } from "express";
import { GbpAutomationError } from "./GbpAutomationError";
import {
  GBP_INPUT_LIMITS,
  sanitizeGbpText,
  sanitizeGbpTextArray,
  sanitizeGbpUrl,
} from "./GbpInputSanitizer";

export function ok(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json({ success: true, data, error: null });
}

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown = null
): Response {
  return res.status(status).json({
    success: false,
    data: null,
    error: { code, message, details },
  });
}

export function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOptionalMonth(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}

export function settingsPayload(body: Record<string, unknown>) {
  const payload = {
    review_reply_enabled:
      typeof body.review_reply_enabled === "boolean"
        ? body.review_reply_enabled
        : undefined,
    review_reply_customizations:
      typeof body.review_reply_customizations === "string"
        ? sanitizeGbpText(body.review_reply_customizations, GBP_INPUT_LIMITS.customization)
        : undefined,
    local_post_customizations:
      typeof body.local_post_customizations === "string"
        ? sanitizeGbpText(body.local_post_customizations, GBP_INPUT_LIMITS.customization)
        : undefined,
    review_reply_voice_examples: sanitizeGbpTextArray(
      body.review_reply_voice_examples,
      GBP_INPUT_LIMITS.maxVoiceExamples,
      GBP_INPUT_LIMITS.voiceExample
    ),
    local_post_voice_examples: sanitizeGbpTextArray(
      body.local_post_voice_examples,
      GBP_INPUT_LIMITS.maxVoiceExamples,
      GBP_INPUT_LIMITS.voiceExample
    ),
    reply_rules: sanitizeGbpTextArray(
      body.reply_rules,
      GBP_INPUT_LIMITS.maxRules,
      GBP_INPUT_LIMITS.rule
    ),
    post_rules: sanitizeGbpTextArray(
      body.post_rules,
      GBP_INPUT_LIMITS.maxRules,
      GBP_INPUT_LIMITS.rule
    ),
    local_post_generation_enabled:
      typeof body.local_post_generation_enabled === "boolean"
        ? body.local_post_generation_enabled
        : undefined,
    // business_info_writeback_enabled is intentionally NOT client-toggleable: A6 writes
    // to a customer's live Google presence, so the master switch is enabled per account
    // by Alloro/Dave (DB/admin), not by any authenticated org member via this endpoint.
    next_post_generation_at:
      typeof body.next_post_generation_at === "string"
        ? new Date(body.next_post_generation_at)
        : undefined,
    default_featured_image_url:
      typeof body.default_featured_image_url === "string"
        ? sanitizeGbpUrl(body.default_featured_image_url)
        : undefined,
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

export function handleGbpError(res: Response, error: unknown): Response {
  if (error instanceof GbpAutomationError) {
    let status = 400;
    if (error.code.includes("NOT_FOUND")) status = 404;
    if (error.code.includes("ACCESS_DENIED") || error.code.includes("PERMISSION")) status = 403;
    if (error.code.includes("RECONNECT_REQUIRED")) status = 401;
    if (error.code.includes("RATE_LIMITED")) status = 429;
    if (error.code.includes("TRANSIENT_FAILURE")) status = 503;
    return fail(res, status, error.code, error.message, error.details);
  }

  return fail(res, 500, "GBP_AUTOMATION_ERROR", "GBP automation failed.");
}
