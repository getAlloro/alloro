/**
 * Admin Websites Controller
 *
 * Named exports handling request/response for all admin website endpoints.
 * Delegates business logic to feature services.
 *
 * Groups:
 * 1. Project Management (9 endpoints)
 * 2. Template Management (8 endpoints)
 * 3. Template Pages (5 endpoints)
 * 4. Project Pages (10 endpoints)
 * 5. Template HFCM (6 endpoints)
 * 6. Project HFCM (6 endpoints)
 * 7. Post Types (5 endpoints)
 * 8. Post Blocks (5 endpoints)
 * 9. Post Taxonomy (8 endpoints)
 * 10. Posts (5 endpoints)
 */

import { Request, Response } from "express";
import { z } from "zod";
import * as projectManager from "./feature-services/service.project-manager";
import * as templateManager from "./feature-services/service.template-manager";
import * as pageEditor from "./feature-services/service.page-editor";
import * as hfcmManager from "./feature-services/service.hfcm-manager";
import * as websiteScraper from "./feature-services/service.website-scraper";
import * as customDomain from "./feature-services/service.custom-domain";
import * as postTypeManager from "./feature-services/service.post-type-manager";
import * as postBlockManager from "./feature-services/service.post-block-manager";
import * as menuTemplateManager from "./feature-services/service.menu-template-manager";
import * as postTaxonomyManager from "./feature-services/service.post-taxonomy-manager";
import * as postManager from "./feature-services/service.post-manager";
import * as menuManager from "./feature-services/service.menu-manager";
import * as reviewBlockManager from "./feature-services/service.review-block-manager";
import * as aiCommand from "./feature-services/service.ai-command";
import * as redirectsService from "./feature-services/service.redirects";
import * as artifactUpload from "./feature-services/service.artifact-upload";
import * as generationPipeline from "./feature-services/service.generation-pipeline";
import * as identityWarmup from "./feature-services/service.identity-warmup";
import * as slotPrefill from "./feature-services/service.slot-prefill";
import { generateSlotValuesFromIdentity } from "./feature-services/service.slot-generator";
import { detectBlock } from "./feature-utils/util.url-block-detector";
import { db } from "../../database/connection";
import { getWbQueue } from "../../workers/wb-queues";
import type { PageGenerateJobData } from "../../workers/processors/websiteGeneration.processor";
import type { IdentityWarmupJobData } from "../../workers/processors/identityWarmup.processor";
import type { LayoutGenerateJobData } from "../../workers/processors/websiteLayouts.processor";
import { FormSubmissionModel } from "../../models/website-builder/FormSubmissionModel";
import {
  ProjectModel,
  type IProject,
} from "../../models/website-builder/ProjectModel";
import { ProjectIdentityModel } from "../../models/website-builder/ProjectIdentityModel";
import { ProjectReviewModel } from "../../models/website-builder/ProjectReviewModel";
import { ReviewModel } from "../../models/website-builder/ReviewModel";
import { generatePresignedUrl } from "../../utils/core/s3";
import { buildEmailBody } from "../websiteContact/websiteContact-services/emailBodyBuilder";
import { resolveFormSubmissionEmailContext } from "../websiteContact/websiteContact-services/formSubmissionEmailContextService";
import { sendEmailWebhook, WebhookError } from "../websiteContact/websiteContact-services/emailWebhookService";
import { resolveWebsiteFormRecipients } from "../../services/formRecipientRoutingService";
import {
  getConfiguredRecipients,
  listOrgUserRecipientOptions,
  updateRecipientSetting,
  validateRecipientList,
} from "../../services/recipientSettingsService";
import {
  getProjectIdentityWarmupStatus,
  hasUsableIdentityForPageGeneration,
  parseProjectIdentity,
  prepareProjectIdentityForSave,
} from "./feature-utils/util.project-identity";

// =====================================================================
// PROJECTS
// =====================================================================

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
    console.error("[Admin Websites] Error fetching projects:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch projects",
    });
  }
}

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
    console.error("[Admin Websites] Error creating project:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create project",
    });
  }
}

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
    console.error("[Admin Websites] Error fetching statuses:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch statuses",
    });
  }
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
    console.error("[Admin Websites] Error fetching project status:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch project status",
    });
  }
}

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
    console.error("[Admin Websites] Error updating page generation status:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update page generation status",
    });
  }
}

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
    console.error("[Admin Websites] Error fetching page generation status:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR" });
  }
}

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
    console.error("[Admin Websites] Error fetching page progressive state:", error);
    return res.status(status).json({
      success: false,
      error: error?.message || "FETCH_ERROR",
    });
  }
}

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
    await db("website_builder.projects")
      .where("id", id)
      .update({
        generation_cancel_requested: false,
        updated_at: db.fn.now(),
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
    console.error("[Admin Websites] Error in create-all-from-template:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create pages from template",
    });
  }
}

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
    console.error("[Admin Websites] Error linking organization:", error);
    return res.status(500).json({
      success: false,
      error: "LINK_ERROR",
      message: error?.message || "Failed to link organization",
    });
  }
}

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
    console.error("[Admin Websites] Error fetching project:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch project",
    });
  }
}

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
    console.error("[Admin Websites] Error updating project:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update project",
    });
  }
}

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
    console.error("[Admin Websites] Error deleting project:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete project",
    });
  }
}

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
      const [page] = await db("website_builder.pages")
        .insert({
          project_id: projectId,
          path: pagePath || "/",
          version: 1,
          status: "draft",
          generation_status: "queued",
          template_page_id: templatePageId || null,
        })
        .returning("id");
      pageId = page.id;

      await db("website_builder.projects")
        .where("id", projectId)
        .where("status", "CREATED")
        .update({ status: "IN_PROGRESS", updated_at: db.fn.now() });
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
    console.error("[Admin Websites] Error starting pipeline:", error);
    return res.status(500).json({
      success: false, error: "PIPELINE_ERROR", message: error?.message || "Failed to start pipeline",
    });
  }
}

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
    console.error("[Admin Websites] Error testing URL:", error);
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
export async function startIdentityWarmup(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const {
      placeId,
      placeIds,
      practiceSearchString,
      urls,
      texts,
      logoUrl,
      primaryColor,
      accentColor,
      gradient,
      manualBusiness,
      manualLocations,
    } = req.body;

    // Normalize multi-GBP selection. The frontend may send `placeIds` (full
    // list) and optionally `placeId` (explicit primary). Fall back to the
    // single-place legacy path when `placeIds` is absent.
    const normalizedPlaceIds: string[] = Array.isArray(placeIds)
      ? placeIds.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    const resolvedPrimary: string | null =
      (typeof placeId === "string" && placeId.trim()) ||
      normalizedPlaceIds[0] ||
      null;
    const fullIdList: string[] =
      normalizedPlaceIds.length > 0
        ? normalizedPlaceIds
        : resolvedPrimary
          ? [resolvedPrimary]
          : [];

    if (
      fullIdList.length === 0 &&
      !hasCompleteNoGbpWarmupData(manualBusiness, manualLocations)
    ) {
      return res.status(400).json({
        success: false,
        error: "IDENTITY_SOURCE_REQUIRED",
        message:
          "Select at least one Google Business Profile, or provide No GBP data with business name, category, phone, and one complete location including hours.",
      });
    }

    // Reset cancel flag + persist selected_place_ids / primary_place_id BEFORE
    // enqueueing the worker so F2's multi-location loop picks them up.
    const projectUpdates: Record<string, unknown> = {
      generation_cancel_requested: false,
      updated_at: db.fn.now(),
    };
    if (fullIdList.length > 0) {
      projectUpdates.selected_place_ids = fullIdList;
      projectUpdates.primary_place_id = resolvedPrimary;
      // Back-compat mirror for legacy consumers of the singular column.
      projectUpdates.selected_place_id = resolvedPrimary;
    } else {
      projectUpdates.selected_place_ids = [];
      projectUpdates.primary_place_id = null;
      projectUpdates.selected_place_id = null;
    }
    await db("website_builder.projects").where("id", id).update(projectUpdates);

    const jobData: IdentityWarmupJobData = {
      projectId: id,
      inputs: {
        placeId: resolvedPrimary || undefined,
        placeIds: fullIdList.length > 0 ? fullIdList : undefined,
        practiceSearchString,
        urls,
        texts,
        logoUrl,
        primaryColor,
        accentColor,
        gradient,
        manualBusiness,
        manualLocations,
      },
    };

    const queue = getWbQueue("identity-warmup");
    await queue.add("warmup", jobData, {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    });

    // Set immediate status so polling reflects queued state.
    await ProjectIdentityModel.setWarmupStatus(id, "queued");

    console.log(`[Admin Websites] Enqueued wb-identity-warmup for project ${id}`);

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error starting identity warmup:", error);
    return res.status(500).json({
      success: false,
      error: "WARMUP_ERROR",
      message: error?.message || "Failed to start warmup",
    });
  }
}

function hasCompleteNoGbpWarmupData(
  manualBusiness: unknown,
  manualLocations: unknown,
): boolean {
  const business =
    manualBusiness && typeof manualBusiness === "object"
      ? (manualBusiness as Record<string, unknown>)
      : null;
  if (
    !business ||
    !hasText(business.name) ||
    !hasText(business.category) ||
    !hasText(business.phone)
  ) {
    return false;
  }

  return (
    Array.isArray(manualLocations) &&
    manualLocations.some((location) => {
      if (!location || typeof location !== "object") return false;
      const l = location as Record<string, unknown>;
      return (
        hasText(l.name) &&
        hasText(l.address) &&
        hasText(l.city) &&
        hasText(l.state) &&
        hasText(l.zip) &&
        hasText(l.phone) &&
        hasHours(l.hours)
      );
    })
  );
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasHours(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(hasText);
}

/** GET /:id/identity — Get full project identity JSON */
export async function getIdentity(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { exists, identity } =
      await ProjectIdentityModel.findEnvelopeByProjectId(id);

    if (!exists) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    return res.json({
      success: true,
      data: identity,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching identity:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message,
    });
  }
}

/** GET /:id/identity/status — Lightweight polling for warmup progress */
export async function getIdentityStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { exists, identity } =
      await ProjectIdentityModel.findEnvelopeByProjectId(id);

    if (!exists) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    return res.json({
      success: true,
      data: {
        warmup_status: getProjectIdentityWarmupStatus(identity),
        warmed_up_at: identity?.warmed_up_at || null,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching identity status:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR" });
  }
}

/** PUT /:id/identity — Replace identity with admin-edited JSON */
export async function updateIdentity(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { identity } = req.body;

    if (!identity || typeof identity !== "object") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "identity object required",
      });
    }

    prepareProjectIdentityForSave(identity);
    await ProjectIdentityModel.updateByProjectId(
      id,
      identity,
      { mirrorBrand: true },
    );

    return res.json({ success: true, data: identity });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating identity:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message,
    });
  }
}

/**
 * POST /:id/identity/resync-list — Manual re-sync of identity.content_essentials.{doctors|services}.
 *
 * Body: `{ list: "doctors" | "services" }`.
 * Query: `?rescrape=true` (optional) — currently logs a notice and continues with
 * cached `raw_inputs.scraped_pages_raw`. Full re-scrape is a follow-up.
 *
 * Behavior:
 *  - Re-runs the same distillation pipeline against the already-scraped content.
 *  - Replaces the targeted list with freshly-stamped entries.
 *  - Existing entries whose `name` (case-insensitive) is missing from the new set
 *    are preserved with `stale: true` so admins retain history.
 */
