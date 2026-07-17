/**
 * Rybbit site-provisioning client.
 *
 * Rybbit does not accept an idempotency key on site creation. Reconcile by the
 * exact normalized domain before creating so a retry can adopt a provider site
 * left behind when local persistence rolled back.
 */

import logger from "../../../lib/logger";
import {
  getRybbitProvisioningConfig,
  type RybbitProvisioningConfig,
} from "../../../config/rybbit";
import { RybbitIntegrationError } from "./service.rybbit-integration";

const RYBBIT_PROVISION_TIMEOUT_MS = 10_000;

type ProviderSite = {
  siteId?: unknown;
  id?: unknown;
  domain?: unknown;
};

function requireRybbitConfiguration(): RybbitProvisioningConfig {
  const config = getRybbitProvisioningConfig();
  if (config) return config;
  throw new RybbitIntegrationError(
    503,
    "RYBBIT_PROVIDER_UNAVAILABLE",
    "Rybbit provisioning is not configured",
  );
}

function providerHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function readProviderSiteId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const value = record.siteId ?? record.id;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

async function requestProvider(
  url: string,
  init: RequestInit,
  operation: "list" | "create",
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    logger.error({ err: error, operation }, "[Rybbit] Site request failed");
    throw new RybbitIntegrationError(
      502,
      "RYBBIT_PROVIDER_ERROR",
      "Rybbit could not reconcile the analytics site",
    );
  }
}

function requireProviderSuccess(
  response: Response,
  operation: "list" | "create",
): void {
  if (response.ok) return;
  logger.error(
    { operation, providerStatus: response.status },
    "[Rybbit] Site request returned an error",
  );
  throw new RybbitIntegrationError(
    502,
    "RYBBIT_PROVIDER_ERROR",
    "Rybbit could not reconcile the analytics site",
  );
}

async function readProviderJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    logger.error({ err: error }, "[Rybbit] Site request returned invalid JSON");
    throw new RybbitIntegrationError(
      502,
      "RYBBIT_PROVIDER_INVALID_RESPONSE",
      "Rybbit returned an invalid provisioning response",
    );
  }
}

function compareSiteIds(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function findMatchingSiteId(payload: unknown, domain: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const sites = (payload as Record<string, unknown>).sites;
  if (!Array.isArray(sites)) {
    throw new RybbitIntegrationError(
      502,
      "RYBBIT_PROVIDER_INVALID_RESPONSE",
      "Rybbit returned an invalid provisioning response",
    );
  }

  const normalizedDomain = normalizeDomain(domain);
  const matches = sites
    .filter(
      (site): site is ProviderSite =>
        !!site &&
        typeof site === "object" &&
        typeof (site as ProviderSite).domain === "string" &&
        normalizeDomain((site as ProviderSite).domain as string) ===
          normalizedDomain,
    )
    .map(readProviderSiteId)
    .filter((siteId): siteId is string => !!siteId)
    .sort(compareSiteIds);

  if (matches.length > 1) {
    logger.warn(
      { domain: normalizedDomain, matchingSiteCount: matches.length },
      "[Rybbit] Multiple provider sites match the domain; using the canonical lowest site id",
    );
  }
  return matches[0] ?? null;
}

async function findProviderSite(
  domain: string,
  config: RybbitProvisioningConfig,
): Promise<string | null> {
  const response = await requestProvider(
    `${config.apiUrl}/api/organizations/${config.organizationId}/sites`,
    {
      method: "GET",
      headers: providerHeaders(config.apiKey),
      signal: AbortSignal.timeout(RYBBIT_PROVISION_TIMEOUT_MS),
    },
    "list",
  );
  requireProviderSuccess(response, "list");
  return findMatchingSiteId(await readProviderJson(response), domain);
}

async function createProviderSite(
  domain: string,
  config: RybbitProvisioningConfig,
): Promise<string> {
  const response = await requestProvider(
    `${config.apiUrl}/api/organizations/${config.organizationId}/sites`,
    {
      method: "POST",
      headers: providerHeaders(config.apiKey),
      body: JSON.stringify({ domain, name: domain, blockBots: true }),
      signal: AbortSignal.timeout(RYBBIT_PROVISION_TIMEOUT_MS),
    },
    "create",
  );
  requireProviderSuccess(response, "create");

  const siteId = readProviderSiteId(await readProviderJson(response));
  if (siteId) return siteId;
  throw new RybbitIntegrationError(
    502,
    "RYBBIT_PROVIDER_INVALID_RESPONSE",
    "Rybbit returned an invalid provisioning response",
  );
}

/**
 * Reuse an exact-domain provider site when one exists; otherwise create it.
 * This is the recovery seam for provider-success/local-persistence-failure.
 */
export async function findOrCreateProviderSite(
  domain: string,
): Promise<string> {
  const config = requireRybbitConfiguration();
  const existingSiteId = await findProviderSite(domain, config);
  if (existingSiteId) return existingSiteId;
  return createProviderSite(domain, config);
}
