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
 * For HTML edits the check is deliberately conservative: a recommendation is
 * failed only when the change is provably absent — none of the distinctive
 * tokens the edit introduced appear in the published content. Pure removals, or
 * edits with no derivable new token, are left untouched (a warn is logged). A
 * false "executed" is preferred over a false "failed", because the edited HTML
 * is LLM-authored and only fuzzily comparable.
 *
 * `page_seo_schema` is verified STRICTLY instead, and the asymmetry is
 * deliberate: the approved schema is an exact JSON-LD array, so "is it live?" is
 * decidable rather than fuzzy. The published `seo_data.schema_json` must contain
 * every approved entry; if it does not — or if it cannot be read at all — the
 * recommendation is failed. A false "failed" there costs one idempotent re-run,
 * whereas a false "executed" would claim structured data is live when it is not.
 */

import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { PostModel } from "../../../models/website-builder/PostModel";
import { normalizeSections } from "./util.section-normalizer";
import {
  type PageSeoSchemaRecommendationRow,
  parseRecommendationMeta,
  readApprovedSchema,
} from "./util.ai-command-seo-schema-contract";
import logger from "../../../lib/logger";

const MIN_TOKEN_LENGTH = 5;
/** The seo_data.schema_json writer — verified structurally, not by HTML tokens. */
const SCHEMA_TARGET_TYPE = "page_seo_schema";
const VERIFIABLE_TARGET_TYPES = new Set([
  "page_section",
  "layout",
  "post",
  SCHEMA_TARGET_TYPE,
]);
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
 * Deep structural containment: every key in `expected` is present in `actual`
 * with an equal value. `actual` may carry EXTRA keys (the handler merges into
 * whatever `seo_data` already held), so this is containment, not equality.
 * Arrays must match element-wise in order.
 */
export function schemaEntryMatches(expected: unknown, actual: unknown): boolean {
  if (expected === null || typeof expected !== "object") return expected === actual;

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((item, i) => schemaEntryMatches(item, actual[i]));
  }

  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const actualRecord = actual as Record<string, unknown>;
  return Object.entries(expected as Record<string, unknown>).every(
    ([key, value]) =>
      Object.prototype.hasOwnProperty.call(actualRecord, key) &&
      schemaEntryMatches(value, actualRecord[key])
  );
}

/**
 * True when every approved JSON-LD entry is present in the published
 * `schema_json` array under a ONE-TO-ONE assignment: each approved entry must be
 * satisfied by its OWN published candidate, never by one candidate shared across
 * several approved entries.
 *
 * The one-to-one requirement is load-bearing, not pedantry. `schemaEntryMatches`
 * is CONTAINMENT, so a candidate satisfies every approved entry it contains — an
 * approved entry and the more specific approved entry that extends it can both
 * point at the same published object. A per-entry "does some candidate match?"
 * test therefore reads a published array that LOST an entry as a pass, which is
 * the one failure this module refuses: claiming structured data is live when it
 * is not (see the strictness note in the module doc).
 *
 * Assignment is a maximum bipartite matching (augmenting paths), deliberately
 * NOT a greedy first-fit. Greedy depends on array order — a general approved
 * entry can consume the one candidate a more specific approved entry needed,
 * reporting a failure even though a valid one-to-one assignment exists. That
 * would break this function's order-independence contract below, so the matching
 * is worth its ~15 lines. Both arrays are a handful of JSON-LD entries, so the
 * O(V·E) cost is irrelevant.
 *
 * Order-independent across entries: the handler writes the approved array
 * verbatim, but a consumer re-ordering it must not read as a failure. EXTRA
 * published entries, and extra keys inside a matched entry, remain allowed — the
 * question is "did every approved entry land?", not "is the published array
 * exactly the approved array".
 */
