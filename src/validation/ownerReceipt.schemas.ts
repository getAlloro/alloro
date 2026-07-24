/**
 * Owner-receipt route schema (src/routes/ownerReceipt.ts) — §11.2 boundary
 * validation, applied through the shared validate() middleware in ENFORCE mode.
 * The endpoint is new and has no clients to soak, so bad input 400s from day one.
 *
 * TENANT SHAPE (§5.5): there is deliberately no `organization_id` key. The
 * organization is resolved server-side by rbacMiddleware from the caller's own
 * memberships. The schema is `.strict()`, so a request carrying an unknown key
 * (e.g. `organization_id`) is rejected outright, not silently ignored.
 *
 * WINDOWS: the caller chooses the PRE and POST comparison windows (nothing is
 * hidden — the owner can move the window and re-read). Dates are validated as
 * `YYYY-MM-DD`; the controller re-checks start <= end and pre <= post ordering.
 *
 * Express 5 note: req.query is a read-only getter, so validate()'s write-back of
 * coerced values is skipped. This schema REJECTS bad input; the controller
 * re-parses the raw strings.
 */

import { z } from "zod";

export const OWNER_RECEIPT_PAGE_DEFAULT = 1;
export const OWNER_RECEIPT_LIMIT_DEFAULT = 50;
export const OWNER_RECEIPT_LIMIT_MAX = 200;

/** A calendar day as `YYYY-MM-DD`. */
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

export const ownerReceiptQuerySchema = z
  .object({
    preStart: isoDay,
    preEnd: isoDay,
    postStart: isoDay,
    postEnd: isoDay,
    locationId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(OWNER_RECEIPT_LIMIT_MAX)
      .optional(),
  })
  .strict();

export type OwnerReceiptQuery = z.infer<typeof ownerReceiptQuerySchema>;
