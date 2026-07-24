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
 * Bounds on the rationale blob. The two text fields are capped; leaving the
 * jsonb passthrough uncapped let a caller holding a super-admin token POST a
 * multi-megabyte nested object straight into the column, once per request, with
 * only the body-parser limit above it. These ceilings are far above anything
 * the CTR-hypothesis producer emits.
 */
const MAX_RATIONALE_KEYS = 32;
const MAX_RATIONALE_SERIALIZED_CHARS = 20_000;

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
    rationale: z
      .record(z.string(), z.unknown())
      .default({})
      .refine((value) => Object.keys(value).length <= MAX_RATIONALE_KEYS, {
        message: `rationale may carry at most ${MAX_RATIONALE_KEYS} keys.`,
      })
      .refine(
        (value) => {
          try {
            return (
              JSON.stringify(value).length <= MAX_RATIONALE_SERIALIZED_CHARS
            );
          } catch {
            // Circular or otherwise unserializable — reject rather than store.
            return false;
          }
        },
        {
          message: `rationale must serialize to at most ${MAX_RATIONALE_SERIALIZED_CHARS} characters.`,
        },
      ),
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

/**
 * Route params for POST/GET /:id/seo/metadata-proposals.
 *
 * Without this, a non-UUID `:id` reaches a UUID-column query and Postgres raises
 * `invalid input syntax for type uuid`, which surfaces to the client as a 500
 * PAGE_METADATA_PROPOSAL_ERROR. A client-caused input error must be a 400
 * (§8.4), not a server fault that pages as a 5xx and fills Sentry with driver
 * errors.
 */
export const pageMetadataProposalParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

/** Route params for the two review routes, which also name a proposal. */
export const pageMetadataProposalReviewParamsSchema = z
  .object({
    id: z.string().uuid(),
    proposalId: z.string().uuid(),
  })
  .strict();
