import { Response } from "express";
import { LocationScopedRequest } from "../../middleware/rbac";
import {
  SupportTicketStatus,
  SupportTicketType,
} from "../../models/SupportTicketModel";
import {
  SupportServiceError,
  SupportTicketService,
} from "./support-services/SupportTicketService";
import {
  validateCreateSupportMessageInput,
  validateCreateSupportTicketInput,
} from "./support-utils/supportTicketValidation";
import {
  presentClientAttachment,
  presentClientMessage,
  presentClientTicket,
} from "./support-utils/supportTicketPresenter";
import { sendError, sendSuccess } from "./support-utils/supportResponses";
import logger from "../../lib/logger";

export async function listTickets(req: LocationScopedRequest, res: Response) {
  try {
    if (!req.organizationId) {
      return sendError(res, "ORGANIZATION_REQUIRED", "Organization is required.", 403);
    }

    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 25), 50);
    const filters = {
      status: normalizeStatus(req.query.status),
      type: normalizeType(req.query.type),
      limit,
      offset: (page - 1) * limit,
    };
    const result = await SupportTicketService.listClientTickets(
      req.organizationId,
      filters
    );

    return sendSuccess(res, {
      tickets: result.data.map(presentClientTicket),
      pagination: buildPagination(page, limit, result.total),
    });
  } catch (error) {
    return handleSupportError(res, error, "Failed to list support tickets.");
  }
}

export async function createTicket(req: LocationScopedRequest, res: Response) {
  try {
    if (!req.userId || !req.organizationId) {
      return sendError(res, "AUTH_REQUIRED", "Authentication is required.", 401);
    }

    const validation = validateCreateSupportTicketInput(req.body || {});
    if (!validation.valid || !validation.data) {
      return sendError(
        res,
        validation.error || "VALIDATION_ERROR",
        validation.message || "Invalid ticket details.",
        400
      );
    }

    const result = await SupportTicketService.createClientTicket({
      userId: req.userId,
      organizationId: req.organizationId,
      locationId: req.locationId,
      input: validation.data,
    });

    return sendSuccess(
      res,
      {
        ticket: presentClientTicket(result.ticket),
        messages: result.messages.map(presentClientMessage),
        attachments: result.attachments.map(presentClientAttachment),
      },
      201
    );
  } catch (error) {
    return handleSupportError(res, error, "Failed to create support ticket.");
  }
}

export async function getTicket(req: LocationScopedRequest, res: Response) {
  try {
    if (!req.organizationId) {
      return sendError(res, "ORGANIZATION_REQUIRED", "Organization is required.", 403);
    }

    const result = await SupportTicketService.getClientTicket(
      req.params.ticketId,
      req.organizationId
    );

    return sendSuccess(res, {
      ticket: presentClientTicket(result.ticket),
      messages: result.messages.map(presentClientMessage),
      attachments: result.attachments.map(presentClientAttachment),
    });
  } catch (error) {
    return handleSupportError(res, error, "Failed to load support ticket.");
  }
}

export async function addMessage(req: LocationScopedRequest, res: Response) {
  try {
    if (!req.userId || !req.organizationId) {
      return sendError(res, "AUTH_REQUIRED", "Authentication is required.", 401);
    }

    const validation = validateCreateSupportMessageInput(req.body || {});
    if (!validation.valid || !validation.data) {
      return sendError(
        res,
        validation.error || "VALIDATION_ERROR",
        validation.message || "Invalid message details.",
        400
      );
    }

    const result = await SupportTicketService.addClientMessage(
      req.params.ticketId,
      req.organizationId,
      req.userId,
      validation.data.body
    );

    return sendSuccess(res, {
      ticket: presentClientTicket(result.ticket),
      messages: result.messages.map(presentClientMessage),
      attachments: result.attachments.map(presentClientAttachment),
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

  logger.error({ err: error }, "[SupportTicketsController]");
  return sendError(res, "SUPPORT_ERROR", fallbackMessage, 500);
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
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