export async function resyncIdentityList(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { list } = req.body || {};
    const rescrape = String(req.query.rescrape || "") === "true";

    if (list !== "doctors" && list !== "services") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: 'list must be "doctors" or "services"',
      });
    }

    const { exists, identity } =
      await ProjectIdentityModel.findEnvelopeByProjectId(id);
    if (!exists) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    if (!identity) {
      return res.status(409).json({
        success: false,
        error: "NO_IDENTITY",
        message: "Project has no identity — run warmup first.",
      });
    }

    const rawInputs = identity.raw_inputs || {};
    const scrapedPagesRaw: Record<string, string> =
      rawInputs.scraped_pages_raw && typeof rawInputs.scraped_pages_raw === "object"
        ? (rawInputs.scraped_pages_raw as Record<string, string>)
        : {};
    const userTextInputs: Array<{ label?: string; text: string }> = Array.isArray(
      rawInputs.user_text_inputs,
    )
      ? rawInputs.user_text_inputs
      : [];
    const gbpRaw = rawInputs.gbp_raw || null;

    const discoveredPages: Array<{ url?: string | null }> = Array.isArray(
      identity.extracted_assets?.discovered_pages,
    )
      ? identity.extracted_assets.discovered_pages
      : [];
    const discoveredPageUrls = discoveredPages
      .map((p) => p?.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);

    if (rescrape) {
      console.warn(
        `[Admin Websites] resync-list ?rescrape=true requested for project ${id} — re-scrape path not yet implemented; using cached pages.`,
      );
    }

    if (Object.keys(scrapedPagesRaw).length === 0 && discoveredPageUrls.length === 0) {
      return res.status(409).json({
        success: false,
        error: "NO_SOURCE_CONTENT",
        message:
          "No cached scraped pages or discovered pages on identity — re-run a full warmup before re-syncing this list.",
      });
    }

    const identityLocations = Array.isArray(identity.locations)
      ? identity.locations.filter(
          (l: any) =>
            l && typeof l.place_id === "string" && l.place_id.length > 0,
        )
      : [];

    const { doctors, services } = await identityWarmup.extractDoctorsAndServices(
      scrapedPagesRaw,
      userTextInputs,
      gbpRaw,
      identityLocations,
      discoveredPageUrls,
      {
        projectId: id,
        eventType: "identity-resync",
        metadata: { stage: "content-distill", list },
      },
    );

    identity.content_essentials = identity.content_essentials || {};
    const existingList: Array<{
      name: string;
      source_url: string | null;
      short_blurb: string | null;
      last_synced_at: string;
      stale?: boolean;
    }> = Array.isArray(identity.content_essentials[list])
      ? identity.content_essentials[list]
      : [];

    const freshList = list === "doctors" ? doctors : services;
    const freshNames = new Set(freshList.map((e) => e.name.trim().toLowerCase()));

    // Carry over entries that dropped out of the fresh extraction, marked stale.
    const stragglers = existingList
      .filter((e) => e && typeof e.name === "string" && !freshNames.has(e.name.trim().toLowerCase()))
      .map((e) => ({ ...e, stale: true }));

    const merged = [...freshList, ...stragglers];

    identity.content_essentials[list] = merged;
    identity.last_updated_at = new Date().toISOString();

    await ProjectIdentityModel.updateByProjectId(id, identity);

    return res.json({
      success: true,
      data: {
        list,
        entries: merged,
        refreshed_count: freshList.length,
        stale_count: stragglers.length,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error re-syncing identity list:", error);
    return res.status(500).json({
      success: false,
      error: "RESYNC_ERROR",
      message: error?.message || "Failed to re-sync identity list",
    });
  }
}

// =====================================================================
// PER-COMPONENT REGENERATE
// =====================================================================

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
    await db("website_builder.projects").where("id", projectId).update({
      generation_cancel_requested: false,
      updated_at: db.fn.now(),
    });

    // Mark page as generating so polling kicks in
    await db("website_builder.pages").where("id", pageId).update({
      generation_status: "generating",
      updated_at: db.fn.now(),
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

    console.log(
      `[Admin Websites] Enqueued regenerate for component "${componentName}" (page ${pageId})`,
    );
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error regenerating component:", error);
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
export async function startLayoutGeneration(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { slotValues } = req.body;

    // Reset cancel flag
    await db("website_builder.projects").where("id", id).update({
      generation_cancel_requested: false,
      updated_at: db.fn.now(),
    });

    // Set status immediately so polling reflects queued state
    await db("website_builder.projects").where("id", id).update({
      layouts_generation_status: "queued",
      layouts_generation_progress: null,
      updated_at: db.fn.now(),
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

    console.log(`[Admin Websites] Enqueued wb-layout-generate for project ${id}`);
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error starting layouts generation:", error);
    return res.status(500).json({
      success: false,
      error: "LAYOUTS_ERROR",
      message: error?.message || "Failed to start layouts generation",
    });
  }
}

/** GET /:id/layouts-status — Poll layout generation status */
export async function getLayoutsStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const row = await db("website_builder.projects")
      .where("id", id)
      .select(
        "layouts_generation_status",
        "layouts_generation_progress",
        "layouts_generated_at",
        "layout_slot_values",
        "wrapper",
        "header",
        "footer",
      )
      .first();

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
    console.error("[Admin Websites] Error fetching layouts status:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR" });
  }
}

/** GET /templates/:templateId/pages/:pageId/slots — Return dynamic_slots for a template page */
export async function getTemplatePageSlots(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { pageId } = req.params;
    const row = await db("website_builder.template_pages")
      .where("id", pageId)
      .select("dynamic_slots")
      .first();

    if (!row) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    let slots = row.dynamic_slots;
    if (typeof slots === "string") {
      try { slots = JSON.parse(slots); } catch { slots = []; }
    }

    return res.json({ success: true, data: slots || [] });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching template page slots:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR" });
  }
}

/** PATCH /templates/:templateId/pages/:pageId/slots — Update dynamic_slots (admin tool) */
export async function updateTemplatePageSlots(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { pageId } = req.params;
    const { slots } = req.body;

    if (!Array.isArray(slots)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "slots must be an array",
      });
    }

    const updated = await db("website_builder.template_pages")
      .where("id", pageId)
      .update({
        dynamic_slots: JSON.stringify(slots),
        updated_at: db.fn.now(),
      });

    if (updated === 0) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    return res.json({ success: true, data: slots });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating template page slots:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR" });
  }
}

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
    console.error("[Admin Websites] Error fetching slot prefill:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR" });
  }
}

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
    console.error("[Admin Websites] Error generating slot values:", error);
    return res.status(code).json({
      success: false,
      error: error?.message || "GENERATE_ERROR",
    });
  }
}

function parseIdentityJson(value: unknown): any {
  return parseProjectIdentity(value);
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
    console.error("[Admin Websites] Error cancelling generation:", error);
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
    console.error("[Admin Websites] Error connecting domain:", error);
    return res.status(500).json({
      success: false,
      error: "DOMAIN_ERROR",
      message: error?.message || "Failed to connect domain",
    });
  }
}

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
    console.error("[Admin Websites] Error verifying domain:", error);
    return res.status(500).json({
      success: false,
      error: "VERIFY_ERROR",
      message: error?.message || "Failed to verify domain",
    });
  }
}

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
    console.error("[Admin Websites] Error disconnecting domain:", error);
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
export async function listTemplates(
  _req: Request,
  res: Response
): Promise<Response> {
  try {
    const templates = await templateManager.listTemplates();
    return res.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching templates:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch templates",
    });
  }
}

/** POST /templates — Create a template */
export async function createTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { template, error } = await templateManager.createTemplate(req.body);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating template:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create template",
    });
  }
}

/** GET /templates/:templateId — Get template with pages */
export async function getTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const template = await templateManager.getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template not found",
      });
    }

    return res.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching template:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch template",
    });
  }
}

/** PATCH /templates/:templateId — Update a template */
export async function updateTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { template, error } = await templateManager.updateTemplate(
      templateId,
      req.body
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
      data: template,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating template:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update template",
    });
  }
}

/** DELETE /templates/:templateId — Delete a template */
export async function deleteTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { error } = await templateManager.deleteTemplate(templateId);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Template deleted successfully",
      data: { id: templateId },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting template:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete template",
    });
  }
}

/** POST /templates/:templateId/activate — Set active template */
export async function activateTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { template, error } = await templateManager.activateTemplate(
      templateId
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
      data: template,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error activating template:", error);
    return res.status(500).json({
      success: false,
      error: "ACTIVATE_ERROR",
      message: error?.message || "Failed to activate template",
    });
  }
}

/** GET /editor/system-prompt — Get page editor system prompt */
export async function getEditorSystemPrompt(
  _req: Request,
  res: Response
): Promise<Response> {
  try {
    const prompt = await templateManager.getPageEditorSystemPrompt();
    return res.json({ success: true, prompt });
  } catch (error: any) {
    console.error(
      "[Admin Websites] Error fetching editor system prompt:",
      error
    );
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch system prompt",
    });
  }
}

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
export async function listTemplatePages(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { pages, error } = await templateManager.listTemplatePages(
      templateId
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
      data: pages,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching template pages:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch template pages",
    });
  }
}

/** POST /templates/:templateId/pages — Create template page */
export async function createTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { page, error } = await templateManager.createTemplatePage(
      templateId,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating template page:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create template page",
    });
  }
}

/** GET /templates/:templateId/pages/:pageId — Get template page */
export async function getTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, pageId } = req.params;
    const page = await templateManager.getTemplatePage(templateId, pageId);

    if (!page) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template page not found",
      });
    }

    return res.json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching template page:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch template page",
    });
  }
}

/** PATCH /templates/:templateId/pages/:pageId — Update template page */
export async function updateTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, pageId } = req.params;
    const { page, error } = await templateManager.updateTemplatePage(
      templateId,
      pageId,
      req.body
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
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating template page:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update template page",
    });
  }
}

/** DELETE /templates/:templateId/pages/:pageId — Delete template page */
export async function deleteTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, pageId } = req.params;
    const { error } = await templateManager.deleteTemplatePage(
      templateId,
      pageId
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
      message: "Template page deleted successfully",
      data: { id: pageId },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting template page:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete template page",
    });
  }
}

// =====================================================================
// PROJECT PAGES
// =====================================================================

/** GET /:id/pages — List project pages */
export async function listPages(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { path } = req.query;
    const pages = await pageEditor.listPages(id, path as string | undefined);
    return res.json({
      success: true,
      data: pages,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching pages:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch pages",
    });
  }
}

/** POST /:id/pages — Create page version */
export async function createPage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { page, error } = await pageEditor.createPage(id, req.body);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating page:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create page",
    });
  }
}

/** POST /:id/pages/artifact — Upload artifact page (React app build) */
export async function uploadArtifactPage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const file = req.file;
    const { path: pagePath, display_name } = req.body;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: "NO_FILE",
        message: "No zip file provided",
      });
    }

    if (!pagePath) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PATH",
        message: "Page path is required",
      });
    }

    const { page, error } = await artifactUpload.uploadArtifactPage(
      id,
      file.buffer,
      pagePath,
      display_name
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error uploading artifact page:", error);
    return res.status(500).json({
      success: false,
      error: "ARTIFACT_UPLOAD_ERROR",
      message: error?.message || "Failed to upload artifact page",
    });
  }
}

/** PUT /:id/pages/:pageId/artifact — Replace artifact page build */
export async function replaceArtifactBuild(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: "NO_FILE",
        message: "No zip file provided",
      });
    }

    const { page, error } = await artifactUpload.replaceArtifactBuild(
      id,
      pageId,
      file.buffer
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
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error replacing artifact build:", error);
    return res.status(500).json({
      success: false,
      error: "ARTIFACT_REPLACE_ERROR",
      message: error?.message || "Failed to replace artifact build",
    });
  }
}

