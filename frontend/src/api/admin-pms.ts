import { apiGet } from "./index";
import type { PmsKeyDataResponse } from "./pms/types";

/**
 * Admin PMS reads — the cross-organization half of the PMS key-data endpoint.
 *
 * Backed by GET /api/admin/pms/keyData, which is super-admin only. The client
 * equivalent (`fetchPmsKeyData` in api/pms/jobs.ts) sends no organization at
 * all: the server derives the tenant from the JWT, because a caller-supplied
 * organization_id on a client route let any authenticated user read any
 * practice's figures.
 *
 * Use this ONLY from admin surfaces. A client surface calling it will get a 403.
 */
export async function fetchAdminPmsKeyData(
  organizationId: number,
  locationId?: number | null,
): Promise<PmsKeyDataResponse> {
  const params = new URLSearchParams();
  params.set("organization_id", String(organizationId));
  if (locationId) params.set("location_id", String(locationId));

  return apiGet({
    path: `/admin/pms/keyData?${params.toString()}`,
  }) as Promise<PmsKeyDataResponse>;
}
