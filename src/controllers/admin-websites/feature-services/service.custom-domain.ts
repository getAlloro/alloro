/**
 * Custom Domain Service
 *
 * Business logic for connecting, verifying, and disconnecting
 * custom domains on website projects.
 *
 * Auto-populates www/non-www counterpart as custom_domain_alt.
 */

import dns from "dns";
import { promisify } from "util";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { refreshCustomDomainCache } from "../../../middleware/corsCustomDomains";
import { provisionRybbitSite } from "./service.rybbit";
import logger from "../../../lib/logger";

const resolve4 = promisify(dns.resolve4);
const RENDERER_IP = process.env.SITE_RENDERER_IP || "";

type ServiceError = { status: number; code: string; message: string };
type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: ServiceError };

/** Given a domain, return its www/non-www counterpart */
function getAltDomain(domain: string): string {
  if (domain.startsWith("www.")) {
    return domain.slice(4); // www.example.com → example.com
  }
  return `www.${domain}`; // example.com → www.example.com
}

// ---------------------------------------------------------------------------
// Connect domain (save to DB, clear verification)
// ---------------------------------------------------------------------------

export async function connectDomain(
  projectId: string,
  domain: string
): Promise<Result<{ custom_domain: string; custom_domain_alt: string; server_ip: string }>> {
  // Validate domain format
  const cleaned = domain.trim().toLowerCase();
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(cleaned)) {
    return {
      error: {
        status: 400,
        code: "INVALID_DOMAIN",
        message: "Invalid domain format. Example: www.example.com",
      },
    };
  }

  const alt = getAltDomain(cleaned);

  // Check project exists
  const project = await ProjectModel.findWithOrgArchivedById(projectId);
  if (!project) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }
  if (project.archived_at || project.org_archived_at) {
    return {
      error: {
        status: 423,
        code: "PROJECT_ARCHIVED",
        message: "Archived organization websites cannot connect custom domains.",
      },
    };
  }

  // Check neither domain is used by another project
  const existing = await ProjectModel.findDomainConflict(cleaned, alt, projectId);

  if (existing) {
    return {
      error: {
        status: 409,
        code: "DOMAIN_TAKEN",
        message: "This domain is already connected to another project",
      },
    };
  }

  // Save both domains, clear verification
  await ProjectModel.setCustomDomain(projectId, cleaned, alt);

  logger.info(`[Custom Domain] Connected ${cleaned} + ${alt} to project ${projectId}`);

  return {
    data: {
      custom_domain: cleaned,
      custom_domain_alt: alt,
      server_ip: RENDERER_IP,
    },
  };
}

// ---------------------------------------------------------------------------
// Verify domain (DNS A record check — checks primary domain)
// ---------------------------------------------------------------------------

export async function verifyDomain(
  projectId: string
): Promise<Result<{ verified: boolean; custom_domain: string; custom_domain_alt: string | null; resolved_ips?: string[] }>> {
  if (!RENDERER_IP) {
    return {
      error: {
        status: 500,
        code: "CONFIG_ERROR",
        message: "SITE_RENDERER_IP not configured on server",
      },
    };
  }

  const project = await ProjectModel.findDomainVerificationContextById(projectId);

  if (!project) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }
  if (project.archived_at || project.org_archived_at) {
    return {
      error: {
        status: 423,
        code: "PROJECT_ARCHIVED",
        message: "Archived organization websites cannot verify custom domains.",
      },
    };
  }

  if (!project.custom_domain) {
    return {
      error: {
        status: 400,
        code: "NO_DOMAIN",
        message: "No custom domain connected to this project",
      },
    };
  }

  // Already verified
  if (project.domain_verified_at) {
    return {
      data: {
        verified: true,
        custom_domain: project.custom_domain,
        custom_domain_alt: project.custom_domain_alt,
      },
    };
  }

  // DNS lookup on primary domain
  let resolvedIps: string[];
  try {
    resolvedIps = await resolve4(project.custom_domain);
  } catch {
    return {
      data: {
        verified: false,
        custom_domain: project.custom_domain,
        custom_domain_alt: project.custom_domain_alt,
        resolved_ips: [],
      },
    };
  }

  const matches = resolvedIps.includes(RENDERER_IP);

  if (matches) {
    await ProjectModel.markDomainVerified(projectId);

    logger.info(`[Custom Domain] Verified ${project.custom_domain} for project ${projectId}`);

    // Immediately update the CORS cache so the new domain is allowed
    refreshCustomDomainCache();

    // Provision Rybbit analytics site (non-blocking)
    provisionRybbitSite(projectId, project.custom_domain).catch(() => {});
  }

  return {
    data: {
      verified: matches,
      custom_domain: project.custom_domain,
      custom_domain_alt: project.custom_domain_alt,
      resolved_ips: resolvedIps,
    },
  };
}

// ---------------------------------------------------------------------------
// Disconnect domain
// ---------------------------------------------------------------------------

export async function disconnectDomain(
  projectId: string
): Promise<Result<{ disconnected: boolean }>> {
  const project = await ProjectModel.findRawById(projectId);
  if (!project) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  await ProjectModel.clearCustomDomain(projectId);

  logger.info(`[Custom Domain] Disconnected domain from project ${projectId}`);

  return { data: { disconnected: true } };
}

// ---------------------------------------------------------------------------
// Get domain status
// ---------------------------------------------------------------------------

export async function getDomainStatus(
  projectId: string
): Promise<Result<{
  custom_domain: string | null;
  custom_domain_alt: string | null;
  domain_verified_at: Date | null;
  server_ip: string;
}>> {
  const project = await ProjectModel.findDomainStatusById(projectId);

  if (!project) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  return {
    data: {
      custom_domain: project.custom_domain,
      custom_domain_alt: project.custom_domain_alt,
      domain_verified_at: project.domain_verified_at,
      server_ip: RENDERER_IP,
    },
  };
}
