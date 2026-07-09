import { useQuery } from "@tanstack/react-query";
import { fetchClientTasks } from "../../api/tasks";
import type { ActionItem } from "../../types/tasks";

/**
 * Frontend-side mirror of the backend `TopAction` shape (defined by the
 * Zod schema at `src/controllers/agents/types/agent-output-schemas.ts`).
 * Each SUMMARY-authored task row carries one of these in `metadata` (as a
 * JSON string in the DB, parsed lazily here).
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T10)
 */
export interface TopActionSupportingMetric {
  label: string;
  value: string;
  sub?: string;
  source_field: string;
}

export interface DomainSummary {
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
}

export interface TopActionCtaButton {
  label: string;
  action_url: string;
}

export interface TopAction {
  title: string;
  urgency: "high" | "medium" | "low";
  priority_score: number;
  domain:
    | "review"
    | "gbp"
    | "ranking"
    | "form-submission"
    | "pms-data-quality"
    | "referral";
  rationale: string;
  highlights?: string[];
  supporting_metrics: TopActionSupportingMetric[];
  outcome: {
    deliverables: string;
    mechanism: string;
  };
  cta: {
    primary: TopActionCtaButton;
    secondary?: TopActionCtaButton;
  };
  due_at?: string;
  // Ch2 unified-type extension (mirrors the backend Zod schema); optional, backward-compatible.
  // `stage` = the journey stage this card addresses; the eyebrow reads it, DOMAIN_TO_STAGE as fallback.
  stage?: "findable" | "choosable" | "bookable" | "memorable";
  execution_state?: "built" | "read-only" | "handoff";
  generic?: boolean;
}

/**
 * Resolved top-action row: the parsed `TopAction` payload plus the original
 * task row's identity, so callers can route to the underlying task.
 */
export interface ResolvedTopAction extends TopAction {
  taskId: number;
  dueDate?: string;
  domain_summaries?: DomainSummary[];
}

/**
 * Parses a task row's `metadata` (string or object) into a `TopAction` shape.
 * Returns `null` if parsing fails or the shape doesn't validate at the
 * structural level.
 */
function parseTopAction(task: ActionItem): ResolvedTopAction | null {
  let raw: unknown = task.metadata;

  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const m = raw as Partial<TopAction> & {
    priority_score?: unknown;
    supporting_metrics?: unknown;
    outcome?: unknown;
    cta?: unknown;
  };

  // Minimal structural guard — the full Zod check lives backend-side.
  if (
    typeof m.title !== "string" ||
    typeof m.priority_score !== "number" ||
    !m.outcome ||
    !m.cta ||
    !Array.isArray(m.supporting_metrics)
  ) {
    return null;
  }

  const parsed: ResolvedTopAction = {
    ...(m as TopAction),
    taskId: task.id,
    dueDate: task.due_date,
  };

  const ds = (raw as Record<string, unknown>).domain_summaries;
  if (Array.isArray(ds) && ds.length > 0) {
    parsed.domain_summaries = ds as DomainSummary[];
  }

  return parsed;
}

interface UseTopActionResult {
  topAction: ResolvedTopAction | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * useTopAction — reads tasks via `fetchClientTasks(orgId, locationId)`,
 * filters to `agent_type === "SUMMARY"`, parses each row's metadata, and
 * returns the highest `priority_score` row as `topAction` (or null).
 *
 * Disabled when `orgId` is null. Mirrors the staleTime used by other
 * Focus dashboard query hooks (5 minutes).
 */
export function useTopAction(
  orgId: number | null,
  locationId: number | null
): UseTopActionResult {
  const query = useQuery<ResolvedTopAction | null>({
    queryKey: ["topAction", orgId, locationId],
    queryFn: async () => {
      if (!orgId) return null;
      const response = await fetchClientTasks(orgId, locationId ?? null);
      if (!response?.success || !response.tasks) return null;

      const all = [...response.tasks.ALLORO, ...response.tasks.USER];
      const summaryTasks = all.filter(
        (t) =>
          // Cast through unknown — frontend AgentType union doesn't yet list
          // "SUMMARY" but the backend writes it directly. Spec: D5.
          (t.agent_type as unknown as string) === "SUMMARY"
      );

      const parsed = summaryTasks
        .map(parseTopAction)
        .filter((p): p is ResolvedTopAction => p !== null);

      if (parsed.length === 0) return null;

      parsed.sort((a, b) => b.priority_score - a.priority_score);
      return parsed[0];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    topAction: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}
