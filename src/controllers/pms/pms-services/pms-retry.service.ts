import axios from "axios";
import db from "../../../database/connection";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { OrganizationLifecycleService } from "../../../services/OrganizationLifecycleService";
import {
  resetToStep,
  updateAutomationStatus,
  AutomationStatusDetail,
} from "../../../utils/pms/pmsAutomationStatus";
import logger from "../../../lib/logger";

const MONTHLY_TASK_AGENT_TYPES = [
  "OPPORTUNITY",
  "CRO_OPTIMIZER",
  "REFERRAL_ENGINE_ANALYSIS",
];

const MONTHLY_AGENT_RESULT_TYPES = [
  "summary",
  "opportunity",
  "cro_optimizer",
  "referral_engine",
];

// =====================================================================
// SHARED: CLEANUP MONTHLY RUN DATA
// =====================================================================

/**
 * Delete all data produced by a monthly agents run.
 * Used by both retry (failed) and restart (completed) flows.
 *
 * Deletes: agent_results, tasks, google_data_store, notifications
 * created during the run's time window.
 */
async function cleanupMonthlyRunData(job: {
  id: number;
  organization_id: number;
  location_id?: number | null;
  automation_status_detail?: AutomationStatusDetail | any;
}): Promise<Record<string, number>> {
  const detail: AutomationStatusDetail | undefined =
    typeof job.automation_status_detail === "string"
      ? JSON.parse(job.automation_status_detail)
      : job.automation_status_detail;

  // 1. Collect agent result IDs from summary (if available)
  let agentResultIds: number[] = [];
  const summary = detail?.summary;

  if (summary?.agentResults) {
    const ar = summary.agentResults;
    for (const key of Object.keys(ar) as Array<keyof typeof ar>) {
      if (ar[key]?.resultId) {
        agentResultIds.push(ar[key]!.resultId!);
      }
    }
  }

  // 2. Get date range from agent_results (before deleting) for google_data_store cleanup
  let dateStart: string | null = null;
  let dateEnd: string | null = null;

  if (agentResultIds.length > 0) {
    const dateRow = await db("agent_results")
      .whereIn("id", agentResultIds)
      .select("date_start", "date_end")
      .first();
    if (dateRow) {
      dateStart = dateRow.date_start;
      dateEnd = dateRow.date_end;
    }
  }

  // 3. Fallback: query agent_results by org + location if no IDs in summary
  if (agentResultIds.length === 0) {
    const timeStart = detail?.startedAt || new Date(Date.now() - 86400_000).toISOString();
    const timeEnd = detail?.completedAt || new Date().toISOString();

    const fallbackResults = await db("agent_results")
      .where({ organization_id: job.organization_id })
      .where((qb: any) => {
        if (job.location_id) qb.where({ location_id: job.location_id });
      })
      .whereIn("agent_type", MONTHLY_AGENT_RESULT_TYPES)
      .whereBetween("created_at", [timeStart, timeEnd])
      .select("id", "date_start", "date_end");

    agentResultIds = fallbackResults.map((r: any) => r.id);
    if (fallbackResults.length > 0) {
      dateStart = fallbackResults[0].date_start;
      dateEnd = fallbackResults[0].date_end;
    }
  }

  // 4. Time window for tasks/notifications
  const timeStart = detail?.startedAt || new Date(Date.now() - 86400_000).toISOString();
  const timeEnd = detail?.completedAt || new Date().toISOString();

  // 5. Transaction — delete all related data
  const deletionCounts = await db.transaction(async (trx) => {
    const counts: Record<string, number> = {};

    // Delete agent_results
    if (agentResultIds.length > 0) {
      counts.agentResults = await trx("agent_results")
        .whereIn("id", agentResultIds)
        .del();
    } else {
      counts.agentResults = 0;
    }

    // Delete tasks
    const tasksQuery = trx("tasks")
      .where({ organization_id: job.organization_id })
      .whereIn("agent_type", MONTHLY_TASK_AGENT_TYPES)
      .whereBetween("created_at", [timeStart, timeEnd]);
    if (job.location_id) {
      tasksQuery.where({ location_id: job.location_id });
    }
    counts.tasks = await tasksQuery.del();

    // Delete google_data_store
    if (dateStart && dateEnd) {
      const gdsQuery = trx("google_data_store")
        .where({
          organization_id: job.organization_id,
          date_start: dateStart,
          date_end: dateEnd,
          run_type: "monthly",
        });
      if (job.location_id) {
        gdsQuery.where({ location_id: job.location_id });
      }
      counts.googleDataStore = await gdsQuery.del();
    } else {
      counts.googleDataStore = 0;
    }

    // Delete notifications
    const notifQuery = trx("notifications")
      .where({
        organization_id: job.organization_id,
        title: "Monthly Insights Ready",
      })
      .whereBetween("created_at", [timeStart, timeEnd]);
    counts.notifications = await notifQuery.del();

    return counts;
  });

  logger.info(
    `[PMS] Cleanup for job ${job.id}: ${JSON.stringify(deletionCounts)}`
  );

  return deletionCounts;
}

