/**
 * PracticeRankingController
 *
 * HTTP handler layer for the ranking-lifecycle endpoints (trigger, status,
 * results, list, accounts, retry, delete, refresh-competitors, latest, history,
 * and in-flight). Named function exports per project convention.
 *
 * Thin controller: parse/validate request -> call feature-service -> shape
 * response via feature-utils -> map errors. Business logic lives in
 * feature-services/; pure helpers + response shapers live in feature-utils/.
 *
 * The v2 curated-competitor endpoints and the Place Photo proxy live in the
 * sibling LocationCompetitorController. (webhook endpoint removed — LLM
 * analysis now runs inline via Claude.)
 */

import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { parseJsonField } from "./feature-utils/util.json-parser";
import { log, logError } from "./feature-utils/util.ranking-logger";
import { fail, fail500 } from "./feature-utils/util.ranking-responses";
import {
  validateTriggerRequest,
  validateLocations,
  validateRefreshCompetitors,
  validateRankingId,
} from "./feature-utils/util.ranking-validator";
import {
  formatTriggerResponse,
  formatLegacyTriggerResponse,
  formatInMemoryBatchStatus,
  formatDbBatchStatus,
  formatRankingStatus,
  formatFullResults,
  formatRankingsList,
  formatAccountsList,
} from "./feature-utils/util.ranking-formatter";
import { formatAccounts } from "./feature-utils/util.account-formatter";
import * as batchTracker from "./feature-services/service.batch-status-tracker";
import * as competitorService from "./feature-services/service.competitor-analysis";
import {
  createPendingRankingRecords,
  buildLegacyLocations,
  dispatchBatchProcessing,
} from "./feature-services/service.trigger-batch";
import {
  runSingleRetryInBackground,
  runBatchRetryInBackground,
} from "./feature-services/service.ranking-retry";
import { getLatestRankingsForAccount } from "./feature-services/service.latest-rankings";
import { getRankingHistory as getRankingHistoryData } from "./feature-services/service.ranking-history";
import { PracticeRankingModel } from "../../models/PracticeRankingModel";
import { GoogleConnectionModel } from "../../models/GoogleConnectionModel";
import { OrganizationModel } from "../../models/OrganizationModel";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";

// POST /trigger

export async function triggerBatchAnalysis(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { googleAccountId, locations } = req.body;

    const validation = validateTriggerRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json(validation.error);
    }

    // Validate account exists and get org domain
    const account =
      await GoogleConnectionModel.findWithOrganizationForTrigger(googleAccountId);

    if (!account) {
      return fail(res, 404, "ACCOUNT_NOT_FOUND", `Account ${googleAccountId} not found`, "");
    }

    if (account.org_archived_at) {
      return fail(
        res,
        423,
        "ORGANIZATION_ARCHIVED",
        "Archived organizations cannot start ranking analysis.",
        "",
      );
    }

    const propertyIds = parseJsonField(account.google_property_ids);

    // Handle new multi-location format
    if (locations && Array.isArray(locations) && locations.length > 0) {
      const locValidation = validateLocations(
        locations,
        propertyIds?.gbp,
      );
      if (!locValidation.valid) {
        return res.status(400).json(locValidation.error);
      }

      // Generate batch ID
      const batchId = uuidv4();

      log(
        `Starting batch ${batchId} for ${locations.length} locations in account ${googleAccountId}`,
      );

      // Create ALL ranking records upfront with "pending" status
      // This ensures the frontend can see all locations immediately when the trigger returns
      // Note: specialty/location will be auto-determined during processing via Identifier Agent
      const organizationId = account.organization_id || null;
      const rankingIds = await createPendingRankingRecords(
        batchId,
        organizationId,
        locations,
      );

      // Start background batch processing (records already created)
      dispatchBatchProcessing(
        batchId,
        googleAccountId,
        locations,
        account.org_domain || "",
        rankingIds,
        true, // recordsPreCreated
        account.organization_id, // actual org ID, not connection row ID
      );

      return res.json(formatTriggerResponse(batchId, locations, rankingIds));
    }

    // Handle legacy single-location format (backward compatibility)
    const { specialty, location } = req.body;
    if (!specialty || !location) {
      return fail(
        res,
        400,
        "MISSING_PARAMS",
        "Either 'locations' array or 'specialty' and 'location' are required",
        "",
      );
    }

    // Use first GBP location for legacy format
    const firstGbp = propertyIds?.gbp?.[0];
    if (!firstGbp) {
      return fail(res, 400, "NO_GBP", "Account has no GBP locations configured", "");
    }

    const legacyLocations = buildLegacyLocations(firstGbp, specialty, location);

    const batchId = uuidv4();

    // Start background batch processing (legacy: creates records inside)
    dispatchBatchProcessing(
      batchId,
      googleAccountId,
      legacyLocations,
      account.org_domain || "",
      [], // no pre-created IDs
      false, // recordsPreCreated = false for legacy
      account.organization_id, // actual org ID, not connection row ID
    );

    return res.json(formatLegacyTriggerResponse(batchId));
  } catch (error: any) {
    logError("POST /trigger", error);
    return fail500(res, "TRIGGER_ERROR", error, "Failed to start analysis");
  }
}

