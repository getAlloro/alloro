import { createNotification } from "../../../utils/core/notificationHelper";
import type { ITask } from "../../../models/TaskModel";
import logger from "../../../lib/logger";

/**
 * Handle notification when a single USER task is approved.
 * Only sends notification when a USER-category task transitions from
 * is_approved=false to is_approved=true.
 *
 * Notification failure does NOT fail the parent operation.
 */
export async function handleApprovalNotification(
  task: ITask,
  wasApprovedBefore: boolean
): Promise<void> {
  const isApprovingUserTask =
    !wasApprovedBefore && task.category === "USER";

  if (!isApprovingUserTask || !task.organization_id) {
    return;
  }

  try {
    await createNotification(
      task.organization_id,
      "New Task Approved",
      "A new opportunity awaits your action! Visit the tasks tab to see more",
      "task",
      { taskId: task.id, taskTitle: task.title },
      { locationId: task.location_id }
    );
    logger.info(
      `[TASKS] Created notification for approved USER task ${task.id}`
    );
  } catch (notificationError: any) {
    logger.error(
      `[TASKS] Failed to create notification: ${notificationError.message}`
    );
    // Don't fail the update if notification creation fails
  }
}

/**
 * Create notifications for bulk-approved USER tasks.
 * Groups by organization and sends one notification per org.
 * Handles singular/plural messaging.
 *
 * Notification failure for any org does NOT fail the parent operation.
 */
export async function createBulkApprovalNotifications(
  userTasksByOrg: Array<{ organization_id: number; count: number }>
): Promise<void> {
  for (const { organization_id, count } of userTasksByOrg) {
    try {
      const message =
        count === 1
          ? "A new opportunity awaits your action! Visit the tasks tab to see more"
          : `${count} new opportunities awaiting your action! Visit tasks to see more`;

      await createNotification(
        organization_id,
        count === 1 ? "New Task Approved" : "New Tasks Approved",
        message,
        "task",
        { taskCount: count }
      );
      logger.info(
        `[TASKS] Created notification for ${count} approved USER task(s) for org ${organization_id}`
      );
    } catch (notificationError: any) {
      logger.error(
        `[TASKS] Failed to create notification for org ${organization_id}: ${notificationError.message}`
      );
      // Don't fail the approval if notification creation fails
    }
  }
}

/**
 * Group an array of tasks by organization_id and return counts per org.
 * Used by bulk approval to determine how many notifications to send per org.
 */
export function groupTasksByOrganization(
  tasks: Array<{ organization_id: number | null }>
): Array<{ organization_id: number; count: number }> {
  const orgCounts = tasks.reduce(
    (acc: Record<number, number>, task) => {
      if (task.organization_id) {
        acc[task.organization_id] = (acc[task.organization_id] || 0) + 1;
      }
      return acc;
    },
    {} as Record<number, number>
  );

  return Object.entries(orgCounts).map(([orgId, count]) => ({
    organization_id: parseInt(orgId, 10),
    count: count as number,
  }));
}
