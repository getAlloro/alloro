/**
 * Receipts Report - Types + Zod
 *
 * The read-only "receipts report" shape produced by
 * `service.receipts-report.ts`. It reports the true monthly value
 * delivered, split into two honest grains:
 *
 *  - `orgLevel`: values that are measured for the whole organization and
 *    CANNOT be attributed to a single location with the data we have
 *    today (website visitors, leads captured, ranking, reviews vs a top
 *    competitor). These are reported once, never copied onto each
 *    location, so an org aggregate is never misread as a location's own.
 *  - `locations[]`: values that ARE genuinely per-location (GBP posts
 *    published, GBP review replies published), each with a total.
 *
 * Honesty contract (the #1 rule): if a value cannot be sourced, the
 * field carries a flag saying so. We NEVER estimate, fabricate, or fake
 * a number. A real zero is a value (flag "ok"), not a flag.
 *
 * Flag vocabulary used across fields:
 *  - "ok"                 sourced from a real query / service
 *  - "not_connected"      integration not wired for this org (rybbit)
 *  - "source_unavailable" the source table/query is unavailable
 *  - "no_snapshots"       no ranking snapshots in the period
 *  - "partial_sum"        total omits one or more flagged locations
 */

import { z } from "zod";

// =====================================================================
// FIELD SHAPES
// =====================================================================

/** A single numeric value with an honest data-integrity flag. */
export interface ReceiptField {
  value: number | null;
  flag: string;
}

export const ReceiptFieldSchema = z.object({
  value: z.number().nullable(),
  flag: z.string(),
});

/**
 * One keyword's ranking movement across the period.
 *
 * `startPosition`/`endPosition` are the earliest and latest in-period
 * snapshot positions. `bestPosition`/`worstPosition` are the best (lowest
 * number) and worst (highest number) positions seen at ANY point in the
 * period, so a mid-period dip is never hidden behind matching endpoints.
 */
export interface RankingMovementItem {
  keyword: string;
  startPosition: number | null;
  endPosition: number | null;
  bestPosition: number | null;
  worstPosition: number | null;
}

export const RankingMovementItemSchema = z.object({
  keyword: z.string(),
  startPosition: z.number().nullable(),
  endPosition: z.number().nullable(),
  bestPosition: z.number().nullable(),
  worstPosition: z.number().nullable(),
});

/**
 * Ranking movement (per-keyword; never summed). `note` carries a
 * coverage caveat, e.g. "snapshots end 2026-05-18" when the latest
 * snapshot predates the period end.
 */
export interface RankingMovementField {
  movements: RankingMovementItem[];
  note: string;
  flag: string; // "ok" | "no_snapshots" | "source_unavailable"
}

export const RankingMovementFieldSchema = z.object({
  movements: z.array(RankingMovementItemSchema),
  note: z.string(),
  flag: z.string(),
});

/** Client review count vs the top competitor from the latest snapshot. */
export interface ReviewsVsCompetitor {
  clientReviewCount: number | null;
  competitorName: string | null;
  competitorReviewCount: number | null;
}

export const ReviewsVsCompetitorSchema = z.object({
  clientReviewCount: z.number().nullable(),
  competitorName: z.string().nullable(),
  competitorReviewCount: z.number().nullable(),
});

/**
 * Reviews-vs-top-competitor (never summed). `note` carries the same
 * coverage caveat as ranking, so a stale count is never presented as the
 * period-end state without a flag.
 */
export interface ReviewsVsTopCompetitorField {
  value: ReviewsVsCompetitor | null;
  note: string;
  flag: string; // "ok" | "no_snapshots" | "source_unavailable"
}

export const ReviewsVsTopCompetitorFieldSchema = z.object({
  value: ReviewsVsCompetitorSchema.nullable(),
  note: z.string(),
  flag: z.string(),
});

// =====================================================================
// REPLACEMENT-COST CONTEXT
// =====================================================================