// =====================================================================
// SHARED: TRIGGER MONTHLY AGENTS
// =====================================================================

async function triggerMonthlyAgents(
  accountId: number,
  jobId: number,
  locationId?: number | null
): Promise<void> {
  await axios.post(
    `http://localhost:${process.env.PORT || 3000}/api/agents/monthly-agents-run`,
    {
      googleAccountId: accountId,
      force: true,
      pmsJobId: jobId,
      locationId,
    }
  );
}

// =====================================================================
// PUBLIC: RETRY FAILED STEP
// =====================================================================

/**
 * Retry a failed automation step.
 * Routes to the appropriate retry handler.
 */
export async function retryFailedStep(
  jobId: number,
  stepToRetry: string
) {
  if (!stepToRetry || !["pms_parser", "monthly_agents"].includes(stepToRetry)) {
    throw Object.assign(
      new Error("stepToRetry must be 'pms_parser' or 'monthly_agents'"),
      { statusCode: 400 }
    );
  }

  // Get the job with all relevant data
  const job = await db("pms_jobs")
    .where({ id: jobId })
    .select(
      "id",
      "organization_id",
      "location_id",
      "status",
      "raw_input_data",
      "response_log",
      "automation_status_detail",
      "is_approved",
      "is_client_approved"
    )
    .first();

  if (!job) {
    throw Object.assign(new Error("PMS job not found"), { statusCode: 404 });
  }

  if (stepToRetry === "pms_parser") {
    return retryPmsParser(jobId, job);
  }

  if (stepToRetry === "monthly_agents") {
    return retryMonthlyAgents(jobId, job);
  }

  throw Object.assign(new Error("Invalid retry step"), { statusCode: 400 });
}

// =====================================================================
// RETRY: PMS PARSER
// =====================================================================

async function retryPmsParser(jobId: number, job: any) {
  if (!job.raw_input_data) {
    throw Object.assign(
      new Error(
        "Cannot retry PMS parser - no raw input data saved. Please re-upload the file."
      ),
      { statusCode: 400 }
    );
  }

  let rawData;
  try {
    rawData =
      typeof job.raw_input_data === "string"
        ? JSON.parse(job.raw_input_data)
        : job.raw_input_data;
  } catch (e) {
    throw Object.assign(new Error("Invalid raw input data format"), {
      statusCode: 400,
    });
  }

  await resetToStep(jobId, "pms_parser");

  await db("pms_jobs").where({ id: jobId }).update({
    status: "pending",
    response_log: null,
    is_approved: 0,
    is_client_approved: 0,
  });

  await updateAutomationStatus(jobId, {
    status: "processing",
    step: "pms_parser",
    stepStatus: "processing",
    customMessage: "Retrying PMS parser agent...",
  });

  try {
    const PMS_PARSER_WEBHOOK = process.env.PMS_PARSER_WEBHOOK;
    if (!PMS_PARSER_WEBHOOK) {
      throw new Error("PMS_PARSER_WEBHOOK not configured in environment");
    }

    await axios.post(
      PMS_PARSER_WEBHOOK,
      { report_data: rawData, jobId },
      { headers: { "Content-Type": "application/json" } }
    );

    logger.info(
      `[PMS] Successfully triggered PMS parser retry for job ${jobId}`
    );

    return { jobId, stepRetried: "pms_parser" };
  } catch (webhookError: any) {
    logger.error(
      `[PMS] Failed to trigger PMS parser retry: ${webhookError.message}`
    );

    await updateAutomationStatus(jobId, {
      status: "failed",
      step: "pms_parser",
      stepStatus: "failed",
      error: `Retry failed: ${webhookError.message}`,
      customMessage: `Retry failed: ${webhookError.message}`,
    });

    throw Object.assign(
      new Error(`Failed to retry PMS parser: ${webhookError.message}`),
      { statusCode: 500 }
    );
  }
}

// =====================================================================
// RETRY: MONTHLY AGENTS (failed runs)
// =====================================================================

