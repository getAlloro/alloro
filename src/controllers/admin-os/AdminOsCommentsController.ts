import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsCommentService } from "./feature-services/OsCommentService";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { osActorId } from "./feature-utils/osRequestParams";

/**
 * Admin OS — document comments (P7 T1). Thin orchestration only (§7.3): each
 * handler parses the request, calls one OsCommentService method, and answers
 * with the §8.1 envelope via osResponses. Edit + delete are author-only, but
 * that gate lives in the service (§5.4) — the controller never trusts the
 * client. No task fields anywhere (pmtool owns tasks).
 */
export class AdminOsCommentsController {
  /** GET /api/admin/os/documents/:id/comments — the threaded Comments rail. */
  static async list(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const thread = await OsCommentService.getThread(req.params.id);
      return ok(res, thread);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/documents/:id/comments — add a comment or reply. */
  static async create(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const comment = await OsCommentService.createComment(
        req.params.id,
        {
          bodyMd: String(req.body.body_md),
          parentCommentId:
            req.body.parent_comment_id != null
              ? String(req.body.parent_comment_id)
              : null,
        },
        osActorId(req)
      );
      return ok(res, { comment }, 201);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** PATCH /api/admin/os/comments/:id — edit body (author-only, §5.4). */
  static async update(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const comment = await OsCommentService.editComment(
        req.params.id,
        String(req.body.body_md),
        osActorId(req)
      );
      return ok(res, { comment });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** DELETE /api/admin/os/comments/:id — tombstone (author-only, §5.4). */
  static async remove(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const result = await OsCommentService.deleteComment(
        req.params.id,
        osActorId(req)
      );
      return ok(res, result);
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
