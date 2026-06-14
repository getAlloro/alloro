import { BaseModel, QueryContext } from "./BaseModel";

export class PmTaskAttachmentModel extends BaseModel {
  protected static tableName = "pm_task_attachments";
  protected static jsonFields: string[] = [];

  // GET /api/pm/tasks/:id/attachments — newest first, joined to uploader email.
  static async listByTaskWithUploader(
    taskId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .leftJoin("users", "pm_task_attachments.uploaded_by", "users.id")
      .where("pm_task_attachments.task_id", taskId)
      .orderBy("pm_task_attachments.created_at", "desc")
      .select("pm_task_attachments.*", "users.email as uploader_email");
  }

  // POST /api/pm/tasks/:id/attachments — insert metadata row.
  // Bypasses BaseModel.create because pm_task_attachments has no updated_at
  // column (attachments are immutable once uploaded).
  static async insertMetadata(
    data: {
      task_id: string;
      uploaded_by: number;
      filename: string;
      s3_key: string;
      mime_type: string;
      size_bytes: number;
    },
    trx?: QueryContext
  ): Promise<any> {
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
}