/** POST /:id/pages/:pageId/publish — Publish a page */
export async function publishPage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { page, error } = await pageEditor.publishPage(id, pageId);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error publishing page:", error);
    return res.status(500).json({
      success: false,
      error: "PUBLISH_ERROR",
      message: error?.message || "Failed to publish page",
    });
  }
}

/** GET /:id/pages/:pageId — Get single page */
export async function getPage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const page = await pageEditor.getPageById(id, pageId);

    if (!page) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Page not found",
      });
    }

    return res.json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching page:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch page",
    });
  }
}

/** PATCH /:id/pages/:pageId — Update draft page */
export async function updatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { page, error } = await pageEditor.updatePage(id, pageId, req.body);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating page:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update page",
    });
  }
}

/** DELETE /:id/pages/by-path — Delete all versions at path */
export async function deletePagesByPath(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const pagePath = req.query.path as string | undefined;

    if (!pagePath) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "path query parameter is required",
      });
    }

    const { deletedCount, error } = await pageEditor.deletePagesByPath(
      id,
      pagePath
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
      message: `Deleted ${deletedCount} version(s) at path "${pagePath}"`,
      data: { path: pagePath, deletedCount },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting page by path:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete page",
    });
  }
}

/** DELETE /:id/pages/:pageId — Delete a page version */
export async function deletePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { error } = await pageEditor.deletePage(id, pageId);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Page version deleted successfully",
      data: { id: pageId },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting page:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete page version",
    });
  }
}

/** POST /:id/pages/:pageId/create-draft — Clone published to draft */
export async function createDraft(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { page, isExisting, error } = await pageEditor.createDraft(
      id,
      pageId
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    // Idempotent: existing draft returns 200, new draft returns 201
    return res.status(isExisting ? 200 : 201).json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating draft:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create draft",
    });
  }
}

/** POST /:id/pages/:pageId/edit — AI edit page component */
export async function editPageComponent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { result, error } = await pageEditor.editPageComponent(
      id,
      pageId,
      req.body
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
      editedHtml: result.editedHtml,
      message: result.message,
      rejected: result.rejected,
      debug: result.debug,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error editing page component:", error);
    return res.status(500).json({
      success: false,
      error: "EDIT_ERROR",
      message: error?.message || "Failed to edit component",
    });
  }
}

/** POST /:id/edit-layout — AI edit layout component */
export async function editLayoutComponent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { result, error } = await pageEditor.editLayoutComponent(
      id,
      req.body
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
      editedHtml: result.editedHtml,
      message: result.message,
      rejected: result.rejected,
      debug: result.debug,
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error editing layout component:", error);
    return res.status(500).json({
      success: false,
      error: "EDIT_ERROR",
      message: error?.message || "Failed to edit layout component",
    });
  }
}

// =====================================================================
// TEMPLATE HFCM
// =====================================================================

/** GET /templates/:templateId/code-snippets — List template snippets */
export async function listTemplateSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const snippets = await hfcmManager.listTemplateSnippets(templateId);
    return res.json({
      success: true,
      data: snippets,
    });
  } catch (error: any) {
    console.error("[HFCM] Error fetching template code snippets:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch code snippets",
    });
  }
}

/** POST /templates/:templateId/code-snippets — Create template snippet */
export async function createTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { snippet, error } = await hfcmManager.createTemplateSnippet(
      templateId,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      data: snippet,
    });
  } catch (error: any) {
    console.error("[HFCM] Error creating template code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create code snippet",
    });
  }
}

/** PATCH /templates/:templateId/code-snippets/:id — Update template snippet */
export async function updateTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, id } = req.params;
    const { snippet, error } = await hfcmManager.updateTemplateSnippet(
      templateId,
      id,
      req.body
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
      data: snippet,
    });
  } catch (error: any) {
    console.error("[HFCM] Error updating template code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update code snippet",
    });
  }
}

/** DELETE /templates/:templateId/code-snippets/:id — Delete template snippet */
export async function deleteTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, id } = req.params;
    const { error } = await hfcmManager.deleteTemplateSnippet(templateId, id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[HFCM] Error deleting template code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete code snippet",
    });
  }
}

/** PATCH /templates/:templateId/code-snippets/:id/toggle — Toggle template snippet */
export async function toggleTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, id } = req.params;
    const { is_enabled, error } = await hfcmManager.toggleTemplateSnippet(
      templateId,
      id
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
      data: { is_enabled },
    });
  } catch (error: any) {
    console.error("[HFCM] Error toggling template code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "TOGGLE_ERROR",
      message: error?.message || "Failed to toggle code snippet",
    });
  }
}

/** PATCH /templates/:templateId/code-snippets/reorder — Reorder template snippets */
export async function reorderTemplateSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { snippetIds } = req.body;
    const { error } = await hfcmManager.reorderTemplateSnippets(
      templateId,
      snippetIds
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
    });
  } catch (error: any) {
    console.error("[HFCM] Error reordering template code snippets:", error);
    return res.status(500).json({
      success: false,
      error: "REORDER_ERROR",
      message: error?.message || "Failed to reorder code snippets",
    });
  }
}

// =====================================================================
// PROJECT HFCM
// =====================================================================

/** GET /:projectId/code-snippets — List project snippets */
export async function listProjectSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const snippets = await hfcmManager.listProjectSnippets(projectId);
    return res.json({
      success: true,
      data: snippets,
    });
  } catch (error: any) {
    console.error("[HFCM] Error fetching project code snippets:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch code snippets",
    });
  }
}

/** POST /:projectId/code-snippets — Create project snippet */
export async function createProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const { snippet, error } = await hfcmManager.createProjectSnippet(
      projectId,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      data: snippet,
    });
  } catch (error: any) {
    console.error("[HFCM] Error creating project code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create code snippet",
    });
  }
}

/** PATCH /:projectId/code-snippets/:id — Update project snippet */
export async function updateProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, id } = req.params;
    const { snippet, error } = await hfcmManager.updateProjectSnippet(
      projectId,
      id,
      req.body
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
      data: snippet,
    });
  } catch (error: any) {
    console.error("[HFCM] Error updating project code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update code snippet",
    });
  }
}

/** DELETE /:projectId/code-snippets/:id — Delete project snippet */
export async function deleteProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, id } = req.params;
    const { error } = await hfcmManager.deleteProjectSnippet(projectId, id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[HFCM] Error deleting project code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete code snippet",
    });
  }
}

/** PATCH /:projectId/code-snippets/:id/toggle — Toggle project snippet */
export async function toggleProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, id } = req.params;
    const { is_enabled, error } = await hfcmManager.toggleProjectSnippet(
      projectId,
      id
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
      data: { is_enabled },
    });
  } catch (error: any) {
    console.error("[HFCM] Error toggling project code snippet:", error);
    return res.status(500).json({
      success: false,
      error: "TOGGLE_ERROR",
      message: error?.message || "Failed to toggle code snippet",
    });
  }
}

/** PATCH /:projectId/code-snippets/reorder — Reorder project snippets */
export async function reorderProjectSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const { snippetIds } = req.body;
    const { error } = await hfcmManager.reorderProjectSnippets(
      projectId,
      snippetIds
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
    });
  } catch (error: any) {
    console.error("[HFCM] Error reordering project code snippets:", error);
    return res.status(500).json({
      success: false,
      error: "REORDER_ERROR",
      message: error?.message || "Failed to reorder code snippets",
    });
  }
}

// =====================================================================
// RECIPIENTS
// =====================================================================

/** GET /:id/recipients — Get configured recipients + org users */
export async function getRecipients(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const project = await db("website_builder.projects")
      .where("id", id)
      .select("id", "recipients", "organization_id")
      .first();

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    let orgUsers: { name: string; email: string; role: string }[] = [];
    let recipients = Array.isArray(project.recipients) ? project.recipients : [];
    if (project.organization_id) {
      [recipients, orgUsers] = await Promise.all([
        getConfiguredRecipients({
          organizationId: project.organization_id,
          channel: "website_form",
          legacyProjectRecipients: project.recipients,
        }),
        listOrgUserRecipientOptions(project.organization_id),
      ]);
    }

    return res.json({
      success: true,
      data: {
        recipients,
        orgUsers,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching recipients:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message || "Failed to fetch recipients" });
  }
}

/** PUT /:id/recipients — Update recipients list */
export async function updateRecipients(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { recipients } = req.body;

    const project = await db("website_builder.projects")
      .where("id", id)
      .select("id", "organization_id")
      .first();

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    let normalized: string[];
    if (project.organization_id) {
      normalized = await updateRecipientSetting(
        project.organization_id,
        "website_form",
        recipients
      );
    } else {
      normalized = validateRecipientList(recipients);
      await db("website_builder.projects")
        .where("id", id)
        .update({ recipients: JSON.stringify(normalized), updated_at: db.fn.now() });
    }

    return res.json({ success: true, data: { recipients: normalized } });
  } catch (error: any) {
    if (error?.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: error.message,
      });
    }
    console.error("[Admin Websites] Error updating recipients:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message || "Failed to update recipients" });
  }
}

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

/** GET /:id/form-submissions — List submissions with pagination */
export async function listFormSubmissions(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const readFilter = req.query.read;
    const filterParam = req.query.filter as string | undefined;
    const formName =
      typeof req.query.formName === "string"
        ? req.query.formName.trim()
        : "";

    const filters: { is_read?: boolean; is_flagged?: boolean; form_name?: string; form_name_not?: string } = {};
    if (readFilter === "true") filters.is_read = true;
    if (readFilter === "false") filters.is_read = false;
    if (formName) filters.form_name = formName;

    if (filterParam === "verified") {
      filters.is_flagged = false;
      if (!formName) filters.form_name_not = "Newsletter Signup";
    } else if (filterParam === "flagged") {
      filters.is_flagged = true;
    } else if (filterParam === "optins" && !formName) {
      filters.form_name = "Newsletter Signup";
    }

    const result = await FormSubmissionModel.findByProjectId(
      id,
      { offset: (page - 1) * limit, limit },
      filters,
    );

    const baseCountFilters = formName ? { form_name: formName } : {};
    const [allCount, unreadCount, flaggedCount, verifiedCount, optinsCount] = await Promise.all([
      FormSubmissionModel.countByProjectId(id, baseCountFilters),
      FormSubmissionModel.countByProjectId(id, { ...baseCountFilters, is_read: false }),
      FormSubmissionModel.countByProjectId(id, { ...baseCountFilters, is_flagged: true }),
      FormSubmissionModel.countByProjectId(id, {
        ...baseCountFilters,
        is_flagged: false,
        ...(formName ? {} : { form_name_not: "Newsletter Signup" }),
      }),
      formName
        ? formName === "Newsletter Signup"
          ? FormSubmissionModel.countByProjectId(id, baseCountFilters)
          : Promise.resolve(0)
        : FormSubmissionModel.countOptinsByProjectId(id),
    ]);

    const totalPages = Math.ceil(result.total / limit);

    return res.json({ success: true, data: result.data, pagination: { page, limit, total: result.total, totalPages }, allCount, unreadCount, flaggedCount, verifiedCount, optinsCount });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing form submissions:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message || "Failed to fetch submissions" });
  }
}

/** PATCH /:id/form-submissions/mark-all-read — Mark submissions read */
export async function markAllFormSubmissionsRead(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const formName =
      typeof req.body?.formName === "string" ? req.body.formName.trim() : "";
    const updated = await FormSubmissionModel.markAllAsReadByProjectId(
      id,
      formName || undefined,
    );

    return res.json({ success: true, data: { updated } });
  } catch (error: any) {
    console.error("[Admin Websites] Error marking submissions read:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to mark submissions read",
    });
  }
}

