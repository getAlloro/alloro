/**
 * PM Task Comments Controller
 *
 * HTTP handlers for flat markdown comments on a PM task. Storage model:
 * - body is markdown (rendered client-side via react-markdown with a strict
 *   safe-rendering config — see CommentsSection.tsx)
 * - mentions is a native PG INTEGER[] on the row itself; it is NOT re-parsed
 *   from the body. The UI pushes user ids into a controlled array when the
 *   user selects an entry from the @ autocomplete popup.
 *
 * Notification fan-out on create (de-duplicated per user per comment event,
 * author never notifies themselves):
 *   1. Every user_id in `mentions` (except the author) → `mention_in_comment`
 *   2. Task `assigned_to` (if not author, not already in set) → `task_commented`
 *   3. Task `created_by` (if not author, not already in set) → `task_commented`
 *
 * Edits do NOT re-send notifications in v1 — a quiet edit by design. Deletes
 * leave existing notifications in place (no FK to pm_task_comments; the
 * notification has already been delivered).
 *
 * Endpoints (mounted under /api/pm):
 * - POST   /tasks/:id/comments                → createComment
 * - GET    /tasks/:id/comments                → listComments
 * - PUT    /tasks/:id/comments/:commentId     → updateComment (author-only)
 * - DELETE /tasks/:id/comments/:commentId     → deleteComment (author-only)
 *
 * Auth: authenticateToken + superAdminMiddleware, same as every other PM route.
 */

import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { db } from "../../database/connection";
import { PmTaskCommentModel } from "../../models/PmTaskCommentModel";
import { PmTaskModel } from "../../models/PmTaskModel";
import { logPmActivity } from "./pmActivityLogger";
import logger from "../../lib/logger";

type CommentNotificationType = "mention_in_comment" | "task_commented";

function handleError(
  res: Response,
  error: unknown,
  operation: string
): Response {
  logger.error({ err: error }, `[PM-COMMENTS] ${operation} failed:`);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

/**
 * Build the mention_names lookup used by the client to highlight @Name in
 * rendered markdown. Accepts the full mention set across many comments to
 * minimize the number of queries.
 */
async function resolveMentionNames(
  userIds: number[]
): Promise<Record<number, string>> {
  const unique = Array.from(new Set(userIds)).filter(
    (id) => typeof id === "number" && !Number.isNaN(id)
  );
  if (unique.length === 0) return {};
  const rows: Array<{ id: number; email: string | null }> = await db("users")
    .whereIn("id", unique)
    .select("id", "email");
  const map: Record<number, string> = {};
  for (const r of rows) {
    map[r.id] = r.email ? r.email.split("@")[0] : `user ${r.id}`;
  }
  return map;
}

function normalizeMentions(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    if (Number.isInteger(n) && n > 0) out.push(n);
  }
  // dedup preserving order
  return Array.from(new Set(out));
}

async function enrichCommentRow(row: any, callerId?: number): Promise<any> {
  if (!row) return row;
  const author: { email: string | null } | undefined = await db("users")
    .where({ id: row.author_id })
    .select("email")
    .first();
  const mentionIds: number[] = Array.isArray(row.mentions) ? row.mentions : [];
  const mention_names = await resolveMentionNames(mentionIds);
  return {
    id: row.id,
    task_id: row.task_id,
    author_id: row.author_id,
    author_name: author?.email
      ? author.email.split("@")[0]
      : `user ${row.author_id}`,
    body: row.body,
    mentions: mentionIds,
    mention_names,
    edited_at: row.edited_at,
    created_at: row.created_at,
    is_mine: callerId !== undefined ? row.author_id === callerId : undefined,
  };
}

// POST /api/pm/tasks/:id/comments
export async function createComment(
  req: AuthRequest,
  res: Response
): Promise<any> {
  try {
    const taskId = req.params.id;
    // users.id is BIGINT (pg returns string); author_id is INTEGER (number).
    // Coerce once so notification dedup + equality checks line up.
    const authorId = Number(req.user!.userId);

    const body: string = typeof req.body?.body === "string" ? req.body.body : "";
    if (!body.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Comment body is required" });
    }

    const mentions = normalizeMentions(req.body?.mentions);

    const task = await PmTaskModel.findById(taskId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, error: "Task not found" });
    }

    const created = await db.transaction(async (trx) => {
      // 1. Insert the comment row.
      const inserted = await PmTaskCommentModel.create(
        {
          task_id: taskId,
          author_id: authorId,
          body,
          mentions,
        },
        trx
      );

      // 2. Build recipient set per the de-duplication rule in the spec.
      //    A user can only appear once. Mention wins over assigned/creator.
      const recipients = new Map<number, CommentNotificationType>();

      for (const uid of mentions) {
        if (uid !== authorId) {
          recipients.set(uid, "mention_in_comment");
        }
      }

      const assignedTo: number | null = task.assigned_to ?? null;
      if (
        assignedTo &&
        assignedTo !== authorId &&
        !recipients.has(assignedTo)
      ) {
        recipients.set(assignedTo, "task_commented");
      }

      const createdBy: number | null = task.created_by ?? null;
      if (createdBy && createdBy !== authorId && !recipients.has(createdBy)) {
        recipients.set(createdBy, "task_commented");
      }

      // 3. Compose metadata for the client-side notification card.
      const [project, actorUser] = await Promise.all([
        trx("pm_projects")
          .where("id", task.project_id)
          .select("name")
          .first(),
        trx("users").where("id", authorId).select("email").first(),
      ]);
      const actor_name = actorUser?.email
        ? actorUser.email.split("@")[0]
        : `user ${authorId}`;
      const metadata = {
        task_title: task.title,
        project_name: project?.name ?? "",
        actor_name,
        comment_preview: body.slice(0, 100),
      };

      // 4. Batch insert notifications.
      if (recipients.size > 0) {
        const rows: Array<{
          user_id: number;
          type: CommentNotificationType;
          task_id: string;
          actor_user_id: number;
          metadata: Record<string, unknown>;
        }> = Array.from(recipients.entries()).map(([user_id, type]) => ({
          user_id,
          type,
          task_id: taskId,
          actor_user_id: authorId,
          metadata,
        }));
        await trx("pm_notifications").insert(rows);
      }

      // 5. Activity log.
      await logPmActivity(
        {
          project_id: task.project_id,
          task_id: taskId,
          user_id: authorId,
          action: "comment_added",
          metadata: {
            comment_id: inserted.id,
            mention_count: mentions.length,
          },
        },
        trx
      );

      return inserted;
    });

    const enriched = await enrichCommentRow(created, authorId);
    return res.status(201).json({ success: true, data: enriched });
  } catch (error) {
    return handleError(res, error, "createComment");
  }
}