export function publishedSchemaContains(
  approved: Record<string, unknown>[],
  publishedSchema: unknown
): boolean {
  if (!Array.isArray(publishedSchema)) return false;
  // Pigeonhole: more approved entries than candidates can never be one-to-one.
  if (approved.length > publishedSchema.length) return false;

  // candidates[i] = every published index that could satisfy approved[i].
  const candidates = approved.map((entry) =>
    publishedSchema.reduce<number[]>((acc, candidate, i) => {
      if (schemaEntryMatches(entry, candidate)) acc.push(i);
      return acc;
    }, [])
  );

  // Kuhn's algorithm: give each approved entry a distinct published entry,
  // re-homing an earlier claim along an augmenting path when one is contested.
  const claimedBy = new Array<number>(publishedSchema.length).fill(-1);
  const claim = (entryIdx: number, visited: boolean[]): boolean => {
    for (const candidateIdx of candidates[entryIdx]) {
      if (visited[candidateIdx]) continue;
      visited[candidateIdx] = true;
      if (claimedBy[candidateIdx] === -1 || claim(claimedBy[candidateIdx], visited)) {
        claimedBy[candidateIdx] = entryIdx;
        return true;
      }
    }
    return false;
  };

  // An entry that cannot be claimed leaves the matching short of every approved
  // entry, and no later assignment can recover it — so a short-circuit is exact.
  return approved.every((_entry, entryIdx) =>
    claim(entryIdx, new Array<boolean>(publishedSchema.length).fill(false))
  );
}

/**
 * Verify one executed `page_seo_schema` recommendation against the LIVE page:
 * re-read the published row's `seo_data.schema_json` and confirm it contains the
 * approved array. Anything short of proof-of-presence — no published row, an
 * unreadable/!array `seo_data`, or a missing entry — fails the recommendation
 * (see the strictness note in the module doc).
 */
async function findSchemaVerificationFailure(
  rec: PageSeoSchemaRecommendationRow,
  approved: Record<string, unknown>[]
): Promise<string | null> {
  const origPage = await PageModel.findRawById(rec.target_id);
  if (!origPage) {
    return `Original page ${rec.target_id} is missing; the approved schema cannot be confirmed live.`;
  }

  const published = await PageModel.findRawByProjectPathStatus(
    origPage.project_id,
    origPage.path,
    "published"
  );
  if (!published) {
    return `No published row for ${origPage.path} after publish — the approved schema is not live.`;
  }

  const seoData = parseRecommendationMeta(published.seo_data) ?? {};
  if (!publishedSchemaContains(approved, seoData.schema_json)) {
    return `Published seo_data.schema_json for ${origPage.path} does not contain the approved schema (publish failure or concurrent overwrite).`;
  }

  return null;
}

async function verifySchemaRecommendation(
  rec: PageSeoSchemaRecommendationRow
): Promise<"verified" | "downgraded"> {
  const approved = readApprovedSchema(rec.target_meta);
  let reason =
    approved
      ? null
      : "Approved page_seo_schema metadata is invalid; a non-empty JSON-LD object array is required.";

  if (approved) {
    try {
      reason = await findSchemaVerificationFailure(rec, approved);
    } catch (err) {
      reason = `Could not read published seo_data.schema_json to verify the write: ${(err as Error).message}`;
    }
  }

  if (!reason) return "verified";

  const prior = parseRecommendationMeta(rec.execution_result) ?? {};

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "failed",
    execution_result: JSON.stringify({
      ...prior,
      success: false,
      verified: false,
      schema_written: false,
      verify_reason: reason,
    }),
  });
  logger.warn(
    { recId: rec.id, target: rec.target_label, reason },
    "[AiCommand] Verify: approved schema not confirmed live — downgraded executed→failed"
  );
  return "downgraded";
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

    // The schema write is structurally verifiable against the live page — it
    // carries no `edited_html`, so it needs its own comparison, not the token
    // heuristic below.
    if (rec.target_type === SCHEMA_TARGET_TYPE) {
      const outcome = await verifySchemaRecommendation(
        rec as PageSeoSchemaRecommendationRow
      );
      if (outcome === "verified") verified++;
      else downgraded++;
      continue;
    }

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