// GET /batch/:batchId/status

export async function getBatchStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { batchId } = req.params;

    // Check in-memory status first (for active batches)
    const inMemoryStatus = batchTracker.getStatus(batchId);

    if (inMemoryStatus) {
      return res.json(formatInMemoryBatchStatus(inMemoryStatus));
    }

    // Fall back to database query
    const rankings = await PracticeRankingModel.findBatchStatusRows(batchId);

    if (rankings.length === 0) {
      return fail(res, 404, "NOT_FOUND", `Batch ${batchId} not found`, "");
    }

    return res.json(formatDbBatchStatus(batchId, rankings));
  } catch (error: any) {
    logError("GET /batch/:batchId/status", error);
    return fail500(res, "BATCH_STATUS_ERROR", error, "Failed to get batch status");
  }
}

// GET /status/:id

export async function getRankingStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;

    const ranking = await PracticeRankingModel.findRawById(parseInt(id));

    if (!ranking) {
      return fail(res, 404, "NOT_FOUND", `Ranking ${id} not found`, "");
    }

    return res.json(formatRankingStatus(ranking));
  } catch (error: any) {
    logError("GET /status/:id", error);
    return fail500(res, "STATUS_ERROR", error, "Failed to get status");
  }
}

// GET /results/:id

export async function getRankingResults(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;

    const ranking = await PracticeRankingModel.findRawById(parseInt(id));

    if (!ranking) {
      return fail(res, 404, "NOT_FOUND", `Ranking ${id} not found`, "");
    }

    return res.json(formatFullResults(ranking));
  } catch (error: any) {
    logError("GET /results/:id", error);
    return fail500(res, "RESULTS_ERROR", error, "Failed to get results");
  }
}

// GET /list

export async function listRankings(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { organization_id, location_id, limit = 20, offset = 0 } = req.query;

    const rankings = await PracticeRankingModel.listWithOrgAndLocation(
      {
        organizationId: organization_id ? Number(organization_id) : undefined,
        locationId: location_id ? Number(location_id) : undefined,
      },
      { limit: Number(limit), offset: Number(offset) },
    );

    return res.json(formatRankingsList(rankings));
  } catch (error: any) {
    logError("GET /list", error);
    return fail500(res, "LIST_ERROR", error, "Failed to list rankings");
  }
}

// GET /accounts

export async function listAccounts(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const accounts =
      await GoogleConnectionModel.findOnboardedAccountsWithOrganization();

    const formattedAccounts = formatAccounts(accounts);

    return res.json(formatAccountsList(formattedAccounts));
  } catch (error: any) {
    logError("GET /accounts", error);
    return fail500(res, "ACCOUNTS_ERROR", error, "Failed to list accounts");
  }
}

// DELETE /batch/:batchId

export async function deleteBatch(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { batchId } = req.params;

    if (!batchId) {
      return fail(res, 400, "INVALID_BATCH_ID", "Batch ID is required", "");
    }

    // Check if batch exists
    const rankings = await PracticeRankingModel.findIdStatusByBatchId(batchId);

    if (rankings.length === 0) {
      return fail(res, 404, "NOT_FOUND", `Batch ${batchId} not found`, "");
    }

    // Delete all rankings in the batch
    const deletedCount = await PracticeRankingModel.deleteByBatchId(batchId);

    // Clean up in-memory batch status if present
    batchTracker.clearStatus(batchId);

    log(`Deleted batch ${batchId} (${deletedCount} rankings)`);

    return res.json({
      success: true,
      message: `Batch deleted successfully`,
      deletedCount: deletedCount,
      batchId: batchId,
    });
  } catch (error: any) {
    logError("DELETE /batch/:batchId", error);
    return fail500(res, "DELETE_BATCH_ERROR", error, "Failed to delete batch");
  }
}

// DELETE /:id

