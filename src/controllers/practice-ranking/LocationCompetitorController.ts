/**
 * LocationCompetitorController
 *
 * HTTP handler layer for the v2 curated-competitor-list endpoints (location-
 * scoped, client-facing, RBAC-gated) plus the authed Place Photo proxy.
 *
 * Split out of PracticeRankingController to keep both controllers under the
 * file-size ceiling. Behavior-preserving: identical routes → handlers → inputs/
 * outputs/status codes/response shapes. Thin handlers: validate input → call
 * feature-service → shape response.
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 *
 * Endpoints:
 * - GET    /locations/:locationId/competitors
 * - POST   /locations/:locationId/competitors/discover
 * - POST   /locations/:locationId/competitors/discover-candidates
 * - POST   /locations/:locationId/competitors/preview-place
 * - POST   /locations/:locationId/competitors
 * - DELETE /locations/:locationId/competitors/:placeId
 * - POST   /locations/:locationId/competitors/finalize-and-run
 * - POST   /locations/:locationId/competitors/reselect-and-run
 * - GET    /photo
 */

import { Request, Response } from "express";
import { logError } from "./feature-utils/util.ranking-logger";
import { fail, fail500 } from "./feature-utils/util.ranking-responses";
import {
  formatLocationCompetitor,
  readComparisonSpecialtyInput,
} from "./feature-utils/util.location-competitor-formatter";
import {
  validateLocationIdParam,
  validatePlaceIdInput,
  validateDiscoveryRadiusMeters,
  DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS,
  MAX_COMPETITORS_PER_LOCATION,
} from "./feature-utils/util.competitor-validator";
import {
  runDiscoveryForLocation,
  previewDiscoveryCandidatesForLocation,
  previewManualCompetitorForLocation,
  getDefaultComparisonSpecialtyForLocation,
  COMPARISON_SPECIALTY_PAYLOAD_OPTIONS,
  addCustomCompetitor,
  removeCompetitorFromList,
  finalizeAndTriggerRun,
  reselectCompetitorsAndTriggerRun,
} from "./feature-services/service.location-competitor-onboarding";
import { LocationCompetitorModel } from "../../models/LocationCompetitorModel";
import { LocationModel } from "../../models/LocationModel";
import { getPlacePhotoMedia } from "../places/feature-services/GooglePlacesApiService";
import type { RBACRequest } from "../../middleware/rbac";

// GET /locations/:locationId/competitors
export async function getLocationCompetitors(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const v = validateLocationIdParam(req.params.locationId);
    if (!v.valid) return res.status(v.status).json(v.body);
    const locationId = Number(req.params.locationId);

    const [onboarding, competitors, location] = await Promise.all([
      LocationCompetitorModel.getOnboardingStatus(locationId),
      LocationCompetitorModel.findActiveByLocationId(locationId),
      LocationModel.findById(locationId),
    ]);
    const comparisonSpecialty =
      await getDefaultComparisonSpecialtyForLocation(locationId);

    const practiceLocation =
      location?.client_place_id &&
      location.client_lat !== null &&
      location.client_lng !== null
        ? {
            placeId: location.client_place_id,
            lat: Number(location.client_lat),
            lng: Number(location.client_lng),
          }
        : null;

    return res.json({
      success: true,
      onboarding: {
        status: onboarding.status,
        finalizedAt: onboarding.finalizedAt,
      },
      practiceLocation,
      selfFilterStatus: location?.client_place_id ? "resolved" : "unresolved",
      competitorDiscoveryRadiusMeters:
        location?.competitor_discovery_radius_meters ??
        DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS,
      comparisonSpecialty,
      comparisonSpecialtyOptions: COMPARISON_SPECIALTY_PAYLOAD_OPTIONS,
      competitors: competitors.map(formatLocationCompetitor),
      count: competitors.length,
      cap: MAX_COMPETITORS_PER_LOCATION,
    });
  } catch (error: any) {
    logError("GET /locations/:locationId/competitors", error);
    return fail500(res, "GET_COMPETITORS_ERROR", error, "Failed to load competitors");
  }
}

// POST /locations/:locationId/competitors/discover
export async function discoverLocationCompetitors(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const v = validateLocationIdParam(req.params.locationId);
    if (!v.valid) return res.status(v.status).json(v.body);
    const locationId = Number(req.params.locationId);
    const radiusV = validateDiscoveryRadiusMeters(req.body?.radiusMeters);
    if (!radiusV.valid) return res.status(radiusV.status).json(radiusV.body);

    const result = await runDiscoveryForLocation(
      locationId,
      req.body?.radiusMeters === undefined ? undefined : radiusV.radiusMeters,
      readComparisonSpecialtyInput(req.body?.comparisonSpecialty)
    );
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logError("POST /locations/:locationId/competitors/discover", error);
    if (
      typeof error?.message === "string" &&
      error.message.includes("already finalized")
    ) {
      return fail(res, 409, "LOCATION_FINALIZED", error.message, "");
    }
    return fail500(res, "DISCOVERY_ERROR", error, "Discovery failed");
  }
}

