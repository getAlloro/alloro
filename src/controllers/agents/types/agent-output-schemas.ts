/**
 * Simplified Agent Output Schemas
 *
 * These types define the EXACT structure n8n must return for each agent.
 * All governance/lineage overhead has been stripped — only fields consumed
 * by the backend (task creation) and frontend (dashboard rendering) remain.
 *
 * Each agent's n8n workflow writes its result directly to `agent_results`
 * via the `run_id` correlation key. The `agent_output` column must conform
 * to these schemas.
 */

import { z } from "zod";

// =====================================================================
// PROOFLINE AGENT (DAILY)
// =====================================================================

/**
 * Proofline Agent Output
 *
 * Consumed by: DashboardOverview (trajectory, title, explanation),
 * ApprovedInsightCard (proof_type, value_change, metric_signal)
 */
export interface ProoflineAgentOutput {
  title: string;
  proof_type: "win" | "loss";
  trajectory: string;
  explanation: string;
  value_change?: string;
  metric_signal?: string;
  source_type?: "visibility" | "engagement" | "reviews";
  citations?: string[];
  /**
   * Up to 2 phrases pulled verbatim from `trajectory` that the dashboard
   * highlights inline. Additive (optional) — legacy outputs without this
   * field remain valid.
   */
  highlights?: string[];
}

export interface ProoflineSkippedOutput {
  skipped: true;
  reason: string;
}

// ---------------------------------------------------------------------
// Zod schema for ProoflineAgentOutput
// ---------------------------------------------------------------------
//
// Mirrors the TS interface above. `highlights` is additive and optional
// (max 2 entries). Nested fields stay permissive; the runner does a
// post-Zod substring check for `highlights[*]` against `trajectory`
// (mismatched entries dropped with a [proofline] warning, not rejected).
//
// Top-level uses `.passthrough()` rather than `.strict()` so legacy
// Proofline outputs that may include incidental extra keys still pass.

export const ProoflineAgentOutputSchema = z
  .object({
    title: z.string().min(1),
    proof_type: z.enum(["win", "loss"]),
    trajectory: z.string().min(1),
    explanation: z.string().min(1),
    value_change: z.string().optional(),
    metric_signal: z.string().optional(),
    source_type: z.enum(["visibility", "engagement", "reviews"]).optional(),
    citations: z.array(z.string()).optional(),
    highlights: z.array(z.string()).max(2).default([]),
  })
  .passthrough();

export type ProoflineAgentOutputZ = z.infer<typeof ProoflineAgentOutputSchema>;

// =====================================================================
// SUMMARY AGENT
// =====================================================================

export interface SummaryWin {
  title: string;
  description: string;
}

export interface SummaryRisk {
  title: string;
  description: string;
  severity?: "low" | "medium" | "high";
}

/**
 * Summary Agent Output
 *
 * Consumed by: Dashboard (wins/risks), Admin Editor, downstream agents
 * (Opportunity + CRO receive full blob as `additional_data`)
 */
export interface SummaryAgentOutput {
  wins: SummaryWin[];
  risks: SummaryRisk[];
  next_steps: string;
  action_nudge?: string;
}

// =====================================================================
// OPPORTUNITY AGENT
// =====================================================================

