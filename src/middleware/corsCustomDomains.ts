/**
 * Custom Domain CORS Cache
 *
 * Maintains an in-memory Set of verified custom domains so the CORS
 * middleware can allow requests from rendered sites served on custom
 * domains without hitting the DB on every request.
 *
 * Refreshes automatically every 5 minutes. Call refreshCustomDomainCache()
 * manually after a domain is verified to avoid the 5-minute delay.
 */

import { ProjectModel } from "../models/website-builder/ProjectModel";
import logger from "../lib/logger";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let allowedDomains = new Set<string>();
let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Load all verified custom domains into memory.
 */
export async function refreshCustomDomainCache(): Promise<void> {
  try {
    const rows = await ProjectModel.findAllVerifiedDomains();

    const domains = new Set<string>();
    for (const row of rows) {
      if (row.custom_domain) domains.add(row.custom_domain.toLowerCase());
      if (row.custom_domain_alt) domains.add(row.custom_domain_alt.toLowerCase());
    }

    allowedDomains = domains;
    logger.info(`[CORS] Custom domain cache refreshed: ${domains.size} domains`);
  } catch (err) {
    logger.error({ err: err }, "[CORS] Failed to refresh custom domain cache:");
  }
}

/**
 * Start the periodic cache refresh. Call once at server startup.
 */
export function startCustomDomainCacheRefresh(): void {
  // Initial load
  refreshCustomDomainCache();

  // Periodic refresh
  if (!refreshTimer) {
    refreshTimer = setInterval(refreshCustomDomainCache, REFRESH_INTERVAL_MS);
  }
}

/**
 * Check if a request origin matches a verified custom domain.
 * Extracts the hostname from the origin URL and checks the cache.
 */
export function isAllowedCustomDomain(origin: string): boolean {
  try {
    const url = new URL(origin);
    return allowedDomains.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
