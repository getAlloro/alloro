/**
 * Public Leadgen Tracking Routes (no JWT auth — shared-secret gated)
 *
 * Mounted at `/api/leadgen` in `src/index.ts`. Three endpoints:
 *
 *   POST /session — upsert anonymous session on first landing
 *   POST /event   — append funnel event, patch session fields
 *   POST /beacon  — sendBeacon-compatible abandonment event (text/plain OK)
 *
 * Protection:
 *   - express-rate-limit: 60 req/min per IP across all three routes
 *   - `X-Leadgen-Key` header (or `{key}` in body for sendBeacon) must match
 *     `LEADGEN_TRACKING_KEY` env var
 *   - /beacon always 204s — on auth failure it silently drops instead of
 *     returning 401 (beacons don't read responses; leaking 401 would also
 *     leak the shape of the auth mechanism)
 */

import express, {
  NextFunction,
  Request,
  Response,
  Router,
} from "express";
import rateLimit from "express-rate-limit";
import {
  getSessionByAudit,
  recordBeacon,
  recordEvent,
  submitEmailNotify,
  submitEmailPaywall,
  upsertSession,
} from "../controllers/leadgen-tracking/LeadgenTrackingController";
import { validateTrackingKey } from "../controllers/leadgen-tracking/feature-utils/util.tracking-auth";
import {
  validateLeadgenBeaconPayload,
  validateLeadgenEventPayload,
} from "../validation/leadgenTracking.schemas";

const router = Router();

// Beacon may arrive as Content-Type: text/plain (sendBeacon blob fallback).
// Express's default JSON parser runs globally, but text/plain bodies fall
// through to raw strings — the controller parses them explicitly.
const beaconBodyParser = express.text({ type: "text/plain", limit: "16kb" });

const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limited" },
});

/**
 * Gate for /session and /event. Rejects with 401 on bad key.
 */
function requireTrackingKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!validateTrackingKey(req)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
}

/**
 * Silent gate for /beacon. Drops bad traffic as 204 — no response body,
 * no schema leak, no 401 for bots to fingerprint.
 */
function silentRequireTrackingKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!validateTrackingKey(req)) {
    res.status(204).end();
    return;
  }
  next();
}

router.use(trackingLimiter);

router.post("/session", requireTrackingKey, upsertSession);
router.post(
  "/event",
  requireTrackingKey,
  validateLeadgenEventPayload,
  recordEvent
);
router.post("/email-notify", requireTrackingKey, submitEmailNotify);
router.post("/email-paywall", requireTrackingKey, submitEmailPaywall);
router.get(
  "/session-by-audit/:auditId",
  requireTrackingKey,
  getSessionByAudit
);
router.post(
  "/beacon",
  beaconBodyParser,
  silentRequireTrackingKey,
  validateLeadgenBeaconPayload,
  recordBeacon
);

export default router;
