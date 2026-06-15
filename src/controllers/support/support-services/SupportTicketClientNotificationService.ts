import { NotificationModel } from "../../../models/NotificationModel";
import type { SupportTicket } from "../../../models/SupportTicketModel";
import logger from "../../../lib/logger";

const SUPPORT_REPLY_MESSAGE_LIMIT = 180;

export async function notifyClientOfAdminReply(
  ticket: SupportTicket,
  body: string,
): Promise<void> {
  try {
    await NotificationModel.create({
      organization_id: ticket.organization_id,
      location_id: ticket.location_id,
      title: `Support replied to ${ticket.public_id}`,
      message: truncateMessage(body),
      type: "system",
      metadata: {
        kind: "support_ticket_reply",
        ticketId: ticket.id,
        publicId: ticket.public_id,
        actionPath: `/help?ticket=${ticket.id}`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[SupportTicketClientNotificationService]");
  }
}

function truncateMessage(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= SUPPORT_REPLY_MESSAGE_LIMIT) {
    return trimmed;
  }
  return `${trimmed.slice(0, SUPPORT_REPLY_MESSAGE_LIMIT - 1)}...`;
}
