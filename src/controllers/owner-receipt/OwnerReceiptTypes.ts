/**
 * Public types for the owner-receipt domain.
 *
 * The Owner Receipt is the CMO's report: for one org over a PRE and a POST
 * window it joins (1) the dated actions Alloro took (reused from the Proof
 * Receipt), (2) the post-window gate numbers with their honest before -> after
 * trend, and (3) the diagnosis of which funnel term moved. It is READ-ONLY and
 * ADDITIVE — it reads existing services/readers and invents no number.
 *
 * HONESTY (Value #6): every metric carries its `source` + `asOf`; an absent
 * value is `null` with a plain-words `note` ("not measured"), NEVER 0. No field
 * asserts causation — the numbers, the trend, and the diagnosis are returned;
 * the owner draws the conclusion. This file emits structured data only; no
 * owner-facing prose/copy is built here (that is the frontend's job).
 */

import type { ProofReceipt } from "../proof-receipt/ProofReceiptTypes";
import type { ImpressionsLiftResult } from "../patient-journey/feature-services/impressionsLiftReader";
import type { FunnelMovementDiagnosis } from "../patient-journey/feature-utils/funnelMovementDiagnosis";

/** A closed date window, inclusive of both ends, as `YYYY-MM-DD` strings. */
export interface ReceiptWindow {
  start: string;
  end: string;
}

/** The three staked funnel gates a receipt metric can describe. */
export type ReceiptGate = "impressions" | "visits" | "leads";

/**
 * One post-window gate number, honesty-labelled. `value` is `null` when the
 * source is not connected or the window is not honestly covered — never a
 * zero-standing-in-for-absent. A genuine measured zero (a connected source with
 * no events in the window) is a real `0`; the `note` disambiguates.
 */
export interface OwnerReceiptMetric {
  gate: ReceiptGate;
  /** Post-window value, or `null` when not measured. */
  value: number | null;
  /** Provenance of the number: e.g. `gsc_organic`, `rybbit`, `form_submissions`. */
  source: string | null;
  /** As-of date (`YYYY-MM-DD`) of the number, or `null` when not measured. */
  asOf: string | null;
  /** Plain-words note: why `null`, or a coverage caveat. `null` when clean. */
  note: string | null;
}

/**
 * The assembled owner receipt. Structured data only — the actions, the metrics,
 * the honest impressions trend, and the funnel diagnosis. No prose, no causal claim.
 */
export interface OwnerReceipt {
  organizationId: number;
  /**
   * Set when scoped to one office; omitted = every accessible location.
   *
   * ⚠️ KNOWN ASYMMETRY — this scopes the ACTIONS ONLY. `metrics`,
   * `impressionsTrend` and `diagnosis` are read per website PROJECT, and
   * `ProjectModel.findByOrganizationId` returns one project per org, so those
   * numbers are practice-wide regardless of this field. A multi-location
   * practice scoping to office B therefore sees office-B actions beside
   * org-wide numbers, with this field echoed back as if it scoped everything.
   *
   * Resolving it means either refusing `locationId` outright or carrying a
   * per-metric scope, both of which change the contract the card renders — a
   * product decision, deliberately not made here. Until it is settled, a
   * consumer must NOT present these numbers as belonging to one office.
   */
  locationId?: number;
  /** The org's website project id, or `null` when it has none (all gates null). */
  projectId: string | null;
  preWindow: ReceiptWindow;
  postWindow: ReceiptWindow;
  /** Dated actions Alloro took over [preWindow.start, postWindow.end] (reused). */
  actions: ProofReceipt;
  /**
   * False when the dated-actions read FAILED and `actions` is a placeholder.
   *
   * This exists because the degraded placeholder is byte-identical to a true
   * "Alloro did nothing this window": both are `items: []` and
   * `summary.total: 0`. Without this flag a failed read renders to the owner as
   * a measured zero — Value #6 exactly. A consumer must check this before
   * showing the count, and show "we could not load the action list" instead.
   */
  actionsAvailable: boolean;
  /** Plain-words note when `actionsAvailable` is false; `null` otherwise. */
  actionsNote: string | null;
  /** Post-window gate numbers, honesty-labelled. */
  metrics: OwnerReceiptMetric[];
  /** Honest before -> after impressions delta + coverage (reused, GSC-organic). */
  impressionsTrend: ImpressionsLiftResult;
  /** Which funnel term moved leads pre -> post (deterministic; no causation). */
  diagnosis: FunnelMovementDiagnosis;
}

/**
 * Everything the service needs. `organizationId` and `accessibleLocationIds`
 * are server-derived (§5.5/§11.7) — there is deliberately no field here a
 * client request can set to name another tenant.
 */
export interface GetOwnerReceiptInput {
  organizationId: number;
  accessibleLocationIds: number[];
  locationId?: number;
  preWindow: ReceiptWindow;
  postWindow: ReceiptWindow;
  /** Pagination for the dated actions list (§11.6). */
  page: number;
  limit: number;
}
