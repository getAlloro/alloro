/**
 * User Website Controller
 *
 * Handles HTTP request/response for user-facing website operations.
 * Delegates business logic to userWebsite.service.
 *
 * Endpoints:
 * - GET  / → getUserWebsite (DFY tier website data)
 * - GET  /media → listMedia (DFY tier website media)
 * - POST /media → uploadMedia (DFY tier website media upload)
 * - POST /pages/:pageId/edit → editPageComponent (AI page edit)
 */

import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import * as userWebsiteService from "./user-website-services/userWebsite.service";
import * as analyticsService from "./user-website-services/websiteAnalytics.service";
import * as contentService from "./user-website-services/websiteContent.service";
import * as customDomainService from "../admin-websites/feature-services/service.custom-domain";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { handleError, handleGscError } from "./user-website-utils/responses";
import logger from "../../lib/logger";

// Post, taxonomy, and menu handlers live in sibling modules to keep this
// controller under the size ceiling. Re-exported so the route file's
// `import * as controller` surface stays identical.
export {
  listPosts,
  createUserPost,
  getPost,
  updateUserPost,
  deleteUserPost,
  listPostTypes,
  listCategories,
  createUserCategory,
  listTags,
  createUserTag,
  updateUserPostSeo,
} from "./postHandlers";
export {
  listUserMenus,
  createUserMenu,
  getUserMenu,
  updateUserMenu,
  deleteUserMenu,
  createUserMenuItem,
  updateUserMenuItem,
  deleteUserMenuItem,
  reorderUserMenuItems,
} from "./menuHandlers";
export {
  getRecipients,
  updateRecipients,
  listFormCatalog,
  updateFormRecipientRule,
  updateFormPreferences,
  getFormSubmissionStats,
  getWebsiteAnalytics,
  getFormSubmissionsTimeseries,
  markAllFormSubmissionsRead,
  listFormSubmissions,
  getFormSubmission,
  toggleFormSubmissionRead,
  deleteFormSubmission,
  exportFormSubmissions,
} from "./formSubmissionHandlers";

// =====================================================================
// GET /api/user/website — Fetch user's organization website
// =====================================================================

export async function getUserWebsite(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;

    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const data = await userWebsiteService.fetchUserWebsiteData(orgId);

    // PREPARING state — project not yet created
    if (data.preparing) {
      return res.json({
        status: data.status,
        message: data.message,
      });
    }

    return res.json({
      project: data.project,
      pages: data.pages,
      media: data.media,
      usage: data.usage,
    });
  } catch (error) {
    return handleError(res, error, "Fetch user website");
  }
}

// =====================================================================
// GET /api/user/website/media — List user's website media
// =====================================================================

export async function listMedia(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const { type, search, page = "1", limit = "50" } = req.query;
    const result = await userWebsiteService.listMediaForOrg(orgId, {
      type: type as string | undefined,
      search: search as string | undefined,
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
    });

    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      quota: result.quota,
    });
  } catch (error) {
    return handleError(res, error, "List website media");
  }
}

// =====================================================================
// POST /api/user/website/media — Upload media for user's website
// =====================================================================

export async function uploadMedia(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const files = req.files as Express.Multer.File[];
    const result = await userWebsiteService.uploadMediaForOrg(orgId, files);

    return res.status(201).json({
      success: true,
      data: result.succeeded,
      failed: result.failed.length > 0 ? result.failed : undefined,
      quota: result.quota,
    });
  } catch (error: any) {
    if (error.statusCode && error.errorCode) {
      const body: Record<string, unknown> = {
        success: false,
        error: error.errorCode,
        message: error.message,
      };
      if (error.quota) {
        body.quota = error.quota;
      }
      return res.status(error.statusCode).json(body);
    }

    return handleError(res, error, "Upload website media");
  }
}

// =====================================================================
// POST /api/user/website/pages/:pageId/edit — AI page component edit
// =====================================================================

