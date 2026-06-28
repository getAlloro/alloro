import { MarketKeywordModel } from "../../../models/MarketKeywordModel";
import { MarketKeywordSearchVolumeModel } from "../../../models/MarketKeywordSearchVolumeModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { GscDataModel } from "../../../models/website-builder/GscDataModel";
import { calculateKeywordCoverage } from "../feature-utils/coverageMetrics";
import { scoreMarketOpportunityConfidence } from "../feature-utils/confidence";
import { extractGscQueries } from "../feature-utils/gscQueryExtraction";
import type { MarketIntelligenceSummary } from "../feature-utils/types";

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().split("T")[0];
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

async function readCoverageInputs(organizationId: number) {
  const [keywords, project] = await Promise.all([
    MarketKeywordModel.findApprovedByOrganization(organizationId),
    ProjectModel.findByOrganizationId(organizationId),
  ]);
  if (!project?.id) return { keywords, queries: [] };
  const rows = await GscDataModel.findByProjectAndDateRange(project.id, daysAgoIso(90), todayIso());
  return {
    keywords,
    queries: extractGscQueries(rows.map((row) => ({
      report_date: row.report_date,
      data: row.data,
    }))),
  };
}

export async function getMarketOpportunitySummary(
  organizationId: number,
  reportMonth: string,
): Promise<MarketIntelligenceSummary> {
  const [summary, coverageInputs] = await Promise.all([
    MarketKeywordSearchVolumeModel.getOpportunitySummaryForOrganization(
      organizationId,
      reportMonth,
    ),
    readCoverageInputs(organizationId),
  ]);

  const coverage = calculateKeywordCoverage(
    coverageInputs.keywords,
    coverageInputs.queries,
  );
  const warnings: string[] = [];
  if (summary.keywordCount < 100) warnings.push("keyword_count_below_target");
  if (coverage.uniqueGscQueries === 0) warnings.push("gsc_queries_missing");
  if (summary.nullVolumeCount > 0) warnings.push("some_keywords_missing_volume");

  return {
    ...summary,
    coverage,
    confidence: scoreMarketOpportunityConfidence({
      keywordCount: summary.keywordCount,
      coverage,
      nullVolumeCount: summary.nullVolumeCount,
    }),
    warnings,
  };
}
