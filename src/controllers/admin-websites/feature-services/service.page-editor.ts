/**
 * Page Editor Service
 *
 * Business logic for page versioning workflow, draft/published lifecycle,
 * AI-powered component editing (Claude integration), and layout editing.
 */

import { db } from "../../../database/connection";
import { normalizeSections } from "../feature-utils/util.section-normalizer";
import { snapshotPageStateIfChanged } from "../../../utils/website-utils/pageSnapshots";

const PROJECTS_TABLE = "website_builder.projects";
const PAGES_TABLE = "website_builder.pages";

// ---------------------------------------------------------------------------
// List pages for a project
// ---------------------------------------------------------------------------

export async function listPages(
  projectId: string,
  pathFilter?: string
): Promise<any[]> {
  console.log(`[Admin Websites] Fetching pages for project ID: ${projectId}`);

  let query = db(PAGES_TABLE).where("project_id", projectId);

  if (pathFilter) {
    query = query.where("path", pathFilter);
  }

  const pages = await query.orderBy("path", "asc").orderBy("version", "desc");

  console.log(`[Admin Websites] Found ${pages.length} pages`);

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

  console.log(
    `[Admin Websites] Creating page for project ID: ${projectId}, path: ${path}`
  );

  // Get latest version for this project+path
  const latestPage = await db(PAGES_TABLE)
    .where({ project_id: projectId, path })
    .orderBy("version", "desc")
    .first();

  const newVersion = latestPage ? latestPage.version + 1 : 1;

  // Mark existing drafts as inactive
  await db(PAGES_TABLE)
    .where({ project_id: projectId, path, status: "draft" })
    .update({ status: "inactive", updated_at: db.fn.now() });

  // Create new page
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

  const [page] = await db(PAGES_TABLE)
    .insert(insertData)
    .returning("*");

  // If publishing, mark previous published as inactive
  if (publish) {
    await db(PAGES_TABLE)
      .where({ project_id: projectId, path, status: "published" })
      .whereNot("id", page.id)
      .update({ status: "inactive", updated_at: db.fn.now() });
  }

  console.log(
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
  console.log(
    `[Admin Websites] Publishing page ID: ${pageId} for project ID: ${projectId}`
  );

  // Get the page
  const page = await db(PAGES_TABLE).where("id", pageId).first();

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

  // Unpublish any currently published page for this project+path
  await db(PAGES_TABLE)
    .where({
      project_id: page.project_id,
      path: page.path,
      status: "published",
    })
    .update({ status: "inactive", updated_at: db.fn.now() });

  // Publish this page
  const [publishedPage] = await db(PAGES_TABLE)
    .where("id", pageId)
    .update({ status: "published", updated_at: db.fn.now() })
    .returning("*");

  console.log(`[Admin Websites] \u2713 Published page ID: ${pageId}`);

  return { page: publishedPage };
}

// ---------------------------------------------------------------------------
// Get single page
// ---------------------------------------------------------------------------

export async function getPageById(
  projectId: string,
  pageId: string
): Promise<any> {
  console.log(
    `[Admin Websites] Fetching page ID: ${pageId} for project ID: ${projectId}`
  );

  const page = await db(PAGES_TABLE)
    .where({ id: pageId, project_id: projectId })
    .first();

  return page || null;
}

// ---------------------------------------------------------------------------
// Update draft page sections/chat
// ---------------------------------------------------------------------------

export async function updatePage(
  projectId: string,
  pageId: string,
  data: { sections?: any; edit_chat_history?: any }
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

  console.log(
    `[Admin Websites] Updating page ID: ${pageId} for project ID: ${projectId}`
  );

  const page = await db(PAGES_TABLE)
    .where({ id: pageId, project_id: projectId })
    .first();

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

  const updatePayload: Record<string, unknown> = {
    updated_at: db.fn.now(),
  };

  if (sections) {
    // Preserve the draft's pre-save state as a restorable history entry
    // before overwriting it (deduped + pruned inside the helper).
    await snapshotPageStateIfChanged(page);
    updatePayload.sections = JSON.stringify(sections);
  }

  if (edit_chat_history !== undefined) {
    updatePayload.edit_chat_history = JSON.stringify(edit_chat_history);
  }

  const [updatedPage] = await db(PAGES_TABLE)
    .where("id", pageId)
    .update(updatePayload)
    .returning("*");

  console.log(`[Admin Websites] \u2713 Updated page ID: ${pageId}`);

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
  console.log(
    `[Admin Websites] Deleting all versions at path "${pagePath}" for project ID: ${projectId}`
  );

  const pages = await db(PAGES_TABLE)
    .where({ project_id: projectId, path: pagePath })
    .select("id");

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

  const deletedCount = await db(PAGES_TABLE)
    .where({ project_id: projectId, path: pagePath })
    .del();

  console.log(
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
  console.log(
    `[Admin Websites] Deleting page ID: ${pageId} for project ID: ${projectId}`
  );

  const page = await db(PAGES_TABLE)
    .where({ id: pageId, project_id: projectId })
    .first();

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
  const siblingCount = await db(PAGES_TABLE)
    .where({ project_id: projectId, path: page.path })
    .count("* as count")
    .first();

  if (siblingCount && parseInt(siblingCount.count as string, 10) <= 1) {
    return {
      error: {
        status: 400,
        code: "LAST_VERSION",
        message: "Cannot delete the only remaining version of a page",
      },
    };
  }

  await db(PAGES_TABLE).where("id", pageId).del();

  console.log(`[Admin Websites] \u2713 Deleted page ID: ${pageId}`);

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
  console.log(
    `[Admin Websites] Creating draft from page ID: ${sourcePageId} for project ID: ${projectId}`
  );

  const sourcePage = await db(PAGES_TABLE)
    .where({ id: sourcePageId, project_id: projectId })
    .first();

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
  const existingDraft = await db(PAGES_TABLE)
    .where({ project_id: projectId, path: sourcePage.path, status: "draft" })
    .first();

  if (existingDraft) {
    // Check if the published page has been updated since this draft was last
    // touched. If so, the draft is stale — refresh its sections from the
    // published version. Compared against the draft's updated_at (not
    // created_at) so saved draft edits are never silently clobbered.
    const publishedUpdated = new Date(sourcePage.updated_at).getTime();
    const draftUpdated = new Date(
      existingDraft.updated_at || existingDraft.created_at
    ).getTime();

    if (publishedUpdated > draftUpdated) {
      console.log(
        `[Admin Websites] Stale draft detected (draft created: ${existingDraft.created_at}, published updated: ${sourcePage.updated_at}). Refreshing sections.`
      );

      const [refreshedDraft] = await db(PAGES_TABLE)
        .where("id", existingDraft.id)
        .update({
          sections: JSON.stringify(normalizeSections(sourcePage.sections)),
          seo_data: sourcePage.seo_data ? JSON.stringify(sourcePage.seo_data) : null,
          edit_chat_history: JSON.stringify({}),
          updated_at: db.fn.now(),
        })
        .returning("*");

      return { page: refreshedDraft, isExisting: true };
    }

    console.log(
      `[Admin Websites] Returning existing draft ID: ${existingDraft.id}`
    );
    return { page: existingDraft, isExisting: true };
  }

  // Get latest version number
  const latestPage = await db(PAGES_TABLE)
    .where({ project_id: projectId, path: sourcePage.path })
    .orderBy("version", "desc")
    .first();

  const newVersion = latestPage ? latestPage.version + 1 : 1;

  // Create the draft — carry forward template_page_id so per-section
  // regeneration can still resolve the source template. Without it,
  // buildComponentList(templatePage=null) returns [] and the pipeline
  // silently does nothing.
  const [draftPage] = await db(PAGES_TABLE)
    .insert({
      project_id: projectId,
      path: sourcePage.path,
      version: newVersion,
      status: "draft",
      template_page_id: sourcePage.template_page_id || null,
      sections: JSON.stringify(normalizeSections(sourcePage.sections)),
      seo_data: sourcePage.seo_data ? JSON.stringify(sourcePage.seo_data) : null,
    })
    .returning("*");

  console.log(
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

  console.log(
    `[Admin Websites] Edit request for page ${pageId}, class: ${alloroClass}`
  );

  // Verify page exists and belongs to project
  const page = await db(PAGES_TABLE)
    .where({ id: pageId, project_id: projectId })
    .first();

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

  console.log(
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

  console.log(
    `[Admin Websites] Layout edit request for project ${projectId}, class: ${alloroClass}`
  );

  // Verify project exists
  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
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

  console.log(
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
  const query = db(PAGES_TABLE)
    .where({ project_id: projectId, path })
    .whereNull("seo_data");

  if (excludePageId) {
    query.whereNot("id", excludePageId);
  }

  const updated = await query.update({
    seo_data: JSON.stringify(seoData),
  });

  if (updated > 0) {
    console.log(
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
  console.log(
    `[Admin Websites] Updating SEO for page ID: ${pageId}, project ID: ${projectId}`
  );

  const page = await db(PAGES_TABLE)
    .where({ id: pageId, project_id: projectId })
    .first();

  if (!page) {
    return {
      page: null,
      error: { status: 404, code: "NOT_FOUND", message: "Page not found" },
    };
  }

  const [updatedPage] = await db(PAGES_TABLE)
    .where("id", pageId)
    .update({
      seo_data: JSON.stringify(seoData),
      updated_at: db.fn.now(),
    })
    .returning("*");

  // Propagate to all sibling versions with null seo_data
  await propagateSeoToSiblings(projectId, page.path, seoData, pageId);

  console.log(`[Admin Websites] ✓ Updated SEO for page ID: ${pageId}`);

  return { page: updatedPage };
}

// ---------------------------------------------------------------------------
// Build media context for AI prompts (shared helper)
// ---------------------------------------------------------------------------

async function buildMediaContext(projectId: string): Promise<string> {
  const mediaItems = await db("website_builder.media")
    .where({ project_id: projectId })
    .orderBy("created_at", "desc")
    .select(
      "display_name",
      "s3_url",
      "alt_text",
      "mime_type",
      "width",
      "height"
    );

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
  const updated = await db(PAGES_TABLE)
    .where({ project_id: projectId, path })
    .update({
      display_name: displayName,
      updated_at: db.fn.now(),
    });

  console.log(
    `[Admin Websites] ✓ Updated display_name for path "${path}" to "${displayName}" (${updated} version(s))`
  );

  return updated;
}
