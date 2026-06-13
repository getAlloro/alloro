import { scoreAuthority, scoreConnectedPerformance, scoreEntity } from "./entitySignalScoring";
import { CATEGORY_WEIGHTS, buildHardCaps, summarizeResults } from "./scoringShared";
import { scoreAccess, scorePageSource } from "./sourceReadinessScoring";
import type {
  AiSeoCheckResultInput,
  AiSeoScoreSummary,
  ExternalEntitySourceInput,
  ExtractedBusinessIdentity,
  OrganizationAuditContext,
  UrlAuditSnapshot,
} from "./types";

export const AI_SEO_RULE_VERSION = "2026-06-08.v1";

export interface TargetScoreInput {
  snapshot: UrlAuditSnapshot;
  externalSources: ExternalEntitySourceInput[];
  organizationContext?: OrganizationAuditContext | null;
  canonicalIdentity?: ExtractedBusinessIdentity | null;
}

export interface TargetScoreOutput {
  results: AiSeoCheckResultInput[];
  summary: AiSeoScoreSummary;
}

export function scoreAuditTarget(input: TargetScoreInput): TargetScoreOutput {
  const results = [
    ...scoreAccess(input.snapshot),
    ...scorePageSource(input.snapshot),
    ...scoreEntity(
      input.snapshot,
      input.externalSources,
      input.canonicalIdentity,
    ),
    ...scoreConnectedPerformance(input.snapshot, input.organizationContext),
    ...scoreAuthority(input.externalSources, input.organizationContext),
  ];

  assertRubricIntegrity(results);

  return {
    results,
    summary: summarizeResults(results, buildHardCaps(input.snapshot)),
  };
}

/**
 * The overall score is computed from per-check weights, so the declared
 * CATEGORY_WEIGHTS only hold if each category's check weights sum to it.
 * Fail fast when a check is added/changed without rebalancing — a silent
 * drift here would corrupt every score.
 */
function assertRubricIntegrity(results: AiSeoCheckResultInput[]): void {
  for (const [categoryId, config] of Object.entries(CATEGORY_WEIGHTS)) {
    const sum = results
      .filter((result) => result.category === categoryId)
      .reduce((total, result) => total + result.weight, 0);
    if (sum !== config.weight) {
      throw new Error(
        `AI/SEO rubric drift: category "${categoryId}" check weights sum to ${sum}, expected ${config.weight}. Rebalance check weights or update CATEGORY_WEIGHTS.`,
      );
    }
  }
}

export { summarizeResults };