// GET /api/pm/tasks/:id/comments
export async function listComments(
  req: AuthRequest,
  res: Response
): Promise<any> {
  try {
    const taskId = req.params.id;

    const task = await PmTaskModel.findById(taskId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, error: "Task not found" });
    }

    const rows = await db("pm_task_comments as c")
      .leftJoin("users as u", "c.author_id", "u.id")
      .where("c.task_id", taskId)
      .orderBy("c.created_at", "asc")
      .select(
        "c.id",
        "c.task_id",
        "c.author_id",
        "c.body",
        "c.mentions",
        "c.edited_at",
        "c.created_at",
        "u.email as author_email"
      );

    // Resolve mention_names in bulk across all comments for the task.
    const allMentionIds: number[] = [];
    for (const r of rows) {
      if (Array.isArray(r.mentions)) {
        for (const id of r.mentions) allMentionIds.push(id);
      }
    }
    const mentionNameMap = await resolveMentionNames(allMentionIds);

    // users.id is BIGINT (pg returns string); author_id is INTEGER.
    const callerId = Number(req.user!.userId);
    const comments = rows.map((r: any) => {
      const mentions: number[] = Array.isArray(r.mentions) ? r.mentions : [];
      const mention_names: Record<number, string> = {};
      for (const id of mentions) {
        if (mentionNameMap[id]) mention_names[id] = mentionNameMap[id];
      }
      return {
        id: r.id,
        task_id: r.task_id,
        author_id: r.author_id,
        author_name: r.author_email
          ? r.author_email.split("@")[0]
          : `user ${r.author_id}`,
        body: r.body,
        mentions,
        mention_names,
        edited_at: r.edited_at,
        created_at: r.created_at,
        // Server-verified permission flag — UI mirrors this instead of
        // decoding the JWT client-side. Matches the check enforced by
        // updateComment/deleteComment.
        is_mine: r.author_id === callerId,
      };
    });

    return res.json({ success: true, data: { comments } });
  } catch (error) {
    return handleError(res, error, "listComments");
  }
}

// PUT /api/pm/tasks/:id/comments/:commentId
export async function updateComment(
  req: AuthRequest,
  res: Response
): Promise<any> {
  try {
    const { id: taskId, commentId } = req.params;
    // users.id is BIGINT (pg returns string); author_id is INTEGER.
    const callerId = Number(req.user!.userId);

    const existing = await PmTaskCommentModel.findOne({
      id: commentId,
      task_id: taskId,
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    if (existing.author_id !== callerId) {
      return res.status(403).json({
        success: false,
        error: "Only the comment author can edit this comment",
      });
    }

    const body: string =
      typeof req.body?.body === "string" ? req.body.body : "";
    if (!body.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Comment body is required" });
    }
    const mentions = normalizeMentions(req.body?.mentions);

    const task = await PmTaskModel.findById(taskId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, error: "Task not found" });
    }

    await db.transaction(async (trx) => {
      await trx("pm_task_comments")
        .where({ id: commentId })
        .update({
          body,
          mentions,
          edited_at: new Date(),
          updated_at: new Date(),
        });

      await logPmActivity(
        {
          project_id: task.project_id,
          task_id: taskId,
          user_id: callerId,
          action: "comment_edited",
          metadata: {
            comment_id: commentId,
            mention_count: mentions.length,
          },
        },
        trx
      );
    });

    const updated = await PmTaskCommentModel.findById(commentId);
    const enriched = await enrichCommentRow(updated, callerId);
    return res.json({ success: true, data: enriched });
  } catch (error) {
    return handleError(res, error, "updateComment");
  }
}

// DELETE /api/pm/tasks/:id/comments/:commentId
export async function deleteComment(
  req: AuthRequest,
  res: Response
): Promise<any> {
  try {
    const { id: taskId, commentId } = req.params;
    // users.id is BIGINT (pg returns string); author_id is INTEGER.
    const callerId = Number(req.user!.userId);

    const existing = await PmTaskCommentModel.findOne({
      id: commentId,
      task_id: taskId,
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    if (existing.author_id !== callerId) {
      return res.status(403).json({
        success: false,
        error: "Only the comment author can delete this comment",
      });
    }

    const task = await PmTaskModel.findById(taskId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, error: "Task not found" });
    }

    await db.transaction(async (trx) => {
      await trx("pm_task_comments").where({ id: commentId }).del();

      await logPmActivity(
        {
          project_id: task.project_id,
          task_id: taskId,
          user_id: callerId,
          action: "comment_deleted",
          metadata: { comment_id: commentId },
        },
        trx
      );
    });

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return handleError(res, error, "deleteComment");
  }
}
