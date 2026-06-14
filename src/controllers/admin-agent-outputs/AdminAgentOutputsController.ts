/**
 * Admin Agent Outputs Controller
 *
 * Named function exports for all 11 admin agent output endpoints.
 * Handles request/response, validation, logging, and delegates
 * business logic to feature services.
 */

import { Request, Response } from "express";
import { AgentResultModel } from "../../models/AgentResultModel";
import { OrganizationModel } from "../../models/OrganizationModel";
import * as listService from "./feature-services/AgentOutputListService";
import * as archiveService from "./feature-services/AgentOutputArchiveService";
import * as deleteService from "./feature-services/AgentOutputDeleteService";
import * as bulkService from "./feature-services/AgentOutputBulkService";
import * as statsService from "./feature-services/AgentOutputStatsService";
import { validateBulkIds } from "./feature-utils/validateBulkIds";
import logger from "../../lib/logger";

// =====================================================================
// GET / — List outputs with pagination + filters
// =====================================================================

export async function listOutputs(req: Request, res: Response): Promise<Response> {
  try {
    logger.info({ detail: req.query }, "[Admin Agent Outputs] Fetching with filters:");

    const result = await listService.list(
      req.query as listService.ListAgentOutputsParams
    );

    logger.info(
      `[Admin Agent Outputs] Found ${result.data.length} of ${result.pagination.total} outputs (page ${result.pagination.page})`
    );

    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Outputs] Error fetching outputs:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch agent outputs",
    });
  }
}

// =====================================================================
// GET /organizations — List organizations for filter dropdown
// =====================================================================

export async function getOrganizations(_req: Request, res: Response): Promise<Response> {
  try {
    logger.info("[Admin Agent Outputs] Fetching organizations for filter");

    const organizations = await OrganizationModel.listAll();

    logger.info(
      `[Admin Agent Outputs] Found ${organizations.length} organizations`
    );

    return res.json({
      success: true,
      organizations: organizations.map((org) => ({
        id: org.id,
        name: org.name,
      })),
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Outputs] Error fetching organizations:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch organizations",
    });
  }
}

// =====================================================================
// GET /agent-types — List unique agent types
// =====================================================================

export async function getAgentTypes(_req: Request, res: Response): Promise<Response> {
  try {
    logger.info("[Admin Agent Outputs] Fetching unique agent types");

    const agentTypes = await AgentResultModel.listAgentTypes();

    logger.info(
      `[Admin Agent Outputs] Found ${agentTypes.length} unique agent types`
    );

    return res.json({
      success: true,
      agentTypes,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Outputs] Error fetching agent types:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch agent types",
    });
  }
}

// =====================================================================
// GET /stats — Get summary stats
// =====================================================================

export async function getSummaryStats(_req: Request, res: Response): Promise<Response> {
  try {
    logger.info("[Admin Agent Outputs] Fetching summary statistics");

    const stats = await statsService.getSummary();

    logger.info("[Admin Agent Outputs] Summary statistics fetched");

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Outputs] Error fetching stats:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch statistics",
    });
  }
}

// =====================================================================
// GET /:id — Get single output with details
// =====================================================================

export async function getOutputById(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;

    logger.info(`[Admin Agent Outputs] Fetching output ID: ${id}`);

    const output = await AgentResultModel.findByIdWithDetails(parseInt(id, 10));

    if (!output) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Agent output not found",
      });
    }

    logger.info(`[Admin Agent Outputs] Found output ID: ${id}`);

    return res.json({
      success: true,
      data: output,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Outputs] Error fetching output:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch agent output",
    });
  }
}

// =====================================================================
// PATCH /:id/archive — Archive output
// =====================================================================

export async function archiveOutput(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const idNum = parseInt(id, 10);

    logger.info(`[Admin Agent Outputs] Archiving output ID: ${id}`);

    await archiveService.archiveSingle(idNum);

    logger.info(`[Admin Agent Outputs] Archived output ID: ${id}`);

    return res.json({
      success: true,
      message: "Agent output archived successfully",
      data: { id: idNum, status: "archived" },
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: error.errorCode || "NOT_FOUND",
        message: error.message,
      });
    }

    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: error.errorCode || "ALREADY_ARCHIVED",
        message: error.message,
      });
    }

    logger.error({ err: error }, "[Admin Agent Outputs] Error archiving output:");
    return res.status(500).json({
      success: false,
      error: "ARCHIVE_ERROR",
      message: error?.message || "Failed to archive agent output",
    });
  }
}

