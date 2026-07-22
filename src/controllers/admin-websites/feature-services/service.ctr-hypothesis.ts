/**
 * CTR-hypothesis service — brick 2 of the CTR self-optimization loop
 * (diagnose → educated hypothesis → recorded experiment → fleet learning).
 *
 * Brick 1 (feature-utils/ctrOpportunity.ts) answers "which already-ranking pages
 * are under-clicked for their position?" This service answers the next question:
 * "what should we change, on what evidence, and what do we expect?"
 *
 * It turns a blind rewrite into an EDUCATED HYPOTHESIS:
 *   • aimed at a measured opportunity (injected, never guessed),
 *   • grounded in graded, cited CTR principles (feature-utils/util.ctr-principles.ts),
 *   • carrying a rationale that names which principle it applied, and
 *   • carrying a prediction derived from the measured position baseline.
 *
 * THREE HONESTY PROPERTIES, each enforced in code rather than asked for:
 *   1. The prediction is NEVER model-generated. `predictedCtr` is the baseline the
 *      opportunity already carries; the model is explicitly told any number it
 *      writes will be discarded, and none is ever read back.
 *   2. The applied-principle list is DETERMINISTIC. It comes from
 *      selectApplicablePrinciples(), not from the model's self-report, so the
 *      model cannot claim evidence it did not use.
 *   3. When nothing measurable is wrong, it REFUSES to propose. No gap, or no
 *      violated principle, returns a skip with a reason instead of a rewrite.
 *
 * It writes nothing and sends nothing. The returned object is a proposal the owner
 * approves, and it carries exactly what brick 3 will later persist. Brick 3 owns
 * the table; there is no persistence here.
 */

import { z } from "zod";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent } from "../../../agents/service.llm-runner";
import logger from "../../../lib/logger";
import { trimTitleLength } from "../feature-utils/util.title-length";
import { buildCtrDemandUserBlock } from "../feature-utils/util.ctr-demand-block";
import type { GscTopQuery } from "../feature-utils/util.seo-gsc-demand";
import {
  CTR_GUARDRAILS,
  selectApplicablePrinciples,
  TITLE_TARGET_MAX_CHARS,
  TITLE_TARGET_MIN_CHARS,
  type CtrPrinciple,
} from "../feature-utils/util.ctr-principles";

const LOG_PREFIX = "[CTR Hypothesis]";
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;
const EFFORT = "medium" as const;
const MAX_PAGE_CONTENT_CHARS = 6000;

/** Typed domain error — status mapping is centralized in the response helper (§8.3). */
export class CtrHypothesisError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "CtrHypothesisError";
  }
}

/**
 * Structural mirror of brick 1's `CtrOpportunity`. It is redeclared rather than
 * imported because brick 1 lives on an unmerged branch — importing it would not
 * compile on dev/dave, and this brick is deliberately decoupled from it. The
 * field names match exactly, so the wiring PR feeds findCtrOpportunities()
 * output straight in once #205 merges.
 */
export interface CtrOpportunityInput {
  page: string;
  impressions: number;
  clicks: number;
  /** Measured click-through, straight from GSC (fraction, e.g. 0.04). */
  actualCtr: number;
  /** Baseline click-through for this page's rank, computed by brick 1. */
  expectedCtr: number;
  position: number;
  missedClicks: number;
}

export interface CtrHypothesisRequest {
  opportunity: CtrOpportunityInput;
  currentTitle: string;
  currentDescription?: string;
  /** Site-level GSC top queries. Directional only — there is no per-page join. */
  siteTopQueries?: GscTopQuery[];
  pageContent?: string;
  businessName?: string;
  locationLabel?: string;
  projectId?: string;
}

export interface AppliedPrinciple {
  id: string;
  grade: CtrPrinciple["grade"];
  claim: string;
  guidance: string;
  sourceUrl: string;
  verifiedViaFetch: string;
  caveat?: string;
}

export interface CtrHypothesisSkipped {
  status: "skipped";
  reason: "no-measured-gap" | "no-applicable-principle";
  explanation: string;
  opportunity: CtrOpportunityInput;
}

export interface CtrHypothesis {
  status: "proposed";
  opportunity: CtrOpportunityInput;
  before: { title: string; description: string | null };
  proposed: { title: string; description: string; titleTrimmed: boolean };
  rationale: {
    summary: string;
    principlesApplied: AppliedPrinciple[];
    queryLinkage: {
      /** Never "measured" — no per-page query data exists (see util.ctr-demand-block). */
      basis: "inferred" | "none";
      queries: string[];
      note: string;
    };
  };
  prediction: {
    predictedCtr: number;
    predictedLift: number;
    basis: "position-baseline";
    statement: string;
  };
}