/** GET /:id/form-submissions/:submissionId — Get single submission */
export async function getFormSubmission(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionId } = req.params;
    const submission = await FormSubmissionModel.findById(submissionId);

    if (!submission) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Submission not found" });
    }

    // Resolve pre-signed URLs for any file values in contents
    if (submission.contents) {
      if (Array.isArray(submission.contents)) {
        // Sections format
        for (const section of submission.contents) {
          if (section && typeof section === "object" && Array.isArray((section as any).fields)) {
            for (const field of (section as any).fields) {
              if (Array.isArray(field) && field[1] && typeof field[1] === "object" && "s3Key" in field[1]) {
                try {
                  field[1].url = await generatePresignedUrl(field[1].s3Key, 3600);
                } catch (err) {
                  console.error(`[Form Submission] Failed to generate pre-signed URL for ${field[1].s3Key}:`, err);
                }
              }
            }
          }
        }
      } else if (typeof submission.contents === "object") {
        // Legacy flat format
        for (const [, value] of Object.entries(submission.contents)) {
          if (value && typeof value === "object" && "s3Key" in value) {
            try {
              (value as any).url = await generatePresignedUrl((value as any).s3Key, 3600);
            } catch (err) {
              console.error(`[Form Submission] Failed to generate pre-signed URL for ${(value as any).s3Key}:`, err);
            }
          }
        }
      }
    }

    return res.json({ success: true, data: submission });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching submission:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message || "Failed to fetch submission" });
  }
}

/** PATCH /:id/form-submissions/:submissionId/read — Toggle read status */
export async function toggleFormSubmissionRead(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionId } = req.params;
    const { is_read } = req.body;

    if (is_read) {
      await FormSubmissionModel.markAsRead(submissionId);
    } else {
      await FormSubmissionModel.markAsUnread(submissionId);
    }

    return res.json({ success: true, data: { is_read } });
  } catch (error: any) {
    console.error("[Admin Websites] Error toggling submission read:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message || "Failed to update submission" });
  }
}

/** DELETE /:id/form-submissions/:submissionId — Delete a submission */
export async function deleteFormSubmission(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionId } = req.params;
    await FormSubmissionModel.deleteById(submissionId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting submission:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message || "Failed to delete submission" });
  }
}

const BULK_MAX = 50;
const FROM_EMAIL = process.env.CONTACT_FORM_FROM || "info@getalloro.com";
type FormResendProject = Pick<IProject, "organization_id" | "recipients">;

async function resolveCurrentFormSubmissionRecipients(
  projectId: string,
  formName: string,
  project: FormResendProject,
): Promise<string[]> {
  const resolution = await resolveWebsiteFormRecipients({
    projectId,
    formName,
    organizationId: project.organization_id,
    legacyProjectRecipients: project.recipients,
  });

  return resolution.recipients;
}

/** POST /:id/form-submissions/:submissionId/send-email — Manually send a single submission to current recipients */
export async function sendFormSubmissionEmail(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id: projectId, submissionId } = req.params;
    const submission = await FormSubmissionModel.findById(submissionId);

    if (!submission) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Submission not found" });
    }
    if (submission.project_id !== projectId) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Submission not found" });
    }
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Website project not found" });
    }

    const recipients = await resolveCurrentFormSubmissionRecipients(
      projectId,
      submission.form_name,
      project,
    );
    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: "NO_RECIPIENTS", message: "No recipients configured for this form" });
    }

    const emailContext = await resolveFormSubmissionEmailContext(project);
    const emailBody = buildEmailBody(submission.form_name, submission.contents, {
      headerColor: emailContext.headerColor,
      logoUrl: emailContext.logoUrl,
    });

    await sendEmailWebhook({
      cc: [],
      bcc: [],
      body: emailBody,
      from: FROM_EMAIL,
      subject: `New Entry From ${submission.form_name}`,
      fromName: emailContext.fromName,
      recipients,
    });

    return res.json({ success: true, data: { recipients } });
  } catch (error: any) {
    if (error instanceof WebhookError) {
      return res.status(502).json({ success: false, error: "WEBHOOK_ERROR", message: "Failed to send email" });
    }
    console.error("[Admin Websites] Error sending submission email:", error);
    return res.status(500).json({ success: false, error: "SEND_ERROR", message: error?.message || "Failed to send email" });
  }
}

/** POST /:id/form-submissions/bulk/send-email — Manually send multiple flagged submissions */
export async function bulkSendFormSubmissionsEmail(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { submissionIds } = req.body;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ success: false, error: "INVALID_PAYLOAD", message: "submissionIds must be a non-empty array" });
    }
    if (submissionIds.length > BULK_MAX) {
      return res.status(400).json({ success: false, error: "TOO_MANY", message: `Max ${BULK_MAX} submissions per bulk request` });
    }

    let sent = 0;
    let skipped = 0;
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Website project not found" });
    }
    const emailContext = await resolveFormSubmissionEmailContext(project);
    const recipientsByFormName = new Map<string, string[]>();

    for (const id of submissionIds) {
      const submission = await FormSubmissionModel.findById(String(id));
      if (
        !submission ||
        submission.project_id !== projectId
      ) {
        skipped++;
        continue;
      }

      try {
        let recipients = recipientsByFormName.get(submission.form_name);
        if (!recipients) {
          recipients = await resolveCurrentFormSubmissionRecipients(
            projectId,
            submission.form_name,
            project,
          );
          recipientsByFormName.set(submission.form_name, recipients);
        }

        if (recipients.length === 0) {
          skipped++;
          continue;
        }

        const emailBody = buildEmailBody(
          submission.form_name,
          submission.contents,
          {
            headerColor: emailContext.headerColor,
            logoUrl: emailContext.logoUrl,
          },
        );
        await sendEmailWebhook({
          cc: [],
          bcc: [],
          body: emailBody,
          from: FROM_EMAIL,
          subject: `New Entry From ${submission.form_name}`,
          fromName: emailContext.fromName,
          recipients,
        });
        sent++;
      } catch {
        skipped++;
      }
    }

    return res.json({ success: true, data: { sent, skipped } });
  } catch (error: any) {
    console.error("[Admin Websites] Error bulk sending submission emails:", error);
    return res.status(500).json({ success: false, error: "BULK_SEND_ERROR", message: error?.message || "Failed to bulk send emails" });
  }
}

/** DELETE /:id/form-submissions/bulk — Delete multiple submissions */
export async function bulkDeleteFormSubmissions(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionIds } = req.body;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ success: false, error: "INVALID_PAYLOAD", message: "submissionIds must be a non-empty array" });
    }
    if (submissionIds.length > BULK_MAX) {
      return res.status(400).json({ success: false, error: "TOO_MANY", message: `Max ${BULK_MAX} submissions per bulk request` });
    }

    const deleted = await FormSubmissionModel.bulkDeleteByIds(submissionIds.map(String));
    return res.json({ success: true, data: { deleted } });
  } catch (error: any) {
    console.error("[Admin Websites] Error bulk deleting submissions:", error);
    return res.status(500).json({ success: false, error: "BULK_DELETE_ERROR", message: error?.message || "Failed to bulk delete submissions" });
  }
}

/** PATCH /:id/form-submissions/bulk/read — Toggle read status for multiple submissions */
export async function bulkToggleFormSubmissionsRead(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionIds, is_read } = req.body;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ success: false, error: "INVALID_PAYLOAD", message: "submissionIds must be a non-empty array" });
    }
    if (submissionIds.length > BULK_MAX) {
      return res.status(400).json({ success: false, error: "TOO_MANY", message: `Max ${BULK_MAX} submissions per bulk request` });
    }

    const ids = submissionIds.map(String);
    if (is_read) {
      await FormSubmissionModel.bulkMarkAsRead(ids);
    } else {
      await FormSubmissionModel.bulkMarkAsUnread(ids);
    }

    return res.json({ success: true, data: { is_read, count: ids.length } });
  } catch (error: any) {
    console.error("[Admin Websites] Error bulk toggling submission read:", error);
    return res.status(500).json({ success: false, error: "BULK_READ_ERROR", message: error?.message || "Failed to bulk update submissions" });
  }
}

// =====================================================================
// POST TYPES
// =====================================================================

/** GET /templates/:templateId/post-types */
export async function listPostTypes(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postTypeManager.listPostTypes(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postTypes });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing post types:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/post-types */
export async function createPostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postTypeManager.createPostType(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.postType });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating post type:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/post-types/:postTypeId */
export async function getPostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postTypeId } = req.params;
    const postType = await postTypeManager.getPostType(templateId, postTypeId);
    if (!postType) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Post type not found" });
    return res.json({ success: true, data: postType });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting post type:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/post-types/:postTypeId */
export async function updatePostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postTypeId } = req.params;
    const result = await postTypeManager.updatePostType(templateId, postTypeId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postType });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating post type:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/post-types/:postTypeId */
export async function deletePostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postTypeId } = req.params;
    const result = await postTypeManager.deletePostType(templateId, postTypeId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting post type:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// POST BLOCKS
// =====================================================================

/** GET /templates/:templateId/post-blocks */
export async function listPostBlocks(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postBlockManager.listPostBlocks(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postBlocks });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing post blocks:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/post-blocks */
export async function createPostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postBlockManager.createPostBlock(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.postBlock });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating post block:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/post-blocks/:postBlockId */
export async function getPostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postBlockId } = req.params;
    const postBlock = await postBlockManager.getPostBlock(templateId, postBlockId);
    if (!postBlock) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Post block not found" });
    return res.json({ success: true, data: postBlock });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting post block:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/post-blocks/:postBlockId */
export async function updatePostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postBlockId } = req.params;
    const result = await postBlockManager.updatePostBlock(templateId, postBlockId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postBlock });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating post block:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/post-blocks/:postBlockId */
export async function deletePostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postBlockId } = req.params;
    const result = await postBlockManager.deletePostBlock(templateId, postBlockId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting post block:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// MENU TEMPLATES
// =====================================================================

/** GET /templates/:templateId/menu-templates */
export async function listMenuTemplates(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await menuTemplateManager.listMenuTemplates(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menuTemplates });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing menu templates:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/menu-templates */
export async function createMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await menuTemplateManager.createMenuTemplate(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.menuTemplate });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating menu template:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/menu-templates/:menuTemplateId */
export async function getMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, menuTemplateId } = req.params;
    const menuTemplate = await menuTemplateManager.getMenuTemplate(templateId, menuTemplateId);
    if (!menuTemplate) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Menu template not found" });
    return res.json({ success: true, data: menuTemplate });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting menu template:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/menu-templates/:menuTemplateId */
export async function updateMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, menuTemplateId } = req.params;
    const result = await menuTemplateManager.updateMenuTemplate(templateId, menuTemplateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menuTemplate });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating menu template:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/menu-templates/:menuTemplateId */
export async function deleteMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, menuTemplateId } = req.params;
    const result = await menuTemplateManager.deleteMenuTemplate(templateId, menuTemplateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting menu template:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// POST TAXONOMY (Categories & Tags)
// =====================================================================

/** GET /post-types/:postTypeId/categories */
export async function listCategories(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.listCategories(postTypeId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.categories });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing categories:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /post-types/:postTypeId/categories */
export async function createCategory(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.createCategory(postTypeId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.category });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating category:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /post-types/:postTypeId/categories/:categoryId */
export async function updateCategory(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, categoryId } = req.params;
    const result = await postTaxonomyManager.updateCategory(postTypeId, categoryId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.category });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating category:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /post-types/:postTypeId/categories/:categoryId */
