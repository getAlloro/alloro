/**
 * Public Endpoint Rate Limiting — WO-RATE-LIMITING
 *
 * Tighter limits on public-facing endpoints to prevent:
 * - Places API cost abuse via checkup analyze
 * - Account creation spam
 * - Referral form abuse
 * - GBP OAuth enumeration
 *
 * Also includes scraper detection: same place_id queried 5+ times
 * in 5 minutes from same IP logs to behavioral_events.
 */

import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { BehavioralEventModel } from "../models/BehavioralEventModel";
import logger from "../lib/logger";

const RATE_LIMIT_MESSAGE = {
  success: false,
  error: "Too many requests. Please wait before trying again.",
};

// ─── Auth limiter (login / OTP / password reset) ────────────────────
// Strict limit on the authentication attack surface to blunt credential
// stuffing and brute-forcing the 6-digit OTP/verification code space.
//
// Keyed per-IP + per-email so a single account from one IP is capped (stops
// code brute-force) without one shared-IP clinic locking out every user at
// once. `max` is conservative; a normal human login/verify/reset is 1–3 hits.
//
// CAVEAT: express-rate-limit's default store is in-memory and PER-PROCESS. Under
// PM2 cluster mode the counts do NOT aggregate across workers, so the effective
// limit is `max × workerCount`. Acceptable for v1; move to a shared Redis store
// to make the cap global.
const AUTH_RATE_LIMIT_MESSAGE = {
  success: false,
  error: "Too many attempts. Please wait a few minutes and try again.",
};

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: AUTH_RATE_LIMIT_MESSAGE,
  keyGenerator: (req): string => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const rawEmail = (req.body?.email ?? "").toString().trim().toLowerCase();
    return rawEmail ? `${ip}:${rawEmail}` : ip;
  },
});

// ─── Standard limiters ──────────────────────────────────────────────

export const checkupAnalyzeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

export const checkupCreateAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

export const checkupCompareLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

export const referralFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

export const gbpAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

// ─── Places API limiters (Practice Ranking v2 + leadgen autocomplete) ──
// Generous enough for normal client use (curate page autocomplete + leadgen
// onboarding flow), tight enough to keep Places API spend predictable.
// Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md

export const placesAutocompleteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

export const placesDetailsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

export const placesSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

// Photo proxy is authed (only the curate page renders thumbnails) but each
// fetch hits the paid Place Photo SKU. Generous enough for a 10-row list to
// load comfortably; tight enough to cap a misbehaving client.
// Spec: plans/04282026-no-ticket-leaflet-map-click-sync-rich-row-data/spec.md
export const placesPhotoLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

// ─── Scraper detection ──────────────────────────────────────────────

const placeIdTracker = new Map<string, { count: number; firstSeen: number }>();

// Clean stale entries every 5 minutes
setInterval(() => {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  for (const [key, val] of placeIdTracker) {
    if (val.firstSeen < fiveMinAgo) placeIdTracker.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Middleware: detect repeated place_id queries from same IP.
 * 5+ queries for the same practice in 5 minutes = likely scraper.
 */
export function scraperDetection(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const placeId = req.body?.placeId || req.query?.placeId;

  if (!placeId) return next();

  const key = `${ip}:${placeId}`;
  const now = Date.now();
  const entry = placeIdTracker.get(key);

  if (!entry) {
    placeIdTracker.set(key, { count: 1, firstSeen: now });
    return next();
  }

  // Reset if window expired
  if (now - entry.firstSeen > 5 * 60 * 1000) {
    placeIdTracker.set(key, { count: 1, firstSeen: now });
    return next();
  }

  entry.count++;

  if (entry.count === 5) {
    // Log scraper detection — fire and forget
    BehavioralEventModel.insertRateLimitHit({
      eventType: "security.rate_limit_hit",
      properties: JSON.stringify({
        ip,
        place_id: placeId,
        count: entry.count,
        window_seconds: Math.round((now - entry.firstSeen) / 1000),
      }),
    }).catch(() => {});

    logger.warn(`[RateLimit] Scraper detected: IP ${ip} queried place ${placeId} ${entry.count}x in ${Math.round((now - entry.firstSeen) / 1000)}s`);
  }

  next();
}
