import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { PmTaskModel } from "../../models/PmTaskModel";
import logger from "../../lib/logger";

function handleError(res: Response, error: unknown, operation: string): Response {
  logger.error({ err: error }, `[PM-TASK-VIEWS] ${operation} failed:`);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

function parseUserId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function getBacklogTasks(_req: AuthRequest, res: Response): Promise<any> {
  try {
    const groups = await PmTaskModel.listGlobalBacklogGroups();
    return res.json({ success: true, data: groups });
  } catch (error) {
    return handleError(res, error, "getBacklogTasks");
  }
}

export async function getAssignedTasks(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = parseUserId(req.params.userId);
    if (!userId) {
      return res.status(400).json({ success: false, error: "Valid userId is required" });
    }

    const groups = await PmTaskModel.listAssignedTaskGroups(userId);
    return res.json({ success: true, data: groups });
  } catch (error) {
    return handleError(res, error, "getAssignedTasks");
  }
}

export async function getMyTasks(req: AuthRequest, res: Response): Promise<any> {
  try {
    const groups = await PmTaskModel.listAssignedTaskGroups(req.user!.userId);
    return res.json({ success: true, data: groups });
  } catch (error) {
    return handleError(res, error, "getMyTasks");
  }
}
