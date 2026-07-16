/**
 * Rybbit Analytics Service
 *
 * Provisions a Rybbit site and stores the canonical integration row when a
 * custom domain is verified. The renderer owns script injection.
 */

import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { WebsiteIntegrationModel } from "../../../models/website-builder/WebsiteIntegrationModel";
import logger from "../../../lib/logger";

/** Hostname suffix for hosted preview sites. */
const PREVIEW_HOST_SUFFIX = ".sites.getalloro.com";

/** Structured outcome of an on-demand preview-analytics provisioning attempt. */
export interface PreviewAnalyticsResult {
  /** Whether the PREVIEW_ANALYTICS_ENABLED master gate is on. */
  enabled: boolean;
  /** Whether a Rybbit site id is now persisted on the project. */
  provisioned: boolean;
  siteId?: string;
  previewDomain?: string;
  /** Machine-readable reason when not provisioned. */
  reason?:
    | "gate_disabled"
    | "not_found"
    | "archived"
    | "not_live"
    | "no_hostname"
    | "provision_failed";
}

const RYBBIT_API_URL = process.env.RYBBIT_API_URL || "";
const RYBBIT_API_KEY = process.env.RYBBIT_API_KEY || "";
const RYBBIT_ORG_ID = process.env.RYBBIT_ORG_ID || "";

/**
 * Creates a Rybbit site for the given domain and saves a hybrid integration.
 *
 * This is a non-blocking side effect — it logs errors but never throws.
 */
export async function provisionRybbitSite(
  projectId: string,
  domain: string
): Promise<void> {
  try {
    if (!RYBBIT_API_URL || !RYBBIT_API_KEY || !RYBBIT_ORG_ID) {
      logger.warn("[Rybbit] Skipping — missing RYBBIT_API_URL, RYBBIT_API_KEY, or RYBBIT_ORG_ID env vars");
      return;
    }

    const project = await ProjectModel.findRybbitSiteIdById(projectId);

    const existingIntegration = await WebsiteIntegrationModel.findByProjectAndPlatform(projectId, "rybbit");
    const existingSiteId = existingIntegration?.metadata?.siteId;
    if (typeof existingSiteId === "string" && existingSiteId.trim()) {
      if (project && project.rybbit_site_id !== existingSiteId) {
        await ProjectModel.updateRybbitSiteId(projectId, existingSiteId);
      }
      logger.info(`[Rybbit] Integration already provisioned (${existingSiteId}) for project ${projectId}, skipping`);
      return;
    }

    if (project?.rybbit_site_id) {
      const siteId = String(project.rybbit_site_id);
      if (existingIntegration) {
        await WebsiteIntegrationModel.update(existingIntegration.id, {
          type: "hybrid",
          metadata: { ...(existingIntegration.metadata ?? {}), siteId },
          status: "active",
          connected_by: existingIntegration.connected_by ?? "system",
          last_error: null,
        });
      } else {
        await WebsiteIntegrationModel.create({
          project_id: projectId,
          platform: "rybbit",
          type: "hybrid",
          metadata: { siteId },
          status: "active",
          connected_by: "system",
        });
      }
      logger.info(`[Rybbit] Existing project site ID registered (${siteId}) for project ${projectId}`);
      return;
    }

    // Create site in Rybbit
    logger.info(`[Rybbit] Creating site for domain: ${domain}`);

    const response = await fetch(`${RYBBIT_API_URL}/api/organizations/${RYBBIT_ORG_ID}/sites`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RYBBIT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domain,
        name: domain,
        blockBots: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(`[Rybbit] Failed to create site (${response.status}): ${body}`);
      return;
    }

    const site = await response.json();
    const siteId = site.siteId || site.id;

    if (!siteId) {
      logger.error({ err: JSON.stringify(site) }, "[Rybbit] API returned success but no siteId:");
      return;
    }

    logger.info(`[Rybbit] Site created: siteId=${siteId} for ${domain}`);

    // Store siteId on project
    await ProjectModel.updateRybbitSiteId(projectId, String(siteId));

    if (!existingIntegration) {
      await WebsiteIntegrationModel.create({
        project_id: projectId,
        platform: "rybbit",
        type: "hybrid",
        metadata: { siteId: String(siteId) },
        status: "active",
        connected_by: "system",
      });
      logger.info(`[Rybbit] Integration row created for project ${projectId}`);
    } else {
      await WebsiteIntegrationModel.update(existingIntegration.id, {
        type: "hybrid",
        metadata: { ...(existingIntegration.metadata ?? {}), siteId: String(siteId) },
        status: "active",
        connected_by: existingIntegration.connected_by ?? "system",
        last_error: null,
      });
      logger.info(`[Rybbit] Integration row updated for project ${projectId}`);
    }

    logger.info(`[Rybbit] Renderer-managed tracking enabled for project ${projectId}`);
  } catch (err: any) {
    logger.error({ err: err?.message || err }, `[Rybbit] Error provisioning site for project ${projectId}:`);
  }
}