// POST /locations/:locationId/competitors/discover-candidates
export async function previewLocationCompetitorDiscovery(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const v = validateLocationIdParam(req.params.locationId);
    if (!v.valid) return res.status(v.status).json(v.body);
    const radiusV = validateDiscoveryRadiusMeters(req.body?.radiusMeters);
    if (!radiusV.valid) return res.status(radiusV.status).json(radiusV.body);

    const locationId = Number(req.params.locationId);
    const result = await previewDiscoveryCandidatesForLocation(
      locationId,
      req.body?.radiusMeters === undefined ? undefined : radiusV.radiusMeters,
      readComparisonSpecialtyInput(req.body?.comparisonSpecialty)
    );
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logError(
      "POST /locations/:locationId/competitors/discover-candidates",
      error
    );
    if (error?.code === "INVALID_DISCOVERY_RADIUS") {
      return fail(res, 400, error.code, error.message, "");
    }
    return fail500(
      res,
      "DISCOVERY_PREVIEW_ERROR",
      error,
      "Failed to refresh competitor suggestions"
    );
  }
}

// POST /locations/:locationId/competitors/preview-place
export async function previewLocationCompetitorPlace(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const locV = validateLocationIdParam(req.params.locationId);
    if (!locV.valid) return res.status(locV.status).json(locV.body);
    const placeV = validatePlaceIdInput(req.body?.placeId);
    if (!placeV.valid) return res.status(placeV.status).json(placeV.body);
    const radiusV = validateDiscoveryRadiusMeters(req.body?.radiusMeters);
    if (!radiusV.valid) return res.status(radiusV.status).json(radiusV.body);

    const locationId = Number(req.params.locationId);
    const result = await previewManualCompetitorForLocation(
      locationId,
      String(req.body.placeId).trim(),
      req.body?.radiusMeters === undefined ? undefined : radiusV.radiusMeters,
      readComparisonSpecialtyInput(req.body?.comparisonSpecialty)
    );

    return res.json({ success: true, ...result });
  } catch (error: any) {
    logError("POST /locations/:locationId/competitors/preview-place", error);
    if (error?.code === "PLACES_LOOKUP_FAILED") {
      return fail(res, 502, "PLACES_LOOKUP_FAILED", error.message, "");
    }
    if (error?.code === "INVALID_DISCOVERY_RADIUS") {
      return fail(res, 400, error.code, error.message, "");
    }
    return fail500(
      res,
      "COMPETITOR_PREVIEW_ERROR",
      error,
      "Failed to measure competitor profile"
    );
  }
}

// POST /locations/:locationId/competitors  (body: { placeId })
export async function addLocationCompetitor(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const locV = validateLocationIdParam(req.params.locationId);
    if (!locV.valid) return res.status(locV.status).json(locV.body);
    const placeV = validatePlaceIdInput(req.body?.placeId);
    if (!placeV.valid) return res.status(placeV.status).json(placeV.body);

    const locationId = Number(req.params.locationId);
    const placeId = String(req.body.placeId).trim();
    const userId = (req as RBACRequest).userId ?? null;

    const result = await addCustomCompetitor(locationId, placeId, userId);
    return res.json({
      success: true,
      added: formatLocationCompetitor(result.added),
      activeCount: result.activeCount,
      cap: MAX_COMPETITORS_PER_LOCATION,
    });
  } catch (error: any) {
    logError("POST /locations/:locationId/competitors", error);
    if (error?.code === "COMPETITOR_CAP_REACHED") {
      return fail(res, 409, "COMPETITOR_CAP_REACHED", error.message, "");
    }
    if (error?.code === "PLACES_LOOKUP_FAILED") {
      return fail(res, 502, "PLACES_LOOKUP_FAILED", error.message, "");
    }
    if (
      typeof error?.message === "string" &&
      error.message.includes("already finalized")
    ) {
      return fail(res, 409, "LOCATION_FINALIZED", error.message, "");
    }
    return fail500(res, "ADD_COMPETITOR_ERROR", error, "Failed to add competitor");
  }
}