export async function deleteRanking(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const rankingId = parseInt(id);

    const idValidation = validateRankingId(id);
    if (!idValidation.valid) {
      return res.status(400).json(idValidation.error);
    }

    // Check if ranking exists
    const ranking = await PracticeRankingModel.findRawById(rankingId);

    if (!ranking) {
      return fail(res, 404, "NOT_FOUND", `Ranking ${id} not found`, "");
    }

    // Delete the ranking
    await PracticeRankingModel.deleteById(rankingId);

    log(`Deleted ranking analysis ${rankingId}`);

    return res.json({
      success: true,
      message: `Ranking ${id} deleted successfully`,
    });
  } catch (error: any) {
    logError("DELETE /:id", error);
    return fail500(res, "DELETE_ERROR", error, "Failed to delete ranking");
  }
}

// POST /refresh-competitors

export async function refreshCompetitors(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { specialty, location } = req.body;

    const validation = validateRefreshCompetitors({ specialty, location });
    if (!validation.valid) {
      return res.status(400).json(validation.error);
    }

    const wasInvalidated = await competitorService.invalidateCache(
      specialty,
      location,
    );

    return res.json({
      success: true,
      message: wasInvalidated
        ? "Competitor cache invalidated. Next analysis will discover fresh competitors."
        : "No cache found for this specialty+location. Next analysis will discover competitors.",
      invalidated: wasInvalidated,
    });
  } catch (error: any) {
    logError("POST /refresh-competitors", error);
    return fail500(res, "REFRESH_ERROR", error, "Failed to refresh competitors");
  }
}

// POST /retry/:id

export async function retryRanking(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const rankingId = parseInt(id);

    if (isNaN(rankingId)) {
      return fail(res, 400, "INVALID_ID", "Invalid ranking ID", "");
    }

    const ranking = await PracticeRankingModel.findRawById(rankingId);

    if (!ranking) {
      return fail(res, 404, "NOT_FOUND", `Ranking ${id} not found`, "");
    }

    if (ranking.status === "pending" || ranking.status === "processing") {
      return fail(
        res,
        409,
        "ALREADY_RUNNING",
        `Ranking ${id} is currently ${ranking.status}`,
        "",
      );
    }

    // Look up google_property to get connection_id for OAuth
    const gbpProperty = await GooglePropertyModel.findByExternalId(
      ranking.gbp_location_id,
    );
    if (!gbpProperty) {
      return fail(
        res,
        400,
        "NO_GBP_PROPERTY",
        `GBP property ${ranking.gbp_location_id} not found`,
        "",
      );
    }

    // Get org domain
    const org = await OrganizationModel.findDomainById(ranking.organization_id);
    const domain = org?.domain || "";

    // Reset record
    await PracticeRankingModel.updateByIdRaw(rankingId, {
      status: "pending",
      run_reason: "retry",
      error_message: null,
      status_detail: JSON.stringify({
        currentStep: "queued",
        message: "Queued for retry...",
        progress: 0,
        stepsCompleted: [],
        timestamps: { retry_queued_at: new Date().toISOString() },
      }),
      updated_at: new Date(),
    });

    log(`Retry queued for ranking ${rankingId}`);

    // Background processing
    setImmediate(() => {
      runSingleRetryInBackground(
        rankingId,
        ranking,
        gbpProperty.google_connection_id,
        domain,
      ).catch((err) => {
        logError(`retryRanking background ${rankingId}`, err);
      });
    });

    return res.json({ success: true, rankingId, message: "Retry queued" });
  } catch (error: any) {
    logError("POST /retry/:id", error);
    return fail500(res, "RETRY_ERROR", error, "Failed to retry ranking");
  }
}

// POST /retry-batch/:batchId

export async function retryBatch(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { batchId } = req.params;

    const rankings = await PracticeRankingModel.findAllByBatchId(batchId);

    if (rankings.length === 0) {
      return fail(res, 404, "NOT_FOUND", `Batch ${batchId} not found`, "");
    }

    // Soft retry: only re-run failed/completed, skip pending/processing
    const retryable = rankings.filter(
      (r: any) => r.status === "failed" || r.status === "completed",
    );
    const skipped = rankings.filter(
      (r: any) => r.status === "pending" || r.status === "processing",
    );

    if (retryable.length === 0) {
      return fail(
        res,
        400,
        "NOTHING_TO_RETRY",
        "No failed or completed rankings to retry in this batch",
        "",
      );
    }

    // Reset retryable records
    const retryableIds = retryable.map((r: any) => r.id);
    await PracticeRankingModel.updateManyByIds(retryableIds, {
      status: "pending",
      run_reason: "retry",
      error_message: null,
      status_detail: JSON.stringify({
        currentStep: "queued",
        message: "Queued for batch retry...",
        progress: 0,
        stepsCompleted: [],
        timestamps: { retry_queued_at: new Date().toISOString() },
      }),
      updated_at: new Date(),
    });

    log(
      `Batch retry queued for ${batchId}: ${retryable.length} retryable, ${skipped.length} skipped`,
    );

    // Background processing
    setImmediate(() => {
      runBatchRetryInBackground(batchId, retryable).catch((err) => {
        logError(`retryBatch background ${batchId}`, err);
      });
    });

    return res.json({
      success: true,
      batchId,
      retryCount: retryable.length,
      skippedCount: skipped.length,
      message: `Retry queued for ${retryable.length} location(s)${
        skipped.length > 0
          ? `, ${skipped.length} still in progress`
          : ""
      }`,
    });
  } catch (error: any) {
    logError("POST /retry-batch/:batchId", error);
    return fail500(res, "RETRY_BATCH_ERROR", error, "Failed to retry batch");
  }
}