export interface OpportunityItem {
  title: string;
  type: "USER" | "ALLORO";
  explanation: string;
  category?: string;
  urgency?: string;
  due_date?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Opportunity Agent Output (array wrapper)
 *
 * Consumed by: Task creator (opportunities[]), ApprovedInsightCard (title, steps, expected_lift)
 */
export interface OpportunityAgentOutputItem {
  opportunities: OpportunityItem[];
  title?: string;
  steps?: string[];
  expected_lift?: string;
}

export type OpportunityAgentOutput = OpportunityAgentOutputItem[];

// =====================================================================
// CRO OPTIMIZER AGENT
// =====================================================================

export interface CroOptimizerItem {
  title: string;
  type: "USER" | "ALLORO";
  explanation: string;
  category?: string;
  urgency?: string;
  due_date?: string;
  metadata?: Record<string, unknown>;
}

/**
 * CRO Optimizer Agent Output (array wrapper)
 *
 * Consumed by: Task creator only (no frontend rendering)
 */
export interface CroOptimizerAgentOutputItem {
  opportunities: CroOptimizerItem[];
}

export type CroOptimizerAgentOutput = CroOptimizerAgentOutputItem[];

// =====================================================================
// REFERRAL ENGINE AGENT
// =====================================================================

export interface ReferralTopFix {
  title: string;
  description: string;
  impact: string;
}

export interface ReferralGrowthSummary {
  top_three_fixes: ReferralTopFix[];
  estimated_additional_annual_revenue: number;
}

export interface ReferralDoctorReferral {
  referrer_name: string;
  referred: number;
  net_production: number;
  avg_production_per_referral: number;
  trend_label: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  notes: string;
}

export interface ReferralNonDoctorReferral {
  source_label: string;
  source_key: string;
  source_type: "digital" | "patient" | "other";
  referred: number;
  net_production: number;
  avg_production_per_referral: number;
  trend_label: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  notes: string;
}

export interface ReferralAutomationOpportunity {
  title: string;
  description: string;
  priority: string;
  impact: string;
  effort: string;
  category: string;
  due_date?: string;
}

export interface ReferralPracticeAction {
  title: string;
  description: string;
  priority: string;
  impact: string;
  effort: string;
  category: string;
  owner: string;
  due_date?: string;
}

/**
 * Referral Engine Agent Output
 *
 * Consumed by: Task creator (alloro_automation_opportunities + practice_action_plan),
 * Dashboard (growth summary, referral matrices, executive summary)
 */
export interface ReferralEngineAgentOutput {
  executive_summary?: string[];
  growth_opportunity_summary: ReferralGrowthSummary;
  doctor_referral_matrix: ReferralDoctorReferral[];
  non_doctor_referral_matrix: ReferralNonDoctorReferral[];
  alloro_automation_opportunities: ReferralAutomationOpportunity[];
  practice_action_plan: ReferralPracticeAction[];
  observed_period?: {
    start_date: string;
    end_date: string;
  };
  data_quality_flags?: string[];
  confidence?: number;
}

// ---------------------------------------------------------------------
// Zod schema for ReferralEngineAgentOutput
// ---------------------------------------------------------------------
//
// Mirrors the TS interface above. The top-level object is `.strict()` so
// unknown keys at the root fail validation. Nested objects are NOT strict,
// so minor LLM verbosity inside matrix rows / nested blocks does not cause
// hard validation failures (those are the most common drift points).
//
// Enums are tightened past the TS interface for `priority` and
// `source_type` to match the prompt's JSON output spec
// (`ReferralEngineAnalysis.md` lines 130-194). The TS interface keeps
// `priority: string` for backward compat with already-stored agent_results
// rows; this schema is the forward-going contract.

const trendLabelSchema = z.enum([
  "increasing",
  "decreasing",
  "new",
  "dormant",
  "stable",
]);

const prioritySchema = z.enum(["low", "medium", "high"]);

const sourceTypeSchema = z.enum(["digital", "patient", "other"]);

const referralTopFixSchema = z.object({
  title: z.string(),
  description: z.string(),
  impact: z.string(),
});

const referralGrowthSummarySchema = z.object({
  // Field name is legacy — the agent now emits a single recommended action
  // (the Referrals Hub 1-ACTION banner shows exactly one). max(1) enforced;
  // min left open so sparse-data months can validly produce no fix.
  // plans/06102026-referrals-hub-simplification.
  top_three_fixes: z.array(referralTopFixSchema).max(1),
  estimated_additional_annual_revenue: z.number(),
});

const referralDoctorReferralSchema = z.object({
  referrer_name: z.string(),
  referred: z.number(),
  net_production: z.number(),
  avg_production_per_referral: z.number(),
  trend_label: trendLabelSchema,
  notes: z.string(),
});

const referralNonDoctorReferralSchema = z.object({
  source_label: z.string(),
  source_key: z.string(),
  source_type: sourceTypeSchema,
  referred: z.number(),
  net_production: z.number(),
  avg_production_per_referral: z.number(),
  trend_label: trendLabelSchema,
  notes: z.string(),
});

const referralAutomationOpportunitySchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: prioritySchema,
  impact: z.string(),
  effort: z.string(),
  category: z.string(),
  due_date: z.string().optional(),
});

const referralPracticeActionSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: prioritySchema,
  impact: z.string(),
  effort: z.string(),
  category: z.string(),
  owner: z.string(),
  due_date: z.string().optional(),
});

