import { useQuery } from "@tanstack/react-query";
import { fetchLatestSummaryOutput } from "../../api/agentSummary";
import { QUERY_KEYS } from "../../lib/queryClient";
import type {
  LatestSummaryAgentOutput,
  SummaryDomainSummary,
  SummarySupportingMetric,
  SummaryTopAction,
} from "../../types/agentSummary";

export type TopActionSupportingMetric = SummarySupportingMetric;
export type DomainSummary = SummaryDomainSummary;
export type TopAction = SummaryTopAction;

export type ResolvedTopAction = TopAction & {
  resultId: number;
  createdAt: string;
  domain_summaries?: DomainSummary[];
};

export type SummaryDashboardSelection = {
  topAction: ResolvedTopAction | null;
  latestChoosableSummary: DomainSummary | null;
};

const EMPTY_SELECTION: SummaryDashboardSelection = {
  topAction: null,
  latestChoosableSummary: null,
};

const SUMMARY_DOMAINS = new Set<DomainSummary["domain"]>([
  "review",
  "gbp",
  "ranking",
  "form-submission",
  "pms-data-quality",
  "referral",
]);

const REQUIRED_CHOOSABLE_SOURCES = [
  "choosable.practice_review_count",
  "choosable.strongest_competitor_name",
  "choosable.strongest_competitor_review_count",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSupportingMetric(value: unknown): TopActionSupportingMetric | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.label !== "string" ||
    typeof value.value !== "string" ||
    typeof value.source_field !== "string"
  ) {
    return null;
  }
  return {
    label: value.label,
    value: value.value,
    source_field: value.source_field,
    ...(typeof value.sub === "string" ? { sub: value.sub } : {}),
  };
}

function parseDomainSummary(value: unknown): DomainSummary | null {
  if (!isRecord(value) || !SUMMARY_DOMAINS.has(value.domain as DomainSummary["domain"])) {
    return null;
  }
  if (
    typeof value.heading !== "string" ||
    typeof value.summary !== "string" ||
    typeof value.detail !== "string"
  ) {
    return null;
  }
  const evidence = Array.isArray(value.supporting_metrics)
    ? value.supporting_metrics
        .map(parseSupportingMetric)
        .filter((item): item is TopActionSupportingMetric => item !== null)
    : undefined;
  return {
    domain: value.domain as DomainSummary["domain"],
    heading: value.heading,
    summary: value.summary,
    detail: value.detail,
    ...(evidence && evidence.length > 0 ? { supporting_metrics: evidence } : {}),
  };
}

function parseSummaryResults(value: unknown): Record<string, unknown> | null {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return isRecord(raw) ? raw : null;
}

function parseTopAction(value: unknown): TopAction | null {
  if (!isRecord(value)) return null;
  const action = value as Partial<TopAction>;
  if (
    typeof action.title !== "string" ||
    typeof action.rationale !== "string" ||
    typeof action.priority_score !== "number" ||
    !action.outcome ||
    !action.cta ||
    !Array.isArray(action.supporting_metrics)
  ) {
    return null;
  }
  return action as TopAction;
}

function isGroundedChoosableSummary(summary: DomainSummary): boolean {
  if (summary.domain !== "review" || !summary.supporting_metrics) return false;
  const sources = new Set(
    summary.supporting_metrics.map((metric) => metric.source_field)
  );
  return REQUIRED_CHOOSABLE_SOURCES.every((source) => sources.has(source));
}

export function selectSummaryDashboardData(
  latestSummary: LatestSummaryAgentOutput | null,
): SummaryDashboardSelection {
  if (!latestSummary) return EMPTY_SELECTION;
  const output = parseSummaryResults(latestSummary.results);
  if (!output) return EMPTY_SELECTION;
  const parsedActions = (Array.isArray(output.top_actions) ? output.top_actions : [])
    .map(parseTopAction)
    .filter((action): action is TopAction => action !== null);
  const selectedAction =
    [...parsedActions].sort(
      (left, right) => right.priority_score - left.priority_score
    )[0] ?? null;
  const summaries = (Array.isArray(output.domain_summaries)
    ? output.domain_summaries
    : [])
    .map(parseDomainSummary)
    .filter((summary): summary is DomainSummary => summary !== null);
  const topAction = selectedAction
    ? {
        ...selectedAction,
        resultId: latestSummary.resultId,
        createdAt: latestSummary.lastUpdated,
        ...(summaries.length > 0 ? { domain_summaries: summaries } : {}),
      }
    : null;
  const latestChoosableSummary =
    summaries.find(isGroundedChoosableSummary) ?? null;
  return { topAction, latestChoosableSummary };
}

async function fetchSummaryDashboardSelection(
  orgId: number,
  locationId: number | null
): Promise<SummaryDashboardSelection> {
  const latestSummary = await fetchLatestSummaryOutput(orgId, locationId);
  return selectSummaryDashboardData(latestSummary);
}

export function useTopAction(
  orgId: number | null,
  locationId: number | null
) {
  const query = useQuery<SummaryDashboardSelection>({
    queryKey: QUERY_KEYS.summaryDashboard(orgId, locationId),
    queryFn: () => fetchSummaryDashboardSelection(orgId!, locationId),
    enabled: orgId !== null,
    staleTime: 5 * 60 * 1000,
  });
  return {
    ...(query.data ?? EMPTY_SELECTION),
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
