/**
 * Owner-facing "what Alloro did for you" proof receipt (Tier 1).
 *
 * Mirrors the backend contract in
 * `src/controllers/proof-receipt/ProofReceiptTypes.ts`. Dates cross the wire as
 * ISO strings (JSON carries no Date). Every line is a logged, dated fact — a
 * review reply posted, a local post published — no causal claim, nothing modelled.
 */

/**
 * Work-item content type. Mirrors the backend `GbpContentType` union
 * (`src/models/GbpWorkItemModel.ts`) so a consumer keying a lookup off this
 * gets a compile error when a new type is added instead of a silent default.
 */
export type ProofReceiptItemType = "review_reply" | "local_post" | "business_info";

export interface ProofReceiptItem {
  type: ProofReceiptItemType;
  /** published_at (ISO string) — when Alloro did it. */
  at: string;
  workItemId: string;
  /** Which office, so a multi-location practice's feed stays de-blendable. */
  locationId: number;
}

export interface ProofReceiptSummary {
  reviewReplies: number;
  localPosts: number;
  total: number;
}

export interface ProofReceipt {
  organizationId: number;
  /** Set when scoped to one office; omitted = every accessible location. */
  locationId?: number;
  since: string;
  until: string;
  items: ProofReceiptItem[];
  summary: ProofReceiptSummary;
}
