import { logger } from "../../../lib/logger";
import type { DeviceMode } from "./postBlocksTab.types";

export const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "media_url", label: "Media URL" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Boolean" },
  { value: "select", label: "Select" },
  { value: "gallery", label: "Gallery" },
];

export const DEVICE_WIDTHS: Record<DeviceMode, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

// Placeholder post data for preview
const PLACEHOLDER_POST: Record<string, string> = {
  "{{post.title}}": "Sample Post Title",
  "{{post.slug}}": "sample-post-title",
  "{{post.url}}": "/services/sample-post-title",
  "{{post.content}}": "<p>This is sample post content that demonstrates how your post block will render. It can contain <strong>rich HTML</strong> including paragraphs, links, and formatting.</p>",
  "{{post.excerpt}}": "A brief summary of the post content for preview purposes.",
  "{{post.featured_image}}": "https://placehold.co/800x400/e2e8f0/64748b?text=Featured+Image",
  "{{post.categories}}": "Category One, Category Two",
  "{{post.tags}}": "tag-one, tag-two",
  "{{post.created_at}}": "March 5, 2026",
  "{{post.updated_at}}": "March 5, 2026",
  "{{post.published_at}}": "March 5, 2026",
};

const PREVIEW_POSTS = [
  { ...PLACEHOLDER_POST, "{{post.title}}": "First Post Title", "{{post.slug}}": "first-post-title", "{{post.url}}": "/services/first-post-title", "{{post.featured_image}}": "https://placehold.co/800x400/e2e8f0/64748b?text=Post+1" },
  { ...PLACEHOLDER_POST, "{{post.title}}": "Second Post Title", "{{post.slug}}": "second-post-title", "{{post.url}}": "/services/second-post-title", "{{post.featured_image}}": "https://placehold.co/800x400/dbeafe/3b82f6?text=Post+2" },
  { ...PLACEHOLDER_POST, "{{post.title}}": "Third Post Title", "{{post.slug}}": "third-post-title", "{{post.url}}": "/services/third-post-title", "{{post.featured_image}}": "https://placehold.co/800x400/fef3c7/f59e0b?text=Post+3" },
];

// =====================================================================
// Conditional Rendering ({{if}} / {{if_not}} / {{endif}})
//
// Strip {{if post.X}}...{{endif}} and {{if_not post.X}}...{{endif}} blocks
// based on whether the named field is empty in the placeholder dict.
//
// Empty = key absent in placeholder dict, value is empty string, or
// value is an empty array.
// Flat only — nesting aborts with logger.warn and leaves HTML unchanged.
//
// PREVIEW LIMITATION: custom field tokens (`post.custom.X`) are almost
// never in PLACEHOLDER_POST, so conditional blocks referencing them will
// be stripped in preview. Live site uses actual post data.
//
// NOTE: This logic is duplicated in two other locations. Keep in sync.
// The gallery-loop pass (renderGalleryLoops below) must ALSO stay in
// sync across all three:
//   - website-builder-rebuild/src/utils/shortcodes.ts (processConditionals)
//   - alloro/src/controllers/user-website/user-website-services/shortcodeResolver.service.ts
// =====================================================================

const CONDITIONAL_BLOCK_RE =
  /\{\{\s*(if|if_not)\s+post\.([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*endif\s*\}\}/g;
const ORPHAN_CONDITIONAL_RE =
  /\{\{\s*(?:if|if_not)\s+[^}]*\}\}|\{\{\s*endif\s*\}\}/g;
const NESTED_PROBE_RE = /\{\{\s*(?:if|if_not)\s+/;

const GALLERY_LOOP_RE =
  /\{\{\s*start_gallery_loop\s+field='([a-z0-9_-]+)'\s*\}\}([\s\S]*?)\{\{\s*end_gallery_loop\s*\}\}/gi;

function processConditionals(
  html: string,
  placeholderPost: Record<string, string>
): string {
  if (!html.includes("{{if")) return html;

  // Nesting detection — abort loudly.
  for (const probe of html.matchAll(CONDITIONAL_BLOCK_RE)) {
    if (NESTED_PROBE_RE.test(probe[3])) {
      logger.warn(
        `[PostBlocksTab] Nested conditional detected in post template (flat-only in v1). ` +
          `Field: post.${probe[2]}. Block: ${probe[0].slice(0, 200)}`
      );
      return html;
    }
  }

  let result = html.replace(
    CONDITIONAL_BLOCK_RE,
    (_match, kind: string, field: string, body: string) => {
      // Resolve field by looking up the literal token string in the dict.
      const token = `{{post.${field}}}`;
      const value = placeholderPost[token];
      // Empty: undefined, "", or "[]" (serialized empty array marker, if
      // a future caller ever chooses to pass one). Arrays as raw values
      // aren't representable in this token-string dict, so treat an
      // explicit empty-array marker literal as empty for parity with the
      // server resolver's empty-array fix.
      const empty = value === undefined || value === "" || value === "[]";
      const keep = kind === "if" ? !empty : empty;
      return keep ? body : "";
    }
  );

  // Orphan cleanup.
  result = result.replace(ORPHAN_CONDITIONAL_RE, "");
  return result;
}

// Minimal gallery-loop pass for admin preview.
//
// The PLACEHOLDER_POST dict is keyed by literal token strings, so we have
// no structured per-item data to iterate. The right preview behavior is
// to strip the block (consistent with the empty-array case on the server)
// so authors don't see the raw {{start_gallery_loop ...}} / {{item.X}}
// tokens leaking through. Authors preview gallery rendering on the live
// site / admin post editor; the structured-editor preview is for
// markup-level tweaks, not data-level previewing.
function renderGalleryLoops(html: string): string {
  if (!html.includes("start_gallery_loop")) return html;
  return html.replace(GALLERY_LOOP_RE, () => "");
}

export function replacePlaceholders(html: string): string {
  // Step A: strip gallery-loop blocks for preview (no structured data
  // available in the token-string dict — mirrors server empty-array case).
  const afterGallery = renderGalleryLoops(html);

  const startMarker = "{{start_post_loop}}";
  const endMarker = "{{end_post_loop}}";
  const startIdx = afterGallery.indexOf(startMarker);
  const endIdx = afterGallery.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = afterGallery.slice(0, startIdx);
    const template = afterGallery.slice(startIdx + startMarker.length, endIdx);
    const after = afterGallery.slice(endIdx + endMarker.length);

    const rendered = PREVIEW_POSTS.map((post) => {
      // Conditional pass first — per-post so different preview posts can
      // resolve differently (though in practice they share the same shape).
      let result = processConditionals(template, post);
      for (const [token, value] of Object.entries(post)) {
        result = result.replaceAll(token, value);
      }
      return result;
    }).join("\n");

    return before + rendered + after;
  }

  // Fallback: no loop markers — single post replacement
  let result = processConditionals(afterGallery, PLACEHOLDER_POST);
  for (const [token, value] of Object.entries(PLACEHOLDER_POST)) {
    result = result.replaceAll(token, value);
  }
  return result;
}
