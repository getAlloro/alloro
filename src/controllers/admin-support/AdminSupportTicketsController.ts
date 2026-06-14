import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import {
  SupportTicketStatus,
  SupportTicketType,
} from "../../models/SupportTicketModel";
import {
  SupportServiceError,
  SupportTicketService,
} from "../support/support-services/SupportTicketService";
import { sendError, sendSuccess } from "../support/support-utils/supportResponses";
import {
  presentAdminMessage,
  presentAdminAttachment,
  presentAdminTicket,
} from "../support/support-utils/supportTicketPresenter";
import {
  validateAdminSupportMessageInput,
  validateAdminSupportTicketUpdateInput,
} from "../support/support-utils/supportTicketValidation";
import logger from "../../lib/logger";

export async function listTickets(req: Request, res: Response) {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 100);
    const assigned = parseAssignedFilter(req.query.assignedToUserId);

    const result = await SupportTicketService.listAdminTickets({
      status: normalizeStatus(req.query.status),
      type: normalizeType(req.query.type),
      organizationId: parseOptionalNumber(req.query.organizationId),
      assignedToUserId: assigned,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      limit,
      offset: (page - 1) * limit,
    });

    return sendSuccess(res, {
      tickets: result.data.map(presentAdminTicket),
      pagination: buildPagination(page, limit, result.total),
    });
  } catch (error) {
    return handleSupportError(res, error, "Failed to list support tickets.");
  }
}

export async function getTicket(req: Request, res: Response) {
  try {
    const result = await SupportTicketService.getAdminTicket(req.params.ticketId);
    return sendSuccess(res, {
      ticket: presentAdminTicket(result.ticket),
      messages: result.messages.map(presentAdminMessage),
      attachments: result.attachments.map(presentAdminAttachment),
    });
  } catch (error) {
    return handleSupportError(res, error, "Failed to load support ticket.");
  }
}

export async function updateTicket(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return sendError(res, "AUTH_REQUIRED", "Authentication is required.", 401);
    }

    const validation = validateAdminSupportTicketUpdateInput(req.body || {});
    if (!validation.valid || !validation.data) {
      return sendError(
        res,
        validation.error || "VALIDATION_ERROR",
        validation.message || "Invalid ticket update.",
        400
      );
    }

    const result = await SupportTicketService.updateAdminTicket(
      req.params.ticketId,
      userId,
      validation.data
    );

    return sendSuccess(res, {
      ticket: presentAdminTicket(result.ticket),
      messages: result.messages.map(presentAdminMessage),
      attachments: result.attachments.map(presentAdminAttachment),
    });
  } catch (error) {
    return handleSupportError(res, error, "Failed to update support ticket.");
  }
}

export async function addMessage(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return sendError(res, "AUTH_REQUIRED", "Authentication is required.", 401);
    }

    const validation = validateAdminSupportMessageInput(req.body || {});
    if (!validation.valid || !validation.data) {
      return sendError(
        res,
        validation.error || "VALIDATION_ERROR",
        validation.message || "Invalid support message.",
        400
      );
    }

    const result = await SupportTicketService.addAdminMessage(
      req.params.ticketId,
      userId,
      validation.data.body,
      validation.data.visibility
    );

    return sendSuccess(res, {
      ticket: presentAdminTicket(result.ticket),
      messages: result.messages.map(presentAdminMessage),
      attachments: result.attachments.map(presentAdminAttachment),
    });
  } catch (error) {
    return handleSupportError(res, error, "Failed to add support message.");
  }
}

function handleSupportError(
  res: Response,
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof SupportServiceError) {
    return sendError(res, error.code, error.message, error.statusCode);
  }

  logger.error({ err: error }, "[AdminSupportTicketsController]");
  return sendError(res, "SUPPORT_ERROR", fallbackMessage, 500);
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function parseAssignedFilter(value: unknown): number | "unassigned" | undefined {
  if (value === "unassigned") return "unassigned";
  return parseOptionalNumber(value);
}

function normalizeStatus(value: unknown): SupportTicketStatus | "open" | undefined {
  return typeof value === "string" && value ? (value as SupportTicketStatus | "open") : undefined;
}

function normalizeType(value: unknown): SupportTicketType | undefined {
  return typeof value === "string" && value ? (value as SupportTicketType) : undefined;
}

function buildPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
