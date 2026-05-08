import { db } from "../database/connection";
import { QueryContext } from "./BaseModel";

export type SupportAttachmentUploaderRole = "client" | "admin" | "system";
export type SupportAttachmentVisibility = "client_visible" | "internal";

export interface SupportTicketAttachment {
  id: string;
  ticket_id: string;
  uploaded_by_user_id: number | null;
  uploader_role: SupportAttachmentUploaderRole;
  visibility: SupportAttachmentVisibility;
  filename: string;
  s3_key: string;
  mime_type: string;
  size_bytes: number | string;
  created_at: Date | string;
  uploaded_by_name?: string | null;
  uploaded_by_email?: string | null;
}

export class SupportTicketAttachmentModel {
  private static tableName = "support_ticket_attachments";

  static async create(
    data: Omit<SupportTicketAttachment, "id" | "created_at">,
    trx?: QueryContext,
  ): Promise<SupportTicketAttachment> {
    const [row] = await (trx || db)(this.tableName)
      .insert(data)
      .returning("*");
    return row;
  }

  static async countForTicket(
    ticketId: string,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await (trx || db)(this.tableName)
      .where({ ticket_id: ticketId })
      .count("* as count")
      .first();
    return Number(result?.count || 0);
  }

  static async listForTicket(
    ticketId: string,
    options: { includeInternal?: boolean } = {},
    trx?: QueryContext,
  ): Promise<SupportTicketAttachment[]> {
    const query = (trx || db)(this.tableName)
      .select(
        `${this.tableName}.*`,
        "users.email as uploaded_by_email",
        db.raw(
          "COALESCE(users.name, NULLIF(CONCAT_WS(' ', users.first_name, users.last_name), ''), users.email) AS uploaded_by_name",
        ),
      )
      .leftJoin("users", "users.id", `${this.tableName}.uploaded_by_user_id`)
      .where(`${this.tableName}.ticket_id`, ticketId)
      .orderBy(`${this.tableName}.created_at`, "desc");

    if (!options.includeInternal) {
      query.where(`${this.tableName}.visibility`, "client_visible");
    }

    return query;
  }

  static async findForTicket(
    ticketId: string,
    attachmentId: string,
    options: { includeInternal?: boolean } = {},
    trx?: QueryContext,
  ): Promise<SupportTicketAttachment | undefined> {
    const query = (trx || db)(this.tableName)
      .where({ ticket_id: ticketId, id: attachmentId });

    if (!options.includeInternal) {
      query.where({ visibility: "client_visible" });
    }

    return query.first();
  }
}