/**
 * Enable analytics for a PREVIEW-only project (a hosted *.sites.getalloro.com
 * site with no verified custom domain) by provisioning a Rybbit site for its
 * preview hostname, reusing {@link provisionRybbitSite}. Once the active rybbit
 * integration row exists, the renderer injects its tracking snippet on the
 * preview host — no renderer change is needed for pageview/session/bounce.
 *
 * Guardrails:
 *  - Ships DISABLED. The PREVIEW_ANALYTICS_ENABLED master gate must be "true"
 *    before anything is provisioned. This gate is intentional: B1 cannot see the
 *    renderer's injected snippet (separate repo), so it cannot assert the snippet
 *    is cookieless / no-PII — enabling is gated on a human verifying that first.
 *  - On-demand, per-project — never a backfill sweep. Each project gets its OWN
 *    Rybbit site id (isolation is inherited from provisionRybbitSite, which mints
 *    a fresh site per domain and dedups on this project's own integration row).
 *  - Idempotent and non-throwing (inherited); reports the ACTUAL persisted state
 *    by re-reading rybbit_site_id, never an assumed success.
 */
export async function provisionPreviewAnalytics(
  projectId: string,
): Promise<PreviewAnalyticsResult> {
  if (process.env.PREVIEW_ANALYTICS_ENABLED !== "true") {
    logger.info(
      `[Rybbit] Preview analytics gate disabled — skipping project ${projectId}`,
    );
    return { enabled: false, provisioned: false, reason: "gate_disabled" };
  }

  const project =
    await ProjectModel.findPreviewProvisioningContextById(projectId);
  if (!project) {
    return { enabled: true, provisioned: false, reason: "not_found" };
  }
  if (project.archived_at) {
    return { enabled: true, provisioned: false, reason: "archived" };
  }
  if (project.status !== "LIVE") {
    return { enabled: true, provisioned: false, reason: "not_live" };
  }

  const previewHost = project.hostname ?? project.generated_hostname;
  if (!previewHost) {
    return { enabled: true, provisioned: false, reason: "no_hostname" };
  }
  const previewDomain = `${previewHost}${PREVIEW_HOST_SUFFIX}`;

  // Reuse the proven, idempotent, per-project provisioning path (non-throwing).
  await provisionRybbitSite(projectId, previewDomain);

  // Report the actual persisted state — never assume the provision succeeded.
  const after = await ProjectModel.findRybbitSiteIdById(projectId);
  const siteId = after?.rybbit_site_id;
  if (siteId) {
    return {
      enabled: true,
      provisioned: true,
      siteId: String(siteId),
      previewDomain,
    };
  }
  return {
    enabled: true,
    provisioned: false,
    previewDomain,
    reason: "provision_failed",
  };
}
