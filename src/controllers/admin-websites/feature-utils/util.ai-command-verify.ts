/**
 * AI Command — post-publish edit verification.
 *
 * After a batch publishes its drafts, this pass re-reads the published content
 * for every recommendation marked "executed" and confirms the edit actually
 * landed. Execution status is otherwise set from "the LLM returned HTML", not
 * "the change reached the published page" — so an edit lost to a section-index
 * drift or a concurrent overwrite would still be reported as a success. Here any
 * such recommendation is downgraded to "failed" with a reason, so the batch
 * stats tell the truth and the operator can re-run only the failures.
 *
 * The check is deliberately conservative: a recommendation is failed only when
 * the change is provably absent — none of the distinctive tokens the edit
 * introduced appear in the published content. Pure removals, or edits with no
 * derivable new token, are left untouched (a warn is logged). A false "executed"
 * is preferred over a false "failed".
 */

import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { PostModel } from "../../../models/website-builder/PostModel";
import { normalizeSections } from "./util.section-normalizer";
import logger from "../../../lib/logger";

const MIN_TOKEN_LENGTH = 5;
const VERIFIABLE_TARGET_TYPES = new Set(["page_section", "layout", "post"]);
const TOKEN_SPLIT = /[\s"'<>=(){};,]+/;

const normalize = (s: string): string => (s || "").replace(/\s+/g, " ").toLowerCase();

/**
 * Tokens present in the edited HTML but not in the pre-edit HTML — the "new"
 * content the edit introduced. Tokens shorter than MIN_TOKEN_LENGTH are dropped
 * as too common to be distinctive. URLs/paths survive intact (`/`, `:`, `.` are
 * not split points), so a `cal.com` → `/book-a-demo` swap yields `/book-a-demo`.
 */
export function extractAddedTokens(currentHtml: string, editedHtml: string): string[] {
  const tokenize = (s: string): string[] =>
    normalize(s)
      .split(TOKEN_SPLIT)
      .filter((tok) => tok.length >= MIN_TOKEN_LENGTH);

  const before = new Set(tokenize(currentHtml));
  const added = new Set<string>();
  for (const tok of tokenize(editedHtml)) {
    if (!before.has(tok)) added.add(tok);
  }
  return [...added];
}

/**
 * True when the edit can be considered present in the published content: either
 * no distinctive new token could be derived (not assertable → don't fail), or at
 * least one added token appears in the published content.
 */
export function changeIsPresent(addedTokens: string[], publishedContent: string): boolean {
  if (addedTokens.length === 0) return true;
  const haystack = normalize(publishedContent);
  return addedTokens.some((tok) => haystack.includes(tok));
}

/**
 * Re-read the now-published content for a recommendation's target. Returns null
 * when the target row no longer exists (treated as not-assertable upstream).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readPublishedContent(rec: any): Promise<string | null> {
  const meta =
    typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  if (rec.target_type === "layout") {
    const project = await ProjectModel.findRawById(rec.target_id);
    return project ? project[meta.layout_field] || "" : null;
  }

  if (rec.target_type === "post") {
    const post = await PostModel.findRawById(rec.target_id);
    return post ? post.content || "" : null;
  }

  if (rec.target_type === "page_section") {
    const origPage = await PageModel.findRawById(rec.target_id);
    if (!origPage) return null;
    const published = await PageModel.findRawByProjectPathStatus(
      origPage.project_id,
      origPage.path,
      "published"
    );
    if (!published) return null;
    const rawSections =
      typeof published.sections === "string"
        ? JSON.parse(published.sections)
        : published.sections;
    const section = normalizeSections(rawSections)[meta.section_index];
    if (!section) return "";
    return typeof section === "string" ? section : section.content || section.html || "";
  }

  return null;
}

/**
 * Verify every "executed" HTML recommendation in a batch against the published
 * content, downgrading any whose change did not land. Never throws — a row that
 * cannot be read or asserted is left as-is and logged.
 */
export async function verifyBatchEdits(
  batchId: string
): Promise<{ verified: number; downgraded: number }> {
  const executed = await AiCommandRecommendationModel.findByBatchId(batchId, {
    status: "executed",
  });

  let verified = 0;
  let downgraded = 0;

  for (const rec of executed) {
    if (!VERIFIABLE_TARGET_TYPES.has(rec.target_type)) continue;

    let result: Record<string, unknown> = {};
    try {
      result =
        typeof rec.execution_result === "string"
          ? JSON.parse(rec.execution_result)
          : rec.execution_result || {};
    } catch {
      result = {};
    }

    const editedHtml = (result.edited_html as string) || "";
    if (!editedHtml) continue;

    const addedTokens = extractAddedTokens(rec.current_html || "", editedHtml);
    if (addedTokens.length === 0) continue;

    let publishedContent: string | null;
    try {
      publishedContent = await readPublishedContent(rec);
    } catch (err) {
      logger.warn(
        { recId: rec.id, batchId, err: (err as Error).message },
        "[AiCommand] Verify: could not re-read published content — leaving as executed"
      );
      continue;
    }
    if (publishedContent == null) continue;

    if (changeIsPresent(addedTokens, publishedContent)) {
      verified++;
      continue;
    }

    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({
        ...result,
        verified: false,
        verify_reason:
          "Edit not found in published content after publish (possible overwrite or section-index drift).",
      }),
    });
    downgraded++;
    logger.warn(
      { recId: rec.id, batchId, target: rec.target_label },
      "[AiCommand] Verify: edit did not reach published content — downgraded executed→failed"
    );
  }

  logger.info({ batchId, verified, downgraded }, "[AiCommand] Verify pass complete");
  return { verified, downgraded };
}
