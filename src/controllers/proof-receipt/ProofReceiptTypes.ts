/**
 * Public types for the proof-receipt domain.
 *
 * Proof Receipt (Tier 1) — the owner-facing "here is what Alloro did for you"
 * feed. Every line is a logged, dated fact drawn from published
 * `gbp_work_items` (a review reply posted, a local post published): no causal
 * arrow, nothing modelled, nothing to fabricate. Later tiers fold in leads
 * answered (`form_submissions.responded_at`) and reviews.
 *
 * (See plans/07202026-pr-merge-remediation/pr-177-proof-receipt.spec.html)
 */

import type { GbpContentType } from "../../models/GbpWorkItemModel";
import type { ProofReceiptPaginationMeta } from "./feature-utils/proofReceiptPagination";

export interface ProofReceiptItem {
  type: GbpContentType;
  /** published_at — when Alloro did it. */
  at: Date;
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
  since: Date;
  until: Date;
  items: ProofReceiptItem[];
  summary: ProofReceiptSummary;
  pagination: ProofReceiptPaginationMeta;
}

/**
 * Everything the service needs. `organizationId` and `accessibleLocationIds`
 * are server-derived (§5.5) — there is deliberately no field here that a
 * client request can set.
 */
export interface GetProofReceiptInput {
  organizationId: number;
  accessibleLocationIds: number[];
  locationId?: number;
  since: Date;
  until: Date;
  page: number;
  limit: number;
}
