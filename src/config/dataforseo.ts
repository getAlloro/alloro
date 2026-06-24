/**
 * DataForSEO Configuration — credentials for the market search-volume harvest.
 *
 * The search-volume job authenticates to DataForSEO's Google Ads search-volume
 * endpoint with HTTP Basic auth (login + password). Both come from the
 * environment only (§5.1) — never hardcoded.
 *
 * Read lazily at call time (not at module load) so dotenv.config() has already
 * run regardless of import order, mirroring config/jwt.ts. A startup warn marks
 * the feature unavailable when the credentials are missing (§5.6): the harvest
 * degrades gracefully (the job no-ops) rather than throwing mid-request — the
 * "Searching your market" funnel stage simply shows its honest empty state.
 */

import logger from "../lib/logger";

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;

if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
  logger.warn(
    "[DataForSEO] DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not set. The market search-volume harvest will be skipped until configured."
  );
}

export interface DataForSeoCredentials {
  login: string;
  password: string;
}

/**
 * Returns the DataForSEO credentials. Throws if either is unset — callers that
 * reach this point have already passed isDataForSeoConfigured(), so the throw is
 * a fail-closed safety net, not the normal degradation path.
 */
export function getDataForSeoCredentials(): DataForSeoCredentials {
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    throw new Error(
      "DataForSEO is not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in environment variables — the search-volume harvest cannot authenticate without them."
    );
  }
  return { login: DATAFORSEO_LOGIN, password: DATAFORSEO_PASSWORD };
}

/**
 * The HTTP Basic `Authorization` header value for DataForSEO:
 * `Basic base64(login:password)`. Throws if credentials are missing.
 */
export function getDataForSeoAuthHeader(): string {
  const { login, password } = getDataForSeoCredentials();
  const encoded = Buffer.from(`${login}:${password}`).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Whether DataForSEO credentials are present. Callers use this for graceful
 * degradation — when false, the search-volume harvest is skipped entirely.
 */
export function isDataForSeoConfigured(): boolean {
  return Boolean(DATAFORSEO_LOGIN && DATAFORSEO_PASSWORD);
}
