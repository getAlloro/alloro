import { Knex } from "knex";
import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

/** A comment's author, joined for display (avatar initial + name). */
export interface IOsCommentAuthor {
  id: number;
  name: string | null;
  email: string;
}

/** os.comments row joined to its author — the shape list/create/byId return. */
export interface IOsCommentView {
  id: string;
  document_id: string;
  parent_comment_id: string | null;
  author_id: number | null;
  body_md: string;
  version_tag: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  author: IOsCommentAuthor | null;
}

export interface INewOsComment {
  document_id: string;
  parent_comment_id: string | null;
  author_id: number;
  body_md: string;
  version_tag: number | null;
}

/**
 * os.comments — lightweight threaded discussion on a document
 * (plans/07042026-alloro-os-admin-port, P7). Ported from alloro-os
 * comments/CommentModel with ALL task columns dropped (is_task/assignee/
 * due/resolve live in pmtool, not here — master D-scope). Tombstone delete:
 * deleted_at is set and the row is kept so a reply's thread shape survives.
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsCommentModel extends BaseModel {
  protected static tableName = "os.comments";

  /** One comment joined to its author for display (§7.4: one builder). */
  private static commentView(query: Knex.QueryBuilder): Promise<IOsCommentView[]> {
    return query
      .leftJoin("users as u", "u.id", "os.comments.author_id")
      .select(
        "os.comments.id",
        "os.comments.document_id",
        "os.comments.parent_comment_id",
        "os.comments.author_id",
        "os.comments.body_md",
        "os.comments.version_tag",
        "os.comments.created_at",
        "os.comments.updated_at",
        "os.comments.deleted_at"
      )
      .select(
        db.raw(
          "case when u.id is null then null else json_build_object('id', u.id, 'name', u.name, 'email', u.email) end as author"
        )
      ) as unknown as Promise<IOsCommentView[]>;
  }

  /**
   * All comments for a document (tombstones included so thread structure
   * survives), oldest first. The service groups roots + one level of replies.
   */
  static async listForDocument(
    documentId: string,
    trx?: QueryContext
  ): Promise<IOsCommentView[]> {
    return this.commentView(
      this.table(trx)
        .where("os.comments.document_id", documentId)
        .orderBy("os.comments.created_at", "asc")
    );
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IOsCommentView | undefined> {
    const [row] = await this.commentView(
      this.table(trx).where("os.comments.id", id).limit(1)
    );
    return row;
  }

  static async createComment(
    input: INewOsComment,
    trx?: QueryContext
  ): Promise<IOsCommentView> {
    const [inserted] = await this.table(trx)
      .insert({
        document_id: input.document_id,
        parent_comment_id: input.parent_comment_id,
        author_id: input.author_id,
        body_md: input.body_md,
        version_tag: input.version_tag,
      })
      .returning("id");
    const id = typeof inserted === "object" ? inserted.id : inserted;
    const view = await this.findById(String(id), trx);
    if (!view) {
      throw new Error(`os.comments row ${id} vanished immediately after insert`);
    }
    return view;
  }

  static async updateBody(
    id: string,
    bodyMd: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ body_md: bodyMd, updated_at: new Date() });
  }

  /** Tombstone: keep the row (thread shape) but mark it deleted. */
  static async softDelete(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ deleted_at: new Date(), updated_at: new Date() });
  }
}
