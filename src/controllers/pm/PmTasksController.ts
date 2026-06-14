import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { PmTaskModel } from "../../models/PmTaskModel";
import { PmColumnModel } from "../../models/PmColumnModel";
import { db } from "../../database/connection";
import { logPmActivity } from "./pmActivityLogger";
import { deleteFromS3 } from "../../utils/core/s3";
import type { QueryContext } from "../../models/BaseModel";
import logger from "../../lib/logger";

/**
 * Fire-and-log S3 cleanup for the given attachment S3 keys.
 *
 * The DB rows are removed via FK ON DELETE CASCADE when the task is deleted,
 * but S3 has no such cascade — we must delete each object individually.
 * Failures are logged but do not throw; an S3 failure must not block the
 * task delete from completing.
 */
async function cleanupAttachmentS3Objects(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;
  const rows: Array<{ s3_key: string }> = await db("pm_task_attachments")
    .whereIn("task_id", taskIds)
    .select("s3_key");
  if (rows.length === 0) return;
  const results = await Promise.allSettled(
    rows.map((r) => deleteFromS3(r.s3_key))
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      logger.error({ err: r.reason }, `[PM-TASKS] Failed to delete S3 object ${rows[i].s3_key}:`);
    }
  });
}

async function insertNotification(
  ctx: QueryContext,
  payload: {
    user_id: number;
    type: "task_assigned" | "task_unassigned" | "assignee_completed_task";
    task_id: string;
    actor_user_id: number;
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  await (ctx as any)("pm_notifications").insert(payload);
}

function handleError(res: Response, error: unknown, operation: string): Response {
  logger.error({ err: error }, `[PM-TASKS] ${operation} failed:`);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

async function enrichTask(task: any): Promise<any> {
  const row = await db("pm_tasks")
    .where("pm_tasks.id", task.id)
    .leftJoin("users as creators", "pm_tasks.created_by", "creators.id")
    .leftJoin("users as assignees", "pm_tasks.assigned_to", "assignees.id")
    .select(
      "pm_tasks.*",
      "creators.email as creator_email",
      "assignees.email as assignee_email"
    )
    .first();
  if (!row) return task;
  return {
    ...row,
    creator_name: row.creator_email ? row.creator_email.split("@")[0] : null,
    assignee_name: row.assignee_email ? row.assignee_email.split("@")[0] : null,
    creator_email: undefined,
    assignee_email: undefined,
  };
}

// POST /api/pm/projects/:id/tasks
export async function createTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const projectId = req.params.id;
    const { title, description, priority, deadline, column_id, assigned_to, source } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: "Task title is required" });
    }

    if (!column_id) {
      return res.status(400).json({ success: false, error: "column_id is required" });
    }

    // Verify column belongs to this project
    const column = await PmColumnModel.findById(column_id);
    if (!column || column.project_id !== projectId) {
      return res.status(400).json({ success: false, error: "Invalid column for this project" });
    }

    const task = await db.transaction(async (trx) => {
      // Shift existing tasks down to make room at position 0
      await trx("pm_tasks")
        .where({ column_id })
        .increment("position", 1);

      // Backlog column auto-clears priority
      const effectivePriority = column.is_backlog ? null : (priority || "P4");

      const created = await PmTaskModel.create(
        {
          project_id: projectId,
          column_id,
          title: title.trim(),
          description: description || null,
          priority: effectivePriority,
          deadline: deadline || (["P1", "P2"].includes(effectivePriority || "") ? new Date().toISOString() : null),
          position: 0,
          assigned_to: assigned_to || null,
          created_by: req.user!.userId,
          source: source || "manual",
        },
        trx
      );

      await logPmActivity(
        {
          project_id: projectId,
          task_id: created.id,
          user_id: req.user!.userId,
          action: "task_created",
          metadata: { column_name: column.name, source: source || "manual" },
        },
        trx
      );

      return created;
    });

    return res.status(201).json({ success: true, data: await enrichTask(task) });
  } catch (error) {
    return handleError(res, error, "createTask");
  }
}

