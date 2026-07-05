/**
 * Super Admin Service
 *
 * Determines if an email belongs to a super admin. Admin authorization is
 * DOMAIN-based (plans/07052026-google-sso-admin-and-user-login): any verified
 * @getalloro.com account is an admin. SUPER_ADMIN_EMAILS is retained as an
 * OPTIONAL additional grant (e.g. a non-@getalloro break-glass address) — empty
 * it to fall back to domain-only.
 */

import { ADMIN_ALLOWED_DOMAIN } from "../../../config/googleLogin";

export function isSuperAdmin(email: string): boolean {
  const normalized = email.toLowerCase();

  // Primary gate: the admin domain.
  if (normalized.endsWith(`@${ADMIN_ALLOWED_DOMAIN}`)) {
    return true;
  }

  // Optional additional grant: the explicit allowlist.
  const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  return superAdminEmails.includes(normalized);
}
