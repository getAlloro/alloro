/**
 * Admin Websites — Project Detail Controller (core)
 *
 * Project status polling, page-generation status/progressive-state,
 * create-all-from-template, org link, URL probe, domain connect/verify/disconnect,
 * layout generation, template-page slots, slot prefill, and generation cancel.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as projectManager from "./feature-services/service.project-manager";
import * as customDomain from "./feature-services/service.custom-domain";
import * as generationPipeline from "./feature-services/service.generation-pipeline";
import * as slotPrefill from "./feature-services/service.slot-prefill";
import { generateSlotValuesFromIdentity } from "./feature-services/service.slot-generator";
import { detectBlock } from "./feature-utils/util.url-block-detector";
import { getWbQueue } from "../../workers/wb-queues";
import type { PageGenerateJobData } from "../../workers/processors/websiteGeneration.processor";
import type { LayoutGenerateJobData } from "../../workers/processors/websiteLayouts.processor";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { ProjectIdentityModel } from "../../models/website-builder/ProjectIdentityModel";
import { PageModel } from "../../models/website-builder/PageModel";
import { getProjectIdentityWarmupStatus, hasUsableIdentityForPageGeneration, parseProjectIdentity, prepareProjectIdentityForSave } from "./feature-utils/util.project-identity";
import logger from "../../lib/logger";

/**
 * Local alias for `parseProjectIdentity` (preserved from the original
 * controller, where `parseIdentityJson` was a thin wrapper).
 */
function parseIdentityJson(value: unknown): any {
  return parseProjectIdentity(value);
}

/** GET /:id/status — Lightweight status polling */
export async function getProjectStatus(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const project = await projectManager.getProjectStatus(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    return res.json(project);
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching project status:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch project status",
    });
  }
}

/** PATCH /pages/:pageId/generation-status — N8N callback to update page generation status */

/** GET /:id/pages/generation-status — Per-page generation status for polling */
export async function getPagesGenerationStatus(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const pages = await projectManager.getPagesGenerationStatus(id);
    return res.json({ success: true, data: pages });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching page generation status:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR" });
  }
}

/** GET /:id/pages/:pageId/progressive-state — Template section scaffolding + generated sections so far */

/** GET /:id/pages/:pageId/progressive-state — Template section scaffolding + generated sections so far */
export async function getPageProgressiveState(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const data = await projectManager.getPageProgressiveState(id, pageId);
    return res.json({ success: true, data });
  } catch (error: any) {
    const status = error?.message === "PAGE_NOT_FOUND" ? 404 : 500;
    logger.error({ err: error }, "[Admin Websites] Error fetching page progressive state:");
    return res.status(status).json({
      success: false,
      error: error?.message || "FETCH_ERROR",
    });
  }
}

/** POST /:id/create-all-from-template — Bulk create all pages and enqueue page generation */

/** POST /:id/create-all-from-template — Bulk create all pages and enqueue page generation */
export async function createAllFromTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const {
      templateId,
      placeId,
      pages,
      businessName,
      formattedAddress,
      city,
      state,
      phone,
      category,
      primaryColor,
      accentColor,
      practiceSearchString,
      rating,
      reviewCount,
      gradient,
      dynamicSlotValues,
    } = req.body;

    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "pages array is required and must not be empty",
      });
    }

    const identityEnvelope = await ProjectIdentityModel.findEnvelopeByProjectId(id);
    if (!identityEnvelope.exists) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    if (!hasUsableIdentityForPageGeneration(identityEnvelope.identity)) {
      return res.status(409).json({
        success: false,
        error: "IDENTITY_NOT_READY",
        message: "Run identity warmup before creating pages from a template.",
      });
    }

    // Clear any stale cancel flag from a previous generation run. Without
    // this, the worker's early `isCancelled` check will flip every new page
    // to `cancelled` the moment it starts.
    await ProjectModel.updateFieldsById(id, {
      generation_cancel_requested: false,
    });

    // Create all page rows as queued
    const createResult = await projectManager.createAllFromTemplate(id, {
      templateId,
      placeId,
      pages,
      businessName,
      formattedAddress,
      city,
      state,
      phone,
      category,
      primaryColor,
      accentColor,
      practiceSearchString,
      rating,
      reviewCount,
    });

    if (createResult.error) {
      return res.status(createResult.error.status).json({
        success: false,
        error: createResult.error.code,
        message: createResult.error.message,
      });
    }

    const createdPages = createResult.pages!;

    const gradientParams = {
      gradientEnabled: gradient?.enabled,
      gradientFrom: gradient?.from,
      gradientTo: gradient?.to,
      gradientDirection: gradient?.direction,
    };
    const generateParams: Omit<PageGenerateJobData, "pageId" | "projectId"> = {
      primaryColor,
      accentColor,
      pageContext: undefined,
      businessName,
      formattedAddress,
      city,
      state,
      phone,
      category,
      rating,
      reviewCount,
      ...gradientParams,
      dynamicSlotValues,
    };

    const queue = getWbQueue("page-generate");
    await Promise.all(
      createdPages.map((page: any) =>
        queue.add(
          "generate-page",
          {
            pageId: page.id,
            projectId: id,
            ...generateParams,
          } satisfies PageGenerateJobData,
          {
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 25 },
          },
        ),
      ),
    );

    return res.status(201).json({ success: true, data: createdPages });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error in create-all-from-template:");
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create pages from template",
    });
  }
}