// PUT /api/pm/tasks/:id
export async function updateTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const existing = await PmTaskModel.findById(id);

    if (!existing) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const { title, description, priority, deadline } = req.body;
    const updates: Record<string, unknown> = {};
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (title !== undefined) {
      updates.title = title.trim();
      changes.title = { old: existing.title, new: title.trim() };
    }
    if (description !== undefined) {
      updates.description = description;
    }
    if (priority !== undefined) {
      updates.priority = priority;
      changes.priority = { old: existing.priority, new: priority };
      // Auto-set deadline to today if P1/P2 and no deadline set yet
      if (["P1", "P2"].includes(priority) && !existing.deadline && deadline === undefined) {
        updates.deadline = new Date().toISOString();
        changes.deadline = { old: existing.deadline, new: updates.deadline };
      }
    }
    if (deadline !== undefined) {
      updates.deadline = deadline;
      changes.deadline = { old: existing.deadline, new: deadline };
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "No fields to update" });
    }

    await PmTaskModel.updateById(id, updates);

    await logPmActivity({
      project_id: existing.project_id,
      task_id: id,
      user_id: req.user!.userId,
      action: "task_updated",
      metadata: changes,
    });

    const updated = await PmTaskModel.findById(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, "updateTask");
  }
}

// PUT /api/pm/tasks/:id/move
export async function moveTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const { column_id: targetColumnId, position: targetPosition } = req.body;

    if (!targetColumnId || targetPosition === undefined) {
      return res.status(400).json({
        success: false,
        error: "column_id and position are required",
      });
    }

    const existing = await PmTaskModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const sourceColumnId = existing.column_id;

    // Get column names for logging
    const [sourceCol, targetCol] = await Promise.all([
      PmColumnModel.findById(sourceColumnId),
      PmColumnModel.findById(targetColumnId),
    ]);

    await db.transaction(async (trx) => {
      // Remove from source: shift tasks above the removed position down
      await trx("pm_tasks")
        .where({ column_id: sourceColumnId })
        .where("position", ">", existing.position)
        .decrement("position", 1);

      // Insert into target: shift tasks at or above target position up
      await trx("pm_tasks")
        .where({ column_id: targetColumnId })
        .where("position", ">=", targetPosition)
        .increment("position", 1);

      // Update the task itself
      const updates: Record<string, unknown> = {
        column_id: targetColumnId,
        position: targetPosition,
      };

      // Handle completion tracking
      if (targetCol?.name === "Done" && !existing.completed_at) {
        updates.completed_at = new Date();
      } else if (sourceCol?.name === "Done" && targetCol?.name !== "Done") {
        updates.completed_at = null;
      }

      // Backlog priority behavior
      if (targetCol?.is_backlog) {
        updates.priority = null;
      } else if (sourceCol?.is_backlog && !targetCol?.is_backlog && !existing.priority) {
        updates.priority = "P4";
      }

      await PmTaskModel.updateById(id, updates, trx);

      await logPmActivity(
        {
          project_id: existing.project_id,
          task_id: id,
          user_id: req.user!.userId,
          action: sourceColumnId === targetColumnId ? "task_reordered" : "task_moved",
          metadata: {
            from_column: sourceCol?.name,
            to_column: targetCol?.name,
            from_position: existing.position,
            to_position: targetPosition,
          },
        },
        trx
      );

      // If moved to Done, also log completion + notify creator
      if (targetCol?.name === "Done" && !existing.completed_at) {
        await logPmActivity(
          {
            project_id: existing.project_id,
            task_id: id,
            user_id: req.user!.userId,
            action: "task_completed",
          },
          trx
        );

        // Notify creator if task has an assignee and creator != assignee
        if (
          existing.assigned_to &&
          existing.created_by !== existing.assigned_to
        ) {
          const [project, actorUser] = await Promise.all([
            trx("pm_projects").where("id", existing.project_id).select("name").first(),
            trx("users").where("id", existing.assigned_to).select("email").first(),
          ]);
          const actorName = actorUser?.email ? actorUser.email.split("@")[0] : `user ${existing.assigned_to}`;
          await insertNotification(trx, {
            user_id: existing.created_by,
            type: "assignee_completed_task",
            task_id: id,
            actor_user_id: existing.assigned_to,
            metadata: {
              task_title: existing.title,
              project_name: project?.name ?? "",
              actor_name: actorName,
            },
          });
        }
      }
    });

    const updated = await PmTaskModel.findById(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, "moveTask");
  }
}

