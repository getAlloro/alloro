/**
 * Auth helpers for protected-route smoke tests.
 *
 * Mints a REAL JWT via the app's own signer (generateToken) so the token is
 * accepted by the real authenticateToken middleware — the auth guard stays in
 * the tested path rather than being mocked out. Requires JWT_SECRET to be set
 * (done in src/__tests__/setup.ts before any import).
 *
 * Usage:
 *   import { authHeader } from "./helpers/auth";
 *   await request(app).get("/api/...").set(authHeader());        // default user
 *   await request(app).get("/api/...").set(authHeader({ email })); // super-admin
 */

import { generateToken } from "../../controllers/auth-otp/feature-services/service.jwt-management";

const DEFAULT_USER_ID = 1;
const DEFAULT_EMAIL = "smoketest@test.alloro";

/** The email seeded into SUPER_ADMIN_EMAILS by the test setup. */
export const SUPER_ADMIN_EMAIL = "superadmin@test.alloro";

export interface TestTokenOptions {
  userId?: number;
  email?: string;
}

/** Mints a valid 7-day session JWT for a test user. */
export function mintTestToken(options: TestTokenOptions = {}): string {
  const userId = options.userId ?? DEFAULT_USER_ID;
  const email = options.email ?? DEFAULT_EMAIL;
  return generateToken(userId, email);
}

/** Returns an Authorization header object for `.set(...)`. */
export function authHeader(
  options: TestTokenOptions = {},
): { Authorization: string } {
  return { Authorization: `Bearer ${mintTestToken(options)}` };
}

/** Convenience: a Bearer header for the configured super-admin email. */
export function superAdminAuthHeader(): { Authorization: string } {
  return authHeader({ email: SUPER_ADMIN_EMAIL });
}
