import { apiDelete, apiGet, apiPatch, apiPost } from "../index";
import { logger } from "../../lib/logger";
import type {
  FetchPmsJobsParams,
  FetchPmsJobsResponse,
  PMSManualEntryRequest,
  PMSUploadRequest,
  PMSUploadResponse,
  PmsKeyDataResponse,
} from "./types";

/**
 * Fetch paginated PMS job records
 */
export async function fetchPmsJobs(
  params: FetchPmsJobsParams = {}
): Promise<FetchPmsJobsResponse> {
  const query = new URLSearchParams();

  if (params.page && params.page > 1) {
    query.set("page", String(params.page));
  }

  if (params.status?.length) {
    query.set("status", params.status.join(","));
  }

  if (typeof params.isApproved === "boolean") {
    query.set("isApproved", params.isApproved ? "1" : "0");
  }

  if (params.organization_id) {
    query.set("organization_id", String(params.organization_id));
  }

  if (params.location_id) {
    query.set("location_id", String(params.location_id));
  }

  const queryString = query.toString();

  return apiGet({
    path: `/pms/jobs${queryString ? `?${queryString}` : ""}`,
  });
}

/**
 * Upload PMS data via CSV file
 * @param request - Contains clientId and file
 * @returns Promise with upload result
 */
export async function uploadPMSData(
  request: PMSUploadRequest
): Promise<PMSUploadResponse> {
  try {
    // Create FormData to send the file
    const formData = new FormData();
    formData.append("csvFile", request.file);
    formData.append("domain", request.domain);
    if (request.locationId) {
      formData.append("locationId", String(request.locationId));
    }
    if (request.targetMonth) {
      formData.append("targetMonth", request.targetMonth);
    }
    if (request.monthlyDataOverride?.length) {
      formData.append("entryType", "file_with_edits");
      formData.append("manualData", JSON.stringify(request.monthlyDataOverride));
    }

    // Use apiPost with FormData support
    const result = await apiPost({
      path: "/pms/upload",
      passedData: formData,
      additionalHeaders: {
        Accept: "application/json",
      },
    });

    return result;
  } catch (error) {
    logger.error("PMS upload API error:", error);
    return {
      success: false,
      error: "Failed to upload PMS data. Please try again.",
    };
  }
}

/**
 * Submit manually entered PMS data (no file upload)
 * Data goes directly to monthly agents, skipping admin/client approval
 * @param request - Contains domain and structured monthly data
 * @returns Promise with submission result
 */
export async function submitManualPMSData(
  request: PMSManualEntryRequest
): Promise<PMSUploadResponse> {
  try {
    const result = await apiPost({
      path: "/pms/upload",
      passedData: {
        domain: request.domain,
        manualData: request.monthlyData,
        entryType: "manual",
        locationId: request.locationId || undefined,
      },
      additionalHeaders: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    return result;
  } catch (error) {
    logger.error("PMS manual entry API error:", error);
    return {
      success: false,
      error: "Failed to submit PMS data. Please try again.",
    };
  }
}

/**
 * Get PMS data summary for a client
 * @param clientId - Client identifier
 * @returns Promise with PMS data summary
 */
export async function getPMSDataSummary(clientId: string) {
  try {
    const response = await apiPost({
      path: "/pms/summary",
      passedData: { clientId },
      additionalHeaders: {
        Accept: "application/json",
      },
    });

    return response;
  } catch (error) {
    logger.error("PMS summary API error:", error);
    return {
      success: false,
      error: "Failed to fetch PMS data summary.",
    };
  }
}

/**
 * Toggle or set the approval state for a PMS job
 */
export async function togglePmsJobApproval(jobId: number, isApproved: boolean) {
  return apiPatch({
    path: `/pms/jobs/${jobId}/approval`,
    passedData: { isApproved },
  });
}

/**
 * Persist updates to a PMS job response log
 */
export async function updatePmsJobResponse(
  jobId: number,
  responseLog: string | null
) {
  return apiPatch({
    path: `/pms/jobs/${jobId}/response`,
    passedData: { responseLog },
  });
}

export async function updatePmsJobClientApproval(
  jobId: number,
  isClientApproved: boolean
) {
  return apiPatch({
    path: `/pms/jobs/${jobId}/client-approval`,
    passedData: { isClientApproved },
  });
}

/**
 * Delete a PMS job entry permanently.
 */
export async function deletePmsJob(jobId: number) {
  return apiDelete({
    path: `/pms/jobs/${jobId}`,
  });
}

/**
 * Fetch PMS key data aggregation for an organization.
 */
export async function fetchPmsKeyData(
  organizationId?: number,
  locationId?: number | null
): Promise<PmsKeyDataResponse> {
  const params = new URLSearchParams();
  if (organizationId) params.set("organization_id", String(organizationId));
  if (locationId) params.set("location_id", String(locationId));
  const query = params.toString();
  return apiGet({
    path: `/pms/keyData${query ? `?${query}` : ""}`,
  }) as Promise<PmsKeyDataResponse>;
}