export interface ReplacementCostLineItem {
  service: string;
  monthlyRate: number | null;
}

export const ReplacementCostLineItemSchema = z.object({
  service: z.string(),
  monthlyRate: z.number().nullable(),
});

/**
 * Replacement-cost context: what this work would cost bought a la carte.
 *
 * This structure is deliberately emitted with NO dollar figures:
 * `ratesStaked` is false, every `monthlyRate` and `total` is null. AI
 * drafts the line-item labels; a human stakes the actual rates before
 * any figure ships. It must never say or imply "Alloro made you $X in
 * revenue" - that is not attributable and violates the no-guarantees
 * canon (Value #6).
 */
export interface ReplacementCostContext {
  lineItems: ReplacementCostLineItem[];
  total: number | null;
  note: string;
  ratesStaked: boolean;
}

export const ReplacementCostContextSchema = z.object({
  lineItems: z.array(ReplacementCostLineItemSchema),
  total: z.number().nullable(),
  note: z.string(),
  ratesStaked: z.boolean(),
});

// =====================================================================
// ORG-LEVEL + PER-LOCATION
// =====================================================================

/**
 * Values measured for the whole organization. With today's data these
 * cannot honestly be split per location:
 *  - websiteVisitors: Rybbit tracks one site per org.
 *  - leadsCaptured: form_submissions link to a project (org), and
 *    projects carry no location; the column form_submissions.location_id
 *    is null for every row.
 *  - ranking + reviewsVsTopCompetitor: every weekly_ranking_snapshot is
 *    stored org-level (location_id null).
 * If location-tagged sources ever exist, add per-location handling; do
 * not copy an org aggregate onto each location.
 */
export interface OrgLevelReceipts {
  websiteVisitors: ReceiptField;
  leadsCaptured: ReceiptField;
  rankingMovement: RankingMovementField;
  reviewsVsTopCompetitor: ReviewsVsTopCompetitorField;
}

export const OrgLevelReceiptsSchema = z.object({
  websiteVisitors: ReceiptFieldSchema,
  leadsCaptured: ReceiptFieldSchema,
  rankingMovement: RankingMovementFieldSchema,
  reviewsVsTopCompetitor: ReviewsVsTopCompetitorFieldSchema,
});

/** Values that are genuinely per-location. */
export interface LocationReceipts {
  locationId: number;
  locationName: string;
  gbpPostsPublished: ReceiptField;
  gbpReviewRepliesPublished: ReceiptField;
}

export const LocationReceiptsSchema = z.object({
  locationId: z.number(),
  locationName: z.string(),
  gbpPostsPublished: ReceiptFieldSchema,
  gbpReviewRepliesPublished: ReceiptFieldSchema,
});

/** Totals across locations for the summable per-location fields only. */
export interface TotalReceipts {
  gbpPostsPublished: ReceiptField;
  gbpReviewRepliesPublished: ReceiptField;
}

export const TotalReceiptsSchema = z.object({
  gbpPostsPublished: ReceiptFieldSchema,
  gbpReviewRepliesPublished: ReceiptFieldSchema,
});

// =====================================================================
// TOP-LEVEL REPORT
// =====================================================================

export interface ReceiptsReport {
  organizationId: number;
  period: { startDate: string; endDate: string };
  generatedAt: string;
  orgLevel: OrgLevelReceipts;
  locations: LocationReceipts[];
  total: TotalReceipts;
  replacementCostContext: ReplacementCostContext;
}

export const ReceiptsReportSchema = z
  .object({
    organizationId: z.number(),
    period: z.object({ startDate: z.string(), endDate: z.string() }),
    generatedAt: z.string(),
    orgLevel: OrgLevelReceiptsSchema,
    locations: z.array(LocationReceiptsSchema),
    total: TotalReceiptsSchema,
    replacementCostContext: ReplacementCostContextSchema,
  })
  .strict();

export type ReceiptsReportZ = z.infer<typeof ReceiptsReportSchema>;
