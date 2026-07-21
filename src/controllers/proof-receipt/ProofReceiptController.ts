/**
 * GET /api/proof-receipt
 *
 * The owner-facing "here is what Alloro did for you" receipt (Tier 1) for the
 * calendar month (1st-of-month UTC -> now). Thin HTTP wrapper (§7.3): it reads
 * server context, delegates to ProofReceiptService, and shapes the response.
 * No business logic, no database access.
 *
 * TENANT SCOPE (§5.5, §11.7). The organization is taken from
 * `req.organizationId`, which rbacMiddleware resolves from the caller's own
 * memberships. There is no request field with which a caller can name a
 * different organization, and the route schema rejects unknown keys, so an
 * `organization_id` parameter is a 400 rather than something to be ignored.
 * `accessibleLocationIds` travels all the way into the model query as a
 * required argument, so the whole-org path is bounded by the caller's grants
 * rather than by the organization alone.
 *
 * Query params (validated at the route by proofReceiptQuerySchema):
 *   - locationId (optional, int) — narrow to one office. Camel case, because
 *     that is the spelling the shared location-scope middleware reads. Omit
 *     for every accessible location; each item is location-tagged either way,
 *     so a multi-location practice's feed is never blended without attribution.
 *   - page, limit (optional, int) — §11.6 pagination.
 *
 * (See plans/07202026-pr-merge-remediation/pr-177-proof-receipt.spec.html)
 */

import { Request, Response } from "express";
import { LocationScopedRequest } from "../../middleware/rbac";
import { ProofReceiptService } from "./feature-services/ProofReceiptService";
import { ProofReceiptError } from "./feature-utils/ProofReceiptError";
import {
  handleProofReceiptError,
  ok,
} from "./feature-utils/controllerResponses";
import { parseProofReceiptPagination } from "./feature-utils/proofReceiptPagination";

const PROOF_RECEIPT_ROUTE = "GET /api/proof-receipt";

interface ProofReceiptContext {
  organizationId: number;
  accessibleLocationIds: number[];
  locationId?: number;
}

/**
 * §5.5 — tenant derived from server context only.
 *
 * The location check here is deliberate defence in depth. The shared
 * location-scope middleware already rejects a location the caller cannot see,
 * but that middleware is shared and its parameter handling has changed over
 * time; re-checking against `accessibleLocationIds` in the domain means this
 * endpoint fails closed on its own terms rather than depending on the exact
 * behavior of a middleware it does not own.
 */
function getProofReceiptContext(req: Request): ProofReceiptContext {
  const scoped = req as LocationScopedRequest;
  const { organizationId, locationId, accessibleLocationIds } = scoped;

  if (!organizationId) {
    throw new ProofReceiptError(
      "PROOF_RECEIPT_CONTEXT_MISSING",
      "Organization context is required."
    );
  }
  if (!accessibleLocationIds) {
    throw new ProofReceiptError(
      "PROOF_RECEIPT_LOCATION_SCOPE_UNAVAILABLE",
      "Location access could not be verified."
    );
  }
  if (
    typeof locationId === "number" &&
    !accessibleLocationIds.includes(locationId)
  ) {
    throw new ProofReceiptError(
      "PROOF_RECEIPT_LOCATION_ACCESS_DENIED",
      "No access to this location."
    );
  }

  return {
    organizationId,
    accessibleLocationIds,
    locationId: typeof locationId === "number" ? locationId : undefined,
  };
}

/** Calendar month: 1st-of-month UTC through now. */
function getCurrentMonthRange(now = new Date()): { since: Date; until: Date } {
  return {
    since: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    until: now,
  };
}

export async function getProofReceipt(
  req: Request,
  res: Response
): Promise<Response> {
  const scoped = req as LocationScopedRequest;
  try {
    const context = getProofReceiptContext(req);
    const { since, until } = getCurrentMonthRange();

    // Express 5: req.query is a read-only getter, so validate()'s write-back of
    // coerced values is a no-op. Parse the raw strings here.
    const { page, limit } = parseProofReceiptPagination(
      req.query.page,
      req.query.limit
    );

    const receipt = await ProofReceiptService.getReceipt({
      organizationId: context.organizationId,
      accessibleLocationIds: context.accessibleLocationIds,
      locationId: context.locationId,
      since,
      until,
      page,
      limit,
    });

    return ok(res, receipt);
  } catch (error) {
    return handleProofReceiptError(res, error, {
      route: PROOF_RECEIPT_ROUTE,
      userId: scoped.userId ?? null,
      organizationId: scoped.organizationId ?? null,
      locationId: scoped.locationId ?? null,
    });
  }
}
