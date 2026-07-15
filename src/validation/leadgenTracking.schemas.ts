/**
 * Boundary validation for the public leadgen event endpoints.
 *
 * These routes intentionally keep their legacy `{ ok, error }` response
 * envelope because cached audit-tool builds still consume it. The JSON and
 * sendBeacon paths share one Zod schema; only their invalid-response behavior
 * differs because sendBeacon callers cannot read a response body.
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { isAcceptedEventName } from "../controllers/leadgen-tracking/feature-utils/util.event-ordering";

const LEADGEN_TEXT_MAX = 2048;
const LEADGEN_EMAIL_MAX = 320;

const optionalText = z
  .union([z.string().trim().min(1).max(LEADGEN_TEXT_MAX), z.null()])
  .optional();

export const leadgenEventPayloadSchema = z
  .object({
    session_id: z.uuid(),
    event_name: z.string().refine(isAcceptedEventName),
    event_data: z.unknown().optional().nullable(),
    audit_id: z.union([z.uuid(), z.null()]).optional(),
    email: z
      .union([z.email().trim().max(LEADGEN_EMAIL_MAX), z.null()])
      .optional(),
    domain: optionalText,
    practice_search_string: optionalText,
    referrer: optionalText,
    utm_source: optionalText,
    utm_medium: optionalText,
    utm_campaign: optionalText,
    utm_term: optionalText,
    utm_content: optionalText,
    key: z.string().optional(),
  })
  .strip();

export type LeadgenEventPayload = z.infer<typeof leadgenEventPayloadSchema>;

function legacyValidationError(error: z.ZodError): string {
  const firstField = error.issues[0]?.path[0];
  if (firstField === "session_id") return "invalid_session_id";
  if (firstField === "event_name") return "invalid_event_name";
  return "invalid_payload";
}

function parseBeaconBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

/** Enforced JSON validation with the cached client's legacy error envelope. */
export function validateLeadgenEventPayload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = leadgenEventPayloadSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ ok: false, error: legacyValidationError(result.error) });
    return;
  }
  req.body = result.data;
  next();
}

/**
 * Parse and validate a text/plain sendBeacon body. Invalid beacons keep the
 * existing silent 204 behavior while valid bodies reach the same controller
 * shape as JSON events.
 */
export function validateLeadgenBeaconPayload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = leadgenEventPayloadSchema.safeParse(parseBeaconBody(req.body));
  if (!result.success) {
    res.status(204).end();
    return;
  }
  req.body = result.data;
  next();
}
