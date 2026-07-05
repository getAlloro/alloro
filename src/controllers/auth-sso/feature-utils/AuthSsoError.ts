/**
 * Typed domain error for the Google SSO login flow (mirrors
 * gbp-automation/feature-utils/GbpAutomationError.ts, §8.3). The OAuth
 * start/callback endpoints are browser redirects rather than JSON responses, so
 * the controller reads `code` to build the `/auth/google/finish?error=<code>`
 * redirect; `status` is carried for the JSON endpoints P2 will add.
 */
export class AuthSsoError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "AuthSsoError";
  }
}
