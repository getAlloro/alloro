import { PmsJobModel } from "../../../models/PmsJobModel";
import { PmsJobEventModel } from "../../../models/PmsJobEventModel";
import { aggregatePmsData } from "../../../utils/pms/pmsAggregator";
import {
  parseResponseLog,
  normalizeApproval,
} from "../pms-utils/pms-normalizer.util";
import { coerceBoolean } from "../pms-utils/pms-validator.util";
import { PAGE_SIZE, PmsStatus } from "../pms-utils/pms-constants";
import { computeInsightsStale } from "../pms-utils/pms-insights-freshness.util";
import logger from "../../../lib/logger";

/**
 * Resolve whether displayed insights are stale relative to PMS data for a
 * location: stale when the latest edit/delete is newer than the latest
 * completed run and no run is active. Returns inert values when unscoped.
 */
async function buildInsightsFreshness(
  organizationId: number,
  locationId?: number
): Promise<{
  insightsStale: boolean;
  lastDataChangeAt: string | null;
  lastInsightsRunAt: string | null;
}> {
  if (!locationId) {
    return {
      insightsStale: false,
      lastDataChangeAt: null,
      lastInsightsRunAt: null,
    };
  }

  const [lastDataChangeAt, runSummary] = await Promise.all([
    PmsJobEventModel.getLatestDataChangeForLocation(organizationId, locationId),
    PmsJobModel.getInsightsRunSummaryForLocation(organizationId, locationId),
  ]);

  return {
    insightsStale: computeInsightsStale({
      lastDataChangeAt,
      lastInsightsRunAt: runSummary.lastCompletedAt,
      hasActiveRun: runSummary.hasActiveRun,
    }),
    lastDataChangeAt,
    lastInsightsRunAt: runSummary.lastCompletedAt,
  };
}

/**
 * Aggregate PMS key metrics for an organization across all processed jobs.
 * Optionally scoped to a specific location.
 */
export async function aggregateKeyData(
  organizationId: number,
  locationId?: number
) {
  const jobsRaw = await PmsJobModel.findJobsForKeyDataByOrganization(
    organizationId,
    locationId
  );
  const latestJob = await PmsJobModel.findLatestJobForKeyDataByOrganization(
    organizationId,
    locationId
  );

  const approvedJobs = jobsRaw.filter(
    (job: any) => normalizeApproval(job.is_approved) === true
  );

  const freshness = await buildInsightsFreshness(organizationId, locationId);

  if (!approvedJobs.length) {
    return {
      organizationId,
      months: [],
      sources: [],
      totals: {
        totalReferrals: 0,
        totalProduction: 0,
        totalAttributedProduction: 0,
      },
      stats: {
        jobCount: 0,
        earliestJobTimestamp: null,
        latestJobTimestamp: null,
        distinctMonths: 0,
        latestJobStatus: latestJob?.status ?? null,
        latestJobIsApproved: normalizeApproval(latestJob?.is_approved),
        latestJobIsClientApproved: normalizeApproval(
          latestJob?.is_client_approved
        ),
        latestJobId: latestJob?.id ?? null,
        ...freshness,
      },
      latestJobRaw:
        latestJob?.response_log !== undefined &&
        latestJob?.response_log !== null
          ? parseResponseLog(latestJob.response_log)
          : null,
    };
  }

  // Use shared aggregation function for consistent PMS data handling
  const aggregatedData = await aggregatePmsData(organizationId, locationId);
  const { months, sources, totals } = aggregatedData;

  const stats = {
    jobCount: approvedJobs.length,
    earliestJobTimestamp: approvedJobs[0]?.timestamp ?? null,
    latestJobTimestamp:
      approvedJobs[approvedJobs.length - 1]?.timestamp ?? null,
    distinctMonths: months.length,
    latestJobStatus: latestJob?.status ?? null,
    latestJobIsApproved: normalizeApproval(latestJob?.is_approved),
    latestJobIsClientApproved: normalizeApproval(
      latestJob?.is_client_approved
    ),
    latestJobId: latestJob?.id ?? null,
    ...freshness,
  };

  return {
    organizationId,
    months,
    sources,
    totals,
    stats,
    latestJobRaw:
      latestJob?.response_log !== undefined &&
      latestJob?.response_log !== null
        ? parseResponseLog(latestJob.response_log)
        : null,
  };
}