export async function editPageComponent(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const { pageId } = req.params;
    const { alloroClass, currentHtml, instruction, chatHistory = [] } =
      req.body;
    const userId = req.userId || 0;
    const orgId = req.organizationId;

    // Input validation
    if (!alloroClass || !currentHtml || !instruction) {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "alloroClass, currentHtml, and instruction are required",
      });
    }

    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const result = await userWebsiteService.editPageComponent({
      orgId,
      userId,
      pageId,
      alloroClass,
      currentHtml,
      instruction,
      chatHistory,
    });

    return res.json({
      success: result.success,
      editedHtml: result.editedHtml,
      message: result.message,
      rejected: result.rejected,
      edits_remaining: result.edits_remaining,
    });
  } catch (error: any) {
    // Rate limit errors need specific response shape
    if (error.errorCode === "RATE_LIMIT_EXCEEDED") {
      return res.status(429).json({
        error: "RATE_LIMIT_EXCEEDED",
        message: error.message,
        limit: error.limit,
        reset_at: error.reset_at,
      });
    }

    // READ_ONLY errors
    if (error.errorCode === "READ_ONLY") {
      return res.status(403).json({
        error: "READ_ONLY",
        message: error.message,
      });
    }

    // DFY_TIER_REQUIRED
    if (error.errorCode === "DFY_TIER_REQUIRED") {
      return res.status(403).json({ error: "DFY_TIER_REQUIRED" });
    }

    // 404 errors (website not found, page not found)
    if (error.statusCode === 404) {
      return res.status(404).json({ error: error.message });
    }

    // Generic edit error — matches original error shape exactly
    logger.error({ err: error }, "[User/Website] Error editing page component:");
    return res.status(500).json({
      error: "EDIT_ERROR",
      message: error?.message || "Failed to edit component",
    });
  }
}

// =====================================================================
// Custom Domain — helpers
// =====================================================================

async function getProjectIdForOrg(orgId: number): Promise<string | null> {
  return contentService.resolveProjectId(orgId);
}

/** Resolve projectId + templateId from orgId (used by resolve-preview). */
async function getProjectAndTemplate(orgId: number) {
  return contentService.resolveProjectIds(orgId);
}

// =====================================================================
// Google Search Console integration
// =====================================================================

/** GET /api/user/website/gsc */
export async function getGscIntegration(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const data = await userWebsiteService.getGscIntegration(orgId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleGscError(res, error, "Fetch Search Console integration");
  }
}

/** GET /api/user/website/gsc/connections */
export async function listGscConnections(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const data = await userWebsiteService.listGscConnections(orgId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleGscError(res, error, "List Search Console connections");
  }
}

/** GET /api/user/website/gsc/sites?connectionId=123 */
export async function listGscSites(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const connectionId = Number(req.query.connectionId);
    if (!Number.isInteger(connectionId) || connectionId <= 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "connectionId is required",
      });
    }

    const data = await userWebsiteService.listGscSites(orgId, connectionId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleGscError(res, error, "List Search Console sites");
  }
}

/** POST /api/user/website/gsc */
export async function saveGscIntegration(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const connectionId = Number(req.body?.connectionId);
    const siteUrl = typeof req.body?.siteUrl === "string" ? req.body.siteUrl : "";

    if (!Number.isInteger(connectionId) || connectionId <= 0 || !siteUrl.trim()) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "connectionId and siteUrl are required",
      });
    }

    const data = await userWebsiteService.saveGscIntegration(
      orgId,
      connectionId,
      siteUrl,
    );
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleGscError(res, error, "Save Search Console integration");
  }
}

/**
 * GET /api/user/website/gsc/performance?rangeDays=90
 *
 * Owner-facing Search Console performance. Auth-derived org context — no
 * projectId in the URL; the project is resolved from the org and the GSC
 * dashboard is computed by the shared admin service (read-only reuse). Mirrors
 * `getWebsiteAnalytics` (Rybbit). Returns `hasIntegration:false` with a null
 * dashboard when GSC isn't connected so the client can render an empty state.
 */
