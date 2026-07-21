import { Request, Response } from "express";
import { LocationScopedRequest } from "../../middleware/rbac";
import { NapConsistencyReadService } from "./feature-services/NapConsistencyReadService";
import { NapConsistencyError } from "./feature-utils/NapConsistencyError";
import {
  handleNapError,
  ok,
  parseOptionalNumber,
} from "./feature-utils/controllerResponses";

/**
 * NAP-consistency read controller — Alloro Funnel Engine A4. Thin orchestration
 * only (§7.3): derive the tenant/location from server context, call the read
 * service, shape the response. No business logic, no DB access. Mirrors
 * `gbp-automation/GbpAutomationController.ts` (§6.1).
 */

type HandlerRequest = Request | LocationScopedRequest;

function scoped(req: HandlerRequest): LocationScopedRequest {
  return req as LocationScopedRequest;
}

/**
 * Resolve organization + location from SERVER context (§5.5 / §11.7). The
 * location is the one `locationScopeMiddleware` already validated the caller can
 * access; a `locationId` in the query is honored only if it matches, so it can
 * never widen scope. Mirrors `clientContext` in the GBP controller.
 */
export function clientContext(req: HandlerRequest): {
  organizationId: number;
  locationId: number;
} {
  const request = scoped(req);
  const requestedLocationId =
    parseOptionalNumber(req.query.locationId) ??
    parseOptionalNumber(req.body?.locationId);
  const accessibleLocationIds = request.accessibleLocationIds;

  if (!accessibleLocationIds) {
    throw new NapConsistencyError(
      "LOCATION_SCOPE_UNAVAILABLE",
      "Location access could not be verified."
    );
  }

  const locationId =
    typeof request.locationId === "number"
      ? request.locationId
      : (accessibleLocationIds[0] ?? null);

  if (requestedLocationId !== null && request.locationId !== requestedLocationId) {
    throw new NapConsistencyError(
      "LOCATION_ACCESS_DENIED",
      "No access to this location."
    );
  }

  if (!request.organizationId || !locationId) {
    throw new NapConsistencyError(
      "MISSING_CONTEXT",
      "Organization and location context are required."
    );
  }

  return { organizationId: request.organizationId, locationId };
}

export class NapConsistencyController {
  /**
   * GET /api/nap-consistency — the latest NAP-consistency observation plus a
   * bounded newest-first history for the caller's location. Real conflicts only;
   * a never-measured location returns `latest: null` (§ honesty).
   */
  static async getForLocation(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const result = await NapConsistencyReadService.getForLocation(
        ctx.organizationId,
        ctx.locationId,
        parseOptionalNumber(req.query.limit)
      );
      return ok(res, result);
    } catch (error) {
      return handleNapError(res, error);
    }
  }
}