// PUT /api/pm/tasks/:id/assign
export async function assignTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;
    const newAssignee: number | null = assigned_to || null;

    const existing = await PmTaskModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const oldAssignee: number | null = existing.assigned_to;

    await db.transaction(async (trx) => {
      await PmTaskModel.updateById(id, { assigned_to: newAssignee }, trx);

      await logPmActivity(
        {
          project_id: existing.project_id,
          task_id: id,
          user_id: req.user!.userId,
          action: "task_assigned",
          metadata: { old_assignee: oldAssignee, new_assignee: newAssignee },
        },
        trx
      );

      // Fetch project name + actor name for notification metadata
      const [project, actorUser] = await Promise.all([
        trx("pm_projects").where("id", existing.project_id).select("name").first(),
        trx("users").where("id", req.user!.userId).select("email").first(),
      ]);
      const actorName = actorUser?.email ? actorUser.email.split("@")[0] : `user ${req.user!.userId}`;
      const meta = { task_title: existing.title, project_name: project?.name ?? "", actor_name: actorName };

      // Notify new assignee
      if (newAssignee && newAssignee !== oldAssignee) {
        await insertNotification(trx, {
          user_id: newAssignee,
          type: "task_assigned",
          task_id: id,
          actor_user_id: req.user!.userId,
          metadata: meta,
        });
      }

      // Notify old assignee they were removed
      if (oldAssignee && oldAssignee !== newAssignee) {
        await insertNotification(trx, {
          user_id: oldAssignee,
          type: "task_unassigned",
          task_id: id,
          actor_user_id: req.user!.userId,
          metadata: meta,
        });
      }
    });

    const updated = await PmTaskModel.findById(id);
    return res.json({ success: true, data: await enrichTask(updated) });
  } catch (error) {
    return handleError(res, error, "assignTask");
  }
}

// DELETE /api/pm/tasks/:id
export async function deleteTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const existing = await PmTaskModel.findById(id);

    if (!existing) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // Log before delete
    await logPmActivity({
      project_id: existing.project_id,
      task_id: id,
      user_id: req.user!.userId,
      action: "task_deleted",
      metadata: { title: existing.title, column_id: existing.column_id },
    });

    // Clean up S3 attachment objects (DB rows cascade via FK). This must run
    // before the task is deleted because the query joins on task_id.
    await cleanupAttachmentS3Objects([id]);

    await db.transaction(async (trx) => {
      await PmTaskModel.deleteById(id, trx);

      // Recompute positions in the source column
      await trx("pm_tasks")
        .where({ column_id: existing.column_id })
        .where("position", ">", existing.position)
        .decrement("position", 1);
    });

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return handleError(res, error, "deleteTask");
  }
}

