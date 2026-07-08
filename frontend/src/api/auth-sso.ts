/**
 * Google SSO login entry points.
 *
 * These are top-level browser navigations to the backend OAuth start endpoint
 * (not XHR) — the backend redirects to Google, then back to
 * `/auth/google/finish`. The path is relative `/api/...` so it resolves
 * same-origin in every environment (Vite proxy locally, Apache on dev/prod).
 *
 * P1 exposes the admin flow only; the user/client login + link/unlink helpers
 * are added with P2.
 */

const SSO_BASE = "/api/auth/google";

/** URL that begins the admin Google sign-in handshake. */
export function adminGoogleLoginUrl(): string {
  return `${SSO_BASE}/start?flow=admin`;
}

/** Navigate the browser into the admin Google sign-in flow. */
export function startAdminGoogleLogin(): void {
  window.location.assign(adminGoogleLoginUrl());
}
