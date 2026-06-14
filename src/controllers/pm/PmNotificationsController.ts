import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { db } from "../../database/connection";
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

    const notifications = await db("pm_notifications as n")
      .leftJoin("users as u", "n.actor_user_id", "u.id")
      .where("n.user_id", userId)
      .orderBy("n.created_at", "desc")
      .limit(50)
      .select("n.*", "u.email as actor_email");

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

    await db("pm_notifications")
      .where({ user_id: userId, is_read: false })
      .update({ is_read: true });

    return res.json({ success: true, data: { updated: true } });
  } catch (error) {
    return handleError(res, error, "markAllRead");
  }
}

// DELETE /api/pm/notifications
export async function deleteAll(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = req.user!.userId;

    await db("pm_notifications").where("user_id", userId).delete();

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return handleError(res, error, "deleteAll");
  }
}