export async function getGscPerformance(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const result = await analyticsService.getGscPerformance(
      project.id,
      req.query.rangeDays
    );
    return res.json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Fetch Search Console performance");
  }
}

// =====================================================================
// POST /api/user/website/domain/connect
// =====================================================================

export async function connectDomain(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: "domain is required" });
    }

    const { data, error } = await customDomainService.connectDomain(projectId, domain);
    if (error) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Connect domain");
  }
}

// =====================================================================
// POST /api/user/website/domain/verify
// =====================================================================

export async function verifyDomain(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { data, error } = await customDomainService.verifyDomain(projectId);
    if (error) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Verify domain");
  }
}

// =====================================================================
// DELETE /api/user/website/domain/disconnect
// =====================================================================

export async function disconnectDomain(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { data, error } = await customDomainService.disconnectDomain(projectId);
    if (error) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Disconnect domain");
  }
}

// =====================================================================
// VERSION HISTORY
// =====================================================================

/** GET /api/user/website/pages/:pageId/versions */
export async function getPageVersions(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId)
      return res.status(400).json({ error: "No organization found" });

    const { pageId } = req.params;
    const result = await userWebsiteService.listPageVersions(orgId, pageId);

    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Fetch page versions");
  }
}

/** GET /api/user/website/pages/:pageId/versions/:versionId */
export async function getPageVersionContent(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId)
      return res.status(400).json({ error: "No organization found" });

    const { pageId, versionId } = req.params;
    const version = await userWebsiteService.getPageVersionContent(
      orgId,
      pageId,
      versionId
    );

    return res.json({ success: true, data: version });
  } catch (error) {
    return handleError(res, error, "Fetch page version content");
  }
}

/** POST /api/user/website/pages/:pageId/versions/:versionId/restore */
export async function restorePageVersion(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId)
      return res.status(400).json({ error: "No organization found" });

    const { pageId, versionId } = req.params;
    const result = await userWebsiteService.restorePageVersion(
      orgId,
      pageId,
      versionId
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Restore page version");
  }
}

// =====================================================================
// PATCH /api/user/website/pages/:pageId/save — Save page sections
// =====================================================================

export async function savePageSections(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { pageId } = req.params;
    const { sections, expected_updated_at, force } = req.body;
    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ error: "sections array is required" });
    }

    const result = await contentService.savePageSections({
      projectId,
      pageId,
      sections,
      expectedUpdatedAt: expected_updated_at,
      force,
    });

    if (result.ok) {
      return res.json({
        success: true,
        data: { updated_at: result.updated_at },
      });
    }

    switch (result.code) {
      case "PAGE_NOT_FOUND":
        return res.status(404).json({ error: "Page not found" });
      case "INVALID_STATUS":
        return res.status(400).json({
          error: "INVALID_STATUS",
          message: "Only the live page can be edited here.",
        });
      case "READ_ONLY":
        return res.status(403).json({
          error: "READ_ONLY",
          message:
            "Your website is in read-only mode. Please upgrade to continue editing.",
        });
      case "STALE_WRITE":
        return res.status(409).json({
          error: "STALE_WRITE",
          message:
            "This page changed since you loaded it. Review the latest version or save anyway.",
        });
    }
  } catch (error) {
    return handleError(res, error, "Save page sections");
  }
}

// =====================================================================
// RESOLVE PREVIEW (shortcodes → HTML)
// =====================================================================

/** POST /api/user/website/resolve-preview */
export async function resolvePreview(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const { html } = req.body;
    if (!html || typeof html !== "string") {
      return res.status(400).json({ error: "html string is required" });
    }

    const resolved = await contentService.resolvePreviewHtml(ids, html);
    return res.json({ html: resolved });
  } catch (error) {
    return handleError(res, error, "Resolve preview");
  }
}
