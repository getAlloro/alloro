/**
 * Patient Journey Insights — response contract (T4).
 *
 * The single shape returned by `GET /api/patient-journey` inside the
 * `{ success, data, error }` envelope (§8.1). The frontend mirrors this type
 * verbatim (`frontend/src/types/patientJourney.ts`), so any change here is a
 * contract change — keep the two in lockstep.
 *
 * Convention: a stage with `value === null` and `available === false` renders an
 * honest "not connected yet" empty state — never a misleading zero. `shared`
 * marks the website-traffic stages (impressions / visits / leads) that are
 * exact for single-location practices but whole-practice totals for
 * multi-location practices.
 */

/**
 * Funnel stage keys. The current monitored pipeline emits
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

export type OrgType = "health" | "generic";

export interface PatientJourneyLocation {
  id: number;
  name: string;
  organizationId: number;
  orgType: OrgType;
  isMultiLocation: boolean;
}

export interface PatientJourneyPeriod {
  /** Human label, e.g. "June 2026". */
  label: string;
  /** Inclusive window start, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive window end, YYYY-MM-DD. */
  endDate: string;
}

export interface PatientJourneyStage {
  key: PatientJourneyStageKey;
  /** Org-type-neutral stage label, e.g. "Website Leads". */
  label: string;
  /** Metric descriptor under the label, e.g. "Search impressions". */
  metaLabel: string;
  /** Stage value, or null when the source is not connected. */
  value: number | null;
  /** True when a real value was read; false drives the empty state. */
  available: boolean;
  /** Why an unavailable stage is empty; drives the stage-card empty copy. */
  unavailableReason?: StageUnavailableReason;
  /** Source descriptor, e.g. "Google Search Console". */
  source: string;
  /** Freshness of this stage's value (ISO date) or null when unknown. */
  asOf: string | null;
  /** True for the whole-practice website-traffic stages. */
  shared: boolean;
  /** Optional caveat shown next to the stage (e.g. all-channel visits). */
  note?: string;
  /** Optional source-specific metadata for detail views and QA visibility. */
  metadata?: Record<string, unknown>;
}

export interface PatientJourneyConversion {
  fromKey: PatientJourneyStageKey;
  toKey: PatientJourneyStageKey;
  /** Step conversion percent (to / from * 100), null if either side is null. */
  pct: number | null;
  /** Step label, e.g. "Google Visibility → Website Visitors". */
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
  leakStageKey: PatientJourneyStageKey | null;
}

export interface PatientJourney {
  location: PatientJourneyLocation;
  period: PatientJourneyPeriod;
  stages: PatientJourneyStage[];
  conversions: PatientJourneyConversion[];
  /** Stage at the bottom of the biggest-leak step, or null. */
  leakStageKey: PatientJourneyStageKey | null;
  revenue: PatientJourneyRevenue;
  context: PatientJourneyContext;
  headline: PatientJourneyHeadline;
}

/**
 * Tenant-scoped input for the assembler. Every field is resolved from the
 * server-side request context by the controller (§5.5/§11.7) — the service
 * never derives tenant identity itself.
 */
export interface PatientJourneyInput {
  organizationId: number;
  locationId: number;
  /** Report month, first day of month YYYY-MM-01. */
  reportMonth: string;
}
