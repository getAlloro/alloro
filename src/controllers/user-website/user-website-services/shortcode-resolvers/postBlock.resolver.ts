/**
 * Post Block Resolver
 *
 * Resolves {{ post_block ... }} shortcodes (doctors / services / staff /
 * locations / generic posts). Extracted verbatim from
 * shortcodeResolver.service.ts as part of a behavior-preserving
 * decomposition — DB access stays in models, rendering output is
 * byte-identical.
 */

import { PostModel } from "../../../../models/website-builder/PostModel";
import { PostBlockModel } from "../../../../models/website-builder/PostBlockModel";
import {
  escapeHtml,
  POST_BLOCK_RE,
  parseAttrs,
  isPaginatedMode,
  getPostOrderColumn,
  getSortOrder,
  getPreviewPerPage,
  parseNonNegativeInt,
  type PostBlockShortcode,
} from "../../user-website-utils/shortcode-parsing";
import {
  processConditionals,
  renderGalleryLoops,
} from "../../user-website-utils/shortcode-conditionals";
import { buildVideoEmbed } from "../../user-website-utils/video-embed";
import { wrapResolved } from "./shared";

export async function resolvePostBlocks(
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
        if (
          typeof val !== "string" &&
          typeof val !== "number" &&
          typeof val !== "boolean"
        ) {
          return "";
        }
        return escapeHtml(String(val)).replace(/\n/g, "<br>");
      }
    );

    return html;
  });

  return before + rendered.join("\n") + after;
}
