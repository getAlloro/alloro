/**
 * Get-found checker — Alloro Funnel Engine Slice 1a orchestrator.
 *
 * READ-ONLY and ADVISORY. Runs the five 1a pieces over a hosted page and emits
 * advisory recommendations only — it writes nothing live, touches no GBP, and
 * adds no autonomy. Slice 1b wires these recommendations into the existing
 * human-approved rail; this module stops at producing them.
 *
 * Reconcile-first (spec rule): this orchestrator REUSES the shipping subsystems —
 *   - identityExtractionService.extractIdentityFromHtml → parse ld+json (incl.
 *     @graph), extract the entity, discover sameAs (NOT re-implemented here),
 *   - entityConsistencyService.compareExternalIdentity → GBP↔page consistency,
 *   - GeneratedCopySafetyService.validateGeneratedCopy → the honesty gate
 *     (neutral shared service under src/services/, consumed by both this
 *     checker and the GBP domain — §7.1 forbids importing another domain's
 *     controller-scoped feature-service),
 * and adds only the thin new logic (schema completeness, answer-first lint,
 * recommendation assembly, observability).
 */

import logger from "../../lib/logger";
import { extractIdentityFromHtml } from "./identityExtractionService";
import { compareExternalIdentity } from "./entityConsistencyService";
import {
  scoreSchemaCompleteness,
  type SchemaCompletenessResult,
} from "./schemaCompletenessScoring";
import {
  scoreGbpCompleteness,
  gbpFieldLabel,
  type GbpCompletenessInput,
  type GbpCompletenessResult,
} from "./gbpCompletenessScoring";
import {
  lintAnswerFirstStructure,
  type AnswerFirstLintResult,
} from "./answerFirstStructureLint";
import { GeneratedCopySafetyService } from "../content-safety/GeneratedCopySafetyService";
import type { ExtractedBusinessIdentity, AiSeoExternalMatchState } from "./types";

/** Internal-only signal string. NEVER placed in owner-facing recommendation copy. */
export const INTERNAL_AEO_INCOMPLETE_SIGNAL = "AEO-incomplete";

/** Internal-only signal string for GBP completeness. NEVER owner-facing. Gates nothing. */
export const INTERNAL_GBP_INCOMPLETE_SIGNAL = "GBP-incomplete";

export interface GbpPageConsistencyFlag {
  state: AiSeoExternalMatchState;
  /** True only when the GBP profile and page schema genuinely disagree. */
  diverges: boolean;
  comparedFields: Record<string, unknown>;
}

/**
 * One advisory recommendation. `title`/`detail` are owner-facing and must never
 * contain the internal AEO signal. `internalSignals` is admin-only.
 */
export interface AdvisoryRecommendation {
  code: string;
  title: string;
  detail: string;
  /** Admin/internal only — never rendered to an owner. Gates nothing. */
  internalSignals: string[];
}

export interface GetFoundCheckInput {
  url: string;
  html: string;
  /**
   * GBP profile identity, when a listing is connected. Omit/undefined → the
   * consistency flag is skipped (edge case: no GBP → score page schema only).
   */
  gbpIdentity?: ExtractedBusinessIdentity | null;
  /**
   * The practice's own condensed GBP record (client_gbp), when available. Omit
   * → the GBP completeness score is skipped (hasData:false, no recommendation).
   */
  gbpCompleteness?: GbpCompletenessInput | null;
}

export interface GetFoundCheckResult {
  url: string;
  schemaCompleteness: SchemaCompletenessResult;
  /** null when no GBP identity was supplied (consistency flag skipped). */
  gbpPageConsistency: GbpPageConsistencyFlag | null;
  /** GBP own-completeness grade. hasData:false when no GBP record was supplied. */
  gbpCompleteness: GbpCompletenessResult;
  answerFirst: AnswerFirstLintResult;
  honesty: {
    /** Copy proposed for this page; each entry run through the honesty gate. */
    checked: number;
    passed: boolean;
    blockedReasons: string[];
  };
  recommendations: AdvisoryRecommendation[];
  /** Admin/internal only. Never owner-facing. Gates nothing. */
  internalSignals: string[];
}

/**
 * Run the get-found checker on one hosted page.
 *
 * @param input.candidateCopy optional generated copy blocks to honesty-check
 *   (schema descriptions, answer-first paragraphs). When omitted, the honesty
 *   gate reports 0 checked / passed (nothing to reject yet).
 */
