/**
 * Shortcode Resolver Service
 *
 * Resolves {{ post_block ... }}, {{ review_block ... }} and {{ menu ... }}
 * shortcodes in HTML for the editor preview / rendering path.
 * Ported from website-builder-rebuild/src/services/postblock.service.ts
 * and menu.service.ts.
 *
 * This module is the orchestrator + public entry point. The per-shortcode
 * resolvers live in ./shortcode-resolvers/ and the pure helpers in
 * ../user-website-utils/ (shortcode-parsing, shortcode-conditionals,
 * video-embed). Decomposed from a single ~955-line file; behavior is
 * preserved verbatim. The pre-existing internal helpers are re-exported
 * below so any deep import of this module keeps resolving.
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
 * When adding a new shortcode type, add a resolver under
 * ./shortcode-resolvers/, wire it into resolveShortcodes below, and update
 * the vocabulary above so template annotations stay aligned.
 */

import logger from "../../../lib/logger";
import { resolvePostBlocks } from "./shortcode-resolvers/postBlock.resolver";
import { resolveReviewBlocks } from "./shortcode-resolvers/reviewBlock.resolver";
import { resolveMenus } from "./shortcode-resolvers/menu.resolver";

// Re-export the resolver + helper surface so existing deep imports of this
// module (if any are added later) continue to resolve from this path.
export { resolvePostBlocks } from "./shortcode-resolvers/postBlock.resolver";
export { resolveReviewBlocks } from "./shortcode-resolvers/reviewBlock.resolver";
export { resolveMenus } from "./shortcode-resolvers/menu.resolver";
export { wrapResolved } from "./shortcode-resolvers/shared";
export {
  escapeHtml,
  parseAttrs,
  isPaginatedMode,
  parseNonNegativeInt,
  parsePositiveInt,
  clamp,
  getPreviewPerPage,
  getPostOrderColumn,
  getSortOrder,
  POST_BLOCK_RE,
  MENU_RE,
  REVIEW_BLOCK_RE,
  type PostBlockShortcode,
  type ReviewBlockShortcode,
  type MenuShortcode,
} from "../user-website-utils/shortcode-parsing";
export {
  isConditionalValueEmpty,
  processConditionals,
  renderGalleryLoops,
} from "../user-website-utils/shortcode-conditionals";
export { buildVideoEmbed } from "../user-website-utils/video-embed";

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
    logger.error(
      { err: error },
      "[ShortcodeResolver] Error resolving shortcodes:"
    );
    return html;
  }
}
