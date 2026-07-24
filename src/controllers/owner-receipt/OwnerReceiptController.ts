/**
 * GET /api/owner-receipt
 *
 * The owner-facing "here is what we did, here is your number, here is the
 * dated trend, and here is which funnel term moved" receipt. Thin HTTP wrapper
 * (§7.3): it reads server context, parses the requested windows, delegates to
 * OwnerReceiptService, and shapes the response. No business logic, no DB access.
 *
 * TENANT SCOPE (§5.5, §11.7). The organization is taken from
 * `req.organizationId`, resolved by rbacMiddleware from the caller's own
 * memberships. There is no request field with which a caller can name a
 * different organization, and the strict route schema rejects unknown keys.
 * `accessibleLocationIds` travels into every scoped read as a required argument.
 *
 * Query params (validated at the route by ownerReceiptQuerySchema):
 *   - preStart, preEnd, postStart, postEnd (required, YYYY-MM-DD) — the two
 *     comparison windows. The owner picks them; nothing is hidden.
 *   - locationId (optional, int) — narrow the dated actions to one office.
 *   - page, limit (optional, int) — §11.6 pagination for the actions list.
 */

import { Request, Response } from "express";
import { LocationScopedRequest } from "../../middleware/rbac";
import { OwnerReceiptService } from "./feature-services/OwnerReceiptService";
import { OwnerReceiptError } from "./feature-utils/OwnerReceiptError";
import {
  handleOwnerReceiptError,
  ok,
} from "./feature-utils/controllerResponses";
import {
  OWNER_RECEIPT_LIMIT_DEFAULT,
  OWNER_RECEIPT_LIMIT_MAX,
  OWNER_RECEIPT_PAGE_DEFAULT,
} from "../../validation/ownerReceipt.schemas";
import type { ReceiptWindow } from "./OwnerReceiptTypes";

const OWNER_RECEIPT_ROUTE = "GET /api/owner-receipt";

interface OwnerReceiptContext {
  organizationId: number;
  accessibleLocationIds: number[];
  locationId?: number;
}

/** §5.5 — tenant derived from server context only; defence-in-depth location check. */
function getOwnerReceiptContext(req: Request): OwnerReceiptContext {
  const scoped = req as LocationScopedRequest;
  const { organizationId, locationId, accessibleLocationIds } = scoped;

  if (!organizationId) {
    throw new OwnerReceiptError(
      "OWNER_RECEIPT_CONTEXT_MISSING",
      "Organization context is required."
    );
  }
  if (!accessibleLocationIds) {
    throw new OwnerReceiptError(
      "OWNER_RECEIPT_LOCATION_SCOPE_UNAVAILABLE",
      "Location access could not be verified."
    );
  }
  if (
    typeof locationId === "number" &&
    !accessibleLocationIds.includes(locationId)
  ) {
    throw new OwnerReceiptError(
      "OWNER_RECEIPT_LOCATION_ACCESS_DENIED",
      "No access to this location."
    );
  }

  return {
    organizationId,
    accessibleLocationIds,
    locationId: typeof locationId === "number" ? locationId : undefined,
  };
}

/** A raw query value that must be a `YYYY-MM-DD` string, or throw a 400. */
function requireDay(value: unknown, field: string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  throw new OwnerReceiptError(
    "OWNER_RECEIPT_WINDOW_INVALID",
    `Query param '${field}' must be a YYYY-MM-DD date.`
  );
}

/**
 * Parse and sanity-check the two windows from raw query strings (Express 5:
 * req.query is a read-only getter, so validate()'s coercions don't land). The
 * ordering checks the schema can't express live here.
 */
function parseWindows(req: Request): { preWindow: ReceiptWindow; postWindow: ReceiptWindow } {
  const preWindow: ReceiptWindow = {
    start: requireDay(req.query.preStart, "preStart"),
    end: requireDay(req.query.preEnd, "preEnd"),
  };
  const postWindow: ReceiptWindow = {
    start: requireDay(req.query.postStart, "postStart"),
    end: requireDay(req.query.postEnd, "postEnd"),
  };
  if (preWindow.start > preWindow.end || postWindow.start > postWindow.end) {
    throw new OwnerReceiptError(
      "OWNER_RECEIPT_WINDOW_INVALID",
      "Each window's start must be on or before its end."
    );
  }
  if (postWindow.start < preWindow.start) {
    throw new OwnerReceiptError(
      "OWNER_RECEIPT_WINDOW_INVALID",
      "The post window must not start before the pre window."
    );
  }
  return { preWindow, postWindow };
}

/** Parse pagination from raw query strings (§11.6), clamped to sane bounds. */
function parsePagination(req: Request): { page: number; limit: number } {
  const page = Number(req.query.page);
  const limit = Number(req.query.limit);
  return {
    page: Number.isInteger(page) && page > 0 ? page : OWNER_RECEIPT_PAGE_DEFAULT,
    limit:
      Number.isInteger(limit) && limit > 0
        ? Math.min(limit, OWNER_RECEIPT_LIMIT_MAX)
        : OWNER_RECEIPT_LIMIT_DEFAULT,
  };
}

export async function getOwnerReceipt(
  req: Request,
  res: Response
): Promise<Response> {
  const scoped = req as LocationScopedRequest;
  try {
    const context = getOwnerReceiptContext(req);
    const { preWindow, postWindow } = parseWindows(req);
    const { page, limit } = parsePagination(req);

    const receipt = await OwnerReceiptService.getReceipt({
      organizationId: context.organizationId,
      accessibleLocationIds: context.accessibleLocationIds,
      locationId: context.locationId,
      preWindow,
      postWindow,
      page,
      limit,
    });

    return ok(res, receipt);
  } catch (error) {
    return handleOwnerReceiptError(res, error, {
      route: OWNER_RECEIPT_ROUTE,
      userId: scoped.userId ?? null,
      organizationId: scoped.organizationId ?? null,
      locationId: scoped.locationId ?? null,
    });
  }
}
