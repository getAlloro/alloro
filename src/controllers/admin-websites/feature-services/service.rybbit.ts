/**
 * Rybbit Analytics Service
 *
 * Provisions a Rybbit site and stores the canonical integration row when a
 * custom domain is verified. The renderer owns script injection.
 */

import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { WebsiteIntegrationModel } from "../../../models/website-builder/WebsiteIntegrationModel";
import logger from "../../../lib/logger";

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
