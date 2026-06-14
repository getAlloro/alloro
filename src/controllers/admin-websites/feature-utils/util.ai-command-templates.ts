/**
 * AI Command — template awareness
 *
 * Fetches a project's post_block / menu / review_block templates and renders
 * them into the prompt-context block appended to AI editor prompts so the LLM
 * recommends valid shortcodes. Extracted from `service.ai-command.ts` as part
 * of a behavior-preserving decomposition; logic and output are unchanged.
 */

import { PostBlockModel } from "../../../models/website-builder/PostBlockModel";
import { MenuTemplateModel } from "../../../models/website-builder/MenuTemplateModel";
import { ReviewBlockModel } from "../../../models/website-builder/ReviewBlockModel";

export interface ProjectTemplates {
  postBlocks: Array<{ slug: string; name: string; description: string | null; postTypeSlug: string }>;
  menuTemplates: Array<{ slug: string; name: string }>;
  reviewBlocks: Array<{ slug: string; name: string; description: string | null }>;
}

export async function getProjectTemplates(templateId: string | null): Promise<ProjectTemplates> {
  const empty: ProjectTemplates = { postBlocks: [], menuTemplates: [], reviewBlocks: [] };
  if (!templateId) return empty;

  const [postBlocks, menuTemplates, reviewBlocks] = await Promise.all([
    PostBlockModel.findWithPostTypeByTemplateId(templateId),
    MenuTemplateModel.findSlugNameByTemplateId(templateId),
    ReviewBlockModel.findSlugNameDescriptionByTemplateId(templateId),
  ]);

  return {
    postBlocks: postBlocks.map((pb: any) => ({
      slug: pb.slug,
      name: pb.name,
      description: pb.description || null,
      postTypeSlug: pb.post_type_slug,
    })),
    menuTemplates: menuTemplates.map((mt: any) => ({
      slug: mt.slug,
      name: mt.name,
    })),
    reviewBlocks: reviewBlocks.map((rb: any) => ({
      slug: rb.slug,
      name: rb.name,
      description: rb.description || null,
    })),
  };
}

export function buildTemplateContext(templates: ProjectTemplates): string {
  const lines: string[] = ["\n## Available Shortcode Templates\n"];

  if (templates.postBlocks.length > 0) {
    lines.push("### Post Block Templates (use with {{ post_block id='SLUG' items='POST_TYPE' }})");
    lines.push("For full article indexes, prefer {{ post_block id='articles-grid' items='articles' paginate='load-more' per_page='9' limit='0' }} when that template is available.");
    for (const pb of templates.postBlocks) {
      lines.push(`- ${pb.slug} (${pb.name}) — renders '${pb.postTypeSlug}' posts${pb.description ? ` — "${pb.description}"` : ""}`);
    }
    lines.push("");
  } else {
    lines.push("### Post Block Templates\n(none available — if recommending a post_block shortcode, note that a template must be created first)\n");
  }

  if (templates.menuTemplates.length > 0) {
    lines.push("### Menu Templates (use with {{ menu id='MENU_SLUG' template='TEMPLATE_SLUG' }})");
    for (const mt of templates.menuTemplates) {
      lines.push(`- ${mt.slug} (${mt.name})`);
    }
    lines.push("");
  }

  if (templates.reviewBlocks.length > 0) {
    lines.push("### Review Block Templates (use with {{ review_block id='SLUG' }})");
    lines.push("For compact long review lists, prefer {{ review_block id='review-list-compact' location='primary' paginate='load-more' per_page='6' limit='0' }} when that template is available.");
    for (const rb of templates.reviewBlocks) {
      lines.push(`- ${rb.slug} (${rb.name})${rb.description ? ` — "${rb.description}"` : ""}`);
    }
    lines.push("");
  } else {
    lines.push("### Review Block Templates\n(none available — if recommending a review_block shortcode, note that a template must be created first)\n");
  }

  return lines.join("\n");
}
