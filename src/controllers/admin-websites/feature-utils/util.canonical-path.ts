/**
 * Deterministic canonical path derivation.
 *
 * The canonical URL of a page or post is a pure function of where it is
 * served — a page's own `path`, a post's `/{post_type.slug}/{post.slug}` —
 * yet the generation prompt used to ask the LLM to write it as free text,
 * which fabricated plausible-looking-but-wrong paths on every post (pages
 * survived only because `page_path` happened to be in the user prompt).
 * ~380 posts across three live sites carried fabricated canonicals before
 * the 2026-07-02 data repair. The prompt no longer asks for the field
 * (SeoGeneration.critical.md); this helper is the code-level guarantee that
 * every generation call path — admin UI single-section, "Generate All",
 * the bulk worker, and the backfill scripts — writes the real path
 * regardless of what any model outputs.
 *
 * Returns null (never throws) when the entity can't be resolved, so a
 * lookup hiccup degrades to "no override" instead of failing a generation.
 */

import { PageModel } from "../../../models/website-builder/PageModel";
import { PostModel } from "../../../models/website-builder/PostModel";
import { PostTypeModel } from "../../../models/website-builder/PostTypeModel";
import logger from "../../../lib/logger";

export async function deriveCanonicalPath(
  entityId: string,
  entityType: "page" | "post"
): Promise<string | null> {
  try {
    if (entityType === "page") {
      const page = await PageModel.findRawById(entityId);
      return typeof page?.path === "string" && page.path.length > 0 ? page.path : null;
    }

    const post = await PostModel.findRawById(entityId);
    if (!post?.slug || !post?.post_type_id) return null;

    const postType = await PostTypeModel.findRawById(post.post_type_id);
    if (!postType?.slug) return null;

    return `/${postType.slug}/${post.slug}`;
  } catch (err) {
    logger.warn(
      { err, entityId, entityType },
      "[SEO Generation] Canonical derivation failed — generation continues without override"
    );
    return null;
  }
}