// GET /latest

export async function getLatestRankings(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { googleAccountId, locationId } = req.query;

    if (!googleAccountId) {
      return fail(res, 400, "MISSING_PARAMS", "googleAccountId is required", "");
    }

    const result = await getLatestRankingsForAccount(
      Number(googleAccountId),
      locationId ? Number(locationId) : null,
    );

    if (result.kind === "not-found-account") {
      return fail(
        res,
        404,
        "NOT_FOUND",
        "No completed ranking found for this account",
        "",
      );
    }

    if (result.kind === "not-found-batch") {
      return fail(
        res,
        404,
        "NOT_FOUND",
        "No completed rankings found in the latest batch",
        "",
      );
    }

    if (result.kind === "legacy") {
      // Return legacy single ranking in array format for consistency
      return res.json({
        success: true,
        rankings: [result.ranking],
      });
    }

    return res.json({
      success: true,
      batchId: result.batchId,
      rankings: result.rankings,
    });
  } catch (error: any) {
    logError("GET /latest", error);
    return fail500(res, "LATEST_ERROR", error, "Failed to get latest rankings");
  }
}

// GET /history

export async function getRankingHistory(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { googleAccountId, locationId, range } = req.query;

    if (!googleAccountId) {
      return fail(res, 400, "MISSING_PARAMS", "googleAccountId is required", "");
    }

    const orgId = Number(googleAccountId);
    if (!Number.isFinite(orgId) || orgId <= 0) {
      return fail(
        res,
        400,
        "INVALID_PARAMS",
        "googleAccountId must be a positive integer",
        "",
      );
    }

    let locId: number | null = null;
    if (locationId !== undefined && locationId !== null && locationId !== "") {
      locId = Number(locationId);
      if (!Number.isFinite(locId) || locId <= 0) {
        return fail(
          res,
          400,
          "INVALID_PARAMS",
          "locationId must be a positive integer",
          "",
        );
      }
    }

    const rangeStr = typeof range === "string" ? range : "6m";
    const months = rangeStr === "3m" ? 3 : 6;
    const intervalLiteral = months === 3 ? "3 months" : "6 months";

    const rankings = await getRankingHistoryData(orgId, intervalLiteral, locId);

    return res.json({
      success: true,
      rankings,
    });
  } catch (error: any) {
    logError("GET /history", error);
    return fail500(res, "HISTORY_ERROR", error, "Failed to get ranking history");
  }
}

// GET /in-flight — most-recent pending/processing ranking for an org (and
// optionally a specific location). The client dashboard uses this to auto-render
// the in-flight progress banner without needing a batchId in the URL.
// (v2 curated-competitor + Place Photo handlers live in LocationCompetitorController.)
// Spec: plans/04282026-no-ticket-rankings-auto-detect-in-flight-sticky/spec.md
export async function getInFlightRanking(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { googleAccountId, locationId } = req.query;
    if (!googleAccountId) {
      return fail(res, 400, "MISSING_PARAMS", "googleAccountId is required", "");
    }

    const filters: Record<string, unknown> = {
      organization_id: Number(googleAccountId),
    };
    if (locationId) filters.location_id = Number(locationId);

    const row = await PracticeRankingModel.findInFlightStatusRow(filters);

    if (!row) {
      return res.json({ success: true, ranking: null });
    }

    return res.json({
      success: true,
      ranking: {
        rankingId: row.id,
        batchId: row.batch_id,
        status: row.status,
        statusDetail: parseJsonField(row.status_detail),
        gbpLocationName: row.gbp_location_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    logError("GET /practice-ranking/in-flight", error);
    return fail500(
      res,
      "IN_FLIGHT_FETCH_FAILED",
      error,
      "Failed to fetch in-flight ranking",
    );
  }
}