// POST /api/pm/tasks/bulk/move-to-project
// Moves a batch of backlog tasks into another project's backlog column.
// All tasks must currently be in an is_backlog column (single or multiple
// source projects are allowed). Tasks are appended to the end of the target
// backlog in input order.
export async function bulkMoveTasksToProject(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { task_ids, target_project_id } = req.body as {
      task_ids?: unknown;
      target_project_id?: unknown;
    };

    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return res.status(400).json({ success: false, error: "task_ids must be a non-empty array" });
    }
    if (typeof target_project_id !== "string" || !target_project_id) {
      return res.status(400).json({ success: false, error: "target_project_id is required" });
    }

    // Load all tasks + their source columns in one shot
    const tasks: any[] = await db("pm_tasks")
      .join("pm_columns", "pm_tasks.column_id", "pm_columns.id")
      .whereIn("pm_tasks.id", task_ids as string[])
      .select(
        "pm_tasks.id",
        "pm_tasks.project_id",
        "pm_tasks.column_id",
        "pm_tasks.position",
        "pm_tasks.title",
        "pm_columns.is_backlog as source_is_backlog",
        "pm_columns.name as source_column_name"
      );

    if (tasks.length !== (task_ids as string[]).length) {
      return res.status(404).json({ success: false, error: "One or more tasks not found" });
    }

    // Enforce backlog-only rule
    const nonBacklog = tasks.filter((t) => !t.source_is_backlog);
    if (nonBacklog.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Only backlog items can be moved between projects",
        metadata: { offending_task_ids: nonBacklog.map((t) => t.id) },
      });
    }

    // Validate target project exists and is active
    const targetProject = await db("pm_projects").where({ id: target_project_id }).first();
    if (!targetProject) {
      return res.status(404).json({ success: false, error: "Target project not found" });
    }
    if (targetProject.status !== "active") {
      return res.status(400).json({ success: false, error: "Target project is not active" });
    }

    // Resolve target backlog column
    const targetBacklog = await db("pm_columns")
      .where({ project_id: target_project_id, is_backlog: true })
      .first();
    if (!targetBacklog) {
      return res.status(400).json({ success: false, error: "Target project has no backlog column" });
    }

    // Reject no-ops: task already in the target backlog
    if (tasks.some((t) => t.column_id === targetBacklog.id)) {
      return res.status(400).json({
        success: false,
        error: "One or more tasks are already in the target project's backlog",
      });
    }

    // Execute the move in a single transaction
    const movedIds: string[] = [];
    await db.transaction(async (trx) => {
      // Current max position in the target backlog (append to end)
      const [maxRow] = await trx("pm_tasks")
        .where({ column_id: targetBacklog.id })
        .max<{ max: number | null }[]>("position as max");
      let nextPosition = ((maxRow?.max ?? -1) as number) + 1;

      // Group by source column so per-column compaction is efficient
      const bySourceCol = new Map<string, any[]>();
      for (const t of tasks) {
        const bucket = bySourceCol.get(t.column_id) ?? [];
        bucket.push(t);
        bySourceCol.set(t.column_id, bucket);
      }

      for (const t of tasks) {
        await trx("pm_tasks")
          .where({ id: t.id })
          .update({
            project_id: target_project_id,
            column_id: targetBacklog.id,
            position: nextPosition,
            priority: null, // backlog = no priority
          });

        await logPmActivity(
          {
            project_id: target_project_id,
            task_id: t.id,
            user_id: req.user!.userId,
            action: "task_moved_to_project",
            metadata: {
              from_project_id: t.project_id,
              from_column_id: t.column_id,
              to_column_id: targetBacklog.id,
              title: t.title,
            },
          },
          trx
        );

        movedIds.push(t.id);
        nextPosition += 1;
      }

      // Compact source columns: rewrite positions to be contiguous
      for (const [sourceColId] of bySourceCol) {
        const remaining: any[] = await trx("pm_tasks")
          .where({ column_id: sourceColId })
          .orderBy("position", "asc")
          .select("id");
        for (let i = 0; i < remaining.length; i++) {
          await trx("pm_tasks").where({ id: remaining[i].id }).update({ position: i });
        }
      }
    });

    return res.json({ success: true, data: { moved_task_ids: movedIds } });
  } catch (error) {
    return handleError(res, error, "bulkMoveTasksToProject");
  }
}

// POST /api/pm/tasks/bulk/delete
// Deletes a batch of tasks and recomputes positions in each affected column.
export async function bulkDeleteTasks(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { task_ids } = req.body as { task_ids?: unknown };
    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return res.status(400).json({ success: false, error: "task_ids must be a non-empty array" });
    }

    const tasks: any[] = await db("pm_tasks")
      .whereIn("id", task_ids as string[])
      .select("id", "project_id", "column_id", "position", "title");

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, error: "No tasks found" });
    }

    const affectedColumnIds = new Set<string>(tasks.map((t) => t.column_id));

    // Clean up S3 attachments before the DB cascade removes their rows.
    await cleanupAttachmentS3Objects(tasks.map((t) => t.id));

    await db.transaction(async (trx) => {
      // Log each deletion before removing the row
      for (const t of tasks) {
        await logPmActivity(
          {
            project_id: t.project_id,
            task_id: t.id,
            user_id: req.user!.userId,
            action: "task_deleted",
            metadata: { title: t.title, column_id: t.column_id, bulk: true },
          },
          trx
        );
      }

      await trx("pm_tasks").whereIn("id", tasks.map((t) => t.id)).delete();

      // Compact affected columns
      for (const colId of affectedColumnIds) {
        const remaining: any[] = await trx("pm_tasks")
          .where({ column_id: colId })
          .orderBy("position", "asc")
          .select("id");
        for (let i = 0; i < remaining.length; i++) {
          await trx("pm_tasks").where({ id: remaining[i].id }).update({ position: i });
        }
      }
    });

    return res.json({ success: true, data: { deleted_count: tasks.length } });
  } catch (error) {
    return handleError(res, error, "bulkDeleteTasks");
  }
}
