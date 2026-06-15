/**
 * User Website — Content Service
 *
 * Business logic for owner-facing content operations that carry real logic
 * beyond a thin manager pass-through: project/template resolution shared across
 * post/menu/preview handlers, live page-section saves (status gate, read-only
 * gate, optimistic concurrency, snapshot + version bump), preview shortcode
 * resolution, and taxonomy create/SEO writes.
 *
 * No req/res objects — the controller parses input and shapes the HTTP
 * response; this layer takes resolved ids and returns plain data or a
 * discriminated result the controller maps to status codes.
 *
 * Extracted from UserWebsiteController to keep the controller thin.
 */

import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { PostModel } from "../../../models/website-builder/PostModel";
import { PostCategoryModel } from "../../../models/website-builder/PostCategoryModel";
import { PostTagModel } from "../../../models/website-builder/PostTagModel";
import { snapshotPageStateIfChanged } from "../../../utils/website-utils/pageSnapshots";
import { resolveShortcodes } from "./shortcodeResolver.service";
import * as postManager from "../../admin-websites/feature-services/service.post-manager";

// =====================================================================
// Project / template resolution (shared by post, menu, preview handlers)
// =====================================================================

/** Resolve projectId for an org, or null when the org has no website. */
export async function resolveProjectId(orgId: number): Promise<string | null> {
  const project = await ProjectModel.findByOrganizationId(orgId);
  return project?.id || null;
}

/** Resolve projectId + templateId for an org, or null when no website. */
export async function resolveProjectIds(
  orgId: number
): Promise<{ projectId: string; templateId: string | null } | null> {
  const project = await ProjectModel.findByOrganizationId(orgId);
  if (!project) return null;
  return { projectId: project.id, templateId: project.template_id };
}

// =====================================================================
// Save page sections (live published row, in place)
// =====================================================================

export type SavePageSectionsResult =
  | { ok: true; updated_at: Date }
  | { ok: false; code: "PAGE_NOT_FOUND" }
  | { ok: false; code: "INVALID_STATUS" }
  | { ok: false; code: "READ_ONLY" }
  | { ok: false; code: "STALE_WRITE" };

export async function savePageSections(params: {
  projectId: string;
  pageId: string;
  sections: unknown[];
  expectedUpdatedAt?: string;
  force?: boolean;
}): Promise<SavePageSectionsResult> {
  const { projectId, pageId, sections, expectedUpdatedAt, force } = params;

  // Verify page belongs to project
  const page = await PageModel.findRawByIdAndProject(pageId, projectId);
  if (!page) return { ok: false, code: "PAGE_NOT_FOUND" };

  // Customer saves write the LIVE published row in place — never history
  // rows or drafts (an inactive id here would rewrite version history).
  if (page.status !== "published") {
    return { ok: false, code: "INVALID_STATUS" };
  }

  // Read-only orgs can browse but not write (same gate as restore).
  const project = await ProjectModel.findById(projectId);
  if ((project as any)?.is_read_only) {
    return { ok: false, code: "READ_ONLY" };
  }

  // Optimistic concurrency fast-path: reject when the row changed since
  // the client loaded it, unless the client explicitly forces.
  if (
    expectedUpdatedAt &&
    !force &&
    new Date(page.updated_at).getTime() !==
      new Date(expectedUpdatedAt).getTime()
  ) {
    return { ok: false, code: "STALE_WRITE" };
  }

  // Preserve the page's pre-save state as a restorable history entry
  // before overwriting it (user-side saves write the live page in place).
  await snapshotPageStateIfChanged(page);

  // Keep the live page as the newest version. The snapshot above takes
  // max+1, so without this the live row would carry a LOWER version than
  // its own archived history and sink beneath it in the History tab (the
  // "latest version is Archived" bug).
  const newest = await PageModel.findLatestByProjectAndPath(
    page.project_id,
    page.path
  );
  const nextVersion = (newest?.version ?? page.version) + 1;

  // Update the page sections directly. The write is conditional on the
  // expected timestamp (1ms range — updated_at has microsecond precision,
  // the client echo is millisecond-truncated) so two racing writers can't
  // both pass the JS check above and both land.
  const updatedPage = await PageModel.saveLiveSections({
    pageId,
    sectionsJson: JSON.stringify(sections),
    nextVersion,
    expectedUpdatedAt:
      expectedUpdatedAt && !force ? new Date(expectedUpdatedAt) : undefined,
  });

  if (!updatedPage) {
    return { ok: false, code: "STALE_WRITE" };
  }

  return { ok: true, updated_at: updatedPage.updated_at };
}

// =====================================================================
// Preview (shortcodes → HTML)
// =====================================================================

export async function resolvePreviewHtml(
  ids: { projectId: string; templateId: string | null },
  html: string
): Promise<string> {
  return resolveShortcodes(html, ids.projectId, ids.templateId);
}

// =====================================================================
// Taxonomy create + post SEO
// =====================================================================

/** Slugify a display name the same way the controller did inline. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function listCategories(postTypeId: string) {
  return PostCategoryModel.findByPostTypeId(postTypeId);
}

export async function listTags(postTypeId: string) {
  return PostTagModel.findByPostTypeId(postTypeId);
}

export async function createCategory(params: {
  postTypeId: string;
  name: string;
  slug?: string;
  parentId?: string | null;
}) {
  const finalSlug = params.slug || slugify(params.name);
  return PostCategoryModel.insertReturning({
    post_type_id: params.postTypeId,
    name: params.name,
    slug: finalSlug,
    parent_id: params.parentId || null,
  });
}

export async function createTag(params: {
  postTypeId: string;
  name: string;
  slug?: string;
}) {
  const finalSlug = params.slug || slugify(params.name);
  return PostTagModel.insertReturning({
    post_type_id: params.postTypeId,
    name: params.name,
    slug: finalSlug,
  });
}

/**
 * Update a post's SEO blob. Returns false when the post doesn't exist under the
 * project (controller maps to 404), true after the write lands.
 */
export async function updatePostSeo(params: {
  projectId: string;
  postId: string;
  seo: unknown;
}): Promise<boolean> {
  const post = await postManager.getPost(params.projectId, params.postId);
  if (!post) return false;

  await PostModel.updateSeoDataRaw(params.postId, JSON.stringify(params.seo));
  return true;
}
