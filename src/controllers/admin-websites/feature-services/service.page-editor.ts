/**
 * Page Editor Service
 *
 * Business logic for page versioning workflow, draft/published lifecycle,
 * AI-powered component editing (Claude integration), and layout editing.
 */

import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { MediaModel } from "../../../models/website-builder/MediaModel";
import { normalizeSections } from "../feature-utils/util.section-normalizer";
import { snapshotPageStateIfChanged } from "../../../utils/website-utils/pageSnapshots";
import logger from "../../../lib/logger";

// ---------------------------------------------------------------------------
// List pages for a project
// ---------------------------------------------------------------------------

export async function listPages(
  projectId: string,
  pathFilter?: string
): Promise<any[]> {
  logger.info(`[Admin Websites] Fetching pages for project ID: ${projectId}`);

  const pages = await PageModel.findByProjectWithOptionalPath(
    projectId,
    pathFilter
  );

  logger.info(`[Admin Websites] Found ${pages.length} pages`);

  return pages;
}

// ---------------------------------------------------------------------------
// Create a new page version
// ---------------------------------------------------------------------------

export async function createPage(
  projectId: string,
  data: { path?: string; sections?: any; publish?: boolean; display_name?: string }
): Promise<{
  page: any;
  error?: { status: number; code: string; message: string };
}> {
  const { path = "/", sections = [], publish = false, display_name } = data;

  logger.info(
    `[Admin Websites] Creating page for project ID: ${projectId}, path: ${path}`
  );

  // Get latest version for this project+path
  const latestPage = await PageModel.findLatestByProjectAndPath(projectId, path);

  const newVersion = latestPage ? latestPage.version + 1 : 1;

  // Create new page — all writes in one transaction so a crash can never
  // leave the path with two published rows (insert-published landed but the
  // previous published was not yet retired).
  const insertData: Record<string, any> = {
    project_id: projectId,
    path,
    version: newVersion,
    status: publish ? "published" : "draft",
    sections: JSON.stringify(sections),
  };

  // Set generation_status to "ready" for blank pages (no pipeline)
  if (Array.isArray(sections) && sections.length === 0) {
    insertData.generation_status = "ready";
  }

  if (display_name) {
    insertData.display_name = display_name;
  }

  const page = await PageModel.createPageVersion({
    projectId,
    path,
    publish,
    insertData,
  });

  logger.info(
    `[Admin Websites] \u2713 Created page ID: ${page.id}, version: ${newVersion}`
  );

  return { page };
}

// ---------------------------------------------------------------------------
// Publish a page
// ---------------------------------------------------------------------------

export async function publishPage(
  projectId: string,
  pageId: string
): Promise<{
  page: any;
  error?: { status: number; code: string; message: string };
}> {
  logger.info(
    `[Admin Websites] Publishing page ID: ${pageId} for project ID: ${projectId}`
  );

  // Get the page \u2014 scoped to the project so a pageId from another project
  // can never be published through this route.
  const page = await PageModel.findRawByIdAndProject(pageId, projectId);

  if (!page) {
    return {
      page: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Page not found",
      },
    };
  }

  // Idempotent: re-publishing an already-published page is a success no-op
  // (a retry after a crashed/lost response must not transit it through
  // "inactive" or error out).
  if (page.status === "published") {
    return { page };
  }

  // Unpublish-then-publish atomically \u2014 a crash between the two statements
  // would otherwise leave the path with NO published row (page down on the
  // live site) until someone manually re-publishes.
  const publishedPage = await PageModel.publishPageVersion({
    pageId,
    projectId: page.project_id,
    path: page.path,
  });

  logger.info(`[Admin Websites] \u2713 Published page ID: ${pageId}`);

  return { page: publishedPage };
}

// ---------------------------------------------------------------------------
// Get single page
// ---------------------------------------------------------------------------

export async function getPageById(
  projectId: string,
  pageId: string
): Promise<any> {
  logger.info(
    `[Admin Websites] Fetching page ID: ${pageId} for project ID: ${projectId}`
  );

  const page = await PageModel.findRawByIdAndProject(pageId, projectId);

  return page || null;
}