export type CtrHypothesisResult = CtrHypothesis | CtrHypothesisSkipped;

const modelOutputSchema = z.object({
  proposed_title: z.string().min(1),
  proposed_description: z.string().min(1),
  rationale: z.string().min(1),
  principle_ids_applied: z.array(z.string()).optional(),
});

function toAppliedPrinciple(principle: CtrPrinciple): AppliedPrinciple {
  return {
    id: principle.id,
    grade: principle.grade,
    claim: principle.claim,
    guidance: principle.guidance,
    sourceUrl: principle.source.url,
    verifiedViaFetch: principle.source.verifiedViaFetch,
    caveat: principle.caveat,
  };
}

function assertValidOpportunity(opportunity: CtrOpportunityInput): void {
  const { actualCtr, expectedCtr, position, impressions } = opportunity;
  const rates = [actualCtr, expectedCtr];

  const isRateValid = rates.every(
    (rate) => Number.isFinite(rate) && rate >= 0 && rate <= 1,
  );
  if (!isRateValid) {
    throw new CtrHypothesisError(
      400,
      "INVALID_OPPORTUNITY",
      "actualCtr and expectedCtr must be fractions between 0 and 1",
    );
  }

  if (!Number.isFinite(position) || position <= 0) {
    throw new CtrHypothesisError(
      400,
      "INVALID_OPPORTUNITY",
      "position must be a positive number",
    );
  }

  if (!Number.isFinite(impressions) || impressions < 0) {
    throw new CtrHypothesisError(
      400,
      "INVALID_OPPORTUNITY",
      "impressions must be zero or greater",
    );
  }
}

