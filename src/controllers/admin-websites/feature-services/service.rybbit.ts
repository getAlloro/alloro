/**
 * Rybbit Analytics Service
 *
 * Provisions a Rybbit site and stores the canonical integration row when a
 * custom domain is verified. The renderer owns script injection.
 */

import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import {
  WebsiteIntegrationModel,
  type IWebsiteIntegrationSafe,
} from "../../../models/website-builder/WebsiteIntegrationModel";
import type { QueryContext } from "../../../models/BaseModel";
import logger from "../../../lib/logger";
import { isPreviewAnalyticsEnabled } from "../../../config/rybbit";
import { RybbitIntegrationError } from "./service.rybbit-integration";
import { findOrCreateProviderSite } from "./service.rybbit-provider";

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
    | "archived"
    | "org_archived"
    | "not_live"
    | "has_custom_domain"
    | "no_hostname"
    | "integration_revoked";
}

type PreviewProject = NonNullable<
  Awaited<ReturnType<typeof ProjectModel.findPreviewProvisioningContextById>>
>;

async function upsertRybbitIntegration(
  projectId: string,
  siteId: string,
  existingIntegration: IWebsiteIntegrationSafe | undefined,
  trx: QueryContext,
): Promise<IWebsiteIntegrationSafe | undefined> {
  if (!existingIntegration) {
    return WebsiteIntegrationModel.create(
      {
        project_id: projectId,
        platform: "rybbit",
        type: "hybrid",
        metadata: { siteId },
        status: "active",
        connected_by: "system",
      },
      trx,
    );
  }

  return WebsiteIntegrationModel.update(
    existingIntegration.id,
    {
      type: "hybrid",
      metadata: { ...(existingIntegration.metadata ?? {}), siteId },
      status: "active",
      connected_by: existingIntegration.connected_by ?? "system",
      last_error: null,
    },
    trx,
  );
}

async function persistRybbitSite(
  projectId: string,
  siteId: string,
  existingIntegration: IWebsiteIntegrationSafe | undefined,
  trx: QueryContext,
): Promise<void> {
  const projectUpdates = await ProjectModel.updateRybbitSiteId(
    projectId,
    siteId,
    trx,
  );
  if (projectUpdates === 0) {
    throw new RybbitIntegrationError(
      404,
      "PROJECT_NOT_FOUND",
      "Website project not found",
    );
  }

  const saved = await upsertRybbitIntegration(
    projectId,
    siteId,
    existingIntegration,
    trx,
  );
  if (!saved) {
    throw new RybbitIntegrationError(
      500,
      "RYBBIT_PERSISTENCE_FAILED",
      "Failed to save the Rybbit integration",
    );
  }
}

/**
 * Creates a Rybbit site for the given domain and saves a hybrid integration.
 */
export async function provisionRybbitSite(
  projectId: string,
  domain: string,
): Promise<string> {
  try {
    return await WebsiteIntegrationModel.transaction(async (trx) => {
      const project = await ProjectModel.findRybbitSiteIdByIdForUpdate(
        projectId,
        trx,
      );
      if (!project) {
        throw new RybbitIntegrationError(
          404,
          "PROJECT_NOT_FOUND",
          "Website project not found",
        );
      }

      const existingIntegration =
        await WebsiteIntegrationModel.findByProjectAndPlatform(
          projectId,
          "rybbit",
          trx,
        );
      const existingSiteId = existingIntegration?.metadata?.siteId;
      if (typeof existingSiteId === "string" && existingSiteId.trim()) {
        const siteId = existingSiteId.trim();
        if (project.rybbit_site_id !== siteId) {
          const updated = await ProjectModel.updateRybbitSiteId(
            projectId,
            siteId,
            trx,
          );
          if (updated === 0) {
            throw new RybbitIntegrationError(
              404,
              "PROJECT_NOT_FOUND",
              "Website project not found",
            );
          }
        }
        logger.info(
          `[Rybbit] Integration already provisioned (${siteId}) for project ${projectId}, skipping`,
        );
        return siteId;
      }

      if (project.rybbit_site_id) {
        const siteId = String(project.rybbit_site_id);
        await persistRybbitSite(
          projectId,
          siteId,
          existingIntegration,
          trx,
        );
        logger.info(
          `[Rybbit] Existing project site ID registered (${siteId}) for project ${projectId}`,
        );
        return siteId;
      }

      logger.info(`[Rybbit] Reconciling site for domain: ${domain}`);
      const siteId = await findOrCreateProviderSite(domain);
      await persistRybbitSite(
        projectId,
        siteId,
        existingIntegration,
        trx,
      );
      logger.info(`[Rybbit] Site ${siteId} persisted for project ${projectId}`);
      return siteId;
    });
  } catch (error) {
    if (error instanceof RybbitIntegrationError) throw error;
    logger.error(
      { err: error, projectId },
      "[Rybbit] Failed to persist site assignment",
    );
    throw new RybbitIntegrationError(
      500,
      "RYBBIT_PERSISTENCE_FAILED",
      "Failed to save the Rybbit integration",
    );
  }
}

