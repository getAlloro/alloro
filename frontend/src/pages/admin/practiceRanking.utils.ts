import type { RankingJob } from "./practiceRanking.types";

// Helper to normalize job data (handle both camelCase and snake_case)
export const normalizeJob = (job: RankingJob): RankingJob => ({
  ...job,
  organization_id: job.organizationId || job.organization_id,
  gbp_location_id: job.gbpLocationId || job.gbp_location_id,
  gbp_location_name: job.gbpLocationName || job.gbp_location_name,
  batch_id: job.batchId || job.batch_id,
  rank_score: job.rankScore ?? job.rank_score,
  rank_position: job.rankPosition ?? job.rank_position,
  total_competitors: job.totalCompetitors ?? job.total_competitors,
  observed_at: job.observedAt || job.observed_at,
  created_at: job.createdAt || job.created_at,
  status_detail: job.statusDetail || job.status_detail,
});

export const getWeekLabel = (date: Date): string => {
  const ordinals = ["1st", "2nd", "3rd", "4th", "5th"];
  const week = Math.ceil(date.getDate() / 7);
  const month = date.toLocaleDateString("en-US", { month: "long" });
  return `${month} ${ordinals[week - 1]} Week`;
};
