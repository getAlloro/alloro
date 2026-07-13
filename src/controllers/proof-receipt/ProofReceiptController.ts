import { Request, Response } from "express";
import { buildProofReceipt } from "../../services/proofReceiptService";
import logger from "../../lib/logger";

/**
 * GET /api/proof-receipt
 *
 * The owner-facing "here's what Alloro did for you" receipt (Tier 1) for the
 * calendar month (1st-of-month UTC → now). Thin HTTP wrapper around
 * `buildProofReceipt`. Mirrors DashboardController.getMetrics — org + optional
 * location scope; auth is the standard middleware applied at the route.
 *
 * Query params:
 *   - organization_id (required, int)
 *   - location_id (optional, int) — scope to one office; omit for the whole
 *     org (each item is location-tagged either way, so a multi-location
 *     practice's feed is never blended without attribution).
 *
 * Response: { success: true, data: ProofReceipt }
 */
export async function getProofReceipt(req: Request, res: Response) {
  try {
    const organizationId = parseInt(String(req.query.organization_id), 10);

    if (!organizationId || isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid organization_id parameter",
      });
    }

    // Optional single-office scope for multi-location practices. Omitted = the
    // whole org (each item carries its location_id regardless).
    const locationIdRaw = req.query.location_id;
    const locationId =
      locationIdRaw != null && String(locationIdRaw).trim() !== ""
        ? parseInt(String(locationIdRaw), 10)
        : undefined;
    if (locationId !== undefined && isNaN(locationId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid location_id parameter",
      });
    }

    // Calendar-month range: 1st-of-month (UTC) through now.
    const now = new Date();
    const since = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );

    const receipt = await buildProofReceipt(organizationId, since, now, locationId);

    return res.json({ success: true, data: receipt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: message }, "Error in /proof-receipt:");
    return res.status(500).json({
      success: false,
      error: `Failed to build proof receipt: ${message}`,
    });
  }
}
