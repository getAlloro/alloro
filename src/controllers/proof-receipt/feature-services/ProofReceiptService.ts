/**
 * Proof Receipt (Tier 1) — orchestrates the owner-facing read-only receipt.
 *
 * Domain-local per §6.3: this is single-domain logic, so it belongs in the
 * domain's feature-services/ rather than the shared src/services/ tree.
 * No database access of its own (§7.3/§7.4) — every read goes through
 * GbpWorkItemModel.
 *
 * (See plans/07202026-pr-merge-remediation/pr-177-proof-receipt.spec.html)
 */

import {
  GbpWorkItemModel,
  type GbpContentType,
  type IGbpWorkItem,
  type PublishedWorkItemRangeFilters,
} from "../../../models/GbpWorkItemModel";
import { buildProofReceiptPaginationMeta } from "../feature-utils/proofReceiptPagination";
import type {
  GetProofReceiptInput,
  ProofReceipt,
  ProofReceiptItem,
} from "../ProofReceiptTypes";

export class ProofReceiptService {
  /**
   * Assemble the receipt for one org over [since, until): a page of dated
   * published work plus a count summary. Read-only.
   */
  static async getReceipt(input: GetProofReceiptInput): Promise<ProofReceipt> {
    // §11.7 — the tenant scope is built once and shared by all three reads, so
    // the page, the summary and the total cannot disagree about scope.
    const filters: PublishedWorkItemRangeFilters = {
      organizationId: input.organizationId,
      accessibleLocationIds: input.accessibleLocationIds,
      locationId: input.locationId,
      since: input.since,
      until: input.until,
    };

    const [rows, summaryRows, total] = await Promise.all([
      GbpWorkItemModel.listPublishedForOrgInRange({
        ...filters,
        limit: input.limit,
        offset: (input.page - 1) * input.limit,
      }),
      GbpWorkItemModel.summarizePublishedForOrgInRange(filters),
      GbpWorkItemModel.countPublishedForOrgInRange(filters),
    ]);

    // ORDER BY published_at DESC in the model is authoritative and correct
    // across pages, which an in-memory sort of a single page is not.
    const items: ProofReceiptItem[] = rows
      .filter((item: IGbpWorkItem) => item.published_at != null)
      .map((item: IGbpWorkItem) => ({
        type: item.content_type,
        at: item.published_at as Date,
        workItemId: item.id,
        locationId: item.location_id,
      }));

    // Counts come from the grouped query over the WHOLE range, never from the
    // current page — otherwise a practice past one page under-reports itself.
    const countFor = (contentType: GbpContentType): number =>
      summaryRows.find((row) => row.content_type === contentType)?.count ?? 0;

    return {
      organizationId: input.organizationId,
      locationId: input.locationId,
      since: input.since,
      until: input.until,
      items,
      summary: {
        reviewReplies: countFor("review_reply"),
        localPosts: countFor("local_post"),
        businessInfo: countFor("business_info"),
        total,
      },
      pagination: buildProofReceiptPaginationMeta(
        total,
        input.page,
        input.limit
      ),
    };
  }
}
