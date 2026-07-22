import { apiGet, unwrap } from "./index";
import type { ProofReceipt } from "../types/proofReceipt";

/**
 * The owner-facing "what Alloro did for you" receipt (Tier 1).
 * Backend: GET /api/proof-receipt (JWT + RBAC + location-scoped). Mirrors the
 * `api/agentSummary` fetch pattern (§12.1): the only layer that talks HTTP.
 */
export async function fetchProofReceipt(
  organizationId: number,
  locationId: number | null,
): Promise<ProofReceipt> {
  const query = new URLSearchParams();
  query.set("organizationId", String(organizationId));
  if (locationId !== null) query.set("locationId", String(locationId));
  return unwrap<ProofReceipt>(
    await apiGet({ path: `/proof-receipt?${query.toString()}` }),
  );
}