/**
 * Fetch paginated PMS job records with optional filtering.
 */
export async function listJobsPaginated(
  filters: {
    statuses: PmsStatus[];
    approvedFilter: boolean | undefined;
    organizationFilter: number | undefined;
    locationFilter: number | undefined;
  },
  page: number
) {
  const { statuses, approvedFilter, organizationFilter, locationFilter } = filters;

  const listFilters = {
    statuses,
    approvedFilter,
    organizationFilter,
    locationFilter,
  };

  const total = await PmsJobModel.countJobsForList(listFilters);

  const jobsRaw = await PmsJobModel.listJobsWithLocationName(listFilters, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const jobs = jobsRaw.map((job: any) => {
    // Parse automation_status_detail if present
    let automationStatusDetail = null;
    if (job.automation_status_detail) {
      try {
        automationStatusDetail =
          typeof job.automation_status_detail === "string"
            ? JSON.parse(job.automation_status_detail)
            : job.automation_status_detail;
      } catch (e) {
        logger.warn(
          `Failed to parse automation_status_detail for job ${job.id}`
        );
      }
    }

    return {
      id: job.id,
      time_elapsed: job.time_elapsed,
      status: job.status,
      response_log: parseResponseLog(job.response_log),
      timestamp: job.timestamp,
      is_approved: job.is_approved === 1 || job.is_approved === true,
      is_client_approved:
        job.is_client_approved === 1 || job.is_client_approved === true,
      organization_id: job.organization_id ?? null,
      location_name: job.location_name || null,
      automation_status_detail: automationStatusDetail,
    };
  });

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return {
    jobs,
    pagination: {
      page,
      perPage: PAGE_SIZE,
      total,
      totalPages,
      hasNextPage: page < totalPages,
    },
    filters: {
      statuses,
      isApproved: approvedFilter,
      organization_id: organizationFilter,
    },
  };
}

/**
 * Update the stored response log JSON for a PMS job.
 * Returns the updated job record.
 */
export async function updateJobResponse(
  jobId: number,
  responseLog: unknown
) {
  let normalizedResponse: any = null;

  if (typeof responseLog === "string") {
    const trimmed = responseLog.trim();
    if (trimmed.length === 0) {
      normalizedResponse = null;
    } else {
      try {
        normalizedResponse = JSON.parse(trimmed);
      } catch (parseError: any) {
        throw Object.assign(
          new Error(`responseLog must be valid JSON: ${parseError.message}`),
          { statusCode: 400 }
        );
      }
    }
  } else {
    // Accept objects/arrays directly
    try {
      JSON.stringify(responseLog);
      normalizedResponse = responseLog;
    } catch (parseError: any) {
      throw Object.assign(
        new Error(
          `responseLog must be JSON serializable: ${parseError.message}`
        ),
        { statusCode: 400 }
      );
    }
  }

  const existingJob = await PmsJobModel.findById(jobId);

  if (!existingJob) {
    throw Object.assign(new Error("PMS job not found"), { statusCode: 404 });
  }

  const responseValue =
    normalizedResponse === null ? null : JSON.stringify(normalizedResponse);

  await PmsJobModel.updateResponseLogRaw(jobId, responseValue);

  const updatedJob = await PmsJobModel.findResponseSummaryById(jobId);

  return {
    id: updatedJob?.id,
    time_elapsed: updatedJob?.time_elapsed,
    status: updatedJob?.status,
    response_log: parseResponseLog(updatedJob?.response_log),
    timestamp: updatedJob?.timestamp,
    is_approved: updatedJob?.is_approved === 1,
    is_client_approved:
      updatedJob?.is_client_approved === 1 ||
      updatedJob?.is_client_approved === true,
  };
}

/**
 * Permanently remove a PMS job entry.
 */
export async function deleteJobById(jobId: number) {
  const existingJob = await PmsJobModel.findById(jobId);

  if (!existingJob) {
    throw Object.assign(new Error("PMS job not found"), { statusCode: 404 });
  }

  await PmsJobModel.deleteById(jobId);

  return { id: jobId };
}
