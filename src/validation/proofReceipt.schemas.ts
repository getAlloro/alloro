/**
 * Proof-receipt route schema (src/routes/proofReceipt.ts) — §11.2 boundary
 * validation, applied through the shared validate() middleware in ENFORCE mode.
 * The endpoint is new and has no clients to soak, so bad input 400s from day one.
 *
 * TENANT SHAPE (§5.5): there is deliberately no `organization_id` key. The
 * organization is resolved server-side by rbacMiddleware from the caller's own
 * memberships, so the client has no field with which to name a tenant. The
 * schema is `.strict()`, which means a request still carrying `organization_id`
 * is rejected outright rather than silently ignored — a loud signal instead of
 * a quiet one.
 *
 * PARAMETER NAME (§5.5): the location parameter is camelCase `locationId`
 * because that is the spelling the shared location-scope middleware reads
 * (src/middleware/rbac.ts). A snake_case `location_id` would leave the
 * middleware's access check with nothing to inspect — the guard would be
 * mounted and inert.
 *
 * Express 5 note: req.query is a read-only getter, so validate()'s write-back
 * of coerced values is skipped. This schema REJECTS bad input; the controller
 * re-parses the raw strings (feature-utils/proofReceiptPagination.ts).
 */

import { z } from "zod";

/** Pagination bounds — named, not magic (§4.2). Shared with the parser. */
export const PROOF_RECEIPT_PAGE_DEFAULT = 1;
export const PROOF_RECEIPT_LIMIT_DEFAULT = 50;
export const PROOF_RECEIPT_LIMIT_MAX = 200;

/**
 * GET /api/proof-receipt query contract.
 *
 * `z.coerce.number().int()` rejects values that the previous hand-rolled
 * parseInt() accepted — parseInt("39abc", 10) returns 39, Number("39abc")
 * returns NaN and fails the schema.
 */
export const proofReceiptQuerySchema = z
  .object({
    locationId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(PROOF_RECEIPT_LIMIT_MAX)
      .optional(),
  })
  .strict();

export type ProofReceiptQuery = z.infer<typeof proofReceiptQuerySchema>;