export async function deleteCategory(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, categoryId } = req.params;
    const result = await postTaxonomyManager.deleteCategory(postTypeId, categoryId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting category:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** GET /post-types/:postTypeId/tags */
export async function listTags(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.listTags(postTypeId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.tags });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing tags:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /post-types/:postTypeId/tags */
export async function createTag(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.createTag(postTypeId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.tag });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating tag:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /post-types/:postTypeId/tags/:tagId */
export async function updateTag(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, tagId } = req.params;
    const result = await postTaxonomyManager.updateTag(postTypeId, tagId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.tag });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating tag:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /post-types/:postTypeId/tags/:tagId */
export async function deleteTag(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, tagId } = req.params;
    const result = await postTaxonomyManager.deleteTag(postTypeId, tagId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting tag:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// POSTS
// =====================================================================

/** GET /:id/posts */
export async function listPosts(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const { post_type_id, status } = req.query;
    const result = await postManager.listPosts(projectId, {
      post_type_id: post_type_id as string | undefined,
      status: status as string | undefined,
    });
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.posts });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing posts:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /:id/posts */
export async function createPost(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const result = await postManager.createPost(projectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.post });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating post:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /:id/posts/:postId */
export async function getPost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const post = await postManager.getPost(projectId, postId);
    if (!post) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Post not found" });
    return res.json({ success: true, data: post });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting post:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /:id/posts/:postId */
export async function updatePost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const result = await postManager.updatePost(projectId, postId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.post });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating post:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/posts/:postId */
export async function deletePost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const result = await postManager.deletePost(projectId, postId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting post:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// MENUS
// =====================================================================

/** GET /:id/menus */
export async function listMenus(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const result = await menuManager.listMenus(projectId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menus });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing menus:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /:id/menus */
export async function createMenu(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const result = await menuManager.createMenu(projectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.menu });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating menu:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /:id/menus/:menuId */
export async function getMenu(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.getMenu(projectId, menuId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menu });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting menu:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /:id/menus/:menuId */
export async function updateMenu(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.updateMenu(projectId, menuId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menu });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating menu:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/menus/:menuId */
export async function deleteMenu(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.deleteMenu(projectId, menuId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting menu:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** POST /:id/menus/:menuId/items */
export async function createMenuItem(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.createMenuItem(projectId, menuId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.item });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating menu item:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/menus/:menuId/items/:itemId */
export async function updateMenuItem(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId, itemId } = req.params;
    const result = await menuManager.updateMenuItem(projectId, menuId, itemId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.item });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating menu item:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/menus/:menuId/items/:itemId */
export async function deleteMenuItem(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId, itemId } = req.params;
    const result = await menuManager.deleteMenuItem(projectId, menuId, itemId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting menu item:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/menus/:menuId/items/reorder */
export async function reorderMenuItems(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.reorderItems(projectId, menuId, req.body.items || []);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error reordering menu items:", error);
    return res.status(500).json({ success: false, error: "REORDER_ERROR", message: error?.message });
  }
}

// =====================================================================
// SEO
// =====================================================================

/** PATCH /:id/pages/:pageId/seo — Update page SEO data */
export async function updatePageSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, pageId } = req.params;
    const { seo_data } = req.body;
    if (!seo_data) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "seo_data is required" });
    }
    const { page, error } = await pageEditor.updatePageSeo(projectId, pageId, seo_data);
    if (error) return res.status(error.status).json({ success: false, ...error });
    return res.json({ success: true, data: page });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating page SEO:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/posts/:postId/seo — Update post SEO data */
export async function updatePostSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const { seo_data } = req.body;
    if (!seo_data) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "seo_data is required" });
    }
    const result = await postManager.updatePost(projectId, postId, { seo_data });
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.post });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating post SEO:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** POST /:id/pages/:pageId/seo/generate — AI generate SEO for a page */
export async function generatePageSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, pageId } = req.params;
    const { generateSeoForSection } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await generateSeoForSection(projectId, pageId, "page", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Admin Websites] Error generating page SEO:", error);
    return res.status(500).json({ success: false, error: "GENERATION_ERROR", message: error?.message });
  }
}

/** POST /:id/posts/:postId/seo/generate — AI generate SEO for a post */
export async function generatePostSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const { generateSeoForSection } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await generateSeoForSection(projectId, postId, "post", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Admin Websites] Error generating post SEO:", error);
    return res.status(500).json({ success: false, error: "GENERATION_ERROR", message: error?.message });
  }
}

/** POST /:id/pages/:pageId/seo/generate-all — AI generate ALL SEO sections at once */
export async function generateAllPageSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, pageId } = req.params;
    const { generateAllSeoSections } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await generateAllSeoSections(projectId, pageId, "page", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Admin Websites] Error generating all page SEO:", error);
    return res.status(500).json({ success: false, error: "GENERATION_ERROR", message: error?.message });
  }
}

/** POST /:id/posts/:postId/seo/generate-all — AI generate ALL SEO sections at once */
export async function generateAllPostSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const { generateAllSeoSections } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await generateAllSeoSections(projectId, postId, "post", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Admin Websites] Error generating all post SEO:", error);
    return res.status(500).json({ success: false, error: "GENERATION_ERROR", message: error?.message });
  }
}

/** POST /:id/pages/:pageId/seo/analyze — AI analyze existing SEO for a page */
export async function analyzePageSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, pageId } = req.params;
    const { analyzeSeoForSection } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await analyzeSeoForSection(projectId, pageId, "page", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Admin Websites] Error analyzing page SEO:", error);
    return res.status(500).json({ success: false, error: "ANALYSIS_ERROR", message: error?.message });
  }
}

/** POST /:id/posts/:postId/seo/analyze — AI analyze existing SEO for a post */
export async function analyzePostSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const { analyzeSeoForSection } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await analyzeSeoForSection(projectId, postId, "post", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Admin Websites] Error analyzing post SEO:", error);
    return res.status(500).json({ success: false, error: "ANALYSIS_ERROR", message: error?.message });
  }
}

/** POST /:id/seo/bulk-generate — Start a bulk SEO generation background job */
export async function startBulkSeoGenerate(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const { entity_type, post_type_id, page_paths } = req.body;

    if (!entity_type || !["page", "post"].includes(entity_type)) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "entity_type must be 'page' or 'post'" });
    }
    if (entity_type === "post" && !post_type_id) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "post_type_id is required for post entity type" });
    }

    const { SeoGenerationJobModel } = await import("../../models/website-builder/SeoGenerationJobModel");
    const { getMindsQueue } = await import("../../workers/queues");

    // Check for existing active job
    const active = await SeoGenerationJobModel.findActive(projectId, entity_type, post_type_id);
    if (active) {
      console.log(`[BULK-SEO] Returning existing active job: ${active.id} status=${active.status} ${active.completed_count}/${active.total_count}`);
      return res.json({ success: true, job_id: active.id, already_active: true });
    }

    // Count entities
    let totalCount: number;
    const selectedPaths: string[] | undefined = Array.isArray(page_paths) && page_paths.length > 0 ? page_paths : undefined;

    if (entity_type === "page") {
      if (selectedPaths) {
        totalCount = selectedPaths.length;
      } else {
        const pages = await db("website_builder.pages")
          .where({ project_id: projectId })
          .select("path");
        const uniquePaths = new Set(pages.map((p: any) => p.path));
        totalCount = uniquePaths.size;
      }
    } else {
      const countResult = await db("website_builder.posts")
        .where({ project_id: projectId, post_type_id })
        .count("* as count")
        .first();
      totalCount = parseInt(countResult?.count as string, 10) || 0;
    }

    if (totalCount === 0) {
      return res.status(400).json({ success: false, error: "NO_ENTITIES", message: `No ${entity_type}s found to generate SEO for.` });
    }

    // Create job record
    const jobRecord = await SeoGenerationJobModel.create({
      project_id: projectId,
      entity_type,
      post_type_id: post_type_id || null,
      total_count: totalCount,
    });

    // Enqueue BullMQ job
    console.log(`[BULK-SEO] Created new job: ${jobRecord.id} type=${entity_type} postType=${post_type_id || "n/a"} total=${totalCount}`);
    const queue = getMindsQueue("seo-bulk-generate");
    await queue.add("seo-bulk-generate", {
      jobRecordId: jobRecord.id,
      projectId,
      entityType: entity_type,
      postTypeId: post_type_id,
      pagePaths: selectedPaths,
    }, { jobId: jobRecord.id });
    console.log(`[BULK-SEO] Enqueued to BullMQ queue: minds-seo-bulk-generate`);

    return res.json({ success: true, job_id: jobRecord.id });
  } catch (error: any) {
    console.error("[Admin Websites] Error starting bulk SEO generation:", error);
    return res.status(500).json({ success: false, error: "BULK_GENERATE_ERROR", message: error?.message });
  }
}

