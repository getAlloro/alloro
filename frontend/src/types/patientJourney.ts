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

/** Stable identifiers for the six funnel stages, in funnel order. */
export type PatientJourneyStageKey =
  | "market_demand"
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
}

export interface PatientJourneyConversion {
  fromKey: string;
  toKey: string;
  pct: number | null;
  label: string;
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