export const ReferralEngineAgentOutputSchema = z
  .object({
    executive_summary: z.array(z.string()).optional(),
    growth_opportunity_summary: referralGrowthSummarySchema,
    doctor_referral_matrix: z.array(referralDoctorReferralSchema),
    non_doctor_referral_matrix: z.array(referralNonDoctorReferralSchema),
    alloro_automation_opportunities: z.array(referralAutomationOpportunitySchema),
    practice_action_plan: z.array(referralPracticeActionSchema),
    observed_period: z
      .object({
        start_date: z.string(),
        end_date: z.string(),
      })
      .optional(),
    data_quality_flags: z.array(z.string()).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export type ReferralEngineAgentOutputZ = z.infer<
  typeof ReferralEngineAgentOutputSchema
>;

// =====================================================================
// SUMMARY V2 AGENT (Chief-of-Staff)
// =====================================================================
//
// Forward-going contract for Summary v2 (see
// plans/04282026-no-ticket-monthly-agents-v2-backend/spec.md). Replaces
// the legacy `SummaryAgentOutput` interface as the validation target —
// the legacy interface is intentionally kept for backward compat with
// already-stored agent_results rows. Top-level `.strict()` forbids
// unknown keys at the root; nested objects (cta, outcome) stay
// permissive to tolerate model verbosity.

export const SupportingMetricSchema = z.object({
  label: z.string().min(1).max(40),
  value: z.string().min(1),
  sub: z.string().optional(),
  source_field: z.string().min(1),
});

export const TopActionSchema = z.object({
  title: z.string().min(1).max(160),
  urgency: z.enum(["high", "medium", "low"]),
  priority_score: z.number().min(0).max(1),
  domain: z.enum([
    "review",
    "gbp",
    "ranking",
    "form-submission",
    "pms-data-quality",
    "referral",
  ]),
  // Generous runaway backstop (~3 sentences). The real "1-2 sentences" lever
  // is the prompt guidance in Summary.md — a TIGHT cap here would fail-closed
  // and reject the doctor's entire monthly action over prose length, which is
  // worse than a slightly long rationale. plans/06132026-practice-hub-clarity.
  rationale: z.string().min(1).max(400),
  highlights: z.array(z.string()).max(2).default([]),
  supporting_metrics: z.array(SupportingMetricSchema).length(3),
  outcome: z.object({
    deliverables: z.string().min(1),
    mechanism: z.string().min(1),
  }),
  cta: z.object({
    primary: z.object({
      label: z.string().min(1),
      action_url: z.string().min(1),
    }),
    secondary: z
      .object({
        label: z.string().min(1),
        action_url: z.string().min(1),
      })
      .optional(),
  }),
  due_at: z.string().optional(),

  // --- Ch2 (Card Standard) unified-type extension ---
  // ADDITIVE + optional so existing SUMMARY output still validates (no breaking reshape).
  // Set by the generating chapter; the selector/eyebrow fall back to DOMAIN_TO_STAGE when absent.
  // `stage`: the journey stage this card ADDRESSES (the leak it fixes), NOT derived from `domain`.
  // Reviews = choosable (Corey-staked 2026-07-07): the owner-facing stage in BOTH the verdict and
  // the eyebrow; "memorable" is Ch6's internal ownership bucket, never the owner-facing label.
  stage: z.enum(["findable", "choosable", "bookable", "memorable"]).optional(),
  // `execution_state`: makes the FLIP machine-readable. built = Alloro drafts + does it on approval
  // + attributes; read-only = honest observation (unbuilt rail); handoff = owner action (minimize).
  execution_state: z.enum(["built", "read-only", "handoff"]).optional(),
  // `generic`: Ch2 quality flag. A generic card (true) fails the Card Standard bar and is never selected.
  generic: z.boolean().optional(),
});

export const DomainSummarySchema = z.object({
  domain: z.enum([
    "review",
    "gbp",
    "ranking",
    "form-submission",
    "pms-data-quality",
    "referral",
  ]),
  heading: z.string().min(1).max(30),
  summary: z.string().min(1).max(150),
  detail: z.string().min(1).max(500),
  // Optional for stored pre-Choosable outputs. Required by the prompt and
  // post-Zod validator when a review summary cites competitor comparisons.
  supporting_metrics: z
    .array(SupportingMetricSchema)
    .min(3)
    .max(4)
    .optional(),
});

export const SummaryV2OutputSchema = z
  .object({
    // Simplified to a single "one thing that matters" action. Upper bound kept
    // at 5 so older multi-action outputs still validate; the task-creator
    // persists only the top-ranked entry. plans/06092026-practice-hub-simplification.
    top_actions: z.array(TopActionSchema).min(1).max(5),
    domain_summaries: z.array(DomainSummarySchema).max(6).optional(),
    data_quality_flags: z.array(z.string()).optional(),
    confidence: z.number().min(0).max(1).optional(),
    observed_period: z
      .object({
        start_date: z.string(),
        end_date: z.string(),
      })
      .optional(),
  })
  .strict();

export type SupportingMetric = z.infer<typeof SupportingMetricSchema>;
export type TopAction = z.infer<typeof TopActionSchema>;
export type DomainSummary = z.infer<typeof DomainSummarySchema>;
export type SummaryV2Output = z.infer<typeof SummaryV2OutputSchema>;