/** GET /:id/seo/bulk-generate/active — Check for any active bulk SEO job */
export async function getActiveBulkSeoJob(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const { entity_type, post_type_id } = req.query;
    const { SeoGenerationJobModel } = await import("../../models/website-builder/SeoGenerationJobModel");

    const job = await SeoGenerationJobModel.findActive(
      projectId,
      (entity_type as "page" | "post") || "page",
      (post_type_id as string) || undefined
    );

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    if (!job) {
      return res.json({ success: true, data: null });
    }

    return res.json({
      success: true,
      data: {
        id: job.id,
        status: job.status,
        total_count: job.total_count,
        completed_count: job.completed_count,
        failed_count: job.failed_count,
        failed_items: job.failed_items,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error checking active bulk SEO job:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

/** GET /:id/seo/bulk-generate/:jobId/status — Poll bulk SEO generation progress */
export async function getBulkSeoStatus(req: Request, res: Response): Promise<Response> {
  try {
    const { jobId } = req.params;
    const { SeoGenerationJobModel } = await import("../../models/website-builder/SeoGenerationJobModel");

    const job = await SeoGenerationJobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Job not found" });
    }

    // No caching
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    return res.json({
      success: true,
      data: {
        id: job.id,
        status: job.status,
        total_count: job.total_count,
        completed_count: job.completed_count,
        failed_count: job.failed_count,
        failed_items: job.failed_items,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching bulk SEO status:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

/** GET /:id/seo/all-meta — Get all page/post titles and descriptions for uniqueness checking */
export async function getAllSeoMeta(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const pages = await db("website_builder.pages")
      .where({ project_id: projectId })
      .whereIn("status", ["published", "draft"])
      .select("id", "path", "status", "version", "seo_data");

    // Deduplicate by path: prefer published, then highest version draft.
    // Uniqueness checks are across different page paths, not across versions.
    const pagesByPath = new Map<string, any>();
    for (const p of pages) {
      const existing = pagesByPath.get(p.path);
      if (
        !existing ||
        (p.status === "published" && existing.status !== "published") ||
        (p.status === existing.status && p.version > existing.version)
      ) {
        pagesByPath.set(p.path, p);
      }
    }

    const posts = await db("website_builder.posts")
      .where({ project_id: projectId })
      .select("id", "title", "slug", "seo_data");

    const meta = {
      pages: Array.from(pagesByPath.values()).map((p: any) => ({
        id: p.id,
        path: p.path,
        meta_title: p.seo_data?.meta_title || null,
        meta_description: p.seo_data?.meta_description || null,
      })),
      posts: posts.map((p: any) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        meta_title: p.seo_data?.meta_title || null,
        meta_description: p.seo_data?.meta_description || null,
      })),
    };

    return res.json({ success: true, data: meta });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching SEO meta:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

// =====================================================================
// REVIEW BLOCKS
// =====================================================================

/** GET /templates/:templateId/review-blocks */
export async function listReviewBlocks(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await reviewBlockManager.listReviewBlocks(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.reviewBlocks });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing review blocks:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/review-blocks */
export async function createReviewBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await reviewBlockManager.createReviewBlock(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.reviewBlock });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating review block:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/review-blocks/:reviewBlockId */
export async function getReviewBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, reviewBlockId } = req.params;
    const reviewBlock = await reviewBlockManager.getReviewBlock(templateId, reviewBlockId);
    if (!reviewBlock) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Review block not found" });
    return res.json({ success: true, data: reviewBlock });
  } catch (error: any) {
    console.error("[Admin Websites] Error getting review block:", error);
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/review-blocks/:reviewBlockId */
export async function updateReviewBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, reviewBlockId } = req.params;
    const result = await reviewBlockManager.updateReviewBlock(templateId, reviewBlockId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.reviewBlock });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating review block:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/review-blocks/:reviewBlockId */
export async function deleteReviewBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, reviewBlockId } = req.params;
    const result = await reviewBlockManager.deleteReviewBlock(templateId, reviewBlockId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting review block:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** POST /:id/reviews/sync — Trigger manual review sync for a project's org */
export async function triggerReviewSync(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;

    const project = await db("website_builder.projects")
      .where("id", id)
      .select("organization_id")
      .first();

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    if (!project.organization_id) {
      return res.status(400).json({ success: false, error: "NO_ORG", message: "Project has no linked organization" });
    }

    const { getMindsQueue } = await import("../../workers/queues");
    const queue = getMindsQueue("review-sync");
    const job = await queue.add("manual-review-sync", { organizationId: project.organization_id });

    console.log(`[Admin Websites] Triggered manual review sync for project ${id} (org ${project.organization_id}), job ${job.id}`);
    return res.json({ success: true, data: { jobId: job.id } });
  } catch (error: any) {
    console.error("[Admin Websites] Error triggering review sync:", error);
    return res.status(500).json({ success: false, error: "SYNC_ERROR", message: error?.message });
  }
}

/** GET /:id/reviews/stats — Get review stats for a project's org locations */
export async function getReviewStats(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const scope = await ProjectReviewModel.getProjectScope(id);

    if (!scope) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    const stats = await ProjectReviewModel.getStats(scope);

    return res.json({
      success: true,
      data: {
        ...stats,
        hasGbpConnection: scope.hasGbpConnection,
        hasPlaceIds: scope.hasPlaceIds,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching review stats:", error);
    return res.status(500).json({ success: false, error: "STATS_ERROR", message: error?.message });
  }
}

/** POST /:id/reviews/fetch — Trigger Apify review fetch. Body may include { placeIds } to override project defaults. */
export async function triggerApifyReviewFetch(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const bodyPlaceIds: string[] | undefined = req.body?.placeIds;
    const scope = await ProjectReviewModel.getProjectScope(id);

    if (!scope) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    const placeIds = Array.isArray(bodyPlaceIds) && bodyPlaceIds.length > 0
      ? bodyPlaceIds.filter((pid: string) => scope.placeIds.includes(pid))
      : scope.placeIds;

    if (placeIds.length === 0) {
      return res.status(400).json({ success: false, error: "NO_PLACE_IDS", message: "No valid GBP locations selected" });
    }

    const { getMindsQueue } = await import("../../workers/queues");
    const queue = getMindsQueue("review-sync");
    const job = await queue.add("apify-review-fetch", { projectId: id, placeIds });

    console.log(`[Admin Websites] Triggered Apify review fetch for project ${id}, ${placeIds.length} place(s), job ${job.id}`);
    return res.json({ success: true, data: { jobId: job.id, placeCount: placeIds.length } });
  } catch (error: any) {
    console.error("[Admin Websites] Error triggering Apify review fetch:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

/** GET /:id/reviews — List reviews for a project with search/filter */
export async function listReviews(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const { search, stars, showHidden } = req.query;
    const scope = await ProjectReviewModel.getProjectScope(id);

    if (!scope) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    const reviews = await ProjectReviewModel.list(scope, {
      search: search as string | undefined,
      stars: stars ? parseInt(stars as string, 10) : undefined,
      showHidden: showHidden === "true",
    });

    return res.json({ success: true, data: reviews });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing reviews:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** PATCH /:id/reviews/:reviewId — Toggle review hidden status */
export async function toggleReviewHidden(req: Request, res: Response): Promise<Response> {
  try {
    const { reviewId } = req.params;
    const { hidden } = req.body;

    if (typeof hidden !== "boolean") {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "hidden must be a boolean" });
    }

    const updated = await ReviewModel.toggleHidden(reviewId, hidden);

    if (updated === 0) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Review not found" });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error toggling review:", error);
    return res.status(500).json({ success: false, error: "TOGGLE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/reviews/:reviewId — Delete a review */
export async function deleteReview(req: Request, res: Response): Promise<Response> {
  try {
    const { reviewId } = req.params;

    const deleted = await ReviewModel.deleteReview(reviewId);

    if (deleted === 0) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Review not found" });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting review:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** GET /:id/reviews/jobs/:jobId/status — Poll review sync/fetch job status */
export async function getReviewJobStatus(req: Request, res: Response): Promise<Response> {
  try {
    const { jobId } = req.params;

    const { getMindsQueue } = await import("../../workers/queues");
    const queue = getMindsQueue("review-sync");
    const job = await queue.getJob(jobId);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    if (!job) {
      return res.json({ success: true, data: { jobId, state: "unknown" } });
    }

    const state = await job.getState();
    const failedReason = (job as any).failedReason || null;

    return res.json({
      success: true,
      data: { jobId: job.id, state, failedReason },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching review job status:", error);
    return res.status(500).json({ success: false, error: "STATUS_ERROR", message: error?.message });
  }
}

// =====================================================================
// AI POST GENERATION
// =====================================================================

/** POST /:id/posts/ai-generate — Generate post content with AI */
export async function aiGeneratePost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { post_type_id, title, reference_url, reference_content } = req.body;

    if (!title || !post_type_id) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "title and post_type_id are required" });
    }

    if (!reference_url && !reference_content) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "reference_url or reference_content is required" });
    }

    // Resolve reference content
    let refContent = reference_content || "";
    if (reference_url && !refContent) {
      try {
        const scrapeResponse = await fetch(reference_url, {
          headers: { "User-Agent": "AlloroBot/1.0" },
          signal: AbortSignal.timeout(15000),
        });
        if (scrapeResponse.ok) {
          const html = await scrapeResponse.text();
          refContent = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 8000);
        }
      } catch {
        // Scrape failed — continue with empty content
      }
    }

    // Get post type info
    const postType = await db("website_builder.post_types").where("id", post_type_id).first();
    const typeName = postType?.name || "post";

    // Generate content via dedicated post content prompt
    const { generatePostContent } = await import("../../utils/website-utils/aiCommandService");
    const result = await generatePostContent({
      title,
      postTypeName: typeName,
      purpose: "",
      referenceContent: refContent,
      styleContext: "",
      customFieldsHint: "",
    });

    return res.json({ success: true, data: { content: result.html } });
  } catch (error: any) {
    console.error("[Admin Websites] Error generating post content:", error);
    return res.status(500).json({ success: false, error: "GENERATE_ERROR", message: error?.message });
  }
}

// =====================================================================
// PAGE DISPLAY NAME
// =====================================================================

/** PATCH /:id/pages/display-name — Update page display name for a path */
export async function updatePageDisplayName(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { path: pagePath, display_name } = req.body;
    if (!pagePath) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "path is required" });
    }
    const updated = await pageEditor.updatePageDisplayName(projectId, pagePath, display_name || null);
    return res.json({ success: true, data: { updated } });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating display name:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

// =====================================================================
// AI COMMAND
// =====================================================================

/** POST /:id/ai-command — Create a new AI command batch and start analysis */
export async function createAiCommandBatch(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { prompt, targets, batch_type } = req.body;

    // Prompt is optional for ui_checker and link_checker
    const bType = batch_type || "ai_editor";
    if (bType === "ai_editor" && (!prompt || typeof prompt !== "string" || prompt.trim().length === 0)) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "prompt is required for AI Editor" });
    }

    const batch = await aiCommand.createBatch(
      projectId,
      (prompt || "").trim(),
      targets || { pages: "all", posts: "all", layouts: "all" },
      (req as any).userId,
      bType
    );

    // Fire-and-forget analysis — don't await
    aiCommand.analyzeBatch(batch.id).catch((err) => {
      console.error(`[Admin Websites] Background analysis failed for batch ${batch.id}:`, err);
    });

    return res.status(201).json({ success: true, data: batch });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating AI command batch:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /:id/ai-command/:batchId — Get batch status and stats */
export async function getAiCommandBatch(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;
    const batch = await aiCommand.getBatch(batchId);

    if (!batch) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Batch not found" });
    }

    return res.json({ success: true, data: batch });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching AI command batch:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

/** GET /:id/ai-command/:batchId/recommendations — List recommendations */
export async function getAiCommandRecommendations(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;
    const { status, target_type } = req.query;

    const recommendations = await aiCommand.getBatchRecommendations(batchId, {
      status: status as string | undefined,
      target_type: target_type as string | undefined,
    });

    return res.json({ success: true, data: recommendations });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching recommendations:", error);
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

/** PATCH /:id/ai-command/:batchId/recommendations/:recId — Update recommendation status */
export async function updateAiCommandRecommendation(req: Request, res: Response): Promise<Response> {
  try {
    const { recId } = req.params;
    const { status } = req.body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "status must be 'approved' or 'rejected'" });
    }

    const { reference_url, reference_content } = req.body;
    const rec = await aiCommand.updateRecommendationStatus(recId, status, {
      reference_url,
      reference_content,
    });
    if (!rec) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Recommendation not found" });
    }

    return res.json({ success: true, data: rec });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating recommendation:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/ai-command/:batchId/recommendations/bulk — Bulk approve/reject */
