import { db } from "../../../database/connection";
import { SupportTicketAttachmentModel } from "../../../models/SupportTicketAttachmentModel";
import type {
  SupportAttachmentUploaderRole,
  SupportAttachmentVisibility,
  SupportTicketAttachment,
} from "../../../models/SupportTicketAttachmentModel";
import { SupportTicketEventModel } from "../../../models/SupportTicketEventModel";
import { SupportTicketModel } from "../../../models/SupportTicketModel";
import {
  deleteFromS3,
  generatePresignedUrl,
  uploadToS3,
} from "../../../utils/core/s3";
import {
  isMimeAllowed,
  MAX_ATTACHMENTS_PER_TICKET,
  MAX_FILE_SIZE_BYTES,
} from "../support-attachments-utils/constants";
import { buildSupportAttachmentS3Key } from "../support-attachments-utils/s3-key";
import { SupportServiceError } from "./SupportTicketService";

type UploadContext = {
  ticketId: string;
  userId: number;
  file: Express.Multer.File;
  uploaderRole: SupportAttachmentUploaderRole;
  visibility: SupportAttachmentVisibility;
};

export class SupportTicketAttachmentService {
  static async listClientAttachments(
    idOrPublicId: string,
    organizationId: number,
  ): Promise<SupportTicketAttachment[]> {
    const ticket = await SupportTicketModel.findClientTicket(
      idOrPublicId,
      organizationId,
    );
    if (!ticket) throw ticketNotFound();
    return SupportTicketAttachmentModel.listForTicket(ticket.id);
  }

  static async listAdminAttachments(
    idOrPublicId: string,
  ): Promise<SupportTicketAttachment[]> {
    const ticket = await SupportTicketModel.findAdminTicket(idOrPublicId);
    if (!ticket) throw ticketNotFound();
    return SupportTicketAttachmentModel.listForTicket(ticket.id, {
      includeInternal: true,
    });
  }

  static async uploadClientAttachment(
    idOrPublicId: string,
    organizationId: number,
    userId: number,
    file: Express.Multer.File,
  ): Promise<SupportTicketAttachment> {
    const ticket = await SupportTicketModel.findClientTicket(
      idOrPublicId,
      organizationId,
    );
    if (!ticket) throw ticketNotFound();

    return this.uploadForTicket({
      ticketId: ticket.id,
      userId,
      file,
      uploaderRole: "client",
      visibility: "client_visible",
    });
  }

  static async uploadAdminAttachment(
    idOrPublicId: string,
    userId: number,
    file: Express.Multer.File,
    visibility: SupportAttachmentVisibility,
  ): Promise<SupportTicketAttachment> {
    const ticket = await SupportTicketModel.findAdminTicket(idOrPublicId);
    if (!ticket) throw ticketNotFound();

    return this.uploadForTicket({
      ticketId: ticket.id,
      userId,
      file,
      uploaderRole: "admin",
      visibility,
    });
  }

  static async getClientAttachmentUrl(
    idOrPublicId: string,
    organizationId: number,
    attachmentId: string,
    forceDownload: boolean,
  ) {
    const ticket = await SupportTicketModel.findClientTicket(
      idOrPublicId,
      organizationId,
    );
    if (!ticket) throw ticketNotFound();

    const attachment = await SupportTicketAttachmentModel.findForTicket(
      ticket.id,
      attachmentId,
    );
    if (!attachment) throw attachmentNotFound();

    return this.buildSignedUrl(attachment, forceDownload);
  }

  static async getAdminAttachmentUrl(
    idOrPublicId: string,
    attachmentId: string,
    forceDownload: boolean,
  ) {
    const ticket = await SupportTicketModel.findAdminTicket(idOrPublicId);
    if (!ticket) throw ticketNotFound();

    const attachment = await SupportTicketAttachmentModel.findForTicket(
      ticket.id,
      attachmentId,
      { includeInternal: true },
    );
    if (!attachment) throw attachmentNotFound();

    return this.buildSignedUrl(attachment, forceDownload);
  }

  private static async uploadForTicket({
    ticketId,
    userId,
    file,
    uploaderRole,
    visibility,
  }: UploadContext): Promise<SupportTicketAttachment> {
    validateFile(file);

    const count = await SupportTicketAttachmentModel.countForTicket(ticketId);
    if (count >= MAX_ATTACHMENTS_PER_TICKET) {
      throw new SupportServiceError(
        "ATTACHMENT_LIMIT_REACHED",
        `You can attach up to ${MAX_ATTACHMENTS_PER_TICKET} files to a ticket.`,
        400,
      );
    }

    const filename = file.originalname || "attachment";
    const mimeType = file.mimetype || "application/octet-stream";
    const s3Key = buildSupportAttachmentS3Key(ticketId, filename);

    await uploadToS3(s3Key, file.buffer, mimeType);

    try {
      return await db.transaction(async (trx) => {
        const attachment = await SupportTicketAttachmentModel.create(
          {
            ticket_id: ticketId,
            uploaded_by_user_id: userId,
            uploader_role: uploaderRole,
            visibility,
            filename,
            s3_key: s3Key,
            mime_type: mimeType,
            size_bytes: file.size,
          },
          trx,
        );

        await SupportTicketEventModel.create(
          {
            ticket_id: ticketId,
            actor_user_id: userId,
            event_type: "attachment_added",
            metadata: {
              attachmentId: attachment.id,
              filename,
              mimeType,
              visibility,
            },
          },
          trx,
        );

        return attachment;
      });
    } catch (error) {
      await deleteFromS3(s3Key).catch(() => undefined);
      throw error;
    }
  }

  private static async buildSignedUrl(
    attachment: SupportTicketAttachment,
    forceDownload: boolean,
  ) {
    const expiresInSeconds = 3600;
    const url = await generatePresignedUrl(
      attachment.s3_key,
      expiresInSeconds,
      forceDownload ? attachment.filename : undefined,
    );
    return { url, expiresInSeconds };
  }
}

function validateFile(file: Express.Multer.File | undefined): void {
  if (!file) {
    throw new SupportServiceError(
      "ATTACHMENT_REQUIRED",
      "Choose a file to attach.",
      400,
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new SupportServiceError(
      "ATTACHMENT_TOO_LARGE",
      "Attachments must be 10MB or smaller.",
      413,
    );
  }

  const mimeType = file.mimetype || "application/octet-stream";
  if (!isMimeAllowed(mimeType)) {
    throw new SupportServiceError(
      "ATTACHMENT_TYPE_NOT_ALLOWED",
      "Attach an image, PDF, or plain text file.",
      400,
    );
  }
}

function ticketNotFound(): SupportServiceError {
  return new SupportServiceError(
    "TICKET_NOT_FOUND",
    "Support ticket not found.",
    404,
  );
}

function attachmentNotFound(): SupportServiceError {
  return new SupportServiceError(
    "ATTACHMENT_NOT_FOUND",
    "Attachment not found.",
    404,
  );
}
