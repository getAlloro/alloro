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

import { db } from "../database/connection";

const PROJECTS_TABLE = "website_builder.projects";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let allowedDomains = new Set<string>();
let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Load all verified custom domains into memory.
 */
export async function refreshCustomDomainCache(): Promise<void> {
  try {
    const rows = await db(PROJECTS_TABLE)
      .leftJoin(
        "organizations",
        `${PROJECTS_TABLE}.organization_id`,
        "organizations.id"
      )
      .select(`${PROJECTS_TABLE}.custom_domain`, `${PROJECTS_TABLE}.custom_domain_alt`)
      .whereNotNull(`${PROJECTS_TABLE}.domain_verified_at`)
      .whereNotNull(`${PROJECTS_TABLE}.custom_domain`)
      .whereNull(`${PROJECTS_TABLE}.archived_at`)
      .where(function () {
        this.whereNull(`${PROJECTS_TABLE}.organization_id`).orWhereNull(
          "organizations.archived_at"
        );
      });

    const domains = new Set<string>();
    for (const row of rows) {
      if (row.custom_domain) domains.add(row.custom_domain.toLowerCase());
      if (row.custom_domain_alt) domains.add(row.custom_domain_alt.toLowerCase());
    }

    allowedDomains = domains;
    console.log(`[CORS] Custom domain cache refreshed: ${domains.size} domains`);
  } catch (err) {
    console.error("[CORS] Failed to refresh custom domain cache:", err);
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
