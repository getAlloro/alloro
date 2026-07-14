import { useQuery } from "@tanstack/react-query";
import { fetchClientTasks } from "../../api/tasks";
import { QUERY_KEYS } from "../../lib/queryClient";
import type { ActionItem } from "../../types/tasks";

export type TopActionSupportingMetric = {
  label: string;
  value: string;
  sub?: string;
  source_field: string;
};

export type DomainSummary = {
  domain:
    | "review"
    | "gbp"
    | "ranking"
    | "form-submission"
    | "pms-data-quality"
    | "referral";
  heading: string;
  summary: string;
  detail: string;
  supporting_metrics?: TopActionSupportingMetric[];
};

export type TopActionCtaButton = {
  label: string;
  action_url: string;
};

export type TopAction = {
  title: string;
  urgency: "high" | "medium" | "low";
  priority_score: number;
  domain: DomainSummary["domain"];
  rationale: string;
  highlights?: string[];
  supporting_metrics: TopActionSupportingMetric[];
  outcome: { deliverables: string; mechanism: string };
  cta: { primary: TopActionCtaButton; secondary?: TopActionCtaButton };
  due_at?: string;
  stage?: "findable" | "choosable" | "bookable" | "memorable";
  execution_state?: "built" | "read-only" | "handoff";
  generic?: boolean;
};

export type ResolvedTopAction = TopAction & {
  taskId: number;
  createdAt: string;
  dueDate?: string;
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

function parseTopAction(task: ActionItem): ResolvedTopAction | null {
  let raw: unknown = task.metadata;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(raw)) return null;

  const action = raw as Partial<TopAction>;
  if (
    typeof action.title !== "string" ||
    typeof action.priority_score !== "number" ||
    !action.outcome ||
    !action.cta ||
    !Array.isArray(action.supporting_metrics)
  ) {
    return null;
  }
  const summaries = Array.isArray(raw.domain_summaries)
    ? raw.domain_summaries
        .map(parseDomainSummary)
        .filter((summary): summary is DomainSummary => summary !== null)
    : [];
  return {
    ...(action as TopAction),
    taskId: task.id,
    createdAt: task.created_at,
    dueDate: task.due_date,
    ...(summaries.length > 0 ? { domain_summaries: summaries } : {}),
  };
}

function isGroundedChoosableSummary(summary: DomainSummary): boolean {
  if (summary.domain !== "review" || !summary.supporting_metrics) return false;
  const sources = new Set(
    summary.supporting_metrics.map((metric) => metric.source_field)
  );
  return REQUIRED_CHOOSABLE_SOURCES.every((source) => sources.has(source));
}

function compareNewestTask(left: ActionItem, right: ActionItem): number {
  const dateDifference =
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  return dateDifference !== 0 ? dateDifference : right.id - left.id;
}

export function selectSummaryDashboardData(
  tasks: ActionItem[]
): SummaryDashboardSelection {
  const summaryTasks = tasks.filter(
    (task) => (task.agent_type as unknown as string) === "SUMMARY"
  );
  const parsedActions = summaryTasks
    .map(parseTopAction)
    .filter((action): action is ResolvedTopAction => action !== null);
  const topAction =
    [...parsedActions].sort(
      (left, right) => right.priority_score - left.priority_score
    )[0] ?? null;

  const newestTask = [...summaryTasks].sort(compareNewestTask)[0];
  const newestSummary = newestTask ? parseTopAction(newestTask) : null;
  const latestChoosableSummary =
    newestSummary?.domain_summaries?.find(isGroundedChoosableSummary) ?? null;
  return { topAction, latestChoosableSummary };
}

async function fetchSummaryDashboardSelection(
  orgId: number,
  locationId: number | null
): Promise<SummaryDashboardSelection> {
  const response = await fetchClientTasks(orgId, locationId);
  if (!response?.success || !response.tasks) return EMPTY_SELECTION;
  return selectSummaryDashboardData([
    ...response.tasks.ALLORO,
    ...response.tasks.USER,
  ]);
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
