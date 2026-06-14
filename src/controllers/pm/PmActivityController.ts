import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { PmActivityLogModel } from "../../models/PmActivityLogModel";
import logger from "../../lib/logger";

function handleError(res: Response, error: unknown, operation: string): Response {
  logger.error({ err: error }, `[PM-ACTIVITY] ${operation} failed:`);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

function enrichEntries(entries: any[]) {
  return entries.map((e: any) => ({
    ...e,
    metadata: typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata,
    user_email: e.user_email || null,
    user_name: e.user_email ? e.user_email.split("@")[0] : null,
    project: e.project_name
      ? { id: e.project_id, name: e.project_name, color: e.project_color }
      : null,
    task: e.task_title ? { id: e.task_id, title: e.task_title } : null,
  }));
}

// GET /api/pm/activity
export async function getGlobalActivity(req: AuthRequest, res: Response): Promise<any> {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const total = await PmActivityLogModel.countAll();

    const entries = await PmActivityLogModel.listGlobal(limit, offset);

    return res.json({ success: true, data: enrichEntries(entries), total });
  } catch (error) {
    return handleError(res, error, "getGlobalActivity");
  }
}

// GET /api/pm/activity/projects/:id/activity
export async function getProjectActivity(req: AuthRequest, res: Response): Promise<any> {
  try {
    const projectId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const total = await PmActivityLogModel.countAll({ project_id: projectId });

    const entries = await PmActivityLogModel.listByProject(projectId, limit, offset);

    return res.json({ success: true, data: enrichEntries(entries), total });
  } catch (error) {
    return handleError(res, error, "getProjectActivity");
  }
}

// DELETE /api/pm/activity — clear all activity
export async function clearActivity(_req: AuthRequest, res: Response): Promise<any> {
  try {
    const count = await PmActivityLogModel.deleteAll();
    return res.json({ success: true, data: { deleted: count } });
  } catch (error) {
    return handleError(res, error, "clearActivity");
  }
}

// GET /api/pm/tasks/:id/activity — task-level activity
export async function getTaskActivity(req: AuthRequest, res: Response): Promise<any> {
  try {
    const taskId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const total = await PmActivityLogModel.countAll({ task_id: taskId });

    const entries = await PmActivityLogModel.listByTask(taskId, limit, offset);

    return res.json({ success: true, data: enrichEntries(entries), total });
  } catch (error) {
    return handleError(res, error, "getTaskActivity");
  }
}