// ---------------------------------------------------------------------------
// Update draft page sections/chat
// ---------------------------------------------------------------------------

export async function updatePage(
  projectId: string,
  pageId: string,
  data: {
    sections?: any;
    edit_chat_history?: any;
    revision_note?: string | null;
    expected_updated_at?: string;
    force?: boolean;
  }
): Promise<{
  page: any;
  error?: { status: number; code: string; message: string };
}> {
  const { sections, edit_chat_history } = data;

  if (!sections && edit_chat_history === undefined) {
    return {
      page: null,
      error: {
        status: 400,
        code: "INVALID_INPUT",
        message: "sections or edit_chat_history is required",
      },
    };
  }

  logger.info(
    `[Admin Websites] Updating page ID: ${pageId} for project ID: ${projectId}`
  );

  const page = await PageModel.findRawByIdAndProject(pageId, projectId);

  if (!page) {
    return {
      page: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Page not found",
      },
    };
  }

  if (page.status !== "draft") {
    return {
      page: null,
      error: {
        status: 400,
        code: "INVALID_STATUS",
        message: "Only draft pages can be edited",
      },
    };
  }

  // Optimistic concurrency: reject the write when the row changed since the
  // client loaded it, unless the client explicitly forces the overwrite.
  if (
    data.expected_updated_at &&
    !data.force &&
    new Date(page.updated_at).getTime() !==
      new Date(data.expected_updated_at).getTime()
  ) {
    return {
      page: null,
      error: {
        status: 409,
        code: "STALE_WRITE",
        message:
          "This page changed since you loaded it. Review the latest version or save anyway.",
      },
    };
  }

  // updated_at is stamped via the DB clock inside the model write (mirrors the
  // original updatePayload updated_at set to the DB-now timestamp).
  const updatePayload: Record<string, unknown> = {};

  if (sections) {
    // Preserve the draft's pre-save state as a restorable history entry
    // before overwriting it (deduped + pruned inside the helper).
    await snapshotPageStateIfChanged(page);
    // Keep the draft as the newest version. The snapshot above takes
    // max+1, so without this the live draft would carry a LOWER version
    // than its own archived history and sink below it in the History tab
    // (the "latest version is Archived" bug). Bumping the draft above the
    // snapshot keeps it pinned to the top as the current editable version.
    const newest = await PageModel.findLatestByProjectAndPath(
      page.project_id,
      page.path
    );
    updatePayload.version = (newest?.version ?? page.version) + 1;
    updatePayload.sections = JSON.stringify(sections);
    updatePayload.change_source = "save";
    updatePayload.revision_note =
      typeof data.revision_note === "string" && data.revision_note.trim()
        ? data.revision_note.trim().slice(0, 255)
        : null;
  }

  if (edit_chat_history !== undefined) {
    updatePayload.edit_chat_history = JSON.stringify(edit_chat_history);
  }

  // Atomic concurrency: the JS comparison above is check-then-act \u2014 two
  // writers can both pass it inside the same window. Make the write itself
  // conditional on the expected timestamp so exactly one wins. Matched as a
  // 1ms range because updated_at carries microsecond precision while the
  // client echoes the millisecond-truncated ISO string.
  const updatedPage = await PageModel.updateDraftWithConcurrencyGuard({
    pageId,
    updatePayload,
    expectedUpdatedAt:
      data.expected_updated_at && !data.force
        ? new Date(data.expected_updated_at)
        : undefined,
  });

  if (!updatedPage) {
    return {
      page: null,
      error: {
        status: 409,
        code: "STALE_WRITE",
        message:
          "This page changed since you loaded it. Review the latest version or save anyway.",
      },
    };
  }

  logger.info(`[Admin Websites] \u2713 Updated page ID: ${pageId}`);

  return { page: updatedPage };
}

// ---------------------------------------------------------------------------
// Delete all versions of a page at a given path
// ---------------------------------------------------------------------------

