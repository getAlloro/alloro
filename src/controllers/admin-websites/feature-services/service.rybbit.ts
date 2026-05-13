/**
 * Rybbit Analytics Service
 *
 * Provisions a Rybbit site and stores the canonical integration row when a
 * custom domain is verified. The renderer owns script injection.
 */

import { db } from "../../../database/connection";
import { WebsiteIntegrationModel } from "../../../models/website-builder/WebsiteIntegrationModel";

const PROJECTS_TABLE = "website_builder.projects";

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
      console.warn("[Rybbit] Skipping — missing RYBBIT_API_URL, RYBBIT_API_KEY, or RYBBIT_ORG_ID env vars");
      return;
    }

    const project = await db(PROJECTS_TABLE)
      .select("rybbit_site_id")
      .where("id", projectId)
      .first();

    const existingIntegration = await WebsiteIntegrationModel.findByProjectAndPlatform(projectId, "rybbit");
    const existingSiteId = existingIntegration?.metadata?.siteId;
    if (typeof existingSiteId === "string" && existingSiteId.trim()) {
      if (project && project.rybbit_site_id !== existingSiteId) {
        await db(PROJECTS_TABLE).where("id", projectId).update({
          rybbit_site_id: existingSiteId,
          updated_at: db.fn.now(),
        });
      }
      console.log(`[Rybbit] Integration already provisioned (${existingSiteId}) for project ${projectId}, skipping`);
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
      console.log(`[Rybbit] Existing project site ID registered (${siteId}) for project ${projectId}`);
      return;
    }

    // Create site in Rybbit
    console.log(`[Rybbit] Creating site for domain: ${domain}`);

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
      console.error(`[Rybbit] Failed to create site (${response.status}): ${body}`);
      return;
    }

    const site = await response.json();
    const siteId = site.siteId || site.id;

    if (!siteId) {
      console.error("[Rybbit] API returned success but no siteId:", JSON.stringify(site));
      return;
    }

    console.log(`[Rybbit] Site created: siteId=${siteId} for ${domain}`);

    // Store siteId on project
    await db(PROJECTS_TABLE).where("id", projectId).update({
      rybbit_site_id: String(siteId),
      updated_at: db.fn.now(),
    });

    if (!existingIntegration) {
      await WebsiteIntegrationModel.create({
        project_id: projectId,
        platform: "rybbit",
        type: "hybrid",
        metadata: { siteId: String(siteId) },
        status: "active",
        connected_by: "system",
      });
      console.log(`[Rybbit] Integration row created for project ${projectId}`);
    } else {
      await WebsiteIntegrationModel.update(existingIntegration.id, {
        type: "hybrid",
        metadata: { ...(existingIntegration.metadata ?? {}), siteId: String(siteId) },
        status: "active",
        connected_by: existingIntegration.connected_by ?? "system",
        last_error: null,
      });
      console.log(`[Rybbit] Integration row updated for project ${projectId}`);
    }

    console.log(`[Rybbit] Renderer-managed tracking enabled for project ${projectId}`);
  } catch (err: any) {
    console.error(`[Rybbit] Error provisioning site for project ${projectId}:`, err?.message || err);
  }
}
