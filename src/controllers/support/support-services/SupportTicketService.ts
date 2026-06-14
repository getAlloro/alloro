import { OrganizationModel } from "../../../models/OrganizationModel";
import {
  AdminTicketFilters,
  ClientTicketFilters,
  SupportTicket,
  SupportTicketListItem,
  SupportTicketModel,
} from "../../../models/SupportTicketModel";
import {
  SupportTicketAttachment,
  SupportTicketAttachmentModel,
} from "../../../models/SupportTicketAttachmentModel";
import { SupportTicketEventModel } from "../../../models/SupportTicketEventModel";
import {
  SupportMessageVisibility,
  SupportTicketMessage,
  SupportTicketMessageModel,
} from "../../../models/SupportTicketMessageModel";
import { UserModel } from "../../../models/UserModel";
import {
  AdminSupportTicketUpdateData,
  CreateSupportTicketData,
} from "../support-utils/supportTicketValidation";
import {
  buildAdminUpdateData,
  buildInitialMessage,
  buildPublicId,
  buildTitle,
  displayUserName,
  resolveAssigneeId,
} from "./SupportTicketHelpers";
import { notifyClientOfAdminReply } from "./SupportTicketClientNotificationService";
import {
  maybeSendResolvedTicketEmail,
  sendCreateTicketEmails,
} from "./SupportTicketNotificationService";

export class SupportServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

type TicketWithMessages = {
  ticket: SupportTicket | SupportTicketListItem;
  messages: SupportTicketMessage[];
  attachments: SupportTicketAttachment[];
};

type CreateTicketContext = {
  userId: number;
  organizationId: number;
  locationId?: number | null;
  input: CreateSupportTicketData;
};

export class SupportTicketService {
  static async createClientTicket(
    context: CreateTicketContext,
  ): Promise<TicketWithMessages> {
    const user = await UserModel.findById(context.userId);
    const organization = await OrganizationModel.findById(
      context.organizationId,
    );
    if (!user || !organization) {
      throw new SupportServiceError(
        "SUPPORT_CONTEXT_NOT_FOUND",
        "We could not verify your account for this request.",
        404,
      );
    }

    const assigneeId = await resolveAssigneeId(context.input.type);
    const ticket = await SupportTicketModel.transaction(async (trx) => {
      const sequence = await SupportTicketModel.nextPublicSequence(trx);
      const created = await SupportTicketModel.create(
        {
          public_id: buildPublicId(context.input.type, sequence),
          organization_id: context.organizationId,
          location_id: context.input.locationId ?? context.locationId ?? null,
          created_by_user_id: context.userId,
          assigned_to_user_id: assigneeId,
          type: context.input.type,
          title: buildTitle(context.input.type, context.input.guidedAnswers),
          current_page_url: context.input.currentPageUrl || null,
          requested_completion_date:
            context.input.requestedCompletionDate || null,
          guided_answers: context.input.guidedAnswers,
        },
        trx,
      );

      await SupportTicketMessageModel.create(
        {
          ticket_id: created.id,
          author_user_id: context.userId,
          author_role: "client",
          visibility: "client_visible",
          body: buildInitialMessage(context.input),
        },
        trx,
      );

      await SupportTicketEventModel.create(
        {
          ticket_id: created.id,
          actor_user_id: context.userId,
          event_type: "ticket_created",
          metadata: { type: created.type, assigneeId },
        },
        trx,
      );

      return created;
    });

    void sendCreateTicketEmails(
      ticket,
      user.email,
      displayUserName(user),
      organization.name,
    );

    return this.getClientTicket(ticket.id, context.organizationId);
  }

  static async listClientTickets(
    organizationId: number,
    filters: ClientTicketFilters,
  ) {
    return SupportTicketModel.listClientTickets(organizationId, filters);
  }

  static async getClientTicket(
    idOrPublicId: string,
    organizationId: number,
  ): Promise<TicketWithMessages> {
    const ticket = await SupportTicketModel.findClientTicket(
      idOrPublicId,
      organizationId,
    );
    if (!ticket) {
      throw new SupportServiceError(
        "TICKET_NOT_FOUND",
        "Support ticket not found.",
        404,
      );
    }

    const messages = await SupportTicketMessageModel.listForTicket(ticket.id);
    const attachments = await SupportTicketAttachmentModel.listForTicket(
      ticket.id,
    );
    return { ticket, messages, attachments };
  }