export async function deletePagesByPath(
  projectId: string,
  pagePath: string
): Promise<{
  deletedCount: number;
  error?: { status: number; code: string; message: string };
}> {
  logger.info(
    `[Admin Websites] Deleting all versions at path "${pagePath}" for project ID: ${projectId}`
  );

  const pages = await PageModel.findIdsByProjectAndPath(projectId, pagePath);

  if (pages.length === 0) {
    return {
      deletedCount: 0,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: `No pages found at path "${pagePath}"`,
      },
    };
  }

  const deletedCount = await PageModel.deleteByProjectAndPath(
    projectId,
    pagePath
  );

  logger.info(
    `[Admin Websites] \u2713 Deleted ${deletedCount} version(s) at path "${pagePath}"`
  );

  return { deletedCount };
}

// ---------------------------------------------------------------------------
// Delete a single page version
// ---------------------------------------------------------------------------

export async function deletePage(
  projectId: string,
  pageId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  logger.info(
    `[Admin Websites] Deleting page ID: ${pageId} for project ID: ${projectId}`
  );

  const page = await PageModel.findRawByIdAndProject(pageId, projectId);

  if (!page) {
    return {
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Page not found",
      },
    };
  }

  if (page.status === "published") {
    return {
      error: {
        status: 400,
        code: "INVALID_STATUS",
        message: "Cannot delete a published page version",
      },
    };
  }

  // Check if this is the last remaining version for this path
  const siblingCount = await PageModel.countByProjectAndPath(
    projectId,
    page.path
  );

  if (siblingCount && parseInt(siblingCount.count as string, 10) <= 1) {
    return {
      error: {
        status: 400,
        code: "LAST_VERSION",
        message: "Cannot delete the only remaining version of a page",
      },
    };
  }

  await PageModel.deleteById(pageId);

  logger.info(`[Admin Websites] \u2713 Deleted page ID: ${pageId}`);

  return {};
}

// ---------------------------------------------------------------------------
// Create draft from published (idempotent)
// ---------------------------------------------------------------------------

export async function createDraft(
  projectId: string,
  sourcePageId: string
): Promise<{
  page: any;
  isExisting: boolean;
  error?: { status: number; code: string; message: string };
}> {
  logger.info(
    `[Admin Websites] Creating draft from page ID: ${sourcePageId} for project ID: ${projectId}`
  );

  const sourcePage = await PageModel.findRawByIdAndProject(
    sourcePageId,
    projectId
  );

  if (!sourcePage) {
    return {
      page: null,
      isExisting: false,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Source page not found",
      },
    };
  }

  if (sourcePage.status !== "published") {
    return {
      page: null,
      isExisting: false,
      error: {
        status: 400,
        code: "INVALID_STATUS",
        message: "Can only create drafts from published pages",
      },
    };
  }

  // Check if a draft already exists for this project+path (idempotent)
  const existingDraft = await PageModel.findRawByProjectPathStatus(
    projectId,
    sourcePage.path,
    "draft"
  );

  if (existingDraft) {
    // Check if the published page has been updated since this draft was last
    // touched (e.g. a customer save in the DFY editor bumps the published
    // row). If so, the draft is stale — refresh its sections from the
    // published version, AFTER preserving the draft's current state as a
    // restorable history entry: a saved draft's latest content exists only
    // in this row (save-time snapshots capture the PRE-save state), so the
    // refresh would otherwise permanently destroy it.
    const publishedUpdated = new Date(sourcePage.updated_at).getTime();
    const draftUpdated = new Date(
      existingDraft.updated_at || existingDraft.created_at
    ).getTime();

    if (publishedUpdated > draftUpdated) {
      logger.info(
        `[Admin Websites] Stale draft detected (draft created: ${existingDraft.created_at}, published updated: ${sourcePage.updated_at}). Snapshotting then refreshing sections.`
      );

      await snapshotPageStateIfChanged(existingDraft);

      // updated_at is stamped via the DB clock inside refreshDraftById (mirrors
      // the original update that set updated_at to the DB-now timestamp).
      const refreshedDraft = await PageModel.refreshDraftById(existingDraft.id, {
        sections: JSON.stringify(normalizeSections(sourcePage.sections)),
        seo_data: sourcePage.seo_data ? JSON.stringify(sourcePage.seo_data) : null,
        edit_chat_history: JSON.stringify({}),
        // The refreshed draft is a copy of published, not an explicit save —
        // stale provenance from the replaced content must not survive.
        change_source: null,
        revision_note: null,
      });

      return { page: refreshedDraft, isExisting: true };
    }

    logger.info(
      `[Admin Websites] Returning existing draft ID: ${existingDraft.id}`
    );
    return { page: existingDraft, isExisting: true };
  }

  // Get latest version number
  const latestPage = await PageModel.findLatestByProjectAndPath(
    projectId,
    sourcePage.path
  );

  const newVersion = latestPage ? latestPage.version + 1 : 1;

  // Create the draft — carry forward template_page_id so per-section
  // regeneration can still resolve the source template. Without it,
  // buildComponentList(templatePage=null) returns [] and the pipeline
  // silently does nothing.
  const draftPage = await PageModel.insertReturning({
    project_id: projectId,
    path: sourcePage.path,
    version: newVersion,
    status: "draft",
    template_page_id: sourcePage.template_page_id || null,
    sections: JSON.stringify(normalizeSections(sourcePage.sections)),
    seo_data: sourcePage.seo_data ? JSON.stringify(sourcePage.seo_data) : null,
    display_name: sourcePage.display_name || null,
  });

  logger.info(
    `[Admin Websites] \u2713 Created draft page ID: ${draftPage.id}, version: ${newVersion}`
  );

  return { page: draftPage, isExisting: false };
}

