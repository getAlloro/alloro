import { apiGet, unwrap } from "./index";

/**
 * The owner-facing Owner Receipt — the CMO's report for one org over a PRE and
 * a POST window: the dated actions Alloro took, the post-window gate numbers
 * with their honest before -> after impressions trend, and the diagnosis of
 * which funnel term moved. Backend: GET /api/owner-receipt (JWT + RBAC +
 * location-scoped). This is the only layer that talks HTTP (§12.1).
 *
 * These interfaces mirror the backend response CONTRACT by hand — they do NOT
 * import backend types, so this file compiles independently of the backend
 * branch. Dates cross the wire as ISO strings (JSON carries no Date). Every
 * value is honesty-labelled: an absent number is `null` with a plain-words
 * `note` ("not measured"), never a 0-standing-in-for-absent, and no field
 * asserts causation.
 */

/** A closed date window, inclusive of both ends, as `YYYY-MM-DD` strings. */
export interface ReceiptWindow {
  start: string;
  end: string;
}

/** The three staked funnel gates a receipt metric can describe. */
export type ReceiptGate = "impressions" | "visits" | "leads";

/** The three multiplicative terms of `submissions = impressions × CTR × CRO`. */
export type FunnelTerm = "impressions" | "CTR" | "CRO";

/**
 * One post-window gate number, honesty-labelled. `value` is `null` when the
 * source is not connected or the window is not honestly covered — never a
 * zero-standing-in-for-absent. A genuine measured zero is a real `0`; the
 * `note` disambiguates.
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

/** One dated action Alloro took (a review reply posted, a local post published). */
export interface OwnerReceiptActionItem {
  /** Work-item content type, e.g. "review_reply" | "local_post". */
  type: string;
  /** published_at (ISO string) — when Alloro did it. */
  at: string;
  workItemId: string;
  /** Which office, so a multi-location practice's feed stays de-blendable. */
  locationId: number;
}

export interface OwnerReceiptActionSummary {
  reviewReplies: number;
  localPosts: number;
  total: number;
}

export interface OwnerReceiptActionPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** The dated actions Alloro took over the receipt's span (reused Proof Receipt). */
export interface OwnerReceiptActions {
  organizationId: number;
  locationId?: number;
  /** ISO string. */
  since: string;
  /** ISO string. */
  until: string;
  items: OwnerReceiptActionItem[];
  summary: OwnerReceiptActionSummary;
  pagination?: OwnerReceiptActionPagination;
}

/**
 * Honest coverage + value for a single impressions window. `storedImpressions`
 * is only safe to read as the window total when `fullyCovered` is true.
 */
export interface ImpressionsWindowCoverage {
  window: ReceiptWindow;
  storedImpressions: number;
  storedDays: number;
  expectedDays: number;
  earliestStored: string | null;
  latestStored: string | null;
  fullyCovered: boolean;
}

/**
 * Honest before -> after GSC-organic impressions trend. A `delta` is present
 * ONLY when `sufficient` is true (both windows fully covered); otherwise
 * `reason` carries the plain-words coverage gap and no delta is shown.
 */
export interface ImpressionsTrend {
  organizationId: number;
  projectId: string | null;
  /** Fixed provenance — GSC web-search organic, never Maps/GBP. */
  source: "gsc_organic";
  pre: ImpressionsWindowCoverage | null;
  post: ImpressionsWindowCoverage | null;
  /** post - pre, ONLY when both windows are fully covered; else `null`. */
  delta: number | null;
  /** delta / pre as a fraction; `null` when the delta is null or pre is 0. */
  pctChange: number | null;
  /** True only when a real delta was produced. */
  sufficient: boolean;
  /** Plain-words reason the result is insufficient; `null` when sufficient. */
  reason: string | null;
  history: { earliest: string | null; latest: string | null };
}

/** Pre/post for one funnel term plus its additive log-contribution to Δln(leads). */
export interface FunnelTermMovement {
  term: FunnelTerm;
  pre: number | null;
  post: number | null;
  logContribution: number | null;
}

/**
 * Which funnel term moved leads pre -> post. Deterministic arithmetic, no
 * causation. `primaryDriver` is non-null only when `diagnosable` is true;
 * otherwise `reason` says plainly why it can't be decomposed.
 */
export interface FunnelMovementDiagnosis {
  leadsPre: number | null;
  leadsPost: number | null;
  leadsChange: number | null;
  leadsChangeFactor: number | null;
  primaryDriver: FunnelTerm | null;
  terms: FunnelTermMovement[];
  diagnosable: boolean;
  reason: string | null;
}

/**
 * The assembled owner receipt. Structured data only — the actions, the metrics,
 * the honest impressions trend, and the funnel diagnosis. No prose, no causal claim.
 */
export interface OwnerReceipt {
  organizationId: number;
  locationId?: number;
  projectId: string | null;
  preWindow: ReceiptWindow;
  postWindow: ReceiptWindow;
  actions: OwnerReceiptActions;
  metrics: OwnerReceiptMetric[];
  impressionsTrend: ImpressionsTrend;
  diagnosis: FunnelMovementDiagnosis;
}

/** The two comparison windows a receipt is scoped to (the owner picks them). */
export interface OwnerReceiptWindows {
  preStart: string;
  preEnd: string;
  postStart: string;
  postEnd: string;
}

/**
 * Fetch the owner receipt for one org over two dated windows.
 *
 * Mirrors the `fetchProofReceipt` pattern (§12.1): the only layer that talks
 * HTTP. The organization is derived server-side from the caller's own
 * membership (§5.5/§11.7) — it is deliberately NOT a request field here.
 */
export async function getOwnerReceipt(
  windows: OwnerReceiptWindows,
  locationId: number | null,
  pagination?: { page?: number; limit?: number },
): Promise<OwnerReceipt> {
  const query = new URLSearchParams();
  query.set("preStart", windows.preStart);
  query.set("preEnd", windows.preEnd);
  query.set("postStart", windows.postStart);
  query.set("postEnd", windows.postEnd);
  if (locationId !== null) query.set("locationId", String(locationId));
  if (pagination?.page !== undefined) query.set("page", String(pagination.page));
  if (pagination?.limit !== undefined) query.set("limit", String(pagination.limit));
  return unwrap<OwnerReceipt>(
    await apiGet({ path: `/owner-receipt?${query.toString()}` }),
  );
}