  static async addClientMessage(
    idOrPublicId: string,
    organizationId: number,
    userId: number,
    body: string,
  ): Promise<TicketWithMessages> {
    const existing = await SupportTicketModel.findClientTicket(
      idOrPublicId,
      organizationId,
    );
    if (!existing) {
      throw new SupportServiceError(
        "TICKET_NOT_FOUND",
        "Support ticket not found.",
        404,
      );
    }
    if (["resolved", "wont_fix", "archived"].includes(existing.status)) {
      throw new SupportServiceError(
        "TICKET_CLOSED",
        "This ticket is closed. Create a new ticket if you need more help.",
        400,
      );
    }

    await SupportTicketModel.transaction(async (trx) => {
      await SupportTicketMessageModel.create(
        {
          ticket_id: existing.id,
          author_user_id: userId,
          author_role: "client",
          visibility: "client_visible",
          body,
        },
        trx,
      );

      if (existing.status === "waiting_on_client") {
        await SupportTicketModel.updateTicket(
          existing.id,
          { status: "in_progress" },
          trx,
        );
      }

      await SupportTicketEventModel.create(
        {
          ticket_id: existing.id,
          actor_user_id: userId,
          event_type: "client_message_added",
          metadata: {},
        },
        trx,
      );
    });

    return this.getClientTicket(existing.id, organizationId);
  }

  static async listAdminTickets(filters: AdminTicketFilters) {
    return SupportTicketModel.listAdminTickets(filters);
  }

  static async getAdminTicket(
    idOrPublicId: string,
  ): Promise<TicketWithMessages> {
    const ticket = await SupportTicketModel.findAdminTicket(idOrPublicId);
    if (!ticket) {
      throw new SupportServiceError(
        "TICKET_NOT_FOUND",
        "Support ticket not found.",
        404,
      );
    }

    const messages = await SupportTicketMessageModel.listForTicket(ticket.id, {
      includeInternal: true,
    });
    const attachments = await SupportTicketAttachmentModel.listForTicket(
      ticket.id,
      { includeInternal: true },
    );
    return { ticket, messages, attachments };
  }

  static async updateAdminTicket(
    idOrPublicId: string,
    actorUserId: number,
    input: AdminSupportTicketUpdateData,
  ): Promise<TicketWithMessages> {
    const existing = await SupportTicketModel.findAdminTicket(idOrPublicId);
    if (!existing) {
      throw new SupportServiceError(
        "TICKET_NOT_FOUND",
        "Support ticket not found.",
        404,
      );
    }

    assertAdminUpdateAllowed(existing, input);

    const updateData = buildAdminUpdateData(input);
    const updated = await SupportTicketModel.transaction(async (trx) => {
      const ticket = await SupportTicketModel.updateTicket(
        existing.id,
        updateData,
        trx,
      );

      await SupportTicketEventModel.create(
        {
          ticket_id: existing.id,
          actor_user_id: actorUserId,
          event_type: "admin_ticket_updated",
          metadata: { changes: updateData },
        },
        trx,
      );

      return ticket || existing;
    });

    await maybeSendResolvedTicketEmail(existing, updated);
    return this.getAdminTicket(existing.id);
  }

  static async addAdminMessage(
    idOrPublicId: string,
    actorUserId: number,
    body: string,
    visibility: SupportMessageVisibility,
  ): Promise<TicketWithMessages> {
    const existing = await SupportTicketModel.findAdminTicket(idOrPublicId);
    if (!existing) {
      throw new SupportServiceError(
        "TICKET_NOT_FOUND",
        "Support ticket not found.",
        404,
      );
    }

    await SupportTicketModel.transaction(async (trx) => {
      await SupportTicketMessageModel.create(
        {
          ticket_id: existing.id,
          author_user_id: actorUserId,
          author_role: "admin",
          visibility,
          body,
        },
        trx,
      );

      await SupportTicketEventModel.create(
        {
          ticket_id: existing.id,
          actor_user_id: actorUserId,
          event_type: "admin_message_added",
          metadata: { visibility },
        },
        trx,
      );
    });

    if (visibility === "client_visible" && existing.status !== "archived") {
      void notifyClientOfAdminReply(existing, body);
    }

    return this.getAdminTicket(existing.id);
  }
}

function assertAdminUpdateAllowed(
  existing: SupportTicket | SupportTicketListItem,
  input: AdminSupportTicketUpdateData,
): void {
  const nextStatus = input.status ?? existing.status;
  const nextResolution =
    input.resolutionNotes !== undefined
      ? input.resolutionNotes
      : existing.resolution_notes;

  if (["resolved", "wont_fix", "archived"].includes(nextStatus)) {
    if (!nextResolution?.trim()) {
      throw new SupportServiceError(
        "MISSING_RESOLUTION",
        "Add resolution notes before closing or archiving a ticket.",
        400,
      );
    }
  }
}
