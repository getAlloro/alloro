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
 * empty state. `shared: true` marks the website-traffic stages
 * (impressions / visits / leads) that, for a multi-location practice, are
 * whole-practice totals (label them "whole-practice website").
 */
export interface PatientJourneyStage {
  key: PatientJourneyStageKey;
  label: string;
  metaLabel: string;
  value: number | null;
  available: boolean;
  source: string;
  asOf: string | null;
  shared: boolean;
  note?: string;
  metadata?: PatientJourneyStageMetadata;
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
  totalCompetitors: number | null;
  available: boolean;
}

export interface PatientJourneyReviewsContext {
  rating: number | null;
  count: number | null;
  newThisMonth: number | null;
  replyRatePct: number | null;
  available: boolean;
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
export interface PatientJourney {
  location: PatientJourneyLocation;
  period: PatientJourneyPeriod;
  stages: PatientJourneyStage[];
  conversions: PatientJourneyConversion[];
  leakStageKey: string | null;
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
