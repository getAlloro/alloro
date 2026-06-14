/**
 * Admin Websites — Pages Controller
 *
 * Project page CRUD, artifact upload/replace, publish, page versions
 * (list/content/restore), delete-by-path, drafts, component/layout inline
 * editing, and display-name update.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as pageEditor from "./feature-services/service.page-editor";
import * as pageVersions from "./feature-services/service.page-versions";
import * as artifactUpload from "./feature-services/service.artifact-upload";
import logger from "../../lib/logger";

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
    logger.error({ err: error }, "[Admin Websites] Error fetching pages:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch pages",
    });
  }
}

/** POST /:id/pages — Create page version */

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
    logger.error({ err: error }, "[Admin Websites] Error creating page:");
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create page",
    });
  }
}

/** POST /:id/pages/artifact — Upload artifact page (React app build) */

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
    logger.error({ err: error }, "[Admin Websites] Error uploading artifact page:");
    return res.status(500).json({
      success: false,
      error: "ARTIFACT_UPLOAD_ERROR",
      message: error?.message || "Failed to upload artifact page",
    });
  }
}

/** PUT /:id/pages/:pageId/artifact — Replace artifact page build */

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
    logger.error({ err: error }, "[Admin Websites] Error replacing artifact build:");
    return res.status(500).json({
      success: false,
      error: "ARTIFACT_REPLACE_ERROR",
      message: error?.message || "Failed to replace artifact build",
    });
  }
}

/** POST /:id/pages/:pageId/publish — Publish a page */

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
    logger.error({ err: error }, "[Admin Websites] Error publishing page:");
    return res.status(500).json({
      success: false,
      error: "PUBLISH_ERROR",
      message: error?.message || "Failed to publish page",
    });
  }
}

/** GET /:id/pages/:pageId — Get single page */

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
    logger.error({ err: error }, "[Admin Websites] Error fetching page:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch page",
    });
  }
}

/** PATCH /:id/pages/:pageId — Update draft page */

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
    logger.error({ err: error }, "[Admin Websites] Error updating page:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update page",
    });
  }
}

/** GET /:id/pages/:pageId/versions — List versions at the page's path */

/** GET /:id/pages/:pageId/versions — List versions at the page's path */
export async function listPageVersions(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId } = req.params;
    const { versions, path, error } = await pageVersions.listPageVersions(
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

    return res.json({
      success: true,
      data: { versions, path },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing page versions:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to list page versions",
    });
  }
}

/** GET /:id/pages/:pageId/versions/:versionId — Get version content */

/** GET /:id/pages/:pageId/versions/:versionId — Get version content */
export async function getPageVersionContent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, versionId } = req.params;
    const { version, error } = await pageVersions.getPageVersionContent(
      id,
      versionId
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
      data: version,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching page version:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch page version",
    });
  }
}

/** POST /:id/pages/:pageId/versions/:versionId/restore — Restore into draft */

/** POST /:id/pages/:pageId/versions/:versionId/restore — Restore into draft */
export async function restorePageVersion(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id, pageId, versionId } = req.params;
    const { page, error } = await pageVersions.restoreVersionIntoDraft(
      id,
      pageId,
      versionId
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
    logger.error({ err: error }, "[Admin Websites] Error restoring page version:");
    return res.status(500).json({
      success: false,
      error: "RESTORE_ERROR",
      message: error?.message || "Failed to restore page version",
    });
  }
}

/** DELETE /:id/pages/by-path — Delete all versions at path */

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
    logger.error({ err: error }, "[Admin Websites] Error deleting page by path:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete page",
    });
  }
}

/** DELETE /:id/pages/:pageId — Delete a page version */

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
    logger.error({ err: error }, "[Admin Websites] Error deleting page:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete page version",
    });
  }
}

/** POST /:id/pages/:pageId/create-draft — Clone published to draft */

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
    logger.error({ err: error }, "[Admin Websites] Error creating draft:");
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create draft",
    });
  }
}

/** POST /:id/pages/:pageId/edit — AI edit page component */

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
    logger.error({ err: error }, "[Admin Websites] Error editing page component:");
    return res.status(500).json({
      success: false,
      error: "EDIT_ERROR",
      message: error?.message || "Failed to edit component",
    });
  }
}

/** POST /:id/edit-layout — AI edit layout component */

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
    logger.error({ err: error }, "[Admin Websites] Error editing layout component:");
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
    logger.error({ err: error }, "[Admin Websites] Error updating display name:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

// =====================================================================
// AI COMMAND
// =====================================================================

/** POST /:id/ai-command — Create a new AI command batch and start analysis */
