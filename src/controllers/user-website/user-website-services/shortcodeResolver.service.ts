/**
 * Shortcode Resolver Service
 *
 * Resolves {{ post_block ... }} and {{ menu ... }} shortcodes in HTML.
 * Ported from website-builder-rebuild/src/services/postblock.service.ts
 * and menu.service.ts for use in the editor preview.
 *
 * Each resolved shortcode is wrapped in a marker div so the editor can
 * restore the original shortcode token during section extraction.
 *
 * =====================================================================
 * ALLORO_SHORTCODE MARKER CONVENTION (consumed by ComponentGenerator +
 * util.html-normalizer; resolver itself is unaffected)
 * =====================================================================
 *
 * Template sections that are owned by a shortcode — the doctor roster,
 * services list, reviews, etc. — should be annotated in their template
 * HTML with a marker comment:
 *
 *     <!-- ALLORO_SHORTCODE: <type> -->
 *
 * Supported `<type>` vocabulary (mirrors what this resolver understands):
 *   - doctors       → {{ post_block items='<id>' ... }} (post type `doctors`)
 *   - services      → {{ post_block items='<id>' ... }} (post type `services`)
 *   - staff         → {{ post_block items='<id>' ... }} (post type `staff`)
 *   - reviews       → {{ review_block items='<id>' ... }}
 *   - posts         → {{ post_block items='<id>' ... }} (generic/other post types)
 *   - menus         → {{ menu items='<id>' ... }}
 *   - locations     → {{ post_block items='<id>' ... }} (post type `locations`)
 *
 * Contract:
 *   - The LLM component generator MUST preserve the marker region
 *     verbatim; it customizes only heading/subheading, not the body.
 *   - The post-gen HTML normalizer (util.html-normalizer.ts) SHOULD
 *     strip any fabricated children inside a marked region and re-insert
 *     the canonical shortcode token when one is missing.
 *   - The resolver itself never reads the marker — markers are purely
 *     advisory metadata for upstream generation/normalization steps.
 *
 * When adding a new shortcode type in this file, update the vocabulary
 * above so template annotations stay aligned.
 */

import { ProjectReviewModel } from "../../../models/website-builder/ProjectReviewModel";
import { PostModel } from "../../../models/website-builder/PostModel";
import { PostBlockModel } from "../../../models/website-builder/PostBlockModel";
import { ReviewBlockModel } from "../../../models/website-builder/ReviewBlockModel";
import { MenuModel, MenuItemModel } from "../../../models/website-builder/MenuModel";
import { MenuTemplateModel } from "../../../models/website-builder/MenuTemplateModel";
import logger from "../../../lib/logger";

// =====================================================================
// HTML Escaping
// =====================================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =====================================================================
// Shortcode Parsing
// =====================================================================

