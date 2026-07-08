import { sendEmail, getAdminEmails } from "../../../emails/emailService";
import {
  APP_URL,
  BRAND_COLORS,
  createButton,
  createCard,
  createTag,
  wrapInBaseTemplate,
} from "../../../emails/templates/base";
import { SupportTicket } from "../../../models/SupportTicketModel";

type TicketEmailContext = {
  ticket: SupportTicket;
  recipientEmail: string;
  recipientName?: string | null;
  organizationName?: string | null;
};

const SUPPORT_FROM_EMAIL =
  process.env.SUPPORT_EMAIL_FROM || "jordan@getalloro.com";
const SUPPORT_FROM_NAME =
  process.env.SUPPORT_EMAIL_FROM_NAME || "Jordan at Alloro";

const TYPE_LABELS: Record<SupportTicket["type"], string> = {
  bug_report: "Bug report",
  feature_request: "Feature request",
  website_edit: "Website edit",
};

export async function sendSupportAcknowledgementEmail(
  context: TicketEmailContext
): Promise<boolean> {
  const { ticket, recipientEmail, recipientName } = context;
  const body = wrapInBaseTemplate(
    `
      <h1 style="margin: 0 0 12px 0; color: ${BRAND_COLORS.navy}; font-size: 24px;">
        We received your ${TYPE_LABELS[ticket.type].toLowerCase()}.
      </h1>
      <p style="margin: 0 0 20px 0; color: ${BRAND_COLORS.mediumGray}; line-height: 1.6;">
        ${recipientName ? `Hi ${escapeHtml(recipientName)}, ` : ""}your request is now in the Alloro support queue.
      </p>
      ${createCard(`
        <p style="margin: 0 0 8px 0; color: ${BRAND_COLORS.mediumGray}; font-size: 13px;">Ticket</p>
        <p style="margin: 0 0 12px 0; color: ${BRAND_COLORS.navy}; font-size: 18px; font-weight: 700;">${escapeHtml(ticket.public_id)} - ${escapeHtml(ticket.title)}</p>
        ${createTag(TYPE_LABELS[ticket.type])}
      `)}
      <p style="margin: 20px 0; color: ${BRAND_COLORS.darkGray}; line-height: 1.6;">
        You can track status and replies from the Help page in your dashboard.
      </p>
      ${createButton("View ticket", `${APP_URL}/help?ticket=${ticket.id}`)}
    `,
    {
      preheader: `${ticket.public_id} is now in the Alloro support queue.`,
    }
  );

  const result = await sendEmail({
    subject: getAcknowledgementSubject(ticket.type),
    body,
    recipients: [recipientEmail],
    from: SUPPORT_FROM_EMAIL,
    fromName: SUPPORT_FROM_NAME,
    category: "support",
  });

  return result.success;
}

export async function sendWebsiteResolvedEmail(
  context: TicketEmailContext
): Promise<boolean> {
  const { ticket, recipientEmail, recipientName } = context;
  const body = wrapInBaseTemplate(
    `
      <h1 style="margin: 0 0 12px 0; color: ${BRAND_COLORS.navy}; font-size: 24px;">
        Your website update is live.
      </h1>
      <p style="margin: 0 0 20px 0; color: ${BRAND_COLORS.mediumGray}; line-height: 1.6;">
        ${recipientName ? `Hi ${escapeHtml(recipientName)}, ` : ""}we completed the requested website edit.
      </p>
      ${createCard(`
        <p style="margin: 0 0 8px 0; color: ${BRAND_COLORS.mediumGray}; font-size: 13px;">Ticket</p>
        <p style="margin: 0 0 12px 0; color: ${BRAND_COLORS.navy}; font-size: 18px; font-weight: 700;">${escapeHtml(ticket.public_id)} - ${escapeHtml(ticket.title)}</p>
        <p style="margin: 0; color: ${BRAND_COLORS.darkGray}; line-height: 1.6;">${escapeHtml(ticket.resolution_notes || "The requested change has been completed.")}</p>
      `)}
      ${createButton("Review in dashboard", `${APP_URL}/help?ticket=${ticket.id}`)}
    `,
    {
      preheader: `${ticket.public_id} has been marked resolved.`,
    }
  );

  const result = await sendEmail({
    subject: "Your website update is live",
    body,
    recipients: [recipientEmail],
    from: SUPPORT_FROM_EMAIL,
    fromName: SUPPORT_FROM_NAME,
    category: "support",
  });

  return result.success;
}

export async function sendSupportAdminNotificationEmail(
  ticket: SupportTicket,
  organizationName?: string | null
): Promise<boolean> {
  const recipients = getSupportAdminEmails();
  if (recipients.length === 0) return false;

  const body = wrapInBaseTemplate(
    `
      <h1 style="margin: 0 0 12px 0; color: ${BRAND_COLORS.navy}; font-size: 24px;">
        New support ticket
      </h1>
      ${createCard(`
        <p style="margin: 0 0 8px 0; color: ${BRAND_COLORS.mediumGray}; font-size: 13px;">${escapeHtml(organizationName || "Client")}</p>
        <p style="margin: 0 0 12px 0; color: ${BRAND_COLORS.navy}; font-size: 18px; font-weight: 700;">${escapeHtml(ticket.public_id)} - ${escapeHtml(ticket.title)}</p>
        ${createTag(TYPE_LABELS[ticket.type])}
      `)}
      ${createButton("Open admin queue", `${APP_URL}/admin/support?ticket=${ticket.id}`)}
    `,
    { preheader: `${ticket.public_id} needs triage.` }
  );

  const result = await sendEmail({
    subject: `[Support] ${ticket.public_id}: ${ticket.title}`,
    body,
    recipients,
    from: SUPPORT_FROM_EMAIL,
    fromName: SUPPORT_FROM_NAME,
    category: "support",
  });

  return result.success;
}

function getAcknowledgementSubject(type: SupportTicket["type"]): string {
  if (type === "bug_report") return "We got your report - we're on it";
  if (type === "feature_request") {
    return "Feature request received - thank you";
  }
  return "Website edit request received";
}

function getSupportAdminEmails(): string[] {
  const supportEmails = (process.env.SUPPORT_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  return supportEmails.length > 0 ? supportEmails : getAdminEmails();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char] || char;
  });
}
