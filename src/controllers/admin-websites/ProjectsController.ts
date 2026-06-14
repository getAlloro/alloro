/**
 * Admin Websites — Projects Controller
 *
 * Project lifecycle (list/create/get/update/delete), statuses, pipeline
 * trigger, website scrape, page-editor system prompt, and the public N8N
 * page-generation status callback. Bound directly by the parent websites.ts router.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as projectManager from "./feature-services/service.project-manager";
import * as templateManager from "./feature-services/service.template-manager";
import * as websiteScraper from "./feature-services/service.website-scraper";
import { getWbQueue } from "../../workers/wb-queues";
import type { PageGenerateJobData } from "../../workers/processors/websiteGeneration.processor";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { ProjectIdentityModel } from "../../models/website-builder/ProjectIdentityModel";
import { PageModel } from "../../models/website-builder/PageModel";
import { getProjectIdentityWarmupStatus, hasUsableIdentityForPageGeneration, parseProjectIdentity, prepareProjectIdentityForSave } from "./feature-utils/util.project-identity";
import logger from "../../lib/logger";

/** GET / — List all projects with pagination */
export async function listProjects(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const {
      status,
      projectListView,
      organizationStatus,
      page = "1",
      limit = "50",
    } = req.query;
    const requestedListView = projectListView ?? organizationStatus;
    const normalizedProjectListView =
      requestedListView === "active" ||
      requestedListView === "inactive" ||
      requestedListView === "archive"
        ? requestedListView
        : undefined;
    const result = await projectManager.listProjects({
      status: status as string | undefined,
      projectListView: normalizedProjectListView,
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
    });
    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching projects:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch projects",
    });
  }
}

/** POST / — Create a new website project */

/** POST / — Create a new website project */
export async function createProject(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { user_id, hostname } = req.body;
    const project = await projectManager.createProject({
      user_id,
      hostname,
    });
    return res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating project:");
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create project",
    });
  }
}

/** GET /statuses — Get unique statuses for filter dropdown */

/** GET /statuses — Get unique statuses for filter dropdown */
export async function getStatuses(
  _req: Request,
  res: Response
): Promise<Response> {
  try {
    const statusList = await projectManager.getProjectStatuses();
    return res.json({
      success: true,
      statuses: statusList,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching statuses:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch statuses",
    });
  }
}

/** GET /:id/status — Lightweight status polling */

/** PATCH /pages/:pageId/generation-status — N8N callback to update page generation status */
export async function updatePageGenerationStatus(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { pageId } = req.params;
    const { generation_status, html_content, sections, wrapper, header, footer } = req.body;

    if (!["generating", "ready", "failed"].includes(generation_status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "generation_status must be generating, ready, or failed",
      });
    }

    const result = await projectManager.updatePageGenerationStatus(pageId, {
      generation_status,
      html_content,
      sections,
      wrapper,
      header,
      footer,
    });

    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        error: result.error.code,
        message: result.error.message,
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating page generation status:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update page generation status",
    });
  }
}

/** GET /:id/pages/generation-status — Per-page generation status for polling */

/** GET /:id — Get single project with pages */
export async function getProject(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const project = await projectManager.getProjectById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    return res.json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching project:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch project",
    });
  }
}

/** PATCH /:id — Update a project */

/** PATCH /:id — Update a project */
export async function updateProject(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { project, error } = await projectManager.updateProject(id, updates);

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
    logger.error({ err: error }, "[Admin Websites] Error updating project:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update project",
    });
  }
}

/** DELETE /:id — Delete a project (cascade pages) */

/** DELETE /:id — Delete a project (cascade pages) */
export async function deleteProject(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;

    const { error } = await projectManager.deleteProject(id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Project deleted successfully",
      data: { id },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting project:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete project",
    });
  }
}

/** POST /start-pipeline — Enqueue BullMQ generation job for a single page */

/** POST /start-pipeline — Enqueue BullMQ generation job for a single page */
export async function startPipeline(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const {
      projectId, templatePageId, path: pagePath,
      pageContext, businessName,
      formattedAddress, city, state, phone, category, rating, reviewCount,
      primaryColor, accentColor, existingPageId,
      gradient, dynamicSlotValues,
    } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false, error: "INVALID_INPUT", message: "projectId is required",
      });
    }

    const identityEnvelope =
      await ProjectIdentityModel.findEnvelopeByProjectId(projectId);
    if (!identityEnvelope.exists) {
      return res.status(404).json({
        success: false, error: "NOT_FOUND", message: "Project not found",
      });
    }

    if (!hasUsableIdentityForPageGeneration(identityEnvelope.identity)) {
      return res.status(409).json({
        success: false,
        error: "IDENTITY_NOT_READY",
        message: "Run identity warmup before starting page generation.",
      });
    }

    // Pre-create page row if not provided
    let pageId = existingPageId;
    if (!pageId) {
      const page = await PageModel.insertReturningId({
        project_id: projectId,
        path: pagePath || "/",
        version: 1,
        status: "draft",
        generation_status: "queued",
        template_page_id: templatePageId || null,
      });
      pageId = page.id;

      await ProjectModel.advanceCreatedToInProgress(projectId);
    }

    const gradientParams = {
      gradientEnabled: gradient?.enabled,
      gradientFrom: gradient?.from,
      gradientTo: gradient?.to,
      gradientDirection: gradient?.direction,
    };

    const pageQueue = getWbQueue("page-generate");
    await pageQueue.add(
      "generate-page",
      {
        pageId, projectId, primaryColor, accentColor, pageContext,
        businessName, formattedAddress, city, state, phone, category, rating, reviewCount,
        ...gradientParams,
        dynamicSlotValues,
      } satisfies PageGenerateJobData,
      { removeOnComplete: { count: 50 }, removeOnFail: { count: 25 } },
    );

    return res.json({ success: true, pageId, message: "Pipeline started successfully" });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error starting pipeline:");
    return res.status(500).json({
      success: false, error: "PIPELINE_ERROR", message: error?.message || "Failed to start pipeline",
    });
  }
}

/** POST /:id/test-url — Probe a URL for WAF / anti-bot / CAPTCHA blocks */

/** GET /editor/system-prompt — Get page editor system prompt */
export async function getEditorSystemPrompt(
  _req: Request,
  res: Response
): Promise<Response> {
  try {
    const prompt = await templateManager.getPageEditorSystemPrompt();
    return res.json({ success: true, prompt });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching editor system prompt:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch system prompt",
    });
  }
}

/** POST /scrape — Scrape a website */

/** POST /scrape — Scrape a website */
export async function scrapeWebsite(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const scraperKey = req.headers["x-scraper-key"];
    const { url } = req.body;

    const { result, error } = await websiteScraper.scrapeWebsite(
      url,
      scraperKey
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.message,
      });
    }

    return res.json({
      success: true,
      baseUrl: result!.baseUrl,
      pages: result!.pages,
      images: result!.images,
      elapsedMs: result!.elapsedMs,
      charLength: result!.charLength,
      estimatedTokens: result!.estimatedTokens,
    });
  } catch (error: any) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: message });
  }
}

// =====================================================================
// TEMPLATE PAGES
// =====================================================================

/** GET /templates/:templateId/pages — List template pages */