const POST_BLOCK_RE = /\{\{\s*post_block\s+((?:[a-z_]+='[^']*'\s*)+)\}\}/g;
const MENU_RE = /\{\{\s*menu\s+((?:[a-z_]+='[^']*'\s*)+)\}\}/g;
const REVIEW_BLOCK_RE = /\{\{\s*review_block\s+((?:[a-z_]+='[^']*'\s*)+)\}\}/g;

interface PostBlockShortcode {
  raw: string;
  id: string;
  items: string;
  tags?: string;
  cats?: string;
  ids?: string;
  exc_ids?: string;
  order?: string;
  order_by?: string;
  limit?: string;
  offset?: string;
  paginate?: string;
  per_page?: string;
}

interface ReviewBlockShortcode {
  raw: string;
  id: string;
  location?: string;
  min_rating?: string;
  limit?: string;
  offset?: string;
  order?: string;
  paginate?: string;
  per_page?: string;
}

interface MenuShortcode {
  raw: string;
  id: string;
  template?: string;
}

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-z_]+)='([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

const PAGINATION_MODES = new Set(["load-more", "numbered", "infinite"]);
const POST_ORDER_COLUMNS = new Set([
  "created_at",
  "published_at",
  "sort_order",
  "title",
]);

function isPaginatedMode(value?: string): boolean {
  return value ? PAGINATION_MODES.has(value) : false;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPreviewPerPage(
  perPage: string | undefined,
  limit: string | undefined,
  fallback: number
): number {
  const explicitPerPage = parsePositiveInt(perPage, 0);
  if (explicitPerPage > 0) return clamp(explicitPerPage, 1, 50);

  const limitFallback = parsePositiveInt(limit, 0);
  if (limitFallback > 0) return clamp(limitFallback, 1, 50);

  return fallback;
}

function getPostOrderColumn(orderBy?: string): string {
  return orderBy && POST_ORDER_COLUMNS.has(orderBy) ? orderBy : "created_at";
}

function getSortOrder(order?: string, fallback: "asc" | "desc" = "asc"): "asc" | "desc" {
  if (order === "asc" || order === "desc") return order;
  return fallback;
}

// =====================================================================
// Post Block Resolution
// =====================================================================

async function resolvePostBlocks(
  html: string,
  projectId: string,
  templateId: string | null
): Promise<string> {
  if (!html.includes("post_block") || !templateId) return html;

  const shortcodes: PostBlockShortcode[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(POST_BLOCK_RE.source, "g");
  while ((match = re.exec(html)) !== null) {
    const attrs = parseAttrs(match[1]);
    if (!attrs.id || !attrs.items) continue;
    shortcodes.push({ raw: match[0], ...attrs } as PostBlockShortcode);
  }

  if (shortcodes.length === 0) return html;

  // Batch fetch post blocks
  const slugs = [...new Set(shortcodes.map((s) => s.id))];
  const blocks = await PostBlockModel.findWithPostTypeByTemplateAndSlugs(
    templateId,
    slugs
  );

  const blockMap = new Map<string, { sections: any; post_type_slug: string }>();
  for (const b of blocks) {
    const sections =
      typeof b.sections === "string" ? JSON.parse(b.sections) : b.sections;
    blockMap.set(b.slug, { sections, post_type_slug: b.post_type_slug });
  }

  for (const sc of shortcodes) {
    const block = blockMap.get(sc.id);
    if (!block) {
      html = html.replace(sc.raw, wrapResolved(sc.raw, ""));
      continue;
    }

    const posts = await fetchFilteredPosts(projectId, sc.items, sc);

    const blockHtml = Array.isArray(block.sections)
      ? block.sections.map((s: any) => s.content || "").join("\n")
      : "";
    const rendered = renderPostBlock(blockHtml, posts, block.post_type_slug);
    html = html.replace(sc.raw, wrapResolved(sc.raw, rendered));
  }

  return html;
}

async function fetchFilteredPosts(
  projectId: string,
  postTypeSlug: string,
  sc: PostBlockShortcode
): Promise<any[]> {
  const isPaginated = isPaginatedMode(sc.paginate);
  const orderBy = getPostOrderColumn(sc.order_by);
  const order = getSortOrder(sc.order, "asc");
  const limit = isPaginated
    ? getPreviewPerPage(sc.per_page, sc.limit, 9)
    : parseNonNegativeInt(sc.limit, 10);
  const offset = isPaginated ? 0 : parseNonNegativeInt(sc.offset, 0);

  const posts = await PostModel.fetchFilteredForBlock(projectId, postTypeSlug, {
    ids: sc.ids,
    exc_ids: sc.exc_ids,
    cats: sc.cats,
    tags: sc.tags,
    orderBy,
    order,
    limit,
    offset,
  });

  if (posts.length > 0) {
    const postIds = posts.map((p: any) => p.id);

    const cats = await PostModel.findCategoryNamesByPostIds(postIds);

    const tags = await PostModel.findTagNamesByPostIds(postIds);

    const catMap = new Map<string, string[]>();
    for (const c of cats) {
      if (!catMap.has(c.post_id)) catMap.set(c.post_id, []);
      catMap.get(c.post_id)!.push(c.name);
    }
    const tagMap = new Map<string, string[]>();
    for (const t of tags) {
      if (!tagMap.has(t.post_id)) tagMap.set(t.post_id, []);
      tagMap.get(t.post_id)!.push(t.name);
    }

    for (const post of posts) {
      post._categories = (catMap.get(post.id) || []).join(", ");
      post._tags = (tagMap.get(post.id) || []).join(", ");
    }
  }

  return posts;
}

// =====================================================================
// Conditional Rendering ({{if}} / {{if_not}} / {{endif}})
//
// Strip {{if post.X}}...{{endif}} and {{if_not post.X}}...{{endif}} blocks
// based on whether the named field is empty.
//
// Empty = null, undefined, "", or an empty array. "0", 0, false are NOT
// empty. Flat only — nesting is detected and the input is returned
// unchanged with a warning (loud failure).
//
// NOTE: This logic is duplicated in two other locations. Keep in sync.
// The gallery-loop pass (renderGalleryLoops + processItemConditionals
// below) must ALSO stay in sync across all three:
//   - website-builder-rebuild/src/utils/shortcodes.ts (processConditionals)
//   - alloro/frontend/src/components/Admin/PostBlocksTab.tsx
// =====================================================================

const CONDITIONAL_BLOCK_RE =
  /\{\{\s*(if|if_not)\s+post\.([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*endif\s*\}\}/g;
const ORPHAN_CONDITIONAL_RE =
  /\{\{\s*(?:if|if_not)\s+[^}]*\}\}|\{\{\s*endif\s*\}\}/g;
const NESTED_PROBE_RE = /\{\{\s*(?:if|if_not)\s+/;

function isConditionalValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function resolveConditionalField(
  post: any,
  customFields: Record<string, unknown>,
  field: string
): unknown {
  if (field.startsWith("custom.")) {
    const slug = field.slice("custom.".length);
    return customFields ? customFields[slug] : undefined;
  }
  // Backend stores categories/tags under _categories/_tags (see fetchFilteredPosts)
  if (field === "categories") return post._categories;
  if (field === "tags") return post._tags;
  // url is derived at render time — non-empty iff slug is set
  if (field === "url") return post.slug || "";
  return post[field];
}

function processConditionals(
  html: string,
  post: any,
  customFields: Record<string, unknown>
): string {
  if (!html.includes("{{if")) return html;

  // Nesting detection — abort loudly on any nested block.
  for (const probe of html.matchAll(CONDITIONAL_BLOCK_RE)) {
    if (NESTED_PROBE_RE.test(probe[3])) {
      logger.warn(
        `[shortcodeResolver] Nested conditional detected in post template (flat-only in v1). ` +
          `Field: post.${probe[2]}. Block: ${probe[0].slice(0, 200)}`
      );
      return html;
    }
  }

  // Strip-or-unwrap pass.
  let result = html.replace(
    CONDITIONAL_BLOCK_RE,
    (_match, kind: string, field: string, body: string) => {
      const value = resolveConditionalField(post, customFields, field);
      const empty = isConditionalValueEmpty(value);
      const keep = kind === "if" ? !empty : empty;
      return keep ? body : "";
    }
  );

  // Orphan cleanup.
  result = result.replace(ORPHAN_CONDITIONAL_RE, "");
  return result;
}

// =====================================================================
// Gallery Loop Rendering ({{start_gallery_loop field='X'}}...{{end_gallery_loop}})
//
// For a given custom field that holds an array of
//   { url: string; link?: string; alt?: string; caption?: string }
// items, emit the body once per item, with {{item.url|link|alt|caption}}
// replaced and {{if item.X}}/{{if_not item.X}} resolved.
//
// Runs BEFORE processConditionals so the inner {{if item.link}} blocks
// inside a gallery body are resolved into flat HTML first — this
// preserves the outer processConditionals' flat-only invariant for the
// surrounding {{if post.custom.<slug>}} block.
//
// Empty or missing arrays → block replaced with "". Missing item keys →
// empty escaped string.
// =====================================================================

const GALLERY_LOOP_RE =
  /\{\{\s*start_gallery_loop\s+field='([a-z0-9_-]+)'\s*\}\}([\s\S]*?)\{\{\s*end_gallery_loop\s*\}\}/gi;
const ITEM_CONDITIONAL_BLOCK_RE =
  /\{\{\s*(if|if_not)\s+item\.([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*endif\s*\}\}/g;
const ITEM_ORPHAN_CONDITIONAL_RE =
  /\{\{\s*(?:if|if_not)\s+item\.[^}]*\}\}|\{\{\s*endif\s*\}\}/g;

function processItemConditionals(body: string, item: Record<string, unknown>): string {
  if (!body.includes("{{if")) return body;

  // Nesting detection — abort loudly on any nested item conditional.
  for (const probe of body.matchAll(ITEM_CONDITIONAL_BLOCK_RE)) {
    if (NESTED_PROBE_RE.test(probe[3])) {
      logger.warn(
        `[shortcodeResolver] Nested item conditional detected in gallery loop (flat-only). ` +
          `Field: item.${probe[2]}. Block: ${probe[0].slice(0, 200)}`
      );
      return body;
    }
  }

  let result = body.replace(
    ITEM_CONDITIONAL_BLOCK_RE,
    (_match, kind: string, field: string, inner: string) => {
      const value = (item as Record<string, unknown>)[field];
      const empty = isConditionalValueEmpty(value);
      const keep = kind === "if" ? !empty : empty;
      return keep ? inner : "";
    }
  );

  result = result.replace(ITEM_ORPHAN_CONDITIONAL_RE, "");
  return result;
}

function renderGalleryLoops(
  html: string,
  customFields: Record<string, unknown>
): string {
  if (!html.includes("start_gallery_loop")) return html;

  return html.replace(
    GALLERY_LOOP_RE,
    (_match, slug: string, body: string) => {
      const raw = customFields ? customFields[slug] : undefined;
      if (!Array.isArray(raw) || raw.length === 0) return "";

      const perItem = raw.map((item) => {
        const safeItem =
          item && typeof item === "object" && !Array.isArray(item)
            ? (item as Record<string, unknown>)
            : {};
        let out = processItemConditionals(body, safeItem);
        const get = (key: string): string => {
          const v = safeItem[key];
          if (v === null || v === undefined) return "";
          if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
            return "";
          }
          return escapeHtml(String(v));
        };
        out = out.replace(/\{\{\s*item\.url\s*\}\}/g, get("url"));
        out = out.replace(/\{\{\s*item\.link\s*\}\}/g, get("link"));
        out = out.replace(/\{\{\s*item\.alt\s*\}\}/g, get("alt"));
        out = out.replace(/\{\{\s*item\.caption\s*\}\}/g, get("caption"));
        return out;
      });

      return perItem.join("\n");
    }
  );
}

function renderPostBlock(
  blockHtml: string,
  posts: any[],
  postTypeSlug: string
): string {
  const startMarker = "{{start_post_loop}}";
  const endMarker = "{{end_post_loop}}";
  const startIdx = blockHtml.indexOf(startMarker);
  const endIdx = blockHtml.indexOf(endMarker);

  let before = "";
  let template = blockHtml;
  let after = "";

  if (startIdx !== -1 && endIdx !== -1) {
    before = blockHtml.slice(0, startIdx);
    template = blockHtml.slice(startIdx + startMarker.length, endIdx);
    after = blockHtml.slice(endIdx + endMarker.length);
  }

  const rendered = posts.map((post) => {
    const customFields =
      typeof post.custom_fields === "string"
        ? JSON.parse(post.custom_fields || "{}")
        : post.custom_fields || {};

    const fmtDate = (d: any) =>
      d
        ? new Date(d).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "";

    // Step A: resolve gallery loops FIRST so any inner {{if item.X}} is
    // fully resolved into flat HTML before processConditionals runs — the
    // outer conditional engine is flat-only and would otherwise bail.
    let html = renderGalleryLoops(template, customFields);

    // Step B: strip {{if post.X}}/{{if_not post.X}} blocks whose field is
    // empty, before any post-level token replacement runs.
    html = processConditionals(html, post, customFields);
    html = html.replace(/\{\{post\.title\}\}/g, escapeHtml(post.title || ""));
    html = html.replace(/\{\{post\.slug\}\}/g, escapeHtml(post.slug || ""));
    html = html.replace(
      /\{\{post\.url\}\}/g,
      escapeHtml(`/${postTypeSlug}/${post.slug}`)
    );
    html = html.replace(/\{\{post\.content\}\}/g, post.content || "");
    html = html.replace(
      /\{\{post\.excerpt\}\}/g,
      escapeHtml(post.excerpt || "")
    );
    html = html.replace(
      /\{\{post\.featured_image\}\}/g,
      escapeHtml(post.featured_image || "")
    );
    html = html.replace(
      /\{\{post\.categories\}\}/g,
      escapeHtml(post._categories || "")
    );
    html = html.replace(
      /\{\{post\.tags\}\}/g,
      escapeHtml(post._tags || "")
    );
    html = html.replace(
      /\{\{post\.created_at\}\}/g,
      escapeHtml(fmtDate(post.created_at))
    );
    html = html.replace(
      /\{\{post\.updated_at\}\}/g,
      escapeHtml(fmtDate(post.updated_at))
    );
    html = html.replace(
      /\{\{post\.published_at\}\}/g,
      escapeHtml(fmtDate(post.published_at))
    );

    // Video embed — generates responsive iframe from video_url custom field
    html = html.replace(/\{\{post\.video_embed\}\}/g, () => {
      const url = String(customFields["video_url"] || "");
      if (!url) return "";
      return buildVideoEmbed(url);
    });

    // Custom fields. Scalar-only here — the gallery-loop pass in Step A
    // consumed any valid {{item.*}} tokens, so any non-primitive value
    // reaching this replacement is either an unresolved gallery (field
    // referenced as a scalar) or a malformed value. Emit "" so it fails
    // silent instead of ugly (`[object Object]`, `,,`, etc.).
    html = html.replace(
      /\{\{post\.custom\.([a-z0-9_-]+)\}\}/gi,
      (_: string, field: string) => {
        const val = customFields[field];
        if (val === null || val === undefined) return "";
        if (typeof val !== "string" && typeof val !== "number" && typeof val !== "boolean") {
          return "";
        }
        return escapeHtml(String(val)).replace(/\n/g, "<br>");
      }
    );

    return html;
  });

  return before + rendered.join("\n") + after;
}

// =====================================================================
// Review Block Resolution
// =====================================================================

async function resolveReviewBlocks(
  html: string,
  projectId: string,
  templateId: string | null
): Promise<string> {
  if (!html.includes("review_block") || !templateId) return html;

  const shortcodes: ReviewBlockShortcode[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(REVIEW_BLOCK_RE.source, "g");
  while ((match = re.exec(html)) !== null) {
    const attrs = parseAttrs(match[1]);
    if (!attrs.id) continue;
    shortcodes.push({ raw: match[0], ...attrs } as ReviewBlockShortcode);
  }

  if (shortcodes.length === 0) return html;

  const scope = await ProjectReviewModel.getProjectScope(projectId);
  if (!scope || (scope.locationIds.length === 0 && scope.placeIds.length === 0)) {
    for (const sc of shortcodes) {
      html = html.replace(sc.raw, wrapResolved(sc.raw, ""));
    }
    return html;
  }

  // Batch fetch review blocks
  const slugs = [...new Set(shortcodes.map((s) => s.id))];
  const blocks = await ReviewBlockModel.findByTemplateAndSlugs(
    templateId,
    slugs
  );

  const blockMap = new Map<string, { sections: any }>();
  for (const b of blocks) {
    const sections =
      typeof b.sections === "string" ? JSON.parse(b.sections) : b.sections;
    blockMap.set(b.slug, { sections });
  }

  for (const sc of shortcodes) {
    const block = blockMap.get(sc.id);
    if (!block) {
      html = html.replace(sc.raw, wrapResolved(sc.raw, ""));
      continue;
    }

    const isPaginated = isPaginatedMode(sc.paginate);
    const minRating = clamp(parsePositiveInt(sc.min_rating, 1), 1, 5);
    const limit = isPaginated
      ? getPreviewPerPage(sc.per_page, sc.limit, 6)
      : parseNonNegativeInt(sc.limit, 10);
    const offset = isPaginated ? 0 : parseNonNegativeInt(sc.offset, 0);
    const order = getSortOrder(sc.order, "desc");

    const reviews = await ProjectReviewModel.list(scope, {
      minRating,
      limit,
      offset,
      order,
      showHidden: false,
    });

    const blockHtml = Array.isArray(block.sections)
      ? block.sections.map((s: any) => s.content || "").join("\n")
      : "";
    const rendered = renderReviewBlock(blockHtml, reviews);
    html = html.replace(sc.raw, wrapResolved(sc.raw, rendered));
  }

  return html;
}

function renderReviewBlock(blockHtml: string, reviews: any[]): string {
  const startMarker = "{{start_review_loop}}";
  const endMarker = "{{end_review_loop}}";
  const startIdx = blockHtml.indexOf(startMarker);
  const endIdx = blockHtml.indexOf(endMarker);

  let before = "";
  let template = blockHtml;
  let after = "";

  if (startIdx !== -1 && endIdx !== -1) {
    before = blockHtml.slice(0, startIdx);
    template = blockHtml.slice(startIdx + startMarker.length, endIdx);
    after = blockHtml.slice(endIdx + endMarker.length);
  }

  const rendered = reviews.map((review) => {
    const fmtDate = (d: any) =>
      d
        ? new Date(d).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "";

    const starsHtml = generateStarsHtml(review.stars || 0);

    let html = template;
    html = html.replace(/\{\{review\.stars\}\}/g, String(review.stars || 0));
    html = html.replace(/\{\{review\.stars_html\}\}/g, starsHtml);
    html = html.replace(
      /\{\{review\.text\}\}/g,
      escapeHtml(review.text || "")
    );
    html = html.replace(
      /\{\{review\.reviewer_name\}\}/g,
      escapeHtml(review.reviewer_name || "Anonymous")
    );
    html = html.replace(
      /\{\{review\.reviewer_photo\}\}/g,
      escapeHtml(review.reviewer_photo_url || "")
    );
    html = html.replace(
      /\{\{review\.is_anonymous\}\}/g,
      String(review.is_anonymous || false)
    );
    html = html.replace(
      /\{\{review\.date\}\}/g,
      escapeHtml(fmtDate(review.review_created_at))
    );
    html = html.replace(
      /\{\{review\.has_reply\}\}/g,
      String(review.has_reply || false)
    );
    html = html.replace(
      /\{\{review\.reply_text\}\}/g,
      escapeHtml(review.reply_text || "")
    );
    html = html.replace(
      /\{\{review\.reply_date\}\}/g,
      escapeHtml(fmtDate(review.reply_date))
    );

    return html;
  });

  return before + rendered.join("\n") + after;
}

function generateStarsHtml(count: number): string {
  const filled = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-yellow-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  const empty = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-5 h-5 text-gray-300"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  const stars: string[] = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(i <= count ? filled : empty);
  }
  return stars.join("");
}

// =====================================================================
// Menu Resolution
// =====================================================================

interface MenuItemNode {
  id: string;
  label: string;
  url: string;
  target: string;
  children: MenuItemNode[];
}

async function resolveMenus(
  html: string,
  projectId: string,
  templateId: string | null
): Promise<string> {
  if (!html.includes("menu")) return html;

  const shortcodes: MenuShortcode[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(MENU_RE.source, "g");
  while ((match = re.exec(html)) !== null) {
    const attrs = parseAttrs(match[1]);
    if (!attrs.id) continue;
    shortcodes.push({ raw: match[0], id: attrs.id, template: attrs.template });
  }

  if (shortcodes.length === 0) return html;

  for (const sc of shortcodes) {
    const menu = await MenuModel.findByProjectAndSlug(projectId, sc.id);

    if (!menu) {
      html = html.replace(
        sc.raw,
        wrapResolved(sc.raw, `<nav data-menu="${escapeHtml(sc.id)}"></nav>`)
      );
      continue;
    }

    const items = await MenuItemModel.findItemsForMenuTree(menu.id);

    if (items.length === 0) {
      html = html.replace(
        sc.raw,
        wrapResolved(sc.raw, `<nav data-menu="${escapeHtml(sc.id)}"></nav>`)
      );
      continue;
    }

    const tree = buildMenuTree(items);

    let menuTemplateHtml: string | null = null;
    if (sc.template && templateId) {
      const mt = await MenuTemplateModel.findByTemplateAndSlug(
        templateId,
        sc.template
      );
      if (mt) {
        const sections =
          typeof mt.sections === "string"
            ? JSON.parse(mt.sections)
            : mt.sections;
        menuTemplateHtml = Array.isArray(sections)
          ? sections.map((s: any) => s.content || "").join("\n")
          : "";
      }
    }

    let rendered: string;
    if (menuTemplateHtml) {
      rendered = renderMenuWithTemplate(tree, menuTemplateHtml);
    } else {
      rendered = renderMenuHtml(tree, true);
    }

    const navWrapped = `<nav data-menu="${escapeHtml(sc.id)}">${rendered}</nav>`;
    html = html.replace(sc.raw, wrapResolved(sc.raw, navWrapped));
  }

  return html;
}

function buildMenuTree(items: any[]): MenuItemNode[] {
  const map = new Map<string, MenuItemNode>();
  const roots: MenuItemNode[] = [];

  for (const item of items) {
    map.set(item.id, {
      id: item.id,
      label: item.label,
      url: item.url,
      target: item.target || "_self",
      children: [],
    });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function renderMenuWithTemplate(
  tree: MenuItemNode[],
  templateHtml: string
): string {
  const startMarker = "{{start_menu_loop}}";
  const endMarker = "{{end_menu_loop}}";
  const startIdx = templateHtml.indexOf(startMarker);
  const endIdx = templateHtml.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) return templateHtml;

  const before = templateHtml.slice(0, startIdx);
  const itemTemplate = templateHtml.slice(
    startIdx + startMarker.length,
    endIdx
  );
  const after = templateHtml.slice(endIdx + endMarker.length);

  const rendered = tree
    .map((node) => renderMenuItemFromTemplate(node, itemTemplate))
    .join("\n");

  return before + rendered + after;
}

function renderMenuItemFromTemplate(
  node: MenuItemNode,
  template: string
): string {
  let html = template;
  html = html.replace(/\{\{menu_item\.label\}\}/g, escapeHtml(node.label));
  html = html.replace(/\{\{menu_item\.url\}\}/g, escapeHtml(node.url));
  html = html.replace(/\{\{menu_item\.target\}\}/g, escapeHtml(node.target));

  if (node.children.length > 0) {
    const childrenHtml =
      '<ul class="nav-submenu">' +
      node.children
        .map((c) => renderMenuItemFromTemplate(c, template))
        .join("\n") +
      "</ul>";
    html = html.replace(/\{\{menu_item\.children\}\}/g, childrenHtml);
  } else {
    html = html.replace(/\{\{menu_item\.children\}\}/g, "");
  }

  return html;
}

function renderMenuHtml(nodes: MenuItemNode[], isRoot: boolean): string {
  const cls = isRoot ? 'class="alloro-menu"' : 'class="alloro-submenu"';
  const items = nodes
    .map((node) => {
      const hasSub = node.children.length > 0;
      const liClass = hasSub ? ' class="has-submenu"' : "";
      const target =
        node.target && node.target !== "_self"
          ? ` target="${escapeHtml(node.target)}"`
          : "";
      const children = hasSub ? renderMenuHtml(node.children, false) : "";
      return `<li${liClass}><a href="${escapeHtml(node.url)}"${target}>${escapeHtml(node.label)}</a>${children}</li>`;
    })
    .join("");
  return `<ul ${cls}>${items}</ul>`;
}

// =====================================================================
// Marker Wrapper
// =====================================================================

function wrapResolved(originalToken: string, resolvedHtml: string): string {
  const encoded = originalToken
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div data-alloro-shortcode-original="${encoded}" style="pointer-events:none">${resolvedHtml}</div>`;
}

// =====================================================================
// Video Embed Builder
// =====================================================================

function buildVideoEmbed(url: string): string {
  if (!url) return "";

  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/
  );
  if (ytMatch) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div>`;
  }

  // Dailymotion: dailymotion.com/video/ID, dai.ly/ID
  const dmMatch = url.match(
    /(?:dailymotion\.com\/video\/|dai\.ly\/)([\w]+)/
  );
  if (dmMatch) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;"><iframe src="https://www.dailymotion.com/embed/video/${dmMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>`;
  }

  // Vimeo: vimeo.com/ID
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;"><iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="autoplay;fullscreen;picture-in-picture" allowfullscreen></iframe></div>`;
  }

  // Loom: loom.com/share/ID
  const loomMatch = url.match(/loom\.com\/share\/([\w]+)/);
  if (loomMatch) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;"><iframe src="https://www.loom.com/embed/${loomMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>`;
  }

  return "";
}

// =====================================================================
// Main Entry Point
// =====================================================================

export async function resolveShortcodes(
  html: string,
  projectId: string,
  templateId: string | null
): Promise<string> {
  try {
    html = await resolvePostBlocks(html, projectId, templateId);
    html = await resolveReviewBlocks(html, projectId, templateId);
    html = await resolveMenus(html, projectId, templateId);
    return html;
  } catch (error) {
    logger.error({ err: error }, "[ShortcodeResolver] Error resolving shortcodes:");
    return html;
  }
}
