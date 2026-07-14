/**
 * Public Route Allowlist + App-Level Default-Deny Auth Guard
 *
 * Security model: the app mounts `requireAuthUnlessPublic` ahead of all router
 * mounts in `index.ts`. Every request must carry a valid JWT UNLESS its path
 * matches the explicit public allowlist or delegates JWT verification to a
 * route-specific middleware below. This flips the app from fail-open
 * (routers had to remember to add auth) to fail-safe (a newly-added route is
 * protected by default).
 *
 * The allowlist is a SECURITY-CRITICAL artifact. Every entry is a route that is
 * genuinely public by design — login/registration, signature-verified webhooks,
 * shared-secret / API-key-gated machine endpoints, and public file/contact
 * surfaces for rendered client sites. Adding an entry here removes auth from
 * that path; do not broaden it casually.
 *
 * Matching:
 *  - EXACT paths win first (e.g. `/api/billing/webhook` is public while the rest
 *    of `/api/billing` is protected).
 *  - PREFIX paths match the path and any sub-path (`/api/auth` covers
 *    `/api/auth/login`, `/api/auth/otp/verify`, etc.).
 *  - OPTIONS preflight is always allowed (CORS handles it before this runs, but
 *    this is a belt-and-suspenders no-op).
 */

import { Response, NextFunction } from "express";
import { authenticateToken, AuthRequest } from "./auth";

/**
 * Exact public paths. These are public even though a broader prefix of theirs is
 * protected — e.g. the Stripe webhook under the otherwise-authenticated
 * `/api/billing`, and the public help form under the otherwise-authenticated
 * `/api/support`.
 */
const PUBLIC_EXACT_PATHS: ReadonlySet<string> = new Set([
  // Diagnostics / health
  "/api/health/db",
  "/api/sentry-test",
  // Stripe webhook — verified by Stripe signature, never carries a JWT.
  "/api/billing/webhook",
  // Public help form + health — the rest of /api/support (tickets) is protected.
  "/api/support/inquiry",
  "/api/support/health",
]);

/**
 * Public path prefixes. A request is public if its path equals one of these or
 * starts with one followed by `/`.
 */
const PUBLIC_PREFIXES: readonly string[] = [
  // ── Authentication (login, register, OAuth callbacks, OTP, password reset) ──
  // Every endpoint under /api/auth is part of an unauthenticated entry flow.
  "/api/auth",

  // ── Signature / API-key / shared-secret gated machine endpoints ──
  "/api/scraper", // n8n website scraper — x-scraper-key header
  "/api/internal", // n8n workers — internal-key (validated in router)
  "/api/leadgen", // leadgen tracking — X-Leadgen-Key (validated in router)
  "/api/audit", // leadgen tool audit tracking (retry path is key-gated)
  "/api/webhooks/mailgun-events", // Mailgun event webhook — HMAC signature-verified in controller

  // ── Public site surfaces (rendered *.sites.getalloro.com) ──
  "/api/websites", // public contact / form-submission / newsletter confirm
  "/api/imports", // public self-hosted asset file serving
  "/api/places", // public GBP search (rate-limited)

  // ── Public skill / portal API (portal-key auth handled in controllers) ──
  "/api/minds", // NOTE: /api/admin/minds is a DIFFERENT, protected mount
  "/api/skills",

  // ── Machine-triggered analytics / agent pipelines (no JWT today) ──
  // These are invoked server-to-server (localhost) and by n8n WITHOUT a JWT.
  // Default-denying them would break the live PMS→agents pipeline and the
  // Clarity / ranking webhooks. They are NOT in this hotfix's "must-protect"
  // set (which is the admin CRUD surface with authenticated frontend callers).
  // Tightening them requires issuing the internal callers a service token —
  // tracked as follow-up, intentionally out of scope here.
  "/api/clarity",
  "/api/agents",
  "/api/practice-ranking", // client + admin mount share this prefix; trigger/
  //   status routes are currently unauthenticated and externally triggered
];

/**
 * Paths that are not public but must reach a narrower route-specific auth
 * strategy. OS images load through <img>, so their route verifies the same JWT
 * from `?token=` before applying the unchanged super-admin gate. No other OS
 * route accepts a query token.
 */
const DELEGATED_AUTH_PREFIXES: readonly string[] = [
  "/api/admin/os/assets",
];

function matchesPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

/**
 * Returns true if the request path is on the public allowlist.
 */
function isPublicPath(path: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(path)) return true;
  return matchesPrefix(path, PUBLIC_PREFIXES);
}

/**
 * App-level default-deny guard. Allows public or explicitly delegated paths to
 * reach their router; everything else must pass `authenticateToken` here (401
 * without a valid JWT). Mount ONCE in index.ts ahead of the router mounts.
 */
export const requireAuthUnlessPublic = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // Only guard the API surface. Non-/api paths are the SPA (static index.html in
  // prod, Vite proxy in dev) and must pass through untouched — gating them would
  // 401 every page load.
  if (!req.path.startsWith("/api/") && req.path !== "/api") {
    return next();
  }

  // CORS preflight carries no auth and is handled upstream — never gate it.
  if (req.method === "OPTIONS") {
    return next();
  }

  if (
    isPublicPath(req.path) ||
    matchesPrefix(req.path, DELEGATED_AUTH_PREFIXES)
  ) {
    return next();
  }

  return authenticateToken(req, res, next);
};
