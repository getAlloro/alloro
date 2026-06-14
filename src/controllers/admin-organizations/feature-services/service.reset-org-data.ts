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
import { db } from "../../../database/connection";
import { OrganizationModel } from "../../../models/OrganizationModel";
import {
  ResetGroupKey,
  ResetPreviewResponse,
  ResetResponse,
} from "../../../types/adminReset";
import logger from "../../../lib/logger";

const REFERRAL_AGENT_TYPE = "referral_engine";

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
    db("pms_jobs")
      .where({ organization_id: orgId })
      .count<{ count: string }[]>("* as count")
      .first(),
    db("agent_results")
      .where({ organization_id: orgId, agent_type: REFERRAL_AGENT_TYPE })
      .count<{ count: string }[]>("* as count")
      .first(),
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

  await db.transaction(async (trx) => {
    if (groups.includes("pms_ingestion")) {
      const deleted = await trx("pms_jobs")
        .where({ organization_id: orgId })
        .del();
      deletedCounts.pms_jobs = deleted;
    }

    if (groups.includes("agent_referral")) {
      // FK has no ON DELETE CASCADE — recommendations must go first.
      const recDeleted = await trx.raw(
        `DELETE FROM agent_recommendations
         WHERE agent_result_id IN (
           SELECT id FROM agent_results
           WHERE organization_id = ? AND agent_type = ?
         )`,
        [orgId, REFERRAL_AGENT_TYPE],
      );
      // pg returns rowCount; sqlite/mysql shape differs — fall back gracefully.
      deletedCounts.agent_recommendations =
        (recDeleted as any)?.rowCount ?? (recDeleted as any)?.[0]?.affectedRows ?? 0;

      const resultsDeleted = await trx("agent_results")
        .where({ organization_id: orgId, agent_type: REFERRAL_AGENT_TYPE })
        .del();
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
