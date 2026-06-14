import { Request, Response } from "express";
import { TaskModel } from "../../models/TaskModel";
import { GoogleConnectionModel } from "../../models/GoogleConnectionModel";
import { db } from "../../database/connection";
import { resolveLocationId } from "../../utils/locationResolver";
import { LocationScopedRequest } from "../../middleware/rbac";
import * as TaskFilteringService from "./feature-services/TaskFilteringService";
import * as TaskBulkOperationsService from "./feature-services/TaskBulkOperationsService";
import * as TaskApprovalService from "./feature-services/TaskApprovalService";
import {
  validateTaskId,
  validateCategory,
  validateCreateRequest,
  validateGoogleAccountId,
  validateBulkTaskIds,
  validateBulkApproval,
  validateBulkStatus,
} from "./feature-utils/taskValidation";
import {
  formatGroupedTasks,
  formatTasksResponse,
} from "./feature-utils/taskResponseFormatters";
import type {
  ActionItemStatus,
  CreateActionItemRequest,
  UpdateActionItemRequest,
} from "./feature-utils/taskValidation";
import logger from "../../lib/logger";

// =====================================================================
// Error handler (preserves original handleError response shape)
// =====================================================================

function handleError(res: Response, error: any, operation: string): Response {
  logger.error({ err: error?.message || error }, `[TASKS] ${operation} Error:`);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
}

// =====================================================================
// CLIENT ENDPOINTS (Domain-Filtered)
// =====================================================================

/**
 * GET /api/tasks
 * Fetch tasks for logged-in client (grouped by category)
 */
export async function getTasksForClient(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const scopedReq = req as LocationScopedRequest;
    const organizationId = scopedReq.organizationId;

    // Prefer org-based query if available (from RBAC middleware)
    if (organizationId) {
      const locationId = scopedReq.locationId || null;
      const accessibleLocationIds = scopedReq.accessibleLocationIds;

      logger.info(`[TASKS] Fetching tasks for org: ${organizationId}, location: ${locationId || "all"}`);

      const tasks = await TaskModel.findByOrganizationApproved(
        organizationId,
        { locationId, accessibleLocationIds }
      );

      const response = formatGroupedTasks(tasks);
      const alloroCount = response.tasks.ALLORO.length;
      const userCount = response.tasks.USER.length;
      logger.info(`[TASKS] Fetched ${alloroCount} ALLORO tasks and ${userCount} USER tasks for org ${organizationId}`);

      return res.json(response);
    }

    // Backward compat: fall back to googleAccountId → organization lookup
    const googleAccountId = req.query.googleAccountId || req.query.organizationId;

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "Missing google account ID",
        message: "googleAccountId is required",
      });
    }

    const connection = await GoogleConnectionModel.findById(Number(googleAccountId));
    if (!connection || !connection.organization_id) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
        message: "Google account not found or has no organization",
      });
    }

    logger.info(`[TASKS] Fetching tasks for org: ${connection.organization_id} (via legacy googleAccountId)`);

    const tasks = await TaskModel.findByOrganizationApproved(connection.organization_id);
    const response = formatGroupedTasks(tasks);

    const alloroCount = response.tasks.ALLORO.length;
    const userCount = response.tasks.USER.length;
    logger.info(
      `[TASKS] Fetched ${alloroCount} ALLORO tasks and ${userCount} USER tasks for org ${connection.organization_id}`
    );

    return res.json(response);
  } catch (error: any) {
    return handleError(res, error, "Fetch tasks");
  }
}

/**
 * PATCH /api/tasks/:id/complete
 * Mark a USER category task as complete (clients only)
 */
export async function completeTask(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const taskIdValidation = validateTaskId(req.params.id);
    if (!taskIdValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID",
        message: taskIdValidation.error,
      });
    }

    const taskId = parseInt(req.params.id, 10);
    const scopedReq = req as LocationScopedRequest;
    const organizationId = scopedReq.organizationId;

    // Prefer org-based ownership check
    if (organizationId) {
      const task = await TaskModel.findByIdAndOrganization(taskId, organizationId);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
          message: "Task does not exist or does not belong to your organization",
        });
      }

      if (task.category !== "USER") {
        return res.status(403).json({
          success: false,
          error: "Cannot complete task",
          message: "Only USER category tasks can be marked complete by clients",
        });
      }

      const updatedTask = await TaskModel.markComplete(taskId);
      logger.info(`[TASKS] Task ${taskId} marked complete for org ${organizationId}`);
      return res.json({ success: true, task: updatedTask, message: "Task marked as complete" });
    }

    // Backward compat: fall back to googleAccountId → organization lookup
    const { googleAccountId } = req.body;

    const accountValidation = validateGoogleAccountId(googleAccountId);
    if (!accountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Missing google account ID",
        message: accountValidation.error,
      });
    }

    const connection = await GoogleConnectionModel.findById(googleAccountId);
    if (!connection || !connection.organization_id) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
        message: "Google account not found or has no organization",
      });
    }

    const task = await TaskModel.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
        message: "Task does not exist",
      });
    }

    if (task.organization_id !== connection.organization_id) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
        message: "Task does not belong to your organization",
      });
    }

    if (task.category !== "USER") {
      return res.status(403).json({
        success: false,
        error: "Cannot complete task",
        message: "Only USER category tasks can be marked complete by clients",
      });
    }

    const updatedTask = await TaskModel.markComplete(taskId);
    logger.info(`[TASKS] Task ${taskId} marked complete for org ${connection.organization_id}`);

    return res.json({
      success: true,
      task: updatedTask,
      message: "Task marked as complete",
    });
  } catch (error: any) {
    return handleError(res, error, "Mark task complete");
  }
}