async function requirePreviewProject(projectId: string): Promise<PreviewProject> {
  const project =
    await ProjectModel.findPreviewProvisioningContextById(projectId);
  if (project) return project;
  throw new RybbitIntegrationError(
    404,
    "PROJECT_NOT_FOUND",
    "Website project not found",
  );
}

function previewProjectBlock(
  project: PreviewProject,
): PreviewAnalyticsResult | null {
  if (project.archived_at) {
    return { enabled: true, provisioned: false, reason: "archived" };
  }
  if (project.org_archived_at) {
    return { enabled: true, provisioned: false, reason: "org_archived" };
  }
  if (project.status !== "LIVE") {
    return { enabled: true, provisioned: false, reason: "not_live" };
  }
  if (project.custom_domain) {
    return { enabled: true, provisioned: false, reason: "has_custom_domain" };
  }
  return null;
}

function getPreviewDomain(project: PreviewProject): string | null {
  const previewHost =
    project.hostname && project.hostname.trim()
      ? project.hostname
      : project.generated_hostname;
  if (!previewHost || !previewHost.trim()) return null;
  return `${previewHost}${PREVIEW_HOST_SUFFIX}`;
}

/**
 * Enable analytics for a PREVIEW-only project (a hosted *.sites.getalloro.com
 * site with no verified custom domain) by provisioning a Rybbit site for its
 * preview hostname, reusing {@link provisionRybbitSite}. The separate renderer
 * is expected to inject from the active integration row, but that activation
 * behavior remains unverified and outside this disabled foundation.
 *
 * Guardrails:
 *  - Ships DISABLED. The PREVIEW_ANALYTICS_ENABLED master gate must be "true"
 *    before anything is provisioned. This gate is intentional: B1 cannot see the
 *    renderer's injected snippet (separate repo), so it cannot assert the snippet
 *    is cookieless / no-PII — enabling is gated on a human verifying that first.
 *  - On-demand, per-project — never a backfill sweep. Each project maps to its
 *    unique domain's Rybbit site id; local lookups remain project-scoped.
 *  - Idempotent under concurrency: a project-row lock serializes callers, and
 *    exact-domain provider reconciliation recovers an orphan after local rollback.
 *  - Typed provisioning failures propagate to the controller.
 *  - Reports the ACTUAL persisted state by re-reading the active integration.
 */
export async function provisionPreviewAnalytics(
  projectId: string,
): Promise<PreviewAnalyticsResult> {
  if (!isPreviewAnalyticsEnabled()) {
    logger.info(
      `[Rybbit] Preview analytics gate disabled — skipping project ${projectId}`,
    );
    return { enabled: false, provisioned: false, reason: "gate_disabled" };
  }

  const project = await requirePreviewProject(projectId);
  const blocked = previewProjectBlock(project);
  if (blocked) return blocked;

  const previewDomain = getPreviewDomain(project);
  if (!previewDomain) {
    return { enabled: true, provisioned: false, reason: "no_hostname" };
  }

  // If a rybbit integration exists but is NOT active (e.g. an admin revoked it),
  // refuse rather than silently re-enabling it — and do NOT call
  // provisionRybbitSite, whose existing-site branch would re-sync the project row
  // to the revoked site id. Re-enabling a revoked integration must be deliberate.
  const existing = await WebsiteIntegrationModel.findByProjectAndPlatform(
    projectId,
    "rybbit",
  );
  if (existing && existing.status !== "active") {
    return { enabled: true, provisioned: false, reason: "integration_revoked" };
  }

  // Reuse the idempotent, per-project provisioning path. Typed provider and
  // persistence failures are mapped by the controller instead of becoming 200s.
  await provisionRybbitSite(projectId, previewDomain);

  // Report the ACTUAL invariant the renderer keys on — an ACTIVE rybbit
  // integration row carrying a site id — not merely the project column (which
  // can be re-synced from a stale row) and never an assumed success.
  const after = await WebsiteIntegrationModel.findByProjectAndPlatform(
    projectId,
    "rybbit",
  );
  const siteId =
    after && after.status === "active" ? after.metadata?.siteId : undefined;
  if (typeof siteId === "string" && siteId.trim()) {
    return { enabled: true, provisioned: true, siteId, previewDomain };
  }
  throw new RybbitIntegrationError(
    500,
    "RYBBIT_PERSISTENCE_FAILED",
    "Failed to save the Rybbit integration",
  );
}