// =====================================================================
// PATCH /:id/unarchive — Unarchive output
// =====================================================================

export async function unarchiveOutput(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const idNum = parseInt(id, 10);

    logger.info(`[Admin Agent Outputs] Unarchiving output ID: ${id}`);

    await archiveService.unarchiveSingle(idNum);

    logger.info(`[Admin Agent Outputs] Unarchived output ID: ${id}`);

    return res.json({
      success: true,
      message: "Agent output restored successfully",
      data: { id: idNum, status: "success" },
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: error.errorCode || "NOT_FOUND",
        message: error.message,
      });
    }

    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: error.errorCode || "NOT_ARCHIVED",
        message: error.message,
      });
    }

    logger.error({ err: error }, "[Admin Agent Outputs] Error unarchiving output:");
    return res.status(500).json({
      success: false,
      error: "UNARCHIVE_ERROR",
      message: error?.message || "Failed to unarchive agent output",
    });
  }
}

// =====================================================================
// DELETE /:id — Delete output
// =====================================================================

export async function deleteOutput(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const idNum = parseInt(id, 10);

    logger.info(`[Admin Agent Outputs] Deleting output ID: ${id}`);

    await deleteService.deleteSingle(idNum);

    logger.info(`[Admin Agent Outputs] Permanently deleted output ID: ${id}`);

    return res.json({
      success: true,
      message: "Agent output permanently deleted",
      data: { id: idNum },
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: error.errorCode || "NOT_FOUND",
        message: error.message,
      });
    }

    logger.error({ err: error }, "[Admin Agent Outputs] Error deleting output:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete agent output",
    });
  }
}

// =====================================================================
// POST /bulk-archive — Bulk archive
// =====================================================================

export async function bulkArchive(req: Request, res: Response): Promise<Response> {
  try {
    const validation = validateBulkIds(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: validation.error,
      });
    }

    logger.info(
      `[Admin Agent Outputs] Bulk archiving ${validation.ids!.length} output(s)`
    );

    const updated = await bulkService.bulkArchive(validation.ids!);

    logger.info(`[Admin Agent Outputs] Archived ${updated} output(s)`);

    return res.json({
      success: true,
      message: `${updated} output(s) archived successfully`,
      data: { archived: updated },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Outputs] Error bulk archiving:");
    return res.status(500).json({
      success: false,
      error: "BULK_ARCHIVE_ERROR",
      message: error?.message || "Failed to bulk archive outputs",
    });
  }
}

// =====================================================================
// POST /bulk-unarchive — Bulk unarchive
// =====================================================================

export async function bulkUnarchive(req: Request, res: Response): Promise<Response> {
  try {
    const validation = validateBulkIds(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: validation.error,
      });
    }

    logger.info(
      `[Admin Agent Outputs] Bulk unarchiving ${validation.ids!.length} output(s)`
    );

    const updated = await bulkService.bulkUnarchive(validation.ids!);

    logger.info(`[Admin Agent Outputs] Unarchived ${updated} output(s)`);

    return res.json({
      success: true,
      message: `${updated} output(s) restored successfully`,
      data: { unarchived: updated },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Outputs] Error bulk unarchiving:");
    return res.status(500).json({
      success: false,
      error: "BULK_UNARCHIVE_ERROR",
      message: error?.message || "Failed to bulk unarchive outputs",
    });
  }
}

// =====================================================================
// POST /bulk-delete — Bulk delete
// =====================================================================

export async function bulkDelete(req: Request, res: Response): Promise<Response> {
  try {
    const validation = validateBulkIds(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: validation.error,
      });
    }

    logger.info(
      `[Admin Agent Outputs] Bulk deleting ${validation.ids!.length} output(s)`
    );

    const deleted = await bulkService.bulkDelete(validation.ids!);

    logger.info(
      `[Admin Agent Outputs] Permanently deleted ${deleted} output(s)`
    );

    return res.json({
      success: true,
      message: `${deleted} output(s) permanently deleted`,
      data: { deleted },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Agent Outputs] Error bulk deleting:");
    return res.status(500).json({
      success: false,
      error: "BULK_DELETE_ERROR",
      message: error?.message || "Failed to bulk delete outputs",
    });
  }
}
