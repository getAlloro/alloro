/**
 * Admin Agent Insights Controller
 *
 * Named function exports for all 8 admin agent insights endpoints.
 * Handles request/response, validation, logging, and delegates
 * business logic to feature services.
 */

import { Request, Response } from "express";
import { buildDateRange } from "./feature-utils/dateRangeBuilder";
import { parsePaginationParams } from "./feature-utils/paginationHelper";
import { isValidStatus } from "./feature-utils/statusMapper";
import * as summaryService from "./feature-services/summaryService";
import * as recommendationService from "./feature-services/recommendationService";
import * as governanceService from "./feature-services/governanceService";
import logger from "../../lib/logger";

// =====================================================================
// GET /summary
// =====================================================================

export async function getSummary(req: Request, res: Response): Promise<Response> {
  try {
    const { month } = req.query;
    const { page, limit } = parsePaginationParams(
      req.query.page as string,
      req.query.limit as string
    );

    const { startDate, endDate, endDateTime } = buildDateRange(month as string | undefined);

    logger.info(
      `[Admin Agent Insights] Fetching summary for ${startDate} to ${endDate}`
    );

    const result = await summaryService.fetchSummary(
      startDate,
      endDate,
      endDateTime,
      page,
      limit
    );

    if (result.message) {
      logger.info(
        "[Admin Agent Insights] No recommendations found for this period"
      );
    } else {
      logger.info(
        `[Admin Agent Insights] Found ${result.pagination.total} agent types with recommendations`
      );
      logger.info(
        `[Admin Agent Insights] Returning ${result.data.length} of ${result.pagination.total} agent types (page ${result.pagination.page})`
      );
    }

    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      period: result.period,
      ...(result.message ? { message: result.message } : {}),
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Insights] Error fetching summary:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch agent insights summary",
    });
  }
}

// =====================================================================
// GET /:agentType/recommendations
// =====================================================================

export async function getRecommendations(req: Request, res: Response): Promise<Response> {
  try {
    const { agentType } = req.params;
    const {
      month,
      source = "all",
      status = "all",
    } = req.query;
    const { page, limit } = parsePaginationParams(
      req.query.page as string,
      req.query.limit as string
    );

    logger.info(
      `[Admin Agent Insights] Fetching recommendations for ${agentType}, month=${
        month || "all"
      }, source=${source}, status=${status}, page=${page}`
    );

    const result = await recommendationService.fetchRecommendations(
      agentType,
      month as string | undefined,
      source as string,
      status as string,
      page,
      limit
    );

    logger.info(
      `[Admin Agent Insights] Found ${result.data.length} of ${result.pagination.total} recommendations (page ${page})`
    );

    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Insights] Error fetching recommendations:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch recommendations",
    });
  }
}

// =====================================================================
// PATCH /recommendations/:id
// =====================================================================

export async function updateRecommendation(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !isValidStatus(status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "Status must be PASS, REJECT, or IGNORE",
      });
    }

    logger.info(
      `[Admin Agent Insights] Updating recommendation ${id} to status ${status}`
    );

    const result = await recommendationService.updateRecommendationStatus(id, status);

    logger.info(`[Admin Agent Insights] Updated recommendation ${id}`);

    return res.json({
      success: true,
      message: "Recommendation status updated successfully",
      data: result,
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Recommendation not found",
      });
    }
    logger.error({ err: error }, "[Admin Agent Insights] Error updating recommendation:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update recommendation",
    });
  }
}

// =====================================================================
// PATCH /:agentType/recommendations/mark-all-pass
// =====================================================================

export async function markAllPass(req: Request, res: Response): Promise<Response> {
  try {
    const { agentType } = req.params;
    const { source } = req.query;

    logger.info(
      `[Admin Agent Insights] Marking all recommendations as PASS for ${agentType}${
        source ? ` (source: ${source})` : ""
      }`
    );

    const result = await recommendationService.markAllAsPass(
      agentType,
      source as string | undefined
    );

    logger.info(
      `[Admin Agent Insights] Marked ${result.updated} recommendation(s) as PASS`
    );

    return res.json({
      success: true,
      message: `Marked ${result.updated} recommendation(s) as PASS`,
      data: result,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Insights] Error marking all as PASS:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to mark recommendations as PASS",
    });
  }
}

// =====================================================================
// DELETE /recommendations/bulk-delete
// =====================================================================

export async function bulkDeleteRecommendations(req: Request, res: Response): Promise<Response> {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Must provide an array of recommendation IDs",
      });
    }

    logger.info(
      `[Admin Agent Insights] Bulk deleting ${ids.length} recommendation(s)`
    );

    const result = await recommendationService.bulkDelete(ids);

    logger.info(
      `[Admin Agent Insights] Deleted ${result.deleted} recommendation(s)`
    );

    return res.json({
      success: true,
      message: `Deleted ${result.deleted} recommendation(s)`,
      data: result,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Insights] Error bulk deleting recommendations:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete recommendations",
    });
  }
}

// =====================================================================
// DELETE /clear-month-data
// =====================================================================

export async function clearMonthData(req: Request, res: Response): Promise<Response> {
  try {
    const { month } = req.query;
    const { startDate, endDate, endDateTime } = buildDateRange(month as string | undefined);

    logger.info(
      `[Admin Agent Insights] Clearing Guardian/Governance data for ${startDate} to ${endDate}`
    );

    const result = await recommendationService.clearMonthData(
      startDate,
      endDate,
      endDateTime
    );

    logger.info(
      `[Admin Agent Insights] Deleted ${result.deletedResults} agent results and ${result.deletedRecommendations} recommendations`
    );

    return res.json({
      success: true,
      message: `Cleared Guardian and Governance data for ${startDate} to ${endDate}`,
      data: {
        deletedResults: result.deletedResults,
        deletedRecommendations: result.deletedRecommendations,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Insights] Error clearing month data:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to clear month data",
    });
  }
}

// =====================================================================
// GET /:agentType/governance-ids
// =====================================================================

export async function getGovernanceIds(req: Request, res: Response): Promise<Response> {
  try {
    const { agentType } = req.params;

    logger.info(
      `[Admin Agent Insights] Fetching governance recommendation IDs for ${agentType}`
    );

    const result = await governanceService.fetchGovernanceIds(agentType);

    logger.info(
      `[Admin Agent Insights] Found ${result.passed.length} PASS and ${result.rejected.length} REJECT recommendations for ${agentType}`
    );

    return res.json({
      success: true,
      passed: result.passed,
      rejected: result.rejected,
      counts: result.counts,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Insights] Error fetching governance IDs:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message:
        error?.message || "Failed to fetch governance recommendation IDs",
    });
  }
}

// =====================================================================
// POST /by-ids
// =====================================================================

export async function getByIds(req: Request, res: Response): Promise<Response> {
  try {
    logger.info("reached here");
    const { passed, rejected } = req.body;

    if (!passed && !rejected) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Must provide passed and/or rejected arrays",
      });
    }

    logger.info(
      `[Admin Agent Insights] Fetching recommendations: ${
        passed?.length || 0
      } passed, ${rejected?.length || 0} rejected`
    );

    const result = await governanceService.fetchByIds(passed, rejected);

    logger.info(
      `[Admin Agent Insights] Found ${result.passed.length} passed and ${result.rejected.length} rejected recommendation(s)`
    );

    return res.json({
      success: true,
      passed: result.passed,
      rejected: result.rejected,
      counts: result.counts,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Insights] Error fetching recommendations by IDs:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch recommendations",
    });
  }
}