// =====================================================================
// ADMIN ENDPOINTS (Unrestricted Access)
// =====================================================================

/**
 * POST /api/tasks
 * Create a new task (admin only)
 */
export async function createTask(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const {
      organization_id,
      location_id,
      title,
      description,
      category,
      is_approved = false,
      due_date,
      metadata,
    }: CreateActionItemRequest = req.body;

    // Validation
    const createValidation = validateCreateRequest(req.body);
    if (!createValidation.isValid) {
      // Determine the right error key based on what's missing
      const errorKey =
        !title || !category
          ? "Missing required fields"
          : "Invalid category";
      return res.status(400).json({
        success: false,
        error: errorKey,
        message: createValidation.error,
      });
    }

    const resolvedOrgId = organization_id || null;

    if (!resolvedOrgId) {
      return res.status(400).json({
        success: false,
        error: "Missing organization",
        message: "organization_id is required",
      });
    }

    // Use provided location_id or resolve from organization
    const locationId = location_id ? Number(location_id) : await resolveLocationId(resolvedOrgId);

    // Create task via model (handles timestamps and JSON serialization)
    const createdTask = await TaskModel.create({
      organization_id: resolvedOrgId,
      location_id: locationId,
      title,
      description: description || null,
      category,
      status: "pending" as ActionItemStatus,
      is_approved,
      created_by_admin: true,
      due_date: due_date ? new Date(due_date) : null,
      metadata: metadata || null,
    });

    logger.info(
      `[TASKS] Created task ${createdTask.id} for org ${resolvedOrgId}`
    );

    return res.status(201).json({
      success: true,
      task: createdTask,
      message: "Task created successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Create task");
  }
}

/**
 * GET /api/tasks/admin/all
 * Fetch all tasks with filtering (admin dashboard)
 */
export async function getAdminTasks(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { tasks, total } = await TaskFilteringService.getAdminTasks(
      req.query as Record<string, any>
    );

    const response = formatTasksResponse(tasks, total);
    return res.json(response);
  } catch (error: any) {
    return handleError(res, error, "Fetch all tasks (admin)");
  }
}

/**
 * PATCH /api/tasks/:id
 * Update a task (admin only)
 */
export async function updateTask(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const taskIdValidation = validateTaskId(req.params.id);
    if (!taskIdValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID",
        message: taskIdValidation.error,
      });
    }

    const taskId = parseInt(req.params.id, 10);
    const updates: UpdateActionItemRequest = req.body;

    // Check if task exists
    const task = await TaskModel.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
        message: "Task does not exist",
      });
    }

    // Build update object (only include fields that are present)
    const updateData: Partial<Record<string, unknown>> = {};

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.status !== undefined) {
      updateData.status = updates.status;
      // Set completed_at if status is complete and not already completed
      if (updates.status === "complete" && !task.completed_at) {
        updateData.completed_at = new Date();
      }
    }
    if (updates.is_approved !== undefined)
      updateData.is_approved = updates.is_approved;
    if (updates.due_date !== undefined)
      updateData.due_date = updates.due_date
        ? new Date(updates.due_date)
        : null;
    if (updates.metadata !== undefined)
      updateData.metadata = updates.metadata;

    // Track if approval status is changing to true for USER tasks
    const wasApprovedBefore = task.is_approved;

    // Update task (model handles updated_at and JSON serialization)
    await TaskModel.updateById(taskId, updateData);

    const updatedTask = await TaskModel.findById(taskId);

    // Handle approval notification for USER tasks
    if (updates.is_approved === true && task.organization_id) {
      await TaskApprovalService.handleApprovalNotification(
        task,
        wasApprovedBefore
      );
    }

    logger.info(`[TASKS] Updated task ${taskId}`);

    return res.json({
      success: true,
      task: updatedTask,
      message: "Task updated successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Update task");
  }
}

