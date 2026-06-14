import { SupportTicket, SupportTicketModel } from "../../../models/SupportTicketModel";
import { UserModel } from "../../../models/UserModel";
import {
  sendSupportAcknowledgementEmail,
  sendSupportAdminNotificationEmail,
  sendWebsiteResolvedEmail,
} from "./SupportEmailService";
import { displayUserName } from "./SupportTicketHelpers";
import logger from "../../../lib/logger";

export async function sendCreateTicketEmails(
  ticket: SupportTicket,
  recipientEmail: string,
  recipientName: string | null,
  organizationName: string | null
): Promise<void> {
  try {
    const didSendAck = await sendSupportAcknowledgementEmail({
      ticket,
      recipientEmail,
      recipientName,
      organizationName,
    });
    if (didSendAck) {
      await SupportTicketModel.updateTicket(ticket.id, {
        ack_email_sent_at: new Date(),
      });
    }
    await sendSupportAdminNotificationEmail(ticket, organizationName);
  } catch (error) {
    logger.error({ err: error }, "[SupportTicketNotificationService] Ticket email failed");
  }
}

export async function maybeSendResolvedTicketEmail(
  existing: SupportTicket,
  updated: SupportTicket
): Promise<void> {
  if (
    existing.type !== "website_edit" ||
    existing.status === "resolved" ||
    updated.status !== "resolved" ||
    updated.resolved_email_sent_at
  ) {
    return;
  }

  const userId = updated.created_by_user_id;
  if (!userId) return;

  const user = await UserModel.findById(userId);
  if (!user?.email) return;

  const didSend = await sendWebsiteResolvedEmail({
    ticket: updated,
    recipientEmail: user.email,
    recipientName: displayUserName(user),
  });

  if (didSend) {
    await SupportTicketModel.updateTicket(updated.id, {
      resolved_email_sent_at: new Date(),
    });
  }
}