// ---------------------------------------------------------------------------
// AI edit page component
// ---------------------------------------------------------------------------

export async function editPageComponent(
  projectId: string,
  pageId: string,
  data: {
    alloroClass: string;
    currentHtml: string;
    instruction: string;
    chatHistory?: any;
  }
): Promise<{
  result: any;
  error?: { status: number; code: string; message: string };
}> {
  const { alloroClass, currentHtml, instruction, chatHistory } = data;

  if (!alloroClass || !currentHtml || !instruction) {
    return {
      result: null,
      error: {
        status: 400,
        code: "INVALID_INPUT",
        message: "alloroClass, currentHtml, and instruction are required",
      },
    };
  }

  logger.info(
    `[Admin Websites] Edit request for page ${pageId}, class: ${alloroClass}`
  );

  // Verify page exists and belongs to project
  const page = await PageModel.findRawByIdAndProject(pageId, projectId);

  if (!page) {
    return {
      result: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Page not found",
      },
    };
  }

  // Build media context
  const mediaContext = await buildMediaContext(projectId);

  // Import the service lazily to avoid circular deps
  const { editHtmlComponent } = await import(
    "../../../utils/website-utils/pageEditorService"
  );

  const result = await editHtmlComponent({
    alloroClass,
    currentHtml,
    instruction,
    chatHistory,
    mediaContext, // Inject media library context
    costContext: {
      projectId,
      eventType: "editor-chat",
      metadata: { page_id: pageId },
    },
  });

  logger.info(
    `[Admin Websites] \u2713 Edit completed for class: ${alloroClass}`
  );

  return { result };
}

// ---------------------------------------------------------------------------
// AI edit layout component (header/footer)
// ---------------------------------------------------------------------------

