import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { LocationScopedRequest } from "../../middleware/rbac";
import { SupportTicketAttachmentService } from "./support-services/SupportTicketAttachmentService";
import { SupportServiceError } from "./support-services/SupportTicketService";
import { sendError, sendSuccess } from "./support-utils/supportResponses";
import {
  presentAdminAttachment,
  presentClientAttachment,
} from "./support-utils/supportTicketPresenter";

export async function listClientAttachments(
  req: LocationScopedRequest,
  res: Response,
) {
  try {
    if (!req.organizationId) {
      return sendError(
        res,
        "ORGANIZATION_REQUIRED",
        "Organization is required.",
        403,
      );
    }

    const attachments =
      await SupportTicketAttachmentService.listClientAttachments(
        req.params.ticketId,
        req.organizationId,
      );

    return sendSuccess(res, {
      attachments: attachments.map(presentClientAttachment),
    });
  } catch (error) {
    return handleSupportError(res, error, "Failed to list attachments.");
  }
}

export async function uploadClientAttachment(
  req: LocationScopedRequest,
  res: Response,
) {
  try {
    if (!req.userId || !req.organizationId) {
      return sendError(res, "AUTH_REQUIRED", "Authentication is required.", 401);
    }

    const attachment =
      await SupportTicketAttachmentService.uploadClientAttachment(
        req.params.ticketId,
        req.organizationId,
        req.userId,
        (req as AuthRequest).file as Express.Multer.File,
      );

    return sendSuccess(
      res,
      { attachment: presentClientAttachment(attachment) },
      201,
    );
  } catch (error) {
    return handleSupportError(res, error, "Failed to upload attachment.");
  }
}

export async function getClientAttachmentUrl(
  req: LocationScopedRequest,
  res: Response,
) {
  try {
    if (!req.organizationId) {
      return sendError(
        res,
        "ORGANIZATION_REQUIRED",
        "Organization is required.",
        403,
      );
    }

    const data = await SupportTicketAttachmentService.getClientAttachmentUrl(
      req.params.ticketId,
      req.organizationId,
      req.params.attachmentId,
      req.query.download === "1",
    );

    return sendSuccess(res, data);
  } catch (error) {
    return handleSupportError(res, error, "Failed to load attachment.");
  }
}

export async function listAdminAttachments(req: AuthRequest, res: Response) {
  try {
    const attachments = await SupportTicketAttachmentService.listAdminAttachments(
      req.params.ticketId,
    );

    return sendSuccess(res, {
      attachments: attachments.map(presentAdminAttachment),
    });
  } catch (error) {
    return handleSupportError(res, error, "Failed to list attachments.");
  }
}

export async function uploadAdminAttachment(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return sendError(res, "AUTH_REQUIRED", "Authentication is required.", 401);
    }

    const visibility =
      req.body?.visibility === "internal" ? "internal" : "client_visible";
    const attachment =
      await SupportTicketAttachmentService.uploadAdminAttachment(
        req.params.ticketId,
        userId,
        req.file as Express.Multer.File,
        visibility,
      );

    return sendSuccess(
      res,
      { attachment: presentAdminAttachment(attachment) },
      201,
    );
  } catch (error) {
    return handleSupportError(res, error, "Failed to upload attachment.");
  }
}

export async function getAdminAttachmentUrl(req: AuthRequest, res: Response) {
  try {
    const data = await SupportTicketAttachmentService.getAdminAttachmentUrl(
      req.params.ticketId,
      req.params.attachmentId,
      req.query.download === "1",
    );

    return sendSuccess(res, data);
  } catch (error) {
    return handleSupportError(res, error, "Failed to load attachment.");
  }
}

function handleSupportError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof SupportServiceError) {
    return sendError(res, error.code, error.message, error.statusCode);
  }

  return sendError(res, "SUPPORT_ATTACHMENT_ERROR", fallbackMessage, 500);
}
