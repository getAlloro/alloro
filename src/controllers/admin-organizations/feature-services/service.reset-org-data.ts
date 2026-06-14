/**
 * Reset Organization Data Service
 *
 * Hard-deletes selected reset groups for a single organization in a single
 * knex transaction. Partial failure rolls back the entire reset.
 *
 * v1 scope (2 groups):
 *   - `pms_ingestion`     -> DELETE FROM pms_jobs WHERE organization_id = :id
 *   - `agent_referral`    -> DELETE FROM agent_recommendations (joined via agent_results),
 *                            then DELETE FROM agent_results WHERE agent_type = 'referral_engine'
 *
 * The PMS -> Referral Engine cascade is enforced in the UI. The backend honors
 * the `groups` array literally — no hidden server-side cascade.
 *
 * Reference analog: src/controllers/settings/feature-services/service.delete-organization.ts
 */
import { OrganizationModel } from "../../../models/OrganizationModel";
import { PmsJobModel } from "../../../models/PmsJobModel";
import { AgentResultModel } from "../../../models/AgentResultModel";
import { AgentRecommendationModel } from "../../../models/AgentRecommendationModel";
import {
  RESET_GROUP_KEYS,
  ResetGroupKey,
  ResetPreviewResponse,
  ResetResponse,
} from "../../../types/adminReset";
import { AdminOrgError } from "../feature-utils/AdminOrgError";
import logger from "../../../lib/logger";

const REFERRAL_AGENT_TYPE = "referral_engine";

export interface ValidatedResetRequest {
  uniqueGroups: ResetGroupKey[];
  adminEmail: string;
}

/**
 * Validate a reset request against domain rules:
 * org must exist, `confirmName` must match the org name exactly, `groups`
 * must be a non-empty subset of RESET_GROUP_KEYS, and the acting admin email
 * must be present. Returns the de-duped groups (order-preserving) + admin email.
 *
 * Guard failures throw AdminOrgError carrying the exact status + body so the
 * controller relays them verbatim.
 */
export async function validateResetRequest(
  orgId: number,
  body: { groups?: unknown; confirmName?: unknown },
  adminEmail: string | undefined,
): Promise<ValidatedResetRequest> {
  const organization = await OrganizationModel.findById(orgId);
  if (!organization) {
    throw new AdminOrgError(404, { error: "Organization not found" });
  }

  const { groups, confirmName } = body ?? {};

  if (typeof confirmName !== "string" || confirmName !== organization.name) {
    throw new AdminOrgError(400, {
      success: false,
      error:
        "Confirmation failed. `confirmName` must match the organization name exactly.",
    });
  }

  if (!Array.isArray(groups) || groups.length === 0) {
    throw new AdminOrgError(400, {
      success: false,
      error: "`groups` must be a non-empty array of reset group keys.",
    });
  }

  const allowed = new Set<string>(RESET_GROUP_KEYS);
  const invalid = groups.filter(
    (g): g is unknown => typeof g !== "string" || !allowed.has(g),
  );
  if (invalid.length > 0) {
    throw new AdminOrgError(400, {
      success: false,
      error: `Invalid reset group key(s): ${invalid
        .map((g) => JSON.stringify(g))
        .join(", ")}. Allowed: ${RESET_GROUP_KEYS.join(", ")}.`,
    });
  }

  if (!adminEmail) {
    throw new AdminOrgError(401, {
      success: false,
      error: "Authenticated admin email not found on request.",
    });
  }

  // De-dupe while preserving order — guards against `["pms_ingestion","pms_ingestion"]`.
  const uniqueGroups = Array.from(new Set(groups as ResetGroupKey[]));

  return { uniqueGroups, adminEmail };
}

/**
 * Read-only count preview for the modal.
 * Runs the count queries in parallel and returns row counts per reset group.
 */
export async function previewResetCounts(
  orgId: number,
): Promise<ResetPreviewResponse> {
  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    const err: any = new Error("Organization not found");
    err.statusCode = 404;
    throw err;
  }

  const [pmsCount, referralCount] = await Promise.all([
    PmsJobModel.countByOrganizationId(orgId),
    AgentResultModel.countByOrganizationAndAgentType(
      orgId,
      REFERRAL_AGENT_TYPE
    ),
  ]);

  return {
    orgId,
    orgName: org.name,
    counts: {
      pms_ingestion: Number(pmsCount?.count ?? 0),
      agent_referral: Number(referralCount?.count ?? 0),
    },
  };
}

/**
 * Execute the reset for the given groups inside a single transaction.
 *
 * Returns per-table deletion counts so the frontend can show
 * "Reset N rows across X groups". Logs a structured `[admin-reset]` line.
 */
export async function resetOrgData(
  orgId: number,
  groups: ResetGroupKey[],
  adminEmail: string,
): Promise<ResetResponse> {
  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    const err: any = new Error("Organization not found");
    err.statusCode = 404;
    throw err;
  }

  const deletedCounts: Record<string, number> = {};

  await PmsJobModel.transaction(async (trx) => {
    if (groups.includes("pms_ingestion")) {
      const deleted = await PmsJobModel.deleteByOrganizationId(orgId, trx);
      deletedCounts.pms_jobs = deleted;
    }

    if (groups.includes("agent_referral")) {
      // FK has no ON DELETE CASCADE — recommendations must go first.
      const recDeleted =
        await AgentRecommendationModel.deleteByOrganizationAndAgentType(
          orgId,
          REFERRAL_AGENT_TYPE,
          trx,
        );
      // pg returns rowCount; sqlite/mysql shape differs — fall back gracefully.
      deletedCounts.agent_recommendations =
        (recDeleted as any)?.rowCount ?? (recDeleted as any)?.[0]?.affectedRows ?? 0;

      const resultsDeleted =
        await AgentResultModel.deleteByOrganizationAndAgentType(
          orgId,
          REFERRAL_AGENT_TYPE,
          trx,
        );
      deletedCounts.agent_results = resultsDeleted;
    }
  });

  logger.info({ detail: JSON.stringify({
          adminEmail,
          orgId,
          orgName: org.name,
          groups,
          deletedCounts,
          timestamp: new Date().toISOString(),
        }) }, "[admin-reset]");

  return {
    success: true,
    groupsExecuted: groups,
    deletedCounts,
  };
}
