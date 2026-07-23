/**
 * Page metadata proposal route schemas — §11.2 boundary validation, applied through
 * the shared validate() middleware in ENFORCE mode. These endpoints are new and have
 * no clients to soak, so bad input 400s from day one.
 *
 * TENANT SHAPE (§5.5): there is no organization or tenant key in any body. The
 * project is named by the `:id` route parameter and authorized by the super-admin
 * auth hoist on the router; the page is re-read server-side and checked to belong to
 * that project. The client has no field with which to name a tenant, and every
 * schema is `.strict()`, so a body carrying one is rejected outright.
 */

import { z } from "zod";

const MAX_TITLE_CHARS = 500;
const MAX_DESCRIPTION_CHARS = 1000;

/**
 * Body for POST /:id/seo/metadata-proposals. `rationale` is the CTR-hypothesis
 * evidence blob (rationale + prediction + diagnosed opportunity) stored verbatim; it
 * is a bounded passthrough object rather than a re-declared deep shape, so the
 * producer's honest rationale reaches the reviewer unaltered.
 */
export const stagePageMetadataProposalBodySchema = z
  .object({
    pageId: z.string().uuid(),
    proposedTitle: z.string().min(1).max(MAX_TITLE_CHARS),
    proposedDescription: z.string().min(1).max(MAX_DESCRIPTION_CHARS),
    rationale: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type StagePageMetadataProposalBody = z.infer<
  typeof stagePageMetadataProposalBodySchema
>;

/** Query for GET /:id/seo/metadata-proposals — optional status filter. */
export const listPageMetadataProposalsQuerySchema = z
  .object({
    status: z.enum(["pending", "approved", "rejected"]).optional(),
  })
  .strict();
