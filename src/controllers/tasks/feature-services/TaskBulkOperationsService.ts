import { TaskModel } from "../../../models/TaskModel";
import type { ActionItemStatus } from "../feature-utils/taskValidation";
import * as TaskApprovalService from "./TaskApprovalService";
import logger from "../../../lib/logger";

/**
 * Bulk archive tasks by IDs.
 * Returns the count of archived records.
 */
export async function archiveTasks(
  taskIds: number[]
): Promise<{ count: number }> {
  logger.info(`[TASKS] Bulk archiving ${taskIds.length} task(s)`);

  const count = await TaskModel.bulkArchive(taskIds);

  logger.info(`[TASKS] Archived ${count} task(s)`);
  return { count };
}

/**
 * Bulk approve/unapprove tasks by IDs.
 * When approving, finds USER tasks that were not yet approved and sends
 * one notification per domain.
 * Returns the count of updated records.
 */
export async function approveTasks(
  taskIds: number[],
  isApproved: boolean
): Promise<{ count: number }> {
  logger.info(
    `[TASKS] Bulk ${isApproved ? "approving" : "unapproving"} ${taskIds.length} task(s)`
  );

  // If approving, find USER tasks not yet approved (for notifications)
  let userTasksToNotify: Array<{ organization_id: number; count: number }> = [];
  if (isApproved) {
    const tasksForNotification =
      await TaskModel.findUserTasksForApproval(taskIds);
    userTasksToNotify =
      TaskApprovalService.groupTasksByOrganization(tasksForNotification);
  }

  // Perform the bulk update
  const count = await TaskModel.bulkUpdateApproval(taskIds, isApproved);

  logger.info(`[TASKS] Updated ${count} task(s)`);

  // Send notifications (non-blocking for the approval result)
  if (isApproved && userTasksToNotify.length > 0) {
    await TaskApprovalService.createBulkApprovalNotifications(
      userTasksToNotify
    );
  }

  return { count };
}

/**
 * Bulk update task status by IDs.
 * TaskModel.bulkUpdateStatus handles completed_at when status is "complete".
 * Returns the count of updated records.
 */
export async function updateStatus(
  taskIds: number[],
  status: ActionItemStatus
): Promise<{ count: number }> {
  logger.info(`[TASKS] Bulk updating ${taskIds.length} task(s) to ${status}`);

  const count = await TaskModel.bulkUpdateStatus(taskIds, status);

  logger.info(`[TASKS] Updated ${count} task(s)`);
  return { count };
}
