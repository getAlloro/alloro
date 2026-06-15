/**
 * Review Block Resolver
 *
 * Resolves {{ review_block ... }} shortcodes. Extracted verbatim from
 * shortcodeResolver.service.ts as part of a behavior-preserving
 * decomposition — DB access stays in models, rendering output is
 * byte-identical.
 */

import { ProjectReviewModel } from "../../../../models/website-builder/ProjectReviewModel";
import { ReviewBlockModel } from "../../../../models/website-builder/ReviewBlockModel";
import {
  escapeHtml,
  REVIEW_BLOCK_RE,
  parseAttrs,
  isPaginatedMode,
  clamp,
  parsePositiveInt,
  parseNonNegativeInt,
  getPreviewPerPage,
  getSortOrder,
  type ReviewBlockShortcode,
} from "../../user-website-utils/shortcode-parsing";
import { wrapResolved } from "./shared";

export async function resolveReviewBlocks(
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
  if (
    !scope ||
    (scope.locationIds.length === 0 && scope.placeIds.length === 0)
  ) {
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
  const filled =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-yellow-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  const empty =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-5 h-5 text-gray-300"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  const stars: string[] = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(i <= count ? filled : empty);
  }
  return stars.join("");
}