async function retryMonthlyAgents(jobId: number, job: any) {
  if (!job.organization_id) {
    throw Object.assign(
      new Error(
        "Cannot retry monthly agents - no organization associated with this job"
      ),
      { statusCode: 400 }
    );
  }

  if (!job.response_log) {
    throw Object.assign(
      new Error(
        "Cannot retry monthly agents - PMS data has not been parsed yet"
      ),
      { statusCode: 400 }
    );
  }

  await OrganizationLifecycleService.assertActive(job.organization_id);

  const account = await GoogleConnectionModel.findOneByOrganization(job.organization_id);

  if (!account) {
    throw Object.assign(
      new Error(
        `Cannot retry monthly agents - no Google connection found for org ${job.organization_id}`
      ),
      { statusCode: 400 }
    );
  }

  // Clean up any partial data from the failed run
  const deletionCounts = await cleanupMonthlyRunData(job);

  // Reset automation status
  await resetToStep(jobId, "monthly_agents");

  await updateAutomationStatus(jobId, {
    status: "processing",
    step: "monthly_agents",
    stepStatus: "processing",
    subStep: "data_fetch",
    customMessage: "Retrying monthly agents - fetching data...",
  });

  try {
    await triggerMonthlyAgents(account.id, jobId, job.location_id);

    logger.info(
      `[PMS] Monthly agents retry triggered for org ${job.organization_id}`
    );

    return {
      jobId,
      stepRetried: "monthly_agents",
      organization_id: job.organization_id,
      deletionCounts,
    };
  } catch (triggerError: any) {
    logger.error(
      `[PMS] Error triggering monthly agents retry: ${triggerError.message}`
    );

    throw Object.assign(
      new Error(
        `Failed to retry monthly agents: ${triggerError.message}`
      ),
      { statusCode: 500 }
    );
  }
}

// =====================================================================
// RESTART: COMPLETED MONTHLY AGENTS RUN
// =====================================================================

/**
 * Restart a completed monthly agents run.
 * Deletes all data produced by the run, then re-triggers from scratch.
 */
export async function restartMonthlyAgents(jobId: number) {
  // 1. Load & validate
  const job = await db("pms_jobs")
    .where({ id: jobId })
    .select(
      "id",
      "organization_id",
      "location_id",
      "automation_status_detail"
    )
    .first();

  if (!job) {
    throw Object.assign(new Error("PMS job not found"), { statusCode: 404 });
  }

  const detail: AutomationStatusDetail | undefined =
    typeof job.automation_status_detail === "string"
      ? JSON.parse(job.automation_status_detail)
      : job.automation_status_detail;

  if (!detail) {
    throw Object.assign(
      new Error("Only completed runs can be restarted"),
      { statusCode: 400 }
    );
  }

  if (detail.status === "processing") {
    throw Object.assign(
      new Error("Run is already processing"),
      { statusCode: 409 }
    );
  }

  if (detail.status !== "completed") {
    throw Object.assign(
      new Error("Only completed runs can be restarted"),
      { statusCode: 400 }
    );
  }

  if (!job.organization_id) {
    throw Object.assign(
      new Error("No organization associated with this job"),
      { statusCode: 400 }
    );
  }

  await OrganizationLifecycleService.assertActive(job.organization_id);

  // 2. Get Google account for re-trigger
  const account = await GoogleConnectionModel.findOneByOrganization(
    job.organization_id
  );
  if (!account) {
    throw Object.assign(
      new Error(
        `No Google connection found for org ${job.organization_id}`
      ),
      { statusCode: 400 }
    );
  }

  // 3. Clean up all data from the completed run
  const deletionCounts = await cleanupMonthlyRunData(job);

  // 4. Reset automation status
  await resetToStep(jobId, "monthly_agents");

  await updateAutomationStatus(jobId, {
    status: "processing",
    step: "monthly_agents",
    stepStatus: "processing",
    subStep: "data_fetch",
    customMessage: "Restarting monthly agents - fetching data...",
  });

  // 5. Re-trigger monthly agents
  let restarted = true;
  try {
    await triggerMonthlyAgents(account.id, jobId, job.location_id);

    logger.info(
      `[PMS] Monthly agents restart triggered for job ${jobId}, org ${job.organization_id}`
    );
  } catch (triggerError: any) {
    logger.error(
      `[PMS] Failed to trigger monthly agents after restart cleanup: ${triggerError.message}`
    );
    restarted = false;
  }

  return {
    jobId,
    restarted,
    deletionCounts,
  };
}
