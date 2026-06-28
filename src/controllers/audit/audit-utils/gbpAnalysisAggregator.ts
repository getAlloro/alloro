/**
 * Aggregates 5 parallel pillar-scorer outputs into the canonical
 * `GbpAnalysisResult` shape used by the frontend (matches the legacy
 * single-call schema 1:1 so no consumer changes are required).
 *
 * Weights mirror the original GBPAnalysis prompt:
 *   Profile Integrity 30, Trust & Engagement 25, Visual Authority 20,
 *   Search Conversion 15, Competitor Analysis 10.
 */

import { scoreToGrade } from "./gradeScale";

export interface PillarOutput {
  category: string;
  score: number;
  key_finding: string;
  action_items: string[];
}

export interface ProfileIntegrityResult {
  pillar: PillarOutput;
  sync_audit: {
    nap_match: boolean;
    mismatched_fields: string[];
    trust_gap_severity: string;
  };
}

export interface CompetitorAnalysisResult {
  pillar: PillarOutput;
  competitor_analysis: {
    rank_score: number;
    rank_grade: string;
    key_findings: string;
    top_action_items: string[];
  };
}

export interface PillarOnlyResult {
  pillar: PillarOutput;
}

export interface PillarBundle {
  profileIntegrity: ProfileIntegrityResult;
  trustEngagement: PillarOnlyResult;
  visualAuthority: PillarOnlyResult;
  searchConversion: PillarOnlyResult;
  competitorAnalysis: CompetitorAnalysisResult;
}

const WEIGHTS: Record<string, number> = {
  "Profile Integrity": 0.3,
  "Trust & Engagement": 0.25,
  "Visual Authority": 0.2,
  "Search Conversion": 0.15,
  "Competitor Analysis": 0.1,
};

function pickTopActionItems(pillars: PillarOutput[], n = 3): string[] {
  // Strategy: pick action items from the lowest-scoring pillars first
  // (they're the biggest gaps). Take 1 per pillar until we hit `n`.
  const sortedByScore = [...pillars].sort((a, b) => a.score - b.score);
  const picked: string[] = [];
  for (const pillar of sortedByScore) {
    for (const item of pillar.action_items) {
      if (picked.length >= n) break;
      if (!picked.includes(item)) picked.push(item);
    }
    if (picked.length >= n) break;
  }
  // If still <n (some pillars had no action items), fill from any remaining
  if (picked.length < n) {
    for (const pillar of sortedByScore) {
      for (const item of pillar.action_items) {
        if (picked.length >= n) break;
        if (!picked.includes(item)) picked.push(item);
      }
    }
  }
  return picked.slice(0, n);
}

export function aggregateGbpAnalysis(bundle: PillarBundle) {
  const pillars: PillarOutput[] = [
    bundle.profileIntegrity.pillar,
    bundle.trustEngagement.pillar,
    bundle.visualAuthority.pillar,
    bundle.searchConversion.pillar,
    bundle.competitorAnalysis.pillar,
  ];

  const gbp_readiness_score = Math.round(
    pillars.reduce((sum, p) => sum + p.score * (WEIGHTS[p.category] ?? 0), 0)
  );
  const gbp_grade = scoreToGrade(gbp_readiness_score);
  const top_action_items = pickTopActionItems(pillars, 3);

  // Letter grade is always derived from the score in code — never the LLM's
  // freehand letter — so every audit card honors the same approved scale.
  const competitorAnalysis = bundle.competitorAnalysis.competitor_analysis;
  const competitor_analysis = {
    ...competitorAnalysis,
    rank_grade: scoreToGrade(competitorAnalysis.rank_score),
  };

  return {
    top_action_items,
    gbp_readiness_score,
    gbp_grade,
    competitor_analysis,
    sync_audit: bundle.profileIntegrity.sync_audit,
    pillars,
  };
}
