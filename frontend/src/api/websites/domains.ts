/**
 * Websites API - custom domain, organization linking, contact-form type
 *
 * Re-exported via the `src/api/websites.ts` barrel.
 */

import { adminFetch } from "../index";
import { API_BASE } from "./_shared";
import type { WebsiteProject } from "./_shared";

// =====================================================================
// CUSTOM DOMAIN
// =====================================================================

export interface ConnectDomainResponse {
  success: boolean;
  data: { custom_domain: string; server_ip: string };
}

export interface VerifyDomainResponse {
  success: boolean;
  data: { verified: boolean; custom_domain: string; resolved_ips?: string[] };
}

/** Connect a custom domain to a project (admin) */
export const connectDomain = async (
  projectId: string,
  domain: string,
): Promise<ConnectDomainResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/connect-domain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to connect domain");
  }

  return response.json();
};

/** Verify DNS for a project's custom domain (admin) */
export const verifyDomainAdmin = async (
  projectId: string,
): Promise<VerifyDomainResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/verify-domain`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to verify domain");
  }

  return response.json();
};

/** Disconnect custom domain from a project (admin) */
export const disconnectDomain = async (
  projectId: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/disconnect-domain`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to disconnect domain");
  }

  return response.json();
};

// =====================================================================
// ORGANIZATION LINKING
// =====================================================================

/**
 * Link or unlink a website to/from an organization
 */
export const linkWebsiteToOrganization = async (
  projectId: string,
  organizationId: number | null,
): Promise<{ success: boolean; data: WebsiteProject }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/link-organization`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ organizationId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to link organization");
  }

  return response.json();
};

// =====================================================================
// CONTACT FORM
// =====================================================================

export interface ContactFormData {
  name: string;
  phone: string;
  email: string;
  service?: string;
  message?: string;
  captchaToken: string;
}
