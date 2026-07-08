/**
 * Super Admin Service
 *
 * Admin authorization is purely DOMAIN-based
 * (plans/07052026-google-sso-admin-and-user-login): a verified @getalloro.com
 * account is an admin — the same gate the Google login enforces
 * (assertAdminDomain). There is NO SUPER_ADMIN_EMAILS dependence: admin access
 * is the identity, not an env allowlist, and there is no separate admin table —
 * admins are `users` rows identified by id, flagged is_internal for rosters.
 */

import { ADMIN_ALLOWED_DOMAIN } from "../../../config/googleLogin";

export function isSuperAdmin(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ADMIN_ALLOWED_DOMAIN}`);
}
