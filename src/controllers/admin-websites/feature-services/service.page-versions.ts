/**
 * Page Versions Service
 *
 * Admin-side version history for the page editor: list versions at a page's
 * path, fetch a single version's content, and restore a version's content
 * into the current draft (never auto-publishes — the user reviews in the
 * editor and publishes deliberately).
 */

import { PageModel } from "../../../models/website-builder/PageModel";
import { snapshotPageStateIfChanged } from "../../../utils/website-utils/pageSnapshots";
import { normalizeSections } from "../feature-utils/util.section-normalizer";
import logger from "../../../lib/logger";

type ServiceError = { status: number; code: string; message: string };

// ---------------------------------------------------------------------------
// List versions at the page's path
// ---------------------------------------------------------------------------

export async function listPageVersions(
  projectId: string,
  pageId: string
): Promise<{ versions: any[]; path?: string; error?: ServiceError }> {
  const page = await PageModel.findRawByIdAndProject(pageId, projectId);

  if (!page) {
    return {
      versions: [],
      error: { status: 404, code: "NOT_FOUND", message: "Page not found" },
    };
  }

  const versions = await PageModel.listVersionsByProjectAndPath(
    projectId,
    page.path
  );

  return { versions, path: page.path };
}

// ---------------------------------------------------------------------------
// Single version content
// ---------------------------------------------------------------------------

export async function getPageVersionContent(
  projectId: string,
  versionId: string
): Promise<{ version: any; error?: ServiceError }> {
  const version = await PageModel.findVersionByIdAndProject(versionId, projectId);

  if (!version) {
    return {
      version: null,
      error: { status: 404, code: "NOT_FOUND", message: "Version not found" },
    };
  }

  return { version };
}

// ---------------------------------------------------------------------------
// Restore a version's content into the current draft
// ---------------------------------------------------------------------------

export async function restoreVersionIntoDraft(
  projectId: string,
  pageId: string,
  versionId: string
): Promise<{ page: any; error?: ServiceError }> {
  logger.info(
    `[Admin Websites] Restoring version ${versionId} into draft for project ID: ${projectId}`
  );

  const { version: targetVersion, error: versionError } =
    await getPageVersionContent(projectId, versionId);

  if (versionError) {
    return { page: null, error: versionError };
  }

  if (targetVersion.page_type === "artifact") {
    return {
      page: null,
      error: {
        status: 400,
        code: "INVALID_TYPE",
        message: "Artifact pages cannot be restored from version history",
      },
    };
  }

  const restoredSections = JSON.stringify(
    normalizeSections(targetVersion.sections)
  );
  const restoredSeoData = targetVersion.seo_data
    ? JSON.stringify(
        typeof targetVersion.seo_data === "string"
          ? JSON.parse(targetVersion.seo_data)
          : targetVersion.seo_data
      )
    : null;

  const draft = await PageModel.findRawByProjectPathStatus(
    projectId,
    targetVersion.path,
    "draft"
  );

  // No draft at this path — create one carrying the restored content.
  if (!draft) {
    const latestPage = await PageModel.findLatestByProjectAndPath(
      projectId,
      targetVersion.path
    );

    const createdDraft = await PageModel.insertReturning({
      project_id: projectId,
      path: targetVersion.path,
      version: latestPage ? latestPage.version + 1 : 1,
      status: "draft",
      sections: restoredSections,
      seo_data: restoredSeoData,
      display_name: targetVersion.display_name || null,
      template_page_id: targetVersion.template_page_id || null,
      generation_status: "ready",
      change_source: "restore",
    });

    logger.info(
      `[Admin Websites] ✓ Restored version ${targetVersion.version} into new draft ID: ${createdDraft.id}`
    );
    return { page: createdDraft };
  }

  // Preserve the draft's current state as history before overwriting it.
  await snapshotPageStateIfChanged(draft);

  const updatedDraft = await PageModel.updateRestoredDraftReturning(
    draft.id,
    restoredSections,
    restoredSeoData
  );

  logger.info(
    `[Admin Websites] ✓ Restored version ${targetVersion.version} into draft ID: ${draft.id}`
  );

  return { page: updatedDraft };
}
