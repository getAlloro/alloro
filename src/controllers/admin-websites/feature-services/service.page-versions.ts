/**
 * Page Versions Service
 *
 * Admin-side version history for the page editor: list versions at a page's
 * path, fetch a single version's content, and restore a version's content
 * into the current draft (never auto-publishes — the user reviews in the
 * editor and publishes deliberately).
 */

import { db } from "../../../database/connection";
import { snapshotPageStateIfChanged } from "../../../utils/website-utils/pageSnapshots";
import { normalizeSections } from "../feature-utils/util.section-normalizer";

const PAGES_TABLE = "website_builder.pages";

type ServiceError = { status: number; code: string; message: string };

// ---------------------------------------------------------------------------
// List versions at the page's path
// ---------------------------------------------------------------------------

export async function listPageVersions(
  projectId: string,
  pageId: string
): Promise<{ versions: any[]; path?: string; error?: ServiceError }> {
  const page = await db(PAGES_TABLE)
    .where({ id: pageId, project_id: projectId })
    .first();

  if (!page) {
    return {
      versions: [],
      error: { status: 404, code: "NOT_FOUND", message: "Page not found" },
    };
  }

  const versions = await db(PAGES_TABLE)
    .where({ project_id: projectId, path: page.path })
    .orderBy("version", "desc")
    .select(
      "id",
      "version",
      "status",
      "created_at",
      "updated_at",
      "change_source",
      "revision_note"
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
  const version = await db(PAGES_TABLE)
    .where({ id: versionId, project_id: projectId })
    .first();

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
  console.log(
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

  const draft = await db(PAGES_TABLE)
    .where({ project_id: projectId, path: targetVersion.path, status: "draft" })
    .first();

  // No draft at this path — create one carrying the restored content.
  if (!draft) {
    const latestPage = await db(PAGES_TABLE)
      .where({ project_id: projectId, path: targetVersion.path })
      .orderBy("version", "desc")
      .first();

    const [createdDraft] = await db(PAGES_TABLE)
      .insert({
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
      })
      .returning("*");

    console.log(
      `[Admin Websites] ✓ Restored version ${targetVersion.version} into new draft ID: ${createdDraft.id}`
    );
    return { page: createdDraft };
  }

  // Preserve the draft's current state as history before overwriting it.
  await snapshotPageStateIfChanged(draft);

  const [updatedDraft] = await db(PAGES_TABLE)
    .where("id", draft.id)
    .update({
      sections: restoredSections,
      seo_data: restoredSeoData,
      change_source: "restore",
      revision_note: null,
      updated_at: db.fn.now(),
    })
    .returning("*");

  console.log(
    `[Admin Websites] ✓ Restored version ${targetVersion.version} into draft ID: ${draft.id}`
  );

  return { page: updatedDraft };
}
