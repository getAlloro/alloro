/**
 * Admin PMS Controller
 *
 * The cross-organization half of the PMS key-data read, split out from
 * PmsController.getKeyData so the client route can derive its tenant from
 * server context (§5.5) while the admin dashboard keeps its legitimate
 * cross-org view.
 *
 * A caller-supplied organization_id is only safe behind superAdminMiddleware —
 * the same arrangement as src/routes/admin/aiSeoAudit.ts and
 * src/routes/admin/support.ts (§6.1). Mounted at /api/admin/pms.
 */

import { Request, Response } from "express";
import * as dataService from "../pms/pms-services/pms-data.service";
import logger from "../../lib/logger";

/**
 * GET /admin/pms/keyData?organization_id=N
 *
 * Aggregate PMS key metrics for ANY organization. The organization is taken
 * from the query string by design: this route is super-admin only, so the
 * caller is authorized to look across tenants.
 */
export async function getKeyDataForOrganization(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const organizationId = parseInt(String(req.query.organization_id), 10);

    if (!organizationId || isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid organization_id parameter",
      });
    }

    const locationIdRaw = req.query.location_id
      ? parseInt(String(req.query.location_id), 10)
      : undefined;
    const locationId =
      locationIdRaw !== undefined && !isNaN(locationIdRaw)
        ? locationIdRaw
        : undefined;

    const data = await dataService.aggregateKeyData(organizationId, locationId);

    return res.json({ success: true, data });
  } catch (error: any) {
    logger.error(
      { err: error?.message || error, organizationId: req.query.organization_id },
      "Error in /admin/pms/keyData:"
    );
    return res.status(500).json({
      success: false,
      error: "Failed to fetch PMS key data",
    });
  }
}