export function runGetFoundChecker(
  input: GetFoundCheckInput,
  candidateCopy: string[] = [],
): GetFoundCheckResult {
  const { url, html, gbpIdentity } = input;

  // REUSE: single parse/extraction pass (ld+json @graph, entity, sameAs).
  const { identity, schemaItems } = extractIdentityFromHtml(html, url);

  // 1. Schema completeness (new grading over the reused extraction).
  const schemaCompleteness = scoreSchemaCompleteness(schemaItems);

  // 2. GBP↔page consistency (read-only). Skipped when there is no GBP.
  let gbpPageConsistency: GbpPageConsistencyFlag | null = null;
  if (gbpIdentity) {
    const pageText = extractPlainText(html);
    const { state, comparedFields } = compareExternalIdentity(
      gbpIdentity,
      identity,
      pageText,
    );
    gbpPageConsistency = {
      state,
      diverges: state === "conflicting",
      comparedFields,
    };
  }

  // 3. Answer-first structure lint.
  const answerFirst = lintAnswerFirstStructure(html);

  // 3b. GBP own-completeness (read-only). hasData:false when no record supplied.
  const gbpCompleteness = scoreGbpCompleteness(input.gbpCompleteness);

  // 4. Honesty gate over any proposed copy (shared GeneratedCopySafetyService).
  const blockedReasons: string[] = [];
  let honestyPassed = true;
  for (const copy of candidateCopy) {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    if (!result.isSafe) {
      honestyPassed = false;
      blockedReasons.push(...result.reasons);
    }
  }

  const recommendations = buildRecommendations(
    schemaCompleteness,
    gbpPageConsistency,
    answerFirst,
    gbpCompleteness,
  );

  const internalSignals = [
    ...(schemaCompleteness.aeoIncomplete ? [INTERNAL_AEO_INCOMPLETE_SIGNAL] : []),
    ...(gbpCompleteness.gbpIncomplete ? [INTERNAL_GBP_INCOMPLETE_SIGNAL] : []),
  ];

  const result: GetFoundCheckResult = {
    url,
    schemaCompleteness,
    gbpPageConsistency,
    gbpCompleteness,
    answerFirst,
    honesty: {
      checked: candidateCopy.length,
      passed: honestyPassed,
      blockedReasons,
    },
    recommendations,
    internalSignals,
  };

  // 5. Observability hook: checker ran, fields flagged, honesty-lint result.
  logger.info(
    {
      checker: "get-found",
      url,
      schemaHasGradableEntity: schemaCompleteness.hasGradableEntity,
      schemaMissingFieldCount: schemaCompleteness.missingFields.length,
      schemaMissingFields: schemaCompleteness.missingFields,
      gbpConsistencyState: gbpPageConsistency?.state ?? "skipped",
      gbpHasData: gbpCompleteness.hasData,
      gbpMissingFieldCount: gbpCompleteness.missingFields.length,
      gbpMissingFields: gbpCompleteness.missingFields,
      answerFirstFlags: answerFirst.flags,
      honestyChecked: candidateCopy.length,
      honestyPassed,
      internalSignals,
    },
    "[get-found] checker run complete",
  );

  return result;
}

/**
 * Assemble advisory recommendations from the read-only findings. Owner-facing
 * copy only — no internal signal, no rank/visibility claim.
 */
function buildRecommendations(
  schema: SchemaCompletenessResult,
  consistency: GbpPageConsistencyFlag | null,
  answerFirst: AnswerFirstLintResult,
  gbp: GbpCompletenessResult,
): AdvisoryRecommendation[] {
  const recommendations: AdvisoryRecommendation[] = [];

  if (schema.missingFields.length > 0) {
    recommendations.push({
      code: "schema_completeness",
      title: "Complete this page's structured data",
      detail: `Add these structured-data fields so search and AI readers can parse the page: ${schema.missingFields.join(", ")}.`,
      internalSignals: schema.aeoIncomplete ? [INTERNAL_AEO_INCOMPLETE_SIGNAL] : [],
    });
  }

  if (gbp.hasData && gbp.missingFields.length > 0) {
    recommendations.push({
      code: "gbp_completeness",
      title: "Complete your Google Business Profile",
      detail: `Add these details to your Google Business Profile so people and search can read it fully: ${gbp.missingFields.map(gbpFieldLabel).join(", ")}.`,
      internalSignals: gbp.gbpIncomplete ? [INTERNAL_GBP_INCOMPLETE_SIGNAL] : [],
    });
  }

  if (consistency?.diverges) {
    recommendations.push({
      code: "gbp_page_consistency",
      title: "Align the page with the Google Business Profile",
      detail:
        "The page's business details do not match the connected Google Business Profile. Make the name, address, and phone consistent.",
      internalSignals: [],
    });
  }

  for (const flag of answerFirst.flags) {
    recommendations.push({
      code: `answer_first:${flag}`,
      title: answerFirstTitle(flag),
      detail: answerFirstDetail(flag),
      internalSignals: [],
    });
  }

  return recommendations;
}

function answerFirstTitle(flag: AnswerFirstLintResult["flags"][number]): string {
  switch (flag) {
    case "no_question_heading":
      return "Add a question-style heading";
    case "answer_not_first":
      return "Lead with the direct answer";
    case "answer_behind_accordion":
      return "Move the answer out from behind a click";
  }
}

function answerFirstDetail(flag: AnswerFirstLintResult["flags"][number]): string {
  switch (flag) {
    case "no_question_heading":
      return "Add a heading phrased as the question a visitor is asking, so the page answers it plainly.";
    case "answer_not_first":
      return "Put a clear, direct answer near the top of the page instead of below other content.";
    case "answer_behind_accordion":
      return "Show the answer text directly on the page rather than hiding it inside an expandable section.";
  }
}

/** Minimal plain-text extraction for the consistency comparison's page-text arg. */
function extractPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