/** PATCH /:id/link-organization — Link or unlink org */

/** PATCH /:id/link-organization — Link or unlink org */
export async function linkOrganization(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { organizationId } = req.body;

    const { project, error } = await projectManager.linkOrganization(
      id,
      organizationId
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error linking organization:");
    return res.status(500).json({
      success: false,
      error: "LINK_ERROR",
      message: error?.message || "Failed to link organization",
    });
  }
}

/** GET /:id — Get single project with pages */

/** POST /:id/test-url — Probe a URL for WAF / anti-bot / CAPTCHA blocks */
export async function testUrl(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "url string required",
      });
    }
    const result = await detectBlock(url);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error testing URL:");
    return res.status(500).json({
      success: false,
      error: "TEST_URL_ERROR",
      message: error?.message || "Failed to test URL",
    });
  }
}

// =====================================================================
// PROJECT IDENTITY
// =====================================================================

/** POST /:id/identity/warmup — Enqueue identity warmup job */

/** POST /:id/pages/:pageId/regenerate-component — Regenerate a single section */
export async function regeneratePageComponent(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id: projectId, pageId } = req.params;
    const { componentName, instruction } = req.body;

    if (!componentName || typeof componentName !== "string") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "componentName is required",
      });
    }

    // Reset cancel flag
    await ProjectModel.updateFieldsById(projectId, {
      generation_cancel_requested: false,
    });

    // Mark page as generating so polling kicks in
    await PageModel.updateFieldsById(pageId, {
      generation_status: "generating",
    });

    const pageQueue = getWbQueue("page-generate");
    await pageQueue.add(
      "generate-page",
      {
        pageId,
        projectId,
        singleComponent: componentName,
        regenerateInstruction: instruction || undefined,
      },
      { removeOnComplete: { count: 50 }, removeOnFail: { count: 25 } },
    );

    logger.info(
      `[Admin Websites] Enqueued regenerate for component "${componentName}" (page ${pageId})`,
    );
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error regenerating component:");
    return res.status(500).json({
      success: false,
      error: "REGENERATE_ERROR",
      message: error?.message || "Failed to regenerate component",
    });
  }
}

// =====================================================================
// LAYOUTS PIPELINE
// =====================================================================

/** POST /:id/generate-layouts — Enqueue layouts generation job */

/** POST /:id/generate-layouts — Enqueue layouts generation job */
export async function startLayoutGeneration(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { slotValues } = req.body;

    // Reset cancel flag
    await ProjectModel.updateFieldsById(id, {
      generation_cancel_requested: false,
    });

    // Set status immediately so polling reflects queued state
    await ProjectModel.updateFieldsById(id, {
      layouts_generation_status: "queued",
      layouts_generation_progress: null,
    });

    const jobData: LayoutGenerateJobData = {
      projectId: id,
      slotValues: slotValues || {},
    };

    const queue = getWbQueue("layout-generate");
    await queue.add("generate", jobData, {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    });

    logger.info(`[Admin Websites] Enqueued wb-layout-generate for project ${id}`);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error starting layouts generation:");
    return res.status(500).json({
      success: false,
      error: "LAYOUTS_ERROR",
      message: error?.message || "Failed to start layouts generation",
    });
  }
}

