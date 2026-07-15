export type SummarySupportingMetric = {
  label: string;
  value: string;
  sub?: string;
  source_field: string;
};

export type SummaryDomain =
  | "review"
  | "gbp"
  | "ranking"
  | "form-submission"
  | "pms-data-quality"
  | "referral";

export type SummaryDomainSummary = {
  domain: SummaryDomain;
  heading: string;
  summary: string;
  detail: string;
  supporting_metrics?: SummarySupportingMetric[];
};

export type SummaryActionCtaButton = {
  label: string;
  action_url: string;
};

export type SummaryTopAction = {
  title: string;
  urgency: "high" | "medium" | "low";
  priority_score: number;
  domain: SummaryDomain;
  rationale: string;
  highlights?: string[];
  supporting_metrics: SummarySupportingMetric[];
  outcome: { deliverables: string; mechanism: string };
  cta: {
    primary: SummaryActionCtaButton;
    secondary?: SummaryActionCtaButton;
  };
  due_at?: string;
  stage?: "findable" | "choosable" | "bookable" | "memorable";
  execution_state?: "built" | "read-only" | "handoff";
  generic?: boolean;
};

export type LatestSummaryAgentOutput = {
  results: unknown;
  lastUpdated: string;
  dateStart: string | null;
  dateEnd: string | null;
  resultId: number;
};

export type LatestAgentOutputsResponse = {
  success: true;
  googleAccountId: number;
  organizationId: number;
  agents: {
    summary: LatestSummaryAgentOutput | null;
    [agentType: string]: unknown;
  };
};
