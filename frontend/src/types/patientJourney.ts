/**
 * Patient Journey Insights — frontend response types.
 *
 * Mirrors the backend response contract for `GET /api/patient-journey`
 * (plans/06242026-patient-journey-insights/spec.html, T5/T6). The endpoint
 * returns `{ success, data: PatientJourney, error }`; `PatientJourney` is the
 * `data` payload below and must stay byte-for-byte aligned with the backend
 * contract — a stage `value` of `null` paired with `available: false` is an
 * honest "not connected yet" empty state, never a misleading zero.
 */

/** Org wording driver — "health" → "Patient", "generic" → "Customer". */
export type PatientJourneyOrgType = "health" | "generic";

/**
 * Stable stage identifiers. The current monitored pipeline emits
 * impressions → visits → leads; `patients` is reserved until converted-patient
 * data is trustworthy enough to reintroduce.
 */
export type PatientJourneyStageKey =
  | "impressions"
  | "visits"
  | "leads"
  | "patients";

/**
 * Why an unavailable stage is empty. Only the impressions stage emits this
 * today: `not_connected` = no active GSC integration; `pending` = connected
 * but the current month's data has not landed yet (GSC trails ~2 days);
 * `no_data` = connected but the selected past month has no rows. Absent =
 * the generic empty state.
 */
export type StageUnavailableReason = "not_connected" | "pending" | "no_data";

export interface PatientJourneyAction {
  id: string;
  actionType: "seo_meta_update";
  metricKey: "ctr";
  occurredAt: string;
  activeUntil: string;
  summary: string;
  measurementNote: string;
}

export interface PatientJourneyLocation {
  id: number;
  name: string;
  organizationId: number;
  orgType: PatientJourneyOrgType;
  isMultiLocation: boolean;
}

export interface PatientJourneyPeriod {
  label: string;
  startDate: string;
  endDate: string;
}

export interface PatientJourneyGscMetricRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PatientJourneyGscMetadata {
  clicks: number;
  ctr: number;
  position: number;
  topQueries: PatientJourneyGscMetricRow[];
  topPages: PatientJourneyGscMetricRow[];
  top10QueryCount: number;
  top3QueryCount: number;
}

export interface PatientJourneyRybbitMetadata {
  sessions: number;
  pageviews: number;
  bounceRate: number;
  pagesPerSession: number;
  sessionDuration: number;
}

export interface PatientJourneyLeadsMetadata {
  verified: number;
}

export interface PatientJourneyStageMetadata {
  gsc?: PatientJourneyGscMetadata;
  rybbit?: PatientJourneyRybbitMetadata;
  leads?: PatientJourneyLeadsMetadata;
}

/**
 * One funnel stage. `value: null` + `available: false` => render the honest
 * empty state. `shared: true` marks the org-wide stages
 * (impressions / visits / leads) that, for a multi-location practice, are
 * whole-practice totals (label them "whole-practice — all locations", NOT
 * "website": impressions now folds in whole-practice GBP Maps, not just the site).
 */
export interface PatientJourneyStage {
  key: PatientJourneyStageKey;
  label: string;
  metaLabel: string;
  value: number | null;
  available: boolean;
  /** Why an unavailable stage is empty; drives the stage-card empty copy. */
  unavailableReason?: StageUnavailableReason;
  source: string;
  asOf: string | null;
  shared: boolean;
  note?: string;
  metadata?: PatientJourneyStageMetadata;
  /** Current Alloro actions tied to this stage's metrics. */
  actions?: PatientJourneyAction[];
}

export interface PatientJourneyConversion {
  fromKey: string;
  toKey: string;
  pct: number | null;
  label: string;
  /** True when this step is the lowest measured conversion rate. */
  isLeak: boolean;
}

export interface PatientJourneyRevenue {
  value: number | null;
  available: boolean;
}

export interface PatientJourneyRankContext {
  position: number | null;
  available: boolean;
  notInTop20: boolean;
}

export interface MemorableCard {
  rung: "reply_gap" | "velocity_drop";
  stage: "memorable";
  execution_state: "built" | "read-only";
  generic: false;
  headline: string;
  action: string;
  caught_number: number;
  attribution_running_total: number | null;
}

export interface PatientJourneyReviewsContext {
  rating: number | null;
  count: number | null;
  newThisMonth: number | null;
  replyRatePct: number | null;
  available: boolean;
  card: MemorableCard | null;
}

export interface PatientJourneyContext {
  rank: PatientJourneyRankContext;
  reviews: PatientJourneyReviewsContext;
}

export interface PatientJourneyHeadline {
  text: string;
  leakStageKey: string | null;
}

/** The `data` payload of `GET /api/patient-journey`. */
export interface BookableCard {
  stage: "bookable";
  generic: false;
  hook: string;
  action: string;
  caught_number: number;
}

export interface PatientJourney {
  location: PatientJourneyLocation;
  period: PatientJourneyPeriod;
  stages: PatientJourneyStage[];
  conversions: PatientJourneyConversion[];
  leakStageKey: string | null;
  bookableCard: BookableCard | null;
  revenue: PatientJourneyRevenue;
  context: PatientJourneyContext;
  headline: PatientJourneyHeadline;
}

/** Full envelope returned by the api/ helper (success-envelope, §8.1/§16.1). */
export interface PatientJourneyResponse {
  success: boolean;
  data?: PatientJourney;
  error?: string | null;
}
