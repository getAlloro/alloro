/**
 * Shortcode Conditional + Gallery-Loop Engine
 *
 * Pure template-transform helpers extracted verbatim from
 * shortcodeResolver.service.ts as part of a behavior-preserving
 * decomposition. Consumed by the post_block resolver.
 *
 * Covers two passes that MUST stay in sync with the duplicated logic in:
 *   - website-builder-rebuild/src/utils/shortcodes.ts (processConditionals)
 *   - alloro/frontend/src/components/Admin/PostBlocksTab.tsx
 *
 * Uses the Pino logger for loud-failure warnings; no DB, no other side
 * effects.
 *
 * =====================================================================
 * Conditional Rendering ({{if}} / {{if_not}} / {{endif}})
 *
 * Strip {{if post.X}}...{{endif}} and {{if_not post.X}}...{{endif}} blocks
 * based on whether the named field is empty.
 *
 * Empty = null, undefined, "", or an empty array. "0", 0, false are NOT
 * empty. Flat only — nesting is detected and the input is returned
 * unchanged with a warning (loud failure).
 * =====================================================================
 */

import logger from "../../../lib/logger";
import { escapeHtml } from "../user-website-utils/shortcode-parsing";

const CONDITIONAL_BLOCK_RE =
  /\{\{\s*(if|if_not)\s+post\.([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*endif\s*\}\}/g;
const ORPHAN_CONDITIONAL_RE =
  /\{\{\s*(?:if|if_not)\s+[^}]*\}\}|\{\{\s*endif\s*\}\}/g;
const NESTED_PROBE_RE = /\{\{\s*(?:if|if_not)\s+/;

export function isConditionalValueEmpty(value: unknown): boolean {
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

export function processConditionals(
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

function processItemConditionals(
  body: string,
  item: Record<string, unknown>
): string {
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

export function renderGalleryLoops(
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
          if (
            typeof v !== "string" &&
            typeof v !== "number" &&
            typeof v !== "boolean"
          ) {
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
