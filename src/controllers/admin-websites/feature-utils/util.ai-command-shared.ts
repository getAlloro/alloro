/**
 * AI Command — shared helpers
 *
 * Stateless helpers used across the AI command pipeline (analysis phase,
 * execution phase, and the read/update CRUD surface). Extracted from
 * `service.ai-command.ts` as part of a behavior-preserving decomposition;
 * logic, signatures, and return shapes are unchanged.
 */

import { AiCommandBatchModel } from "../../../models/website-builder/AiCommandBatchModel";
import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { PostModel } from "../../../models/website-builder/PostModel";
import { PostTypeModel } from "../../../models/website-builder/PostTypeModel";
import * as menuManager from "../feature-services/service.menu-manager";
import { createDraft } from "../feature-services/service.page-editor";

export interface AiCommandTargets {
  pages?: string[] | "all";
  posts?: string[] | "all";
  layouts?: string[] | "all";
}

export type BatchType = "ai_editor" | "ui_checker" | "link_checker" | "taste_rewrite";

/**
 * Execution context — shared state threaded across all recommendations in a
 * single batch execution run (analysis-phase modules do not use it).
 */
export interface ExecutionContext {
  createdPages: Map<string, { path: string; id: string }>;   // purpose → { path, id }
  createdPosts: Map<string, { id: string; slug: string; post_type_slug: string }>;  // slug → { id, slug, type }
  createdMenus: Map<string, string>;                          // slug → id
  createdRedirects: Map<string, string>;                      // from_path → to_path
  /** Tracks draft page IDs created during batch execution (path → draft page ID) */
  pageDrafts: Map<string, string>;
  /** Project + batch ids — used to attribute LLM costs back to the project. */
  projectId?: string;
  batchId?: string;
}

export async function refreshStats(batchId: string): Promise<void> {
  const stats = await AiCommandRecommendationModel.computeStats(batchId);
  await AiCommandBatchModel.updateStats(batchId, JSON.stringify(stats));
}

/**
 * Resolve the single draft row this batch edits for one page path, pinning it in
 * `ctx.pageDrafts`. Every recommendation for the path — both the read in
 * `getCurrentHtml` and the write in `saveEditedHtml` — shares this row, so edits
 * to the same page stack onto each other instead of each being computed from a
 * stale snapshot and overwriting the previous one (the edit-loss bug where only
 * the last write per section survived).
 *
 * An existing draft at the path is reused as-is (NOT routed through
 * `createDraft`, whose stale-refresh would wipe in-progress edits). A draft is
 * created from the published row only when no draft exists yet.
 */
export async function resolvePageDraftId(
  origPage: { project_id: string; path: string },
  ctx: ExecutionContext
): Promise<string> {
  const pinned = ctx.pageDrafts.get(origPage.path);
  if (pinned) return pinned;

  let page =
    (await PageModel.findRawByProjectPathStatus(
      origPage.project_id,
      origPage.path,
      "draft"
    )) ||
    (await PageModel.findRawByProjectPathStatus(
      origPage.project_id,
      origPage.path,
      "published"
    ));

  if (!page) {
    throw new Error(`No active page at path ${origPage.path}`);
  }

  if (page.status === "published") {
    const draftResult = await createDraft(page.project_id, page.id);
    if (draftResult.error) {
      throw new Error(
        `Failed to create draft for ${origPage.path}: ${draftResult.error.message}`
      );
    }
    page = draftResult.page;
  }

  ctx.pageDrafts.set(origPage.path, page.id);
  return page.id;
}

export async function resolvePages(
  projectId: string,
  target: string[] | "all"
): Promise<any[]> {
  if (target === "all") {
    // For each path, prefer the draft version; fall back to published
    const allPages = await PageModel.findResolvableByProjectId(projectId);

    // Deduplicate by path — keep first (draft preferred)
    const seen = new Set<string>();
    return allPages.filter((p: any) => {
      if (seen.has(p.path)) return false;
      seen.add(p.path);
      return true;
    });
  }

  // Specific page IDs
  return PageModel.findByIds(target);
}

export async function resolvePosts(
  projectId: string,
  target: string[] | "all"
): Promise<any[]> {
  if (target === "all") {
    return PostModel.findPublishedByProjectId(projectId);
  }

  return PostModel.findByIds(target);
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Context helpers for structural analysis
// ---------------------------------------------------------------------------

export async function getExistingPaths(projectId: string): Promise<string[]> {
  const pages = await PageModel.findExistingPaths(projectId);
  return pages.map((p: any) => p.path);
}

export async function getExistingPostSlugs(
  projectId: string
): Promise<Array<{ slug: string; post_type_slug: string }>> {
  return PostModel.findExistingSlugsWithType(projectId);
}

export async function getProjectPostTypes(
  projectId: string,
  templateId: string | null
): Promise<any[]> {
  if (!templateId) return [];
  return PostTypeModel.findByTemplateId(templateId);
}

export async function getExistingMenuItems(
  projectId: string
): Promise<Array<{ menu_slug: string; items: Array<{ label: string; url: string }> }>> {
  const { menus } = await menuManager.listMenus(projectId);
  const result: Array<{ menu_slug: string; items: Array<{ label: string; url: string }> }> = [];

  for (const menu of menus) {
    const detail = await menuManager.getMenu(projectId, menu.id);
    const items = flattenMenuItems(detail.menu?.items || []);
    result.push({ menu_slug: menu.slug, items });
  }

  return result;
}

export function flattenMenuItems(items: any[]): Array<{ label: string; url: string }> {
  const flat: Array<{ label: string; url: string }> = [];
  for (const item of items) {
    flat.push({ label: item.label, url: item.url });
    if (item.children?.length) {
      flat.push(...flattenMenuItems(item.children));
    }
  }
  return flat;
}
