/**
 * Document comments (plans/07042026-alloro-os-admin-port, P7 T1; port of the
 * alloro-os CommentService with ALL task logic and notification fan-out
 * removed — pmtool owns tasks, and the master scope ships no notification
 * infra). Thin over Os*Model (§7.4). Behaviors kept from the port:
 *
 *   - create captures version_tag = the document's live version at comment time
 *   - one nesting level: a reply to a reply re-parents to the root (OS UI shape)
 *   - edit + delete are AUTHOR-ONLY, enforced HERE on the server (§5.4) →
 *     OS_COMMENT_ACCESS_DENIED (403)
 *   - delete is a tombstone (deleted_at set, row kept) so the thread survives
 *   - create + delete each write one os.activity row (controlled vocabulary)
 *
 * body_md is stored RAW (rendered client-side; no HTML is ever stored).
 */

import {
  IOsCommentAuthor,
  IOsCommentView,
  OsCommentModel,
} from "../../../models/OsCommentModel";
import { OsDocumentModel } from "../../../models/OsDocumentModel";
import { OsDocumentVersionModel } from "../../../models/OsDocumentVersionModel";
import { OsActivityModel } from "../../../models/OsActivityModel";
import { OsError } from "../feature-utils/OsError";

/** One comment as the API returns it — tombstones expose no body. */
export interface OsCommentDto {
  id: string;
  parent_comment_id: string | null;
  author: IOsCommentAuthor | null;
  body_md: string;
  version_tag: number | null;
  created_at: Date;
  updated_at: Date;
  deleted: boolean;
}

/** A root comment plus its one level of replies (oldest first). */
export interface OsCommentNode extends OsCommentDto {
  replies: OsCommentDto[];
}

/** The Comments rail payload: the live version + the threaded roots. */
export interface OsCommentThreadView {
  liveVersionNo: number | null;
  comments: OsCommentNode[];
}

/** Blank a tombstoned comment's body so no deleted text leaves the server. */
function shapeComment(row: IOsCommentView): OsCommentDto {
  const deleted = Boolean(row.deleted_at);
  return {
    id: row.id,
    parent_comment_id: row.parent_comment_id,
    author: row.author,
    body_md: deleted ? "" : row.body_md,
    version_tag: row.version_tag,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted,
  };
}

function requireComment(comment: IOsCommentView | undefined): IOsCommentView {
  if (!comment) {
    throw new OsError("OS_COMMENT_NOT_FOUND", "Comment not found.");
  }
  return comment;
}

/**
 * §5.4 — the author gate, enforced on the server for every mutation. The
 * frontend hides Edit/Delete on other people's comments, but that is cosmetic;
 * this is the authoritative check.
 */
function requireAuthor(comment: IOsCommentView, actorId: number): void {
  if (comment.author_id !== actorId) {
    throw new OsError(
      "OS_COMMENT_ACCESS_DENIED",
      "You can only change your own comment.",
      { commentId: comment.id }
    );
  }
}

async function requireDocument(documentId: string): Promise<void> {
  const document = await OsDocumentModel.findDocumentById(documentId);
  if (!document) {
    throw new OsError("OS_DOCUMENT_NOT_FOUND", "Document not found.", {
      documentId,
    });
  }
}

/**
 * One nesting level: a reply's parent is always a root. If the client replies
 * to a reply, re-parent to that reply's root so the thread stays two-deep.
 */
async function resolveRootParent(
  parentCommentId: string | null
): Promise<string | null> {
  if (!parentCommentId) return null;
  const parent = requireComment(await OsCommentModel.findById(parentCommentId));
  return parent.parent_comment_id ?? parent.id;
}

export class OsCommentService {
  /** The Comments rail: live version number + threaded roots (one reply level). */
  static async getThread(documentId: string): Promise<OsCommentThreadView> {
    await requireDocument(documentId);
    const [all, liveVersionNo] = await Promise.all([
      OsCommentModel.listForDocument(documentId),
      OsDocumentVersionModel.maxVersionNo(documentId),
    ]);

    const repliesByRoot = new Map<string, OsCommentDto[]>();
    for (const row of all) {
      if (!row.parent_comment_id) continue;
      const bucket = repliesByRoot.get(row.parent_comment_id) ?? [];
      bucket.push(shapeComment(row));
      repliesByRoot.set(row.parent_comment_id, bucket);
    }

    const comments: OsCommentNode[] = all
      .filter((row) => !row.parent_comment_id)
      .map((root) => ({
        ...shapeComment(root),
        replies: repliesByRoot.get(root.id) ?? [],
      }));

    return {
      liveVersionNo: liveVersionNo > 0 ? liveVersionNo : null,
      comments,
    };
  }

  /**
   * Add a comment (or a reply). version_tag records the live version the
   * comment was made against; a reply-to-reply re-parents to the root.
   */
  static async createComment(
    documentId: string,
    input: { bodyMd: string; parentCommentId: string | null },
    actorId: number
  ): Promise<OsCommentDto> {
    await requireDocument(documentId);
    const rootParent = await resolveRootParent(input.parentCommentId);
    const liveVersionNo = await OsDocumentVersionModel.maxVersionNo(documentId);

    const comment = await OsCommentModel.createComment({
      document_id: documentId,
      parent_comment_id: rootParent,
      author_id: actorId,
      body_md: input.bodyMd,
      version_tag: liveVersionNo > 0 ? liveVersionNo : null,
    });

    await OsActivityModel.log({
      actor_id: actorId,
      action: rootParent ? "comment.replied" : "comment.created",
      target_type: "comment",
      target_id: comment.id,
      metadata: { document_id: documentId },
    });

    return shapeComment(comment);
  }

  /** Edit a comment's body — author-only (§5.4). */
  static async editComment(
    commentId: string,
    bodyMd: string,
    actorId: number
  ): Promise<OsCommentDto> {
    const comment = requireComment(await OsCommentModel.findById(commentId));
    if (comment.deleted_at) {
      throw new OsError("OS_COMMENT_DELETED_CONFLICT", "This comment was deleted.");
    }
    requireAuthor(comment, actorId);
    await OsCommentModel.updateBody(commentId, bodyMd);
    return shapeComment(requireComment(await OsCommentModel.findById(commentId)));
  }

  /** Tombstone a comment — author-only (§5.4); the thread shape is preserved. */
  static async deleteComment(
    commentId: string,
    actorId: number
  ): Promise<{ id: string; deleted: true }> {
    const comment = requireComment(await OsCommentModel.findById(commentId));
    requireAuthor(comment, actorId);
    if (!comment.deleted_at) {
      await OsCommentModel.softDelete(commentId);
      await OsActivityModel.log({
        actor_id: actorId,
        action: "comment.deleted",
        target_type: "comment",
        target_id: commentId,
        metadata: { document_id: comment.document_id },
      });
    }
    return { id: commentId, deleted: true };
  }
}
