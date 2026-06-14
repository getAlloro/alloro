import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { PmNotificationModel } from "../../models/PmNotificationModel";
import logger from "../../lib/logger";

function handleError(res: Response, error: unknown, operation: string): Response {
  logger.error({ err: error }, `[PM-NOTIFICATIONS] ${operation} failed:`);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

// GET /api/pm/notifications
export async function getNotifications(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = req.user!.userId;

    const notifications = await PmNotificationModel.listForUserWithActorEmail(userId);

    const enriched = notifications.map((n: any) => {
      const hasActorName = n.metadata?.actor_name;
      if (!hasActorName && n.actor_email) {
        return {
          ...n,
          actor_email: undefined,
          metadata: { ...(n.metadata ?? {}), actor_name: n.actor_email.split("@")[0] },
        };
      }
      const { actor_email: _, ...rest } = n;
      return rest;
    });

    return res.json({ success: true, data: enriched });
  } catch (error) {
    return handleError(res, error, "getNotifications");
  }
}

// PUT /api/pm/notifications/read-all
export async function markAllRead(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = req.user!.userId;

    await PmNotificationModel.markAllReadForUser(userId);

    return res.json({ success: true, data: { updated: true } });
  } catch (error) {
    return handleError(res, error, "markAllRead");
  }
}

// DELETE /api/pm/notifications
export async function deleteAll(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = req.user!.userId;

    await PmNotificationModel.deleteAllForUser(userId);

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return handleError(res, error, "deleteAll");
  }
}