function renderPrinciplesBlock(
  applicable: CtrPrinciple[],
  guardrails: readonly CtrPrinciple[],
): string {
  const render = (principle: CtrPrinciple): string =>
    [
      `- id: ${principle.id}`,
      `  grade: ${principle.grade}`,
      `  claim: ${principle.claim}`,
      `  source: ${principle.source.publisher} (${principle.source.url}, verified via fetch ${principle.source.verifiedViaFetch})`,
      `  do: ${principle.guidance}`,
      principle.caveat ? `  caveat: ${principle.caveat}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  return `CTR PRINCIPLES THIS PAGE VIOLATES (apply these):
${applicable.map(render).join("\n")}

ALWAYS-ON CONSTRAINTS (bound the rewrite; not reasons to rewrite):
${guardrails.map(render).join("\n")}`;
}

function buildUserPrompt(
  request: CtrHypothesisRequest,
  applicable: CtrPrinciple[],
  demandBlock: string,
): string {
  const { opportunity, currentTitle, currentDescription, pageContent } = request;
  const parts: string[] = [
    `PAGE: ${opportunity.page}`,
    `MEASURED PERFORMANCE: ${opportunity.impressions} impressions, ${opportunity.clicks} clicks, ` +
      `click-through ${(opportunity.actualCtr * 100).toFixed(2)}% at average position ` +
      `${opportunity.position.toFixed(1)}. The baseline click-through for that position is ` +
      `${(opportunity.expectedCtr * 100).toFixed(2)}%, so roughly ${opportunity.missedClicks} ` +
      `clicks are being left on the table over the measured window.`,
    `\nCURRENT TITLE (${currentTitle.trim().length} characters):\n${currentTitle}`,
    `\nCURRENT META DESCRIPTION:\n${currentDescription?.trim() || "(none)"}`,
  ];

  if (request.businessName) parts.push(`\nBUSINESS: ${request.businessName}`);
  if (request.locationLabel) parts.push(`LOCATION: ${request.locationLabel}`);

  if (pageContent?.trim()) {
    parts.push(
      `\nPAGE CONTENT (the page being optimized):\n${pageContent.slice(0, MAX_PAGE_CONTENT_CHARS)}`,
    );
  }

  parts.push(`\n${renderPrinciplesBlock(applicable, CTR_GUARDRAILS)}`);
  if (demandBlock) parts.push(`\n${demandBlock}`);

  parts.push(
    `\nTARGET TITLE LENGTH: ${TITLE_TARGET_MIN_CHARS}-${TITLE_TARGET_MAX_CHARS} characters.`,
    "Return ONLY the JSON object described in your instructions.",
  );

  return parts.join("\n");
}

/**
 * Build the educated hypothesis for one diagnosed opportunity.
 *
 * Returns a skip — never a fabricated proposal — when there is no measured gap
 * or no cited principle the current metadata violates.
 */
export async function generateCtrHypothesis(
  request: CtrHypothesisRequest,
): Promise<CtrHypothesisResult> {
  const { opportunity, currentTitle, currentDescription } = request;
  assertValidOpportunity(opportunity);

  if (!currentTitle?.trim()) {
    throw new CtrHypothesisError(
      400,
      "MISSING_TITLE",
      "currentTitle is required to propose a rewrite",
    );
  }

  const gap = opportunity.expectedCtr - opportunity.actualCtr;
  if (gap <= 0) {
    return {
      status: "skipped",
      reason: "no-measured-gap",
      explanation:
        "This page already performs at or above the click-through baseline for its position. " +
        "There is no measured gap for a rewrite to close.",
      opportunity,
    };
  }

  const applicable = selectApplicablePrinciples(currentTitle, currentDescription);
  if (applicable.length === 0) {
    return {
      status: "skipped",
      reason: "no-applicable-principle",
      explanation:
        "The current title and description already satisfy every cited CTR principle we hold " +
        "evidence for, so the click-through gap is unlikely to be a metadata problem. Look at " +
        "the result's competition and the page's match to the query instead of rewriting.",
      opportunity,
    };
  }

  const siteTopQueries = request.siteTopQueries ?? [];
  const demandBlock = buildCtrDemandUserBlock(siteTopQueries);

  const result = await runAgent({
    systemPrompt: loadPrompt("websiteAgents/CtrHypothesis"),
    userMessage: buildUserPrompt(request, applicable, demandBlock),
    model: MODEL,
    maxTokens: MAX_TOKENS,
    effort: EFFORT,
    outputSchema: modelOutputSchema,
    costContext: request.projectId
      ? {
          projectId: request.projectId,
          eventType: "ctr-hypothesis",
          metadata: { page: opportunity.page, position: opportunity.position },
        }
      : undefined,
  });

  const parsed = modelOutputSchema.safeParse(result.parsed);
  if (!parsed.success) {
    logger.error(
      { page: opportunity.page, issues: parsed.error.issues.map((i) => i.code) },
      `${LOG_PREFIX} model returned an unusable rewrite`,
    );
    throw new CtrHypothesisError(
      502,
      "REWRITE_UNPARSEABLE",
      "The rewrite could not be generated in a usable form. Try again.",
    );
  }

  const trimmed = trimTitleLength(parsed.data.proposed_title.trim());
  if (trimmed.unresolvable) {
    logger.warn(
      { page: opportunity.page, length: trimmed.title.length },
      `${LOG_PREFIX} proposed title could not be trimmed under the length limit`,
    );
  }

  const claimedIds = parsed.data.principle_ids_applied ?? [];
  const knownIds = new Set(applicable.map((principle) => principle.id));
  const unknownClaims = claimedIds.filter((id) => !knownIds.has(id));
  if (unknownClaims.length > 0) {
    // The returned list stays deterministic; this only surfaces model drift.
    logger.warn(
      { page: opportunity.page, unknownClaims },
      `${LOG_PREFIX} model cited principles outside the diagnosed set — ignored`,
    );
  }

  return {
    status: "proposed",
    opportunity,
    before: {
      title: currentTitle,
      description: currentDescription?.trim() || null,
    },
    proposed: {
      title: trimmed.title,
      description: parsed.data.proposed_description.trim(),
      titleTrimmed: trimmed.trimmed,
    },
    rationale: {
      summary: parsed.data.rationale.trim(),
      principlesApplied: applicable.map(toAppliedPrinciple),
      queryLinkage: {
        basis: siteTopQueries.length > 0 ? "inferred" : "none",
        queries: siteTopQueries.slice(0, 10).map((query) => query.key),
        note:
          "Search Console queries are measured for the whole site, not per page. Any link " +
          "between these queries and this page is inferred, not measured.",
      },
    },
    prediction: {
      predictedCtr: opportunity.expectedCtr,
      predictedLift: gap,
      basis: "position-baseline",
      statement:
        `Designed to move this page's click-through toward the ${(opportunity.expectedCtr * 100).toFixed(2)}% ` +
        `baseline for position ${opportunity.position.toFixed(1)}. This is a baseline-derived target, ` +
        "not a promise — the result is measured after the change, not predicted by it.",
    },
  };
}
