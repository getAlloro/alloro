import axios from "axios";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import {
  initializeAutomationStatus,
  completeStep,
  updateAutomationStatus,
  failAutomation,
} from "../../../utils/pms/pmsAutomationStatus";
import { OrganizationLifecycleService } from "../../../services/OrganizationLifecycleService";
import logger from "../../../lib/logger";

/**
 * Single source of truth for "PMS data is approved, run agents now."
 *
 * Every PMS ingestion path (manual entry, direct file upload,
 * paste-with-mapping) calls this after creating the `pms_jobs` row.
 * It:
 *   1. Initializes automation status tracking.
 *   2. Marks file_upload as completed.
 *   3. Marks pms_parser as completed OR skipped (paths that run the
 *      mapping inline → "completed"; pure manual entry → "skipped").
 *   4. Marks admin_approval and client_approval as `skipped` — the
 *      client already reviewed in the column-mapping drawer or the
 *      manual-entry form. No human gate before agents.
 *   5. Advances monthly_agents to `processing` / `data_fetch`.
 *   6. Fires the async monthly-agents-run trigger. Failure to dispatch
 *      logs and returns; it must not break job creation.
 *
 * Future PMS upload paths must call this. Do not duplicate the
 * approval-skip + agent-trigger logic elsewhere.
 */

export interface FinalizePmsJobOptions {
  organizationId: number | null;
  locationId: number | null;
  /** Optional — included in the agent trigger payload + log lines. */
  domain?: string;
  /**
   * "completed" when the parsing step actually ran inline (file upload
   * + paste-with-mapping). "skipped" when no parsing happened (pure
   * manual entry).
   */
  pmsParserStatus: "completed" | "skipped";
  /** Required when pmsParserStatus === "skipped". */
  pmsParserSkipMessage?: string;
}

export async function finalizePmsJob(
  jobId: number,
  options: FinalizePmsJobOptions
): Promise<void> {
  const {
    organizationId,
    locationId,
    domain,
    pmsParserStatus,
    pmsParserSkipMessage,
  } = options;

  await initializeAutomationStatus(jobId);

  if (organizationId) {
    try {
      await OrganizationLifecycleService.assertActive(organizationId);
    } catch (error) {
      await failAutomation(
        jobId,
        "monthly_agents",
        "Organization is archived; monthly agents will not run."
      );
      throw error;
    }
  }

  await completeStep(jobId, "file_upload");

  if (pmsParserStatus === "completed") {
    await updateAutomationStatus(jobId, {
      step: "pms_parser",
      stepStatus: "completed",
    });
  } else {
    await updateAutomationStatus(jobId, {
      step: "pms_parser",
      stepStatus: "skipped",
      customMessage: pmsParserSkipMessage ?? "PMS parser skipped",
    });
  }

  await updateAutomationStatus(jobId, {
    step: "admin_approval",
    stepStatus: "skipped",
    customMessage: "Client reviewed inline - no admin approval required",
  });

  await updateAutomationStatus(jobId, {
    step: "client_approval",
    stepStatus: "skipped",
    customMessage: "Client reviewed inline - no client approval required",
  });

  await updateAutomationStatus(jobId, {
    status: "processing",
    step: "monthly_agents",
    stepStatus: "processing",
    subStep: "data_fetch",
    customMessage: "Starting monthly agents - fetching data...",
  });

  await triggerMonthlyAgents(jobId, organizationId, locationId, domain);
}

async function triggerMonthlyAgents(
  jobId: number,
  organizationId: number | null,
  locationId: number | null,
  domain: string | undefined
): Promise<void> {
  try {
    const account = organizationId
      ? await GoogleConnectionModel.findOneByOrganization(organizationId)
      : undefined;

    if (!account) {
      logger.warn(
        `[PMS] No google account found for jobId=${jobId} orgId=${organizationId} - monthly agents not triggered`
      );
      return;
    }

    logger.info(
      `[PMS] Triggering monthly agents for jobId=${jobId} orgId=${organizationId} domain=${domain ?? "(none)"}`
    );

    axios
      .post(
        `http://localhost:${process.env.PORT || 3000}/api/agents/monthly-agents-run`,
        {
          googleAccountId: account.id,
          domain,
          force: true,
          pmsJobId: jobId,
          locationId,
        }
      )
      .then(() => {
        logger.info(
          `[PMS] Monthly agents triggered successfully for jobId=${jobId}`
        );
      })
      .catch((error) => {
        logger.error(
          `[PMS] Failed to trigger monthly agents for jobId=${jobId}: ${error?.message ?? error}`
        );
      });
  } catch (triggerError: any) {
    logger.error(
      `[PMS] Error preparing monthly agents trigger for jobId=${jobId}: ${triggerError?.message ?? triggerError}`
    );
  }
}
