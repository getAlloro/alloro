import { BaseModel, QueryContext } from "./BaseModel";

export interface PmTaskAttachmentRow {
  id: string;
  task_id: string;
  comment_id: string | null;
  uploaded_by: number;
  filename: string;
  s3_key: string;
  mime_type: string;
  size_bytes: number | string;
  created_at: Date | string;
  uploader_email?: string | null;
}

export interface PmTaskAttachmentInsertData {
  task_id: string;
  comment_id?: string | null;
  uploaded_by: number;
  filename: string;
  s3_key: string;
  mime_type: string;
  size_bytes: number;
}

export class PmTaskAttachmentModel extends BaseModel {
  protected static tableName = "pm_task_attachments";
  protected static jsonFields: string[] = [];

  // GET /api/pm/tasks/:id/attachments — newest first, joined to uploader email.
  static async listByTaskWithUploader(
    taskId: string,
    trx?: QueryContext
  ): Promise<PmTaskAttachmentRow[]> {
    return this.table(trx)
      .leftJoin("users", "pm_task_attachments.uploaded_by", "users.id")
      .where("pm_task_attachments.task_id", taskId)
      .orderBy("pm_task_attachments.created_at", "desc")
      .select("pm_task_attachments.*", "users.email as uploader_email");
  }

  // Standalone task attachments exclude images attached to specific comments.
  static async listStandaloneByTaskWithUploader(
    taskId: string,
    trx?: QueryContext
  ): Promise<PmTaskAttachmentRow[]> {
    return this.table(trx)
      .leftJoin("users", "pm_task_attachments.uploaded_by", "users.id")
      .where("pm_task_attachments.task_id", taskId)
      .whereNull("pm_task_attachments.comment_id")
      .orderBy("pm_task_attachments.created_at", "desc")
      .select("pm_task_attachments.*", "users.email as uploader_email");
  }

  static async listByCommentIdsWithUploader(
    commentIds: string[],
    trx?: QueryContext
  ): Promise<PmTaskAttachmentRow[]> {
    if (commentIds.length === 0) return [];
    return this.table(trx)
      .leftJoin("users", "pm_task_attachments.uploaded_by", "users.id")
      .whereIn("pm_task_attachments.comment_id", commentIds)
      .orderBy("pm_task_attachments.created_at", "asc")
      .select("pm_task_attachments.*", "users.email as uploader_email");
  }

  // POST /api/pm/tasks/:id/attachments — insert metadata row.
  // Bypasses BaseModel.create because pm_task_attachments has no updated_at
  // column (attachments are immutable once uploaded).
  static async insertMetadata(
    data: PmTaskAttachmentInsertData,
    trx?: QueryContext
  ): Promise<PmTaskAttachmentRow> {
    const [created] = await this.table(trx).insert(data).returning("*");
    return created;
  }

  // S3 cleanup before a task delete cascade removes the rows — fetch the keys
  // for a batch of task ids.
  static async listS3KeysForTasks(
    taskIds: string[],
    trx?: QueryContext
  ): Promise<Array<{ s3_key: string }>> {
    return this.table(trx).whereIn("task_id", taskIds).select("s3_key");
  }

  static async listS3KeysForComments(
    commentIds: string[],
    trx?: QueryContext
  ): Promise<Array<{ s3_key: string }>> {
    if (commentIds.length === 0) return [];
    return this.table(trx)
      .whereIn("comment_id", commentIds)
      .select("s3_key");
  }
}
