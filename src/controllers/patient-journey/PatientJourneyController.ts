import { Request, Response } from "express";
import { LocationScopedRequest } from "../../middleware/rbac";
import { assemblePatientJourney } from "./feature-services/PatientJourneyService";
import { PatientJourneyError } from "./feature-utils/PatientJourneyError";
import {
  handlePatientJourneyError,
  ok,
  parseOptionalNumber,
  resolveReportMonth,
} from "./feature-utils/controllerResponses";

type HandlerRequest = Request | LocationScopedRequest;

function scoped(req: HandlerRequest): LocationScopedRequest {
  return req as LocationScopedRequest;
}

/**
 * Resolve the tenant scope from server-side request context only (§5.5/§11.7).
 * `organizationId` and `locationId` come from the auth + RBAC + location-scope
 * middleware — never from raw client input. A `locationId` query value is
 * honored only as a guard: it must match the location the middleware already
 * authorized, otherwise access is denied (no cross-tenant read).
 */
export function clientContext(req: HandlerRequest): {
  organizationId: number;
  locationId: number;
} {
  const request = scoped(req);
  const requestedLocationId = parseOptionalNumber(req.query.locationId);
  const accessibleLocationIds = request.accessibleLocationIds;

  if (!accessibleLocationIds) {
    throw new PatientJourneyError(
      "LOCATION_SCOPE_UNAVAILABLE",
      "Location access could not be verified."
    );
  }

  const locationId =
    typeof request.locationId === "number" ? request.locationId : (accessibleLocationIds[0] ?? null);

  if (requestedLocationId !== null && request.locationId !== requestedLocationId) {
    throw new PatientJourneyError("LOCATION_ACCESS_DENIED", "No access to this location.");
  }

  if (!request.organizationId || !locationId) {
    throw new PatientJourneyError(
      "MISSING_CONTEXT",
      "Organization and location context are required."
    );
  }

  return {
    organizationId: request.organizationId,
    locationId,
  };
}

export class PatientJourneyController {
  static async getPatientJourney(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const journey = await assemblePatientJourney({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        reportMonth: resolveReportMonth(req.query.month),
      });
      return ok(res, journey);
    } catch (error) {
      return handlePatientJourneyError(res, error);
    }
  }
}