// DELETE /locations/:locationId/competitors/:placeId
export async function deleteLocationCompetitor(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const locV = validateLocationIdParam(req.params.locationId);
    if (!locV.valid) return res.status(locV.status).json(locV.body);
    const placeV = validatePlaceIdInput(req.params.placeId);
    if (!placeV.valid) return res.status(placeV.status).json(placeV.body);

    const locationId = Number(req.params.locationId);
    const placeId = String(req.params.placeId).trim();

    const result = await removeCompetitorFromList(locationId, placeId);
    return res.json({
      success: true,
      removed: result.removed,
      activeCount: result.activeCount,
      cap: MAX_COMPETITORS_PER_LOCATION,
    });
  } catch (error: any) {
    logError("DELETE /locations/:locationId/competitors/:placeId", error);
    if (
      typeof error?.message === "string" &&
      error.message.includes("already finalized")
    ) {
      return fail(res, 409, "LOCATION_FINALIZED", error.message, "");
    }
    return fail500(
      res,
      "REMOVE_COMPETITOR_ERROR",
      error,
      "Failed to remove competitor"
    );
  }
}

// POST /locations/:locationId/competitors/finalize-and-run
export async function finalizeLocationAndRun(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const v = validateLocationIdParam(req.params.locationId);
    if (!v.valid) return res.status(v.status).json(v.body);
    const locationId = Number(req.params.locationId);

    const result = await finalizeAndTriggerRun(locationId);
    return res.json({
      success: true,
      batchId: result.batchId,
      rankingId: result.rankingId,
      reused: result.reused,
      competitorSetRevision: result.competitorSetRevision,
      selectedCount: result.selectedCount,
    });
  } catch (error: any) {
    logError("POST /locations/:locationId/competitors/finalize-and-run", error);
    return fail500(
      res,
      "FINALIZE_ERROR",
      error,
      "Failed to finalize and trigger run"
    );
  }
}

// POST /locations/:locationId/competitors/reselect-and-run
export async function reselectLocationCompetitorsAndRun(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const v = validateLocationIdParam(req.params.locationId);
    if (!v.valid) return res.status(v.status).json(v.body);

    const placeIds: unknown[] = Array.isArray(req.body?.placeIds)
      ? req.body.placeIds
      : [];
    const invalidPlaceId = placeIds.find(
      (placeId) => !validatePlaceIdInput(placeId).valid
    );
    if (invalidPlaceId !== undefined) {
      return fail(
        res,
        400,
        "INVALID_PLACE_ID",
        "Each placeId must be a non-empty string",
        ""
      );
    }
    const radiusV = validateDiscoveryRadiusMeters(req.body?.radiusMeters);
    if (!radiusV.valid) return res.status(radiusV.status).json(radiusV.body);

    const locationId = Number(req.params.locationId);
    const userId = (req as RBACRequest).userId ?? null;
    const result = await reselectCompetitorsAndTriggerRun(
      locationId,
      placeIds.map((placeId) => String(placeId)),
      userId,
      req.body?.radiusMeters === undefined ? undefined : radiusV.radiusMeters
    );

    return res.json({
      success: true,
      batchId: result.batchId,
      rankingId: result.rankingId,
      reused: result.reused,
      competitorSetRevision: result.competitorSetRevision,
      selectedCount: result.selectedCount,
    });
  } catch (error: any) {
    logError("POST /locations/:locationId/competitors/reselect-and-run", error);
    if (
      [
        "EMPTY_COMPETITOR_SET",
        "COMPETITOR_CAP_REACHED",
        "LOCATION_NOT_FINALIZED",
      ].includes(error?.code)
    ) {
      return fail(
        res,
        error.code === "LOCATION_NOT_FINALIZED" ? 409 : 400,
        error.code,
        error.message,
        ""
      );
    }
    if (error?.code === "PLACES_LOOKUP_FAILED") {
      return fail(res, 502, "PLACES_LOOKUP_FAILED", error.message, "");
    }
    return fail500(
      res,
      "RESELECT_COMPETITORS_ERROR",
      error,
      "Failed to rerun ranking"
    );
  }
}

// GET /photo?name=places/.../photos/...
// Authed proxy for Google Places Photo media. Each call hits the paid Place
// Photo SKU; do not expose unauthenticated.
export async function getCompetitorPhoto(
  req: Request,
  res: Response
): Promise<Response | void> {
  try {
    const photoName = String(req.query.name || "");
    // Validate shape: Google's photo resource names are "places/<id>/photos/<id>".
    // Reject anything else to prevent abuse against arbitrary upstream paths.
    if (!/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
      return fail(
        res,
        400,
        "INVALID_PHOTO_NAME",
        "name must look like places/<id>/photos/<id>",
        ""
      );
    }
    const maxHeightPx = Math.min(
      Math.max(parseInt(String(req.query.h || "200"), 10) || 200, 64),
      800
    );
    const { buffer, contentType } = await getPlacePhotoMedia(
      photoName,
      maxHeightPx
    );
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    return res.end(buffer);
  } catch (error: any) {
    logError("GET /practice-ranking/photo", error);
    return fail(res, 502, "PHOTO_FETCH_FAILED", error?.message, "Failed to fetch photo");
  }
}
