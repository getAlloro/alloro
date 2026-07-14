import { z } from "zod";

export const receiptFieldFlagSchema = z.enum([
  "ok",
  "not_connected",
  "source_unavailable",
]);

export type ReceiptFieldFlag = z.infer<typeof receiptFieldFlagSchema>;

export const receiptFieldSchema = z
  .object({
    value: z.number().int().nonnegative().nullable(),
    flag: receiptFieldFlagSchema,
  })
  .strict()
  .superRefine((field, context) => {
    if (field.flag === "ok" && field.value === null) {
      context.addIssue({
        code: "custom",
        message: "An available receipt field requires a numeric value.",
        path: ["value"],
      });
    }

    if (field.flag !== "ok" && field.value !== null) {
      context.addIssue({
        code: "custom",
        message: "An unavailable receipt field cannot carry a numeric value.",
        path: ["value"],
      });
    }
  });

export type ReceiptField = z.infer<typeof receiptFieldSchema>;

export const receiptRankingSourceSchema = z.enum([
  "serpapi_maps",
  "apify_maps",
  "places_text",
]);

export type ReceiptRankingSource = z.infer<
  typeof receiptRankingSourceSchema
>;

export const rankingObservationPointSchema = z
  .object({
    position: z.number().int().positive(),
    observedAt: z.string().datetime(),
  })
  .strict();

export type RankingObservationPoint = z.infer<
  typeof rankingObservationPointSchema
>;

export const rankingMovementItemSchema = z
  .object({
    query: z.string().nullable(),
    source: receiptRankingSourceSchema.nullable(),
    first: rankingObservationPointSchema,
    last: rankingObservationPointSchema,
    best: rankingObservationPointSchema,
    worst: rankingObservationPointSchema,
  })
  .strict();

export type RankingMovementItem = z.infer<
  typeof rankingMovementItemSchema
>;

export const rankingAvailabilityFlagSchema = z.enum([
  "ok",
  "no_observations",
]);

export const competitorAvailabilityFlagSchema = z.enum([
  "ok",
  "no_observations",
  "no_competitor_data",
]);

export const rankingMovementFieldSchema = z
  .object({
    movements: z.array(rankingMovementItemSchema),
    flag: rankingAvailabilityFlagSchema,
  })
  .strict();

export type RankingMovementField = z.infer<
  typeof rankingMovementFieldSchema
>;

export const reviewsVsCompetitorSchema = z
  .object({
    observedAt: z.string().datetime(),
    query: z.string().nullable(),
    source: receiptRankingSourceSchema.nullable(),
    clientReviewCount: z.number().int().nonnegative().nullable(),
    competitorName: z.string().nullable(),
    competitorReviewCount: z.number().int().nonnegative().nullable(),
    competitorPosition: z.number().int().positive().nullable(),
  })
  .strict();

export type ReviewsVsCompetitor = z.infer<
  typeof reviewsVsCompetitorSchema
>;

export const reviewsVsTopCompetitorFieldSchema = z
  .object({
    value: reviewsVsCompetitorSchema.nullable(),
    flag: competitorAvailabilityFlagSchema,
  })
  .strict();

export type ReviewsVsTopCompetitorField = z.infer<
  typeof reviewsVsTopCompetitorFieldSchema
>;

export const orgLevelReceiptsSchema = z
  .object({
    websiteVisitors: receiptFieldSchema,
    leadsCaptured: receiptFieldSchema,
  })
  .strict();

export type OrgLevelReceipts = z.infer<typeof orgLevelReceiptsSchema>;

export const locationReceiptsSchema = z
  .object({
    locationId: z.number().int().positive(),
    locationName: z.string(),
    gbpPostsPublished: receiptFieldSchema,
    gbpReviewRepliesPublished: receiptFieldSchema,
    rankingMovement: rankingMovementFieldSchema,
    reviewsVsTopCompetitor: reviewsVsTopCompetitorFieldSchema,
  })
  .strict();

export type LocationReceipts = z.infer<typeof locationReceiptsSchema>;

export const totalReceiptsSchema = z
  .object({
    gbpPostsPublished: receiptFieldSchema,
    gbpReviewRepliesPublished: receiptFieldSchema,
  })
  .strict();

export type TotalReceipts = z.infer<typeof totalReceiptsSchema>;

export const replacementCostContextSchema = z
  .object({
    lineItems: z.array(
      z
        .object({
          service: z.string(),
          monthlyRate: z.null(),
        })
        .strict()
    ),
    total: z.null(),
    note: z.string(),
    ratesStaked: z.literal(false),
  })
  .strict();

export type ReplacementCostContext = z.infer<
  typeof replacementCostContextSchema
>;

export const receiptsReportSchema = z
  .object({
    organizationId: z.number().int().positive(),
    period: z
      .object({
        startDate: z.string(),
        endDate: z.string(),
      })
      .strict(),
    generatedAt: z.string().datetime(),
    orgLevel: orgLevelReceiptsSchema,
    locations: z.array(locationReceiptsSchema),
    total: totalReceiptsSchema,
    replacementCostContext: replacementCostContextSchema,
  })
  .strict();

export type ReceiptsReport = z.infer<typeof receiptsReportSchema>;

export interface GetReceiptsReportInput {
  organizationId: number;
  startDate: string;
  endDate: string;
}
