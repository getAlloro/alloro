import { ensureLatLng } from "./locationUtils";
import { deriveGrade } from "./gradeScale";

export function normalizeWebsiteAnalysis(data: any): any | null {
  if (!data) return null;
  return {
    overall_score: Number(data.overall_score),
    // Letter is derived from the score (the LLM no longer supplies it); fall
    // back to any stored letter only if the score is somehow missing.
    overall_grade: deriveGrade(data.overall_score, data.overall_grade),
    pillars: data.pillars.map((p: any) => ({
      ...p,
      score: Number(p.score),
    })),
  };
}

export function normalizeSelfGBP(data: any): any | null {
  if (!data) return null;
  return {
    ...data,
    totalScore: data.totalScore ?? data.averageStarRating ?? 0,
  };
}

export function normalizeCompetitors(
  competitorsData: any,
  selfGbpData: any
): any[] | null {
  if (!competitorsData?.competitors) return null;

  // Extract placeId from step_self_gbp to filter out self
  const selfPlaceId = selfGbpData?.placeId || null;

  return competitorsData.competitors
    .filter((c: any) => c.placeId !== selfPlaceId)
    .map((c: any, index: number) => ({
      ...c,
      location: ensureLatLng(c.location, selfGbpData?.location, index),
      totalScore: c.totalScore ?? c.averageStarRating ?? 0,
    }));
}

export function normalizeGBPAnalysis(data: any): any | null {
  if (!data) return null;
  const gbp_readiness_score = Number(data.gbp_readiness_score);
  const competitor = data.competitor_analysis;
  return {
    ...data,
    gbp_readiness_score,
    // Grades are always derived from their score on the way out, so a stored
    // letter or any LLM-authored one is superseded by the approved scale.
    gbp_grade: deriveGrade(gbp_readiness_score, data.gbp_grade),
    competitor_analysis: competitor
      ? {
          ...competitor,
          rank_grade: deriveGrade(competitor.rank_score, competitor.rank_grade),
        }
      : competitor,
    pillars: data.pillars.map((p: any) => ({
      ...p,
      score: Number(p.score),
    })),
  };
}
