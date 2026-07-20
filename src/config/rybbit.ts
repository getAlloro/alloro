/**
 * Rybbit provisioning configuration.
 *
 * Read lazily so dotenv has loaded before the first provisioning request and
 * tests can set an isolated provider endpoint before importing the service.
 */

export interface RybbitProvisioningConfig {
  apiUrl: string;
  apiKey: string;
  organizationId: string;
}

export function getRybbitProvisioningConfig(): RybbitProvisioningConfig | null {
  const apiUrl = process.env.RYBBIT_API_URL?.trim();
  const apiKey = process.env.RYBBIT_API_KEY?.trim();
  const organizationId = process.env.RYBBIT_ORG_ID?.trim();
  if (!apiUrl || !apiKey || !organizationId) return null;
  return { apiUrl, apiKey, organizationId };
}

export function isPreviewAnalyticsEnabled(): boolean {
  return process.env.PREVIEW_ANALYTICS_ENABLED === "true";
}