export async function editLayoutComponent(
  projectId: string,
  data: {
    alloroClass: string;
    currentHtml: string;
    instruction: string;
    chatHistory?: any;
  }
): Promise<{
  result: any;
  error?: { status: number; code: string; message: string };
}> {
  const { alloroClass, currentHtml, instruction, chatHistory } = data;

  if (!alloroClass || !currentHtml || !instruction) {
    return {
      result: null,
      error: {
        status: 400,
        code: "INVALID_INPUT",
        message: "alloroClass, currentHtml, and instruction are required",
      },
    };
  }

  logger.info(
    `[Admin Websites] Layout edit request for project ${projectId}, class: ${alloroClass}`
  );

  // Verify project exists
  const project = await ProjectModel.findRawById(projectId);
  if (!project) {
    return {
      result: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Project not found",
      },
    };
  }

  // Build media context
  const mediaContext = await buildMediaContext(projectId);

  const { editHtmlComponent } = await import(
    "../../../utils/website-utils/pageEditorService"
  );

  const result = await editHtmlComponent({
    alloroClass,
    currentHtml,
    instruction,
    chatHistory,
    mediaContext, // Inject media library context
    costContext: {
      projectId,
      eventType: "editor-chat",
      metadata: { scope: "layout" },
    },
  });

  logger.info(
    `[Admin Websites] \u2713 Layout edit completed for class: ${alloroClass}`
  );

  return { result };
}

// ---------------------------------------------------------------------------
// Propagate seo_data to all sibling versions of the same page path
// ---------------------------------------------------------------------------

export async function propagateSeoToSiblings(
  projectId: string,
  path: string,
  seoData: Record<string, unknown>,
  excludePageId?: string
): Promise<void> {
  const updated = await PageModel.propagateSeoToSiblingsOptionalExclude({
    projectId,
    path,
    seoDataValue: JSON.stringify(seoData),
    excludePageId,
  });

  if (updated > 0) {
    logger.info(
      `[Admin Websites] ✓ Propagated seo_data to ${updated} sibling version(s) for path: ${path}`
    );
  }
}

// ---------------------------------------------------------------------------
// Update page SEO data
// ---------------------------------------------------------------------------

export async function updatePageSeo(
  projectId: string,
  pageId: string,
  seoData: Record<string, unknown>
): Promise<{
  page: any;
  error?: { status: number; code: string; message: string };
}> {
  logger.info(
    `[Admin Websites] Updating SEO for page ID: ${pageId}, project ID: ${projectId}`
  );

  const page = await PageModel.findRawByIdAndProject(pageId, projectId);

  if (!page) {
    return {
      page: null,
      error: { status: 404, code: "NOT_FOUND", message: "Page not found" },
    };
  }

  const updatedPage = await PageModel.updateSeoDataByIdReturning(
    pageId,
    JSON.stringify(seoData)
  );

  // Propagate to all sibling versions with null seo_data
  await propagateSeoToSiblings(projectId, page.path, seoData, pageId);

  logger.info(`[Admin Websites] ✓ Updated SEO for page ID: ${pageId}`);

  return { page: updatedPage };
}

// ---------------------------------------------------------------------------
// Build media context for AI prompts (shared helper)
// ---------------------------------------------------------------------------

async function buildMediaContext(projectId: string): Promise<string> {
  const mediaItems = await MediaModel.findForAIContext(projectId);

  let mediaContext = "";
  if (mediaItems.length > 0) {
    mediaContext = `\n\n## Available Media Library\n\nYou have access to the following uploaded media for this project. You can reference these images/videos by their URLs in your HTML:\n\n`;
    for (const media of mediaItems) {
      const dimensions =
        media.width && media.height ? ` (${media.width}x${media.height})` : "";
      const altText = media.alt_text ? ` - ${media.alt_text}` : "";
      mediaContext += `- **${media.display_name}**${altText}${dimensions}\n  URL: ${media.s3_url}\n  Type: ${media.mime_type}\n\n`;
    }
    mediaContext += `**Note:** When inserting images from the media library, use the exact URL provided above. These images are already optimized and hosted on S3.\n`;
  }

  return mediaContext;
}

// ---------------------------------------------------------------------------
// Update page display name (propagates to all versions at same path)
// ---------------------------------------------------------------------------

export async function updatePageDisplayName(
  projectId: string,
  path: string,
  displayName: string | null
): Promise<number> {
  const updated = await PageModel.updateDisplayNameByProjectAndPath(
    projectId,
    path,
    displayName
  );

  logger.info(
    `[Admin Websites] ✓ Updated display_name for path "${path}" to "${displayName}" (${updated} version(s))`
  );

  return updated;
}