export async function bulkUpdateAiCommandRecommendations(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;
    const { status, target_type } = req.body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "status must be 'approved' or 'rejected'" });
    }

    const updated = await aiCommand.bulkUpdateStatus(batchId, status, {
      target_type,
    });

    return res.json({ success: true, data: { updated } });
  } catch (error: any) {
    console.error("[Admin Websites] Error bulk updating recommendations:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** POST /:id/ai-command/:batchId/execute — Execute approved recommendations */
export async function executeAiCommandBatch(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;

    const batch = await aiCommand.getBatch(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Batch not found" });
    }

    if (batch.status !== "ready") {
      return res.status(400).json({ success: false, error: "INVALID_STATUS", message: `Batch status is "${batch.status}", expected "ready"` });
    }

    const stats = typeof batch.stats === "string" ? JSON.parse(batch.stats) : batch.stats;
    if (!stats.approved || stats.approved === 0) {
      return res.status(400).json({ success: false, error: "NO_APPROVED", message: "No approved recommendations to execute" });
    }

    // Fire-and-forget execution — don't await
    aiCommand.executeBatch(batchId).catch((err) => {
      console.error(`[Admin Websites] Background execution failed for batch ${batchId}:`, err);
    });

    return res.json({ success: true, data: { status: "executing" } });
  } catch (error: any) {
    console.error("[Admin Websites] Error executing AI command batch:", error);
    return res.status(500).json({ success: false, error: "EXECUTE_ERROR", message: error?.message });
  }
}

/** GET /:id/ai-command — List all batches for a project */
export async function listAiCommandBatches(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const batches = await aiCommand.listBatches(projectId);
    return res.json({ success: true, data: batches });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing AI command batches:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** PATCH /:id/ai-command/:batchId — Rename a batch */
export async function renameAiCommandBatch(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;
    const { summary } = req.body;
    if (!summary || typeof summary !== "string") {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "summary is required" });
    }
    const batch = await aiCommand.updateBatchSummary(batchId, summary.trim());
    return res.json({ success: true, data: batch });
  } catch (error: any) {
    console.error("[Admin Websites] Error renaming batch:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/ai-command/:batchId — Delete a batch */
export async function deleteAiCommandBatch(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;
    await aiCommand.deleteBatch(batchId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting AI command batch:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// REDIRECTS
// =====================================================================

/** GET /:id/redirects — List redirects for a project */
export async function listRedirects(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { type } = req.query;
    const redirects = await redirectsService.listRedirects(projectId, {
      type: type ? parseInt(type as string, 10) : undefined,
    });
    return res.json({ success: true, data: redirects });
  } catch (error: any) {
    console.error("[Admin Websites] Error listing redirects:", error);
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /:id/redirects — Create a redirect */
export async function createRedirect(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const result = await redirectsService.createRedirect(projectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.redirect });
  } catch (error: any) {
    console.error("[Admin Websites] Error creating redirect:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** POST /:id/redirects/bulk — Bulk create redirects */
export async function bulkCreateRedirects(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { redirects } = req.body;
    if (!Array.isArray(redirects)) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "redirects array is required" });
    }
    const result = await redirectsService.bulkCreateRedirects(projectId, redirects);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("[Admin Websites] Error bulk creating redirects:", error);
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/redirects/:redirectId — Update a redirect */
export async function updateRedirect(req: Request, res: Response): Promise<Response> {
  try {
    const { redirectId } = req.params;
    const result = await redirectsService.updateRedirect(redirectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.redirect });
  } catch (error: any) {
    console.error("[Admin Websites] Error updating redirect:", error);
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/redirects/:redirectId — Delete a redirect */
export async function deleteRedirect(req: Request, res: Response): Promise<Response> {
  try {
    const { redirectId } = req.params;
    const result = await redirectsService.deleteRedirect(redirectId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Websites] Error deleting redirect:", error);
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// COSTS — per-project AI cost rollup (Anthropic only in MVP)
// =====================================================================

/** GET /:projectId/costs — Per-project AI cost events + totals */
export async function getProjectCosts(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { projectId } = req.params;

    // Confirm project exists so a typo returns 404 instead of an empty list.
    const project = await db("website_builder.projects")
      .where("id", projectId)
      .select("id")
      .first();
    if (!project) {
      return res
        .status(404)
        .json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    const events = await db("website_builder.ai_cost_events")
      .where("project_id", projectId)
      .orderBy("created_at", "desc")
      .limit(100);

    // Totals — sum across the per-project history (not just the visible page).
    const totalsRow = await db("website_builder.ai_cost_events")
      .where("project_id", projectId)
      .select(
        db.raw("COALESCE(SUM(estimated_cost_usd), 0)::float AS total_cost_usd"),
        db.raw("COALESCE(SUM(input_tokens), 0)::int AS total_input"),
        db.raw("COALESCE(SUM(output_tokens), 0)::int AS total_output"),
        db.raw(
          "COALESCE(SUM(cache_creation_tokens), 0)::int AS total_cache_creation",
        ),
        db.raw("COALESCE(SUM(cache_read_tokens), 0)::int AS total_cache_read"),
        db.raw("COUNT(*)::int AS total_events"),
      )
      .first();

    const shapedEvents = events.map((e: any) => ({
      id: e.id,
      event_type: e.event_type,
      vendor: e.vendor,
      model: e.model,
      input_tokens: Number(e.input_tokens),
      output_tokens: Number(e.output_tokens),
      cache_creation_tokens:
        e.cache_creation_tokens != null ? Number(e.cache_creation_tokens) : null,
      cache_read_tokens:
        e.cache_read_tokens != null ? Number(e.cache_read_tokens) : null,
      estimated_cost_usd: Number(e.estimated_cost_usd),
      metadata: e.metadata ?? null,
      parent_event_id: e.parent_event_id ?? null,
      created_at: e.created_at,
    }));

    return res.json({
      success: true,
      data: {
        total_cost_usd: Number(totalsRow?.total_cost_usd || 0),
        total_events: Number(totalsRow?.total_events || 0),
        total_tokens: {
          input: Number(totalsRow?.total_input || 0),
          output: Number(totalsRow?.total_output || 0),
          cache_creation: Number(totalsRow?.total_cache_creation || 0),
          cache_read: Number(totalsRow?.total_cache_read || 0),
        },
        events: shapedEvents,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching project costs:", error);
    return res
      .status(500)
      .json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

// =====================================================================
// POST IMPORT FROM IDENTITY (T8 + F4)
//
// Admins import doctor / service / location entries discovered during identity
// warmup into website_builder.posts. The HTTP layer enqueues a BullMQ job and
// the client polls for status — see service.post-importer + postImporter.processor.
// =====================================================================

/**
 * POST /:projectId/posts/import — enqueue an import-from-identity job.
 * Body: { postType, entries: Array<string | { source_url, name }>, overwrite?: boolean }
 */
export async function startPostImport(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const { postType, entries, overwrite } = req.body || {};

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "projectId is required",
      });
    }
    if (!postType || !["doctor", "service", "location"].includes(postType)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "postType must be 'doctor' | 'service' | 'location'",
      });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "entries must be a non-empty array",
      });
    }
    const project = await db("website_builder.projects")
      .where("id", projectId)
      .first();
    if (!project) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    const queue = getWbQueue("post-import");
    const job = await queue.add(
      "import-from-identity",
      {
        projectId,
        postType,
        entries,
        overwrite: !!overwrite,
      },
      {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 25 },
      },
    );

    return res.status(202).json({
      success: true,
      data: { jobId: job.id, total: entries.length },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error starting post import:", error);
    return res.status(500).json({
      success: false,
      error: "ENQUEUE_ERROR",
      message: error?.message || "Failed to start import",
    });
  }
}

/**
 * GET /:projectId/posts/import/:jobId — return live progress + final results.
 *
 * Response shape:
 *   { state: "waiting"|"active"|"completed"|"failed"|"unknown",
 *     progress: { total, completed, results }, summary?: ImportResultSummary }
 */
export async function getPostImportStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "jobId is required",
      });
    }
    const queue = getWbQueue("post-import");
    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Job not found (it may have been pruned).",
      });
    }
    const state = await job.getState();
    const progress = (job.progress as unknown) || {
      total: 0,
      completed: 0,
      results: [],
    };
    const summary = job.returnvalue ?? null;
    const failedReason = (job as any).failedReason || null;

    return res.json({
      success: true,
      data: {
        jobId: job.id,
        state,
        progress,
        summary,
        failedReason,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error fetching post import status:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch import status",
    });
  }
}

// =====================================================================
// LOCATIONS — F3 manage `identity.locations[]` + `selected_place_ids`
// =====================================================================
//
// All four handlers below are appended for plan
// `plans/04182026-no-ticket-identity-enrichments-and-post-imports/spec.md`
// task F3. They share a small set of helpers kept local to this section so
// existing handlers above are not modified.
//
// Reference implementation: `service.identity-warmup.ts:475` (`buildLocationEntryFromGbp`)
// and `:433` (`buildBusinessFromGbp`). Those helpers are not exported so we
// inline-construct the same shape here. `scrapeGbp` is the canonical Apify
// caller, reused.

import { scrapeGbp as locationsScrapeGbp } from "./feature-utils/util.gbp-scraper";

interface LocationsIdentityLocation {
  id?: string;
  source?: "gbp" | "manual";
  place_id: string | null;
  name: string;
  address: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  website_url: string | null;
  hours: unknown;
  last_synced_at: string;
  is_primary: boolean;
  warmup_status: "ready" | "failed" | "pending";
  warmup_error?: string;
  stale?: boolean;
}

function buildLocationEntryFromGbpLocal(
  placeId: string,
  gbpData: any,
  isPrimary: boolean,
): LocationsIdentityLocation {
  const g = gbpData || {};
  return {
    id: placeId,
    source: "gbp",
    place_id: placeId,
    name: g.title || g.name || "",
    address: g.address || null,
    city: g.city || null,
    state: g.state || null,
    zip: g.postalCode || null,
    phone: g.phone || null,
    rating: (g.totalScore ?? g.rating ?? null) as number | null,
    review_count: (g.reviewsCount ?? g.reviewCount ?? null) as number | null,
    category: g.categoryName || g.category || null,
    website_url: g.website || null,
    hours: g.openingHours || null,
    last_synced_at: new Date().toISOString(),
    is_primary: isPrimary,
    warmup_status: "ready",
  };
}

function buildBusinessFromGbpLocal(gbpData: any, fallbackPlaceId: string): any {
  const g = gbpData || {};
  return {
    name: g.title || g.name || null,
    category: g.categoryName || g.category || null,
    phone: g.phone || null,
    address: g.address || null,
    city: g.city || null,
    state: g.state || null,
    zip: g.postalCode || null,
    hours: g.openingHours || null,
    rating: g.totalScore ?? g.rating ?? null,
    review_count: g.reviewsCount ?? g.reviewCount ?? null,
    website_url: g.website || null,
    place_id: fallbackPlaceId || g.placeId || null,
  };
}

