import { GbpWorkItemModel, type IGbpWorkItem } from "../models/GbpWorkItemModel";

/**
 * Proof Receipt (Tier 1) — the owner-facing "here's what Alloro did for you" feed.
 * See specs/proof-receipt-build-spec.md.
 *
 * Every line is a LOGGED, DATED fact drawn from published `gbp_work_items`
 * (a review reply posted, a local post published) — no causal arrow, nothing
 * modeled, nothing to fabricate. That honesty is what makes it a rail-record
 * and not an agency activity report. Later tiers fold in leads answered
 * (`form_submissions.responded_at`, from the Responder) and reviews.
 */

export interface ProofReceiptItem {
  type: "review_reply" | "local_post";
  at: Date; // published_at — when Alloro did it
  workItemId: string;
}

export interface ProofReceipt {
  organizationId: number;
  since: Date;
  until: Date;
  items: ProofReceiptItem[];
  summary: {
    reviewReplies: number;
    localPosts: number;
    total: number;
  };
}

/**
 * Assemble the Tier-1 proof receipt for one org over [since, until):
 * the dated list of published work + a plain count summary. Read-only.
 */
export async function buildProofReceipt(
  organizationId: number,
  since: Date,
  until: Date,
): Promise<ProofReceipt> {
  const published = await GbpWorkItemModel.listPublishedForOrgInRange(
    organizationId,
    since,
    until,
  );

  const items: ProofReceiptItem[] = published
    .filter((w: IGbpWorkItem) => w.published_at != null)
    .map((w: IGbpWorkItem) => ({
      type: w.content_type,
      at: w.published_at as Date,
      workItemId: w.id,
    }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const reviewReplies = items.filter((i) => i.type === "review_reply").length;
  const localPosts = items.filter((i) => i.type === "local_post").length;

  return {
    organizationId,
    since,
    until,
    items,
    summary: { reviewReplies, localPosts, total: items.length },
  };
}
