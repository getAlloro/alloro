/**
 * CTR-hypothesis route schema — §11.2 boundary validation, applied through the
 * shared validate() middleware in ENFORCE mode. The endpoint is new and has no
 * clients to soak, so bad input 400s from day one.
 *
 * The body carries a diagnosed CTR opportunity (the shape brick 1's
 * findCtrOpportunities() returns) plus the page's current metadata. Rates are
 * fractions, not percentages, matching Google Search Console.
 *
 * TENANT SHAPE (§5.5): there is no organization or tenant key. The project is
 * named by the `:id` route parameter and authorized by the super-admin auth hoist
 * on the router, so the client has no field with which to name a tenant. The
 * schema is `.strict()`, so a body carrying one is rejected outright rather than
 * silently ignored.
 *
 * The queries array is bounded here as well as normalized downstream
 * (feature-utils/util.ctr-demand-block.ts) — GSC query text is attacker-
 * influenceable input, so the boundary caps volume and the prompt builder caps
 * and sanitizes content.
 */

import { z } from "zod";

const MAX_QUERIES = 50;
const MAX_QUERY_CHARS = 500;
const MAX_TITLE_CHARS = 500;
const MAX_DESCRIPTION_CHARS = 1000;
const MAX_PAGE_CONTENT_CHARS = 50_000;

const ctrRate = z.number().min(0).max(1);

const opportunitySchema = z
  .object({
    page: z.string().min(1).max(2048),
    impressions: z.number().int().min(0),
    clicks: z.number().int().min(0),
    actualCtr: ctrRate,
    expectedCtr: ctrRate,
    position: z.number().positive(),
    missedClicks: z.number().int(),
  })
  .strict();

const topQuerySchema = z
  .object({
    key: z.string().min(1).max(MAX_QUERY_CHARS),
    clicks: z.number(),
    impressions: z.number(),
    ctr: z.number(),
    position: z.number(),
  })
  .strict();

export const ctrHypothesisBodySchema = z
  .object({
    opportunity: opportunitySchema,
    currentTitle: z.string().min(1).max(MAX_TITLE_CHARS),
    currentDescription: z.string().max(MAX_DESCRIPTION_CHARS).optional(),
    siteTopQueries: z.array(topQuerySchema).max(MAX_QUERIES).optional(),
    pageContent: z.string().max(MAX_PAGE_CONTENT_CHARS).optional(),
    businessName: z.string().max(200).optional(),
    locationLabel: z.string().max(200).optional(),
  })
  .strict();

export type CtrHypothesisBody = z.infer<typeof ctrHypothesisBodySchema>;