/** POST /:id/locations — Append a new location, scrape it, write into identity. */
export async function addProjectLocation(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const placeId = (req.body?.place_id || req.body?.placeId || "").toString().trim();

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "place_id is required",
      });
    }

    const project = await db("website_builder.projects")
      .where("id", id)
      .select(
        "id",
        "project_identity",
        "selected_place_ids",
        "selected_place_id",
        "primary_place_id",
      )
      .first();

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    const existingIds: string[] = Array.isArray(project.selected_place_ids)
      ? (project.selected_place_ids as string[])
      : [];

    if (existingIds.includes(placeId)) {
      // Already attached — surface a 409 with the current locations array so
      // the UI can refresh without a confusing silent-success.
      const identity = parseIdentityJson(project.project_identity) || {};
      return res.status(409).json({
        success: false,
        error: "DUPLICATE_LOCATION",
        message: "This location is already attached to the project.",
        data: { locations: Array.isArray(identity.locations) ? identity.locations : [] },
      });
    }

    // Hard cap per spec — 20 locations per project.
    if (existingIds.length >= 20) {
      return res.status(409).json({
        success: false,
        error: "LIMIT_EXCEEDED",
        message: "Maximum of 20 locations per project.",
      });
    }

    // Scrape the new location now (synchronously) so the UI can render the
    // entry immediately. Failures still write a stale entry instead of 5xx-ing,
    // matching the multi-location warmup behavior in F2.
    let scraped: any = null;
    let scrapeError: string | null = null;
    try {
      scraped = await locationsScrapeGbp(placeId);
    } catch (err: any) {
      scrapeError = err?.message || "Apify scrape failed";
      console.warn(
        `[Admin Websites] addProjectLocation: scrape failed for ${placeId}: ${scrapeError}`,
      );
    }

    const identity = parseIdentityJson(project.project_identity) || { version: 1 };
    const locations: LocationsIdentityLocation[] = Array.isArray(identity.locations)
      ? identity.locations
      : [];

    // Brand-new location is never primary by default — admins flip it
    // explicitly via PATCH /locations/primary.
    const newEntry: LocationsIdentityLocation = scraped
      ? buildLocationEntryFromGbpLocal(placeId, scraped, false)
      : {
          id: placeId,
          source: "gbp",
          place_id: placeId,
          name: "",
          address: null,
          city: null,
          state: null,
          zip: null,
          phone: null,
          rating: null,
          review_count: null,
          category: null,
          website_url: null,
          hours: null,
          last_synced_at: new Date().toISOString(),
          is_primary: false,
          warmup_status: "failed",
          warmup_error: scrapeError || "Unknown Apify error",
          stale: true,
        };

    const updatedLocations = [...locations, newEntry];
    identity.locations = updatedLocations;
    identity.last_updated_at = new Date().toISOString();

    const updatedSelectedIds = [...existingIds, placeId];

    await db.transaction(async (trx) => {
      await ProjectIdentityModel.updateByProjectId(id, identity, {}, trx);
      await trx("website_builder.projects").where("id", id).update({
        selected_place_ids: updatedSelectedIds,
        updated_at: db.fn.now(),
      });
    });

    return res.json({
      success: true,
      data: {
        locations: updatedLocations,
        added: newEntry,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error adding location:", error);
    return res.status(500).json({
      success: false,
      error: "ADD_LOCATION_ERROR",
      message: error?.message || "Failed to add location",
    });
  }
}

/** PATCH /:id/locations/primary — Switch the project's primary location. */
export async function setPrimaryLocation(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const placeId = (req.body?.place_id || req.body?.placeId || "").toString().trim();

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "place_id is required",
      });
    }

    const project = await db("website_builder.projects")
      .where("id", id)
      .select("id", "project_identity", "selected_place_ids", "primary_place_id")
      .first();

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    const existingIds: string[] = Array.isArray(project.selected_place_ids)
      ? (project.selected_place_ids as string[])
      : [];

    if (!existingIds.includes(placeId)) {
      return res.status(404).json({
        success: false,
        error: "LOCATION_NOT_FOUND",
        message: "place_id is not attached to this project.",
      });
    }

    const identity = parseIdentityJson(project.project_identity) || { version: 1 };
    const locations: LocationsIdentityLocation[] = Array.isArray(identity.locations)
      ? identity.locations
      : [];

    const newPrimary = locations.find((l) => l.place_id === placeId);
    if (!newPrimary) {
      // place_id is in selected_place_ids but missing from identity.locations[].
      // This is an inconsistent state; we refuse rather than silently rebuilding.
      return res.status(409).json({
        success: false,
        error: "INCONSISTENT_STATE",
        message:
          "Location is attached but missing from identity.locations[]. Re-sync the location first.",
      });
    }

    const updatedLocations = locations.map((l) => ({
      ...l,
      is_primary: l.place_id === placeId,
    }));

    // Rewrite identity.business from the new primary's structured fields so
    // all existing consumers of `identity.business` (prompts, slot prefill,
    // generators) immediately reflect the switch without any refactor.
    const rewrittenBusiness = {
      name: newPrimary.name || null,
      category: newPrimary.category || null,
      phone: newPrimary.phone || null,
      address: newPrimary.address || null,
      city: (identity.business && (identity.business as any).city) || null,
      state: (identity.business && (identity.business as any).state) || null,
      zip: (identity.business && (identity.business as any).zip) || null,
      hours: newPrimary.hours ?? null,
      rating: newPrimary.rating ?? null,
      review_count: newPrimary.review_count ?? null,
      website_url: newPrimary.website_url ?? null,
      place_id: newPrimary.place_id,
    };

    identity.locations = updatedLocations;
    identity.business = rewrittenBusiness;
    identity.last_updated_at = new Date().toISOString();

    await db.transaction(async (trx) => {
      await ProjectIdentityModel.updateByProjectId(id, identity, {}, trx);
      await trx("website_builder.projects").where("id", id).update({
        primary_place_id: placeId,
        // Keep the legacy convenience pointer in sync (back-compat with consumers
        // that still read `selected_place_id`).
        selected_place_id: placeId,
        updated_at: db.fn.now(),
      });
    });

    return res.json({
      success: true,
      data: {
        identity,
        primary_place_id: placeId,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error setting primary location:", error);
    return res.status(500).json({
      success: false,
      error: "SET_PRIMARY_ERROR",
      message: error?.message || "Failed to set primary location",
    });
  }
}

/** DELETE /:id/locations/:place_id — Remove a non-primary location. */
export async function removeProjectLocation(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id, place_id: rawPlaceId } = req.params;
    const placeId = (rawPlaceId || "").toString().trim();

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "place_id path param is required",
      });
    }

    const project = await db("website_builder.projects")
      .where("id", id)
      .select(
        "id",
        "project_identity",
        "selected_place_ids",
        "selected_place_id",
        "primary_place_id",
      )
      .first();

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    if (project.primary_place_id === placeId) {
      return res.status(409).json({
        success: false,
        error: "CANNOT_REMOVE_PRIMARY",
        message:
          "Cannot remove the primary location. Set another location as primary first.",
      });
    }

    const existingIds: string[] = Array.isArray(project.selected_place_ids)
      ? (project.selected_place_ids as string[])
      : [];

    const identity = parseIdentityJson(project.project_identity) || { version: 1 };
    const locations: LocationsIdentityLocation[] = Array.isArray(identity.locations)
      ? identity.locations
      : [];

    const updatedLocations = locations.filter((l) => l.place_id !== placeId);
    const updatedSelectedIds = existingIds.filter((p) => p !== placeId);

    identity.locations = updatedLocations;
    identity.last_updated_at = new Date().toISOString();

    await db.transaction(async (trx) => {
      await ProjectIdentityModel.updateByProjectId(id, identity, {}, trx);
      await trx("website_builder.projects").where("id", id).update({
        selected_place_ids: updatedSelectedIds,
        updated_at: db.fn.now(),
      });
    });

    return res.json({
      success: true,
      data: {
        locations: updatedLocations,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error removing location:", error);
    return res.status(500).json({
      success: false,
      error: "REMOVE_LOCATION_ERROR",
      message: error?.message || "Failed to remove location",
    });
  }
}

/** POST /:id/locations/:place_id/resync — Re-scrape a single location. */
export async function resyncProjectLocation(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id, place_id: rawPlaceId } = req.params;
    const placeId = (rawPlaceId || "").toString().trim();

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "place_id path param is required",
      });
    }

    const project = await db("website_builder.projects")
      .where("id", id)
      .select("id", "project_identity", "selected_place_ids", "primary_place_id")
      .first();

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    const existingIds: string[] = Array.isArray(project.selected_place_ids)
      ? (project.selected_place_ids as string[])
      : [];

    if (!existingIds.includes(placeId)) {
      return res.status(404).json({
        success: false,
        error: "LOCATION_NOT_FOUND",
        message: "place_id is not attached to this project.",
      });
    }

    const identity = parseIdentityJson(project.project_identity) || { version: 1 };
    const locations: LocationsIdentityLocation[] = Array.isArray(identity.locations)
      ? identity.locations
      : [];

    const wasPrimary = project.primary_place_id === placeId;

    let scraped: any = null;
    let scrapeError: string | null = null;
    try {
      scraped = await locationsScrapeGbp(placeId);
    } catch (err: any) {
      scrapeError = err?.message || "Apify scrape failed";
      console.warn(
        `[Admin Websites] resyncProjectLocation: scrape failed for ${placeId}: ${scrapeError}`,
      );
    }

    const updatedEntry: LocationsIdentityLocation = scraped
      ? buildLocationEntryFromGbpLocal(placeId, scraped, wasPrimary)
      : {
          id: placeId,
          source: "gbp",
          place_id: placeId,
          name: "",
          address: null,
          city: null,
          state: null,
          zip: null,
          phone: null,
          rating: null,
          review_count: null,
          category: null,
          website_url: null,
          hours: null,
          last_synced_at: new Date().toISOString(),
          is_primary: wasPrimary,
          warmup_status: "failed",
          warmup_error: scrapeError || "Unknown Apify error",
          stale: true,
        };

    // Replace just this entry, preserve order.
    const idx = locations.findIndex((l) => l.place_id === placeId);
    const updatedLocations =
      idx === -1 ? [...locations, updatedEntry] : locations.map((l, i) => (i === idx ? updatedEntry : l));

    identity.locations = updatedLocations;

    // If we re-synced the primary AND the scrape succeeded, refresh
    // identity.business too so admins don't see stale primary data.
    if (wasPrimary && scraped) {
      identity.business = buildBusinessFromGbpLocal(scraped, placeId);
    }

    identity.last_updated_at = new Date().toISOString();

    await ProjectIdentityModel.updateByProjectId(id, identity);

    return res.json({
      success: true,
      data: {
        location: updatedEntry,
        locations: updatedLocations,
      },
    });
  } catch (error: any) {
    console.error("[Admin Websites] Error re-syncing location:", error);
    return res.status(500).json({
      success: false,
      error: "RESYNC_LOCATION_ERROR",
      message: error?.message || "Failed to re-sync location",
    });
  }
}

// =====================================================================
// IDENTITY — slice PATCH
// =====================================================================
//
// `PATCH /:id/identity/slice` — surgical edit for a single allow-listed
// section of `project_identity`. Replaces the slice wholesale (no deep merge)
// after per-slice Zod validation.
//
// See `plans/04202026-no-ticket-identity-modal-cleanup-and-crud/spec.md` T3.

const doctorSliceSchema = z
  .object({
    name: z.string().min(1),
    source_url: z.string().nullable().optional(),
    short_blurb: z.string().nullable().optional(),
    credentials: z.array(z.string()).nullable().optional(),
    location_place_ids: z.array(z.string()).nullable().optional(),
    last_synced_at: z.string().nullable().optional(),
    stale: z.boolean().optional(),
  })
  .strict();

const serviceSliceSchema = z
  .object({
    name: z.string().min(1),
    source_url: z.string().nullable().optional(),
    short_blurb: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    location_place_ids: z.array(z.string()).nullable().optional(),
    last_synced_at: z.string().nullable().optional(),
    stale: z.boolean().optional(),
  })
  .strict();

const looseObject = z.record(z.string(), z.unknown());

const IDENTITY_SLICE_VALIDATORS: Record<string, z.ZodTypeAny> = {
  "content_essentials.doctors": z.array(doctorSliceSchema),
  "content_essentials.services": z.array(serviceSliceSchema),
  "content_essentials.featured_testimonials": z.array(z.unknown()),
  "content_essentials.core_values": z.array(z.unknown()),
  "content_essentials.certifications": z.array(z.unknown()),
  "content_essentials.service_areas": z.array(z.unknown()),
  "content_essentials.social_links": z.array(z.unknown()),
  "content_essentials.unique_value_proposition": z
    .union([z.string(), z.null()]),
  "content_essentials.founding_story": z.union([z.string(), z.null()]),
  "content_essentials.review_themes": z.array(z.unknown()),
  locations: z.array(z.unknown()),
  brand: looseObject,
  voice_and_tone: looseObject,
};

/** Deep-set a value at a dotted path in `target`, mutating intermediates. */
function setAtPath(target: any, dottedPath: string, value: unknown): void {
  const keys = dottedPath.split(".");
  let cursor = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (
      cursor[key] === null ||
      cursor[key] === undefined ||
      typeof cursor[key] !== "object"
    ) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

/** PATCH /:id/identity/slice — Surgical per-slice edit with Zod validation. */
export async function patchIdentitySlice(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { path: slicePath, value } = req.body || {};

    if (!slicePath || typeof slicePath !== "string") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "path string required",
      });
    }

    const validator = IDENTITY_SLICE_VALIDATORS[slicePath];
    if (!validator) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PATH",
        message: `path "${slicePath}" is not in the slice allow-list`,
      });
    }

    const parsed = validator.safeParse(value);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "INVALID_SHAPE",
        message: `value does not match the expected shape for "${slicePath}"`,
        details: parsed.error.issues,
      });
    }

    const { exists, identity } =
      await ProjectIdentityModel.findEnvelopeByProjectId(id);

    if (!exists) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    const nextIdentity = identity || { version: 1 };

    setAtPath(nextIdentity, slicePath, parsed.data);

    await ProjectIdentityModel.updateByProjectId(
      id,
      nextIdentity,
      { mirrorBrand: slicePath === "brand" },
    );

    return res.json({ success: true, data: nextIdentity });
  } catch (error: any) {
    console.error("[Admin Websites] Error patching identity slice:", error);
    return res.status(500).json({
      success: false,
      error: "PATCH_SLICE_ERROR",
      message: error?.message || "Failed to patch identity slice",
    });
  }
}