/** GET /:id/layouts-status — Poll layout generation status */

/** GET /:id/layouts-status — Poll layout generation status */
export async function getLayoutsStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const row = await ProjectModel.findLayoutsStatusById(id);

    if (!row) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    return res.json({
      success: true,
      data: {
        status: row.layouts_generation_status || null,
        progress: parseIdentityJson(row.layouts_generation_progress),
        generated_at: row.layouts_generated_at || null,
        slot_values: parseIdentityJson(row.layout_slot_values) || {},
        wrapper: row.wrapper || "",
        header: row.header || "",
        footer: row.footer || "",
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching layouts status:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR" });
  }
}

/** GET /templates/:templateId/pages/:pageId/slots — Return dynamic_slots for a template page */

/** GET /:id/slot-prefill — Fetch pre-filled slot values for a template page OR layout */
export async function getSlotPrefill(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { templatePageId, layout } = req.query as {
      templatePageId?: string;
      layout?: string;
    };

    if (layout === "true") {
      const result = await slotPrefill.getLayoutSlotPrefill(id);
      return res.json({ success: true, data: result });
    }

    if (!templatePageId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Pass ?templatePageId=X or ?layout=true",
      });
    }

    const result = await slotPrefill.getPageSlotPrefill(id, templatePageId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching slot prefill:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR" });
  }
}

/** POST /:id/slot-generate — LLM-fill text slots using full identity context */

/** POST /:id/slot-generate — LLM-fill text slots using full identity context */
export async function generateSlotValues(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { templatePageId, pageContext } = req.body || {};

    if (typeof templatePageId !== "string" || !templatePageId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "templatePageId is required",
      });
    }

    const result = await generateSlotValuesFromIdentity(
      id,
      templatePageId,
      typeof pageContext === "string" ? pageContext : undefined,
    );
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const code = error?.message === "IDENTITY_NOT_READY" ? 409 : 500;
    logger.error({ err: error }, "[Admin Websites] Error generating slot values:");
    return res.status(code).json({
      success: false,
      error: error?.message || "GENERATE_ERROR",
    });
  }
}

/** POST /:id/cancel-generation — Cancel all in-progress page generation */
export async function cancelGeneration(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const result = await generationPipeline.cancelProjectGeneration(id);
    return res.json({ success: true, cancelledPages: result.cancelledPages });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error cancelling generation:");
    return res.status(500).json({
      success: false,
      error: "CANCEL_ERROR",
      message: error?.message || "Failed to cancel generation",
    });
  }
}

// =====================================================================
// CUSTOM DOMAIN
// =====================================================================

/** POST /:id/connect-domain — Connect a custom domain */

/** POST /:id/connect-domain — Connect a custom domain */
export async function connectDomainHandler(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "domain is required",
      });
    }

    const { data, error } = await customDomain.connectDomain(id, domain);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({ success: true, data });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error connecting domain:");
    return res.status(500).json({
      success: false,
      error: "DOMAIN_ERROR",
      message: error?.message || "Failed to connect domain",
    });
  }
}

/** POST /:id/verify-domain — Verify DNS for custom domain */

/** POST /:id/verify-domain — Verify DNS for custom domain */
export async function verifyDomainHandler(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { data, error } = await customDomain.verifyDomain(id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({ success: true, data });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error verifying domain:");
    return res.status(500).json({
      success: false,
      error: "VERIFY_ERROR",
      message: error?.message || "Failed to verify domain",
    });
  }
}

/** DELETE /:id/disconnect-domain — Disconnect custom domain */

/** DELETE /:id/disconnect-domain — Disconnect custom domain */
export async function disconnectDomainHandler(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { data, error } = await customDomain.disconnectDomain(id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({ success: true, data });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error disconnecting domain:");
    return res.status(500).json({
      success: false,
      error: "DOMAIN_ERROR",
      message: error?.message || "Failed to disconnect domain",
    });
  }
}

// =====================================================================
// TEMPLATES
// =====================================================================

/** GET /templates — List all templates */
