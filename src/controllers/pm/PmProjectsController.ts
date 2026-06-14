import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { PmProjectModel } from "../../models/PmProjectModel";
import { PmColumnModel } from "../../models/PmColumnModel";
import { db } from "../../database/connection";
import { logPmActivity } from "./pmActivityLogger";
import logger from "../../lib/logger";

function handleError(res: Response, error: unknown, operation: string): Response {
  logger.error({ err: error }, `[PM-PROJECTS] ${operation} failed:`);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

const DEFAULT_COLUMNS = [
  { name: "Backlog", position: 0, is_backlog: true },
  { name: "To Do", position: 1, is_backlog: false },
  { name: "In Progress", position: 2, is_backlog: false },
  { name: "Done", position: 3, is_backlog: false },
];

// GET /api/pm/projects
export async function listProjects(req: AuthRequest, res: Response): Promise<any> {
  try {
    const status = (req.query.status as string) || "active";

    const projects = await db("pm_projects")
      .where({ status })
      .select("pm_projects.*")
      .select(
        db.raw(`(SELECT COUNT(*) FROM pm_tasks WHERE pm_tasks.project_id = pm_projects.id)::int AS total_tasks`)
      )
      .select(
        db.raw(`(SELECT COUNT(*) FROM pm_tasks WHERE pm_tasks.project_id = pm_projects.id AND pm_tasks.completed_at IS NOT NULL)::int AS completed_tasks`)
      )
      .select(
        db.raw(`(SELECT MAX(deadline) FROM pm_tasks WHERE pm_tasks.project_id = pm_projects.id AND pm_tasks.completed_at IS NULL AND deadline IS NOT NULL) AS latest_task_deadline`)
      )
      .orderBy("created_at", "desc");

    // Enrich each project with status breakdown + daily activity
    const enriched = await Promise.all(
      projects.map(async (p: any) => {
        // Tasks by status (column name)
        const statusCounts = await db("pm_tasks")
          .join("pm_columns", "pm_tasks.column_id", "pm_columns.id")
          .where("pm_tasks.project_id", p.id)
          .groupBy("pm_columns.name")
          .select("pm_columns.name")
          .count("* as count");

        const tasks_by_status: Record<string, number> = {
          backlog: 0,
          todo: 0,
          in_progress: 0,
          done: 0,
        };
        for (const row of statusCounts) {
          const key = (row.name as string)
            .toLowerCase()
            .replace(/\s+/g, "_");
          tasks_by_status[key] = parseInt(row.count as string, 10);
        }

        // Daily activity (last 90 days)
        const dailyActivity = await db("pm_activity_log")
          .where("project_id", p.id)
          .where("created_at", ">=", db.raw("NOW() - INTERVAL '90 days'"))
          .groupByRaw("DATE(created_at)")
          .select(db.raw("DATE(created_at) as date"))
          .count("* as count")
          .orderBy("date", "asc");

        return {
          ...p,
          effective_deadline: p.deadline || p.latest_task_deadline || null,
          tasks_by_status,
          daily_activity: dailyActivity.map((d: any) => ({
            date: d.date,
            count: parseInt(d.count as string, 10),
          })),
        };
      })
    );

    return res.json({ success: true, data: enriched });
  } catch (error) {
    return handleError(res, error, "listProjects");
  }
}

// POST /api/pm/projects
export async function createProject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { name, description, color, icon, deadline } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Project name is required" });
    }

    const project = await db.transaction(async (trx) => {
      const proj = await PmProjectModel.create(
        {
          name: name.trim(),
          description: description || null,
          color: color || "#D66853",
          icon: icon || "folder",
          deadline: deadline || null,
          status: "active",
          created_by: req.user!.userId,
        },
        trx
      );

      for (const col of DEFAULT_COLUMNS) {
        await PmColumnModel.create(
          { project_id: proj.id, name: col.name, position: col.position, is_backlog: col.is_backlog },
          trx
        );
      }

      await logPmActivity(
        {
          project_id: proj.id,
          user_id: req.user!.userId,
          action: "project_created",
        },
        trx
      );

      return proj;
    });

    return res.status(201).json({ success: true, data: project });
  } catch (error) {
    return handleError(res, error, "createProject");
  }
}

// GET /api/pm/projects/:id
export async function getProject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const project = await PmProjectModel.findById(id);

    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const columns = await db("pm_columns")
      .where({ project_id: id })
      .orderBy("position", "asc");

    const tasks = await db("pm_tasks")
      .select(
        "pm_tasks.*",
        "creators.email as creator_email",
        "assignees.email as assignee_email"
      )
      .leftJoin("users as creators", "pm_tasks.created_by", "creators.id")
      .leftJoin("users as assignees", "pm_tasks.assigned_to", "assignees.id")
      .where("pm_tasks.project_id", id)
      .orderBy("pm_tasks.position", "asc");

    const enrichedTasks = tasks.map((t: any) => ({
      ...t,
      creator_name: t.creator_email ? t.creator_email.split("@")[0] : null,
      assignee_name: t.assignee_email ? t.assignee_email.split("@")[0] : null,
    }));

    const columnsWithTasks = columns.map((col: any) => ({
      ...col,
      tasks: enrichedTasks.filter((t: any) => t.column_id === col.id),
    }));

    return res.json({
      success: true,
      data: { ...project, columns: columnsWithTasks },
    });
  } catch (error) {
    return handleError(res, error, "getProject");
  }
}

// PUT /api/pm/projects/:id
export async function updateProject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const existing = await PmProjectModel.findById(id);

    if (!existing) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const { name, description, color, icon, deadline, status } = req.body;
    const updates: Record<string, unknown> = {};

    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;
    if (icon !== undefined) updates.icon = icon;
    if (deadline !== undefined) updates.deadline = deadline;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "No fields to update" });
    }

    await PmProjectModel.updateById(id, updates);

    if (deadline !== undefined && deadline !== existing.deadline) {
      await logPmActivity({
        project_id: id,
        user_id: req.user!.userId,
        action: "deadline_changed",
        metadata: { old_value: existing.deadline, new_value: deadline },
      });
    }

    const updated = await PmProjectModel.findById(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, "updateProject");
  }
}

// DELETE /api/pm/projects/:id
export async function deleteProject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const existing = await PmProjectModel.findById(id);

    if (!existing) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    await logPmActivity({
      project_id: id,
      user_id: req.user!.userId,
      action: "project_deleted",
      metadata: { project_name: existing.name },
    });

    await PmProjectModel.deleteById(id);
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return handleError(res, error, "deleteProject");
  }
}

// PUT /api/pm/projects/:id/archive
export async function archiveProject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const existing = await PmProjectModel.findById(id);

    if (!existing) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const newStatus = existing.status === "archived" ? "active" : "archived";
    await PmProjectModel.updateById(id, { status: newStatus });

    const updated = await PmProjectModel.findById(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, "archiveProject");
  }
}