/**
 * PATCH /api/tasks/:id/category
 * Update task category (admin only)
 */
export async function updateCategory(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const taskIdValidation = validateTaskId(req.params.id);
    if (!taskIdValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID",
        message: taskIdValidation.error,
      });
    }

    const taskId = parseInt(req.params.id, 10);
    const { category } = req.body;

    const categoryValidation = validateCategory(category);
    if (!categoryValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid category",
        message: categoryValidation.error,
      });
    }

    // Check if task exists
    const task = await TaskModel.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
        message: "Task does not exist",
      });
    }

    // Update category (model handles updated_at)
    await TaskModel.updateById(taskId, { category });

    const updatedTask = await TaskModel.findById(taskId);

    logger.info(`[TASKS] Updated task ${taskId} category to ${category}`);

    return res.json({
      success: true,
      task: updatedTask,
      message: `Task category updated to ${category} successfully`,
    });
  } catch (error: any) {
    return handleError(res, error, "Update task category");
  }
}

/**
 * DELETE /api/tasks/:id
 * Archive a task (soft delete)
 */
export async function archiveTask(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const taskIdValidation = validateTaskId(req.params.id);
    if (!taskIdValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID",
        message: taskIdValidation.error,
      });
    }

    const taskId = parseInt(req.params.id, 10);

    // Check if task exists
    const task = await TaskModel.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
        message: "Task does not exist",
      });
    }

    // Archive the task (soft delete)
    await TaskModel.archive(taskId);

    logger.info(`[TASKS] Archived task ${taskId}`);

    return res.json({
      success: true,
      message: "Task archived successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Archive task");
  }
}

/**
 * GET /api/tasks/clients
 * Get list of available clients for task creation dropdown
 */
export async function getClients(
  _req: Request,
  res: Response
): Promise<Response> {
  try {
    logger.info("[TASKS] Fetching available clients");

    const accounts = await db("google_connections as gc")
      .join("organizations as o", "gc.organization_id", "o.id")
      .where("o.onboarding_completed", true)
      .select("gc.id", "o.domain as domain_name", "gc.email")
      .orderBy("o.domain", "asc");

    logger.info(`[TASKS] Found ${accounts.length} onboarded clients`);

    return res.json({
      success: true,
      clients: accounts,
      total: accounts.length,
    });
  } catch (error: any) {
    return handleError(res, error, "Fetch clients");
  }
}

/**
 * POST /api/tasks/bulk/delete
 * Bulk archive tasks
 */
export async function bulkArchive(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { taskIds } = req.body;

    const validation = validateBulkTaskIds(taskIds);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid task IDs",
        message: validation.error,
      });
    }

    const { count } = await TaskBulkOperationsService.archiveTasks(taskIds);

    return res.json({
      success: true,
      message: `${count} task(s) archived successfully`,
      count,
    });
  } catch (error: any) {
    return handleError(res, error, "Bulk archive tasks");
  }
}

/**
 * POST /api/tasks/bulk/approve
 * Bulk approve/unapprove tasks
 */
export async function bulkApprove(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { taskIds, is_approved } = req.body;

    // Validate taskIds
    const taskIdsValidation = validateBulkTaskIds(taskIds);
    if (!taskIdsValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid task IDs",
        message: taskIdsValidation.error,
      });
    }

    // Validate is_approved
    if (typeof is_approved !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "Invalid approval status",
        message: "is_approved must be a boolean",
      });
    }

    const { count } = await TaskBulkOperationsService.approveTasks(
      taskIds,
      is_approved
    );

    return res.json({
      success: true,
      message: `${count} task(s) ${
        is_approved ? "approved" : "unapproved"
      } successfully`,
      count,
    });
  } catch (error: any) {
    return handleError(res, error, "Bulk approve tasks");
  }
}

/**
 * POST /api/tasks/bulk/status
 * Bulk update task status
 */
export async function bulkUpdateStatus(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { taskIds, status } = req.body;

    // Validate taskIds
    const taskIdsValidation = validateBulkTaskIds(taskIds);
    if (!taskIdsValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid task IDs",
        message: taskIdsValidation.error,
      });
    }

    // Validate status
    if (
      !["pending", "in_progress", "complete", "archived"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid status",
        message: "status must be pending, in_progress, complete, or archived",
      });
    }

    const { count } = await TaskBulkOperationsService.updateStatus(
      taskIds,
      status
    );

    return res.json({
      success: true,
      message: `${count} task(s) updated to ${status} successfully`,
      count,
    });
  } catch (error: any) {
    return handleError(res, error, "Bulk update task status");
  }
}

// =====================================================================
// HEALTH CHECK
// =====================================================================

/**
 * GET /api/tasks/health
 * Health check endpoint
 */
export function healthCheck(_req: Request, res: Response): Response {
  return res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
