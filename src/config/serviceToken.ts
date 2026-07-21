/**
 * Service-token configuration.
 *
 * Machine callers — the PMS→agents self-calls, n8n workflows, and the Clarity /
 * ranking webhooks — reach `/api/agents`, `/api/clarity` and
 * `/api/practice-ranking` without a JWT. Those prefixes sit on the public
 * allowlist for exactly that reason (middleware/publicRoutes.ts), which also
 * leaves them open to anyone else.
 *
 * The replacement is a shared service token, rolled out in two stages so the
 * live pipeline is never cut off:
 *
 *   Stage 1 (default) — ALLORO_SERVICE_TOKEN_ENFORCE unset or "false".
 *     A valid token is recognised and recorded; a request without one is still
 *     served, and logged. This is the observation window: enforcement is only
 *     safe once those logs show no un-tokened callers left.
 *
 *   Stage 2 — ALLORO_SERVICE_TOKEN_ENFORCE="true".
 *     A request without a valid token is rejected with 401.
 *
 * Never flip stage 2 on the strength of a partial window. See the plan's T6.
 */

/** Header carrying the shared secret. */
export const SERVICE_TOKEN_HEADER = "x-alloro-service-token";

/** The configured token, or undefined when none is set. */
export function getServiceToken(): string | undefined {
  const token = process.env.ALLORO_SERVICE_TOKEN?.trim();
  return token && token.length > 0 ? token : undefined;
}

/**
 * Header object for outbound self-calls into the machine routes.
 *
 * Returns an empty object when no token is configured, so callers keep working
 * during stage 1 on a host where the token has not been staged yet.
 */
export function serviceTokenHeader(): Record<string, string> {
  const token = getServiceToken();
  return token ? { [SERVICE_TOKEN_HEADER]: token } : {};
}

/** True once the rollout has moved to stage 2. */
export function isServiceTokenEnforced(): boolean {
  return process.env.ALLORO_SERVICE_TOKEN_ENFORCE?.trim() === "true";
}

/**
 * Startup validation (§5.6). Enforcement without a configured token would
 * reject every machine caller the moment the process came up, so refuse to
 * start in that state rather than discovering it on the first webhook.
 */
export function assertServiceTokenConfig(): void {
  if (isServiceTokenEnforced() && !getServiceToken()) {
    throw new Error(
      "ALLORO_SERVICE_TOKEN_ENFORCE is true but ALLORO_SERVICE_TOKEN is not set — " +
        "every machine caller would be rejected. Set the token or disable enforcement."
    );
  }
}
