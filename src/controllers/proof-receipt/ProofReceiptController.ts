import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
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
 *   - organization_id (required, int) — must match the caller's own org; a
 *     mismatch is rejected 403 (the read is always scoped to the verified
 *     tenant, never to an org id the caller merely names).
 *   - location_id (optional, int) — scope to one office; omit for the whole
 *     org (each item is location-tagged either way, so a multi-location
 *     practice's feed is never blended without attribution).
 *
 * Response: { success: true, data: ProofReceipt }
 */
export async function getProofReceipt(req: RBACRequest, res: Response) {
  try {
    // The caller's VERIFIED org, resolved from the JWT by rbacMiddleware — the
    // only trustworthy tenant key. Never read tenant identity from the query
    // (that would let any authenticated user read another org's receipt).
    // Mirrors SettingsController's `req.organizationId!` scoping.
    const callerOrganizationId = req.organizationId;
    if (!callerOrganizationId) {
      return res.status(403).json({
        success: false,
        error: "No organization access for this user",
      });
    }

    const organizationId = parseInt(String(req.query.organization_id), 10);

    if (!organizationId || isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid organization_id parameter",
      });
    }

    // Defense in depth: a caller may only pull its own org's receipt.
    if (organizationId !== callerOrganizationId) {
      return res.status(403).json({
        success: false,
        error: "No access to this organization",
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

    const receipt = await buildProofReceipt(
      callerOrganizationId,
      since,
      now,
      locationId
    );

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
