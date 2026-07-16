import { sendEmail } from "../../../emails/emailService";
import {
  APP_URL,
  BRAND_COLORS,
  createButton,
  createCard,
  wrapInBaseTemplate,
} from "../../../emails/templates/base";
import { PmProjectModel } from "../../../models/PmProjectModel";
import { UserModel } from "../../../models/UserModel";
import logger from "../../../lib/logger";

const COMMENT_PREVIEW_MAX = 280;
const TASK_TITLE_MAX = 120;

type InternalRecipient = {
  id: number;
  email: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type PmMentionEmailInput = {
  actorUserId: number;
  projectId: string;
  taskId: string;
  taskTitle: string;
  commentBody: string;
  mentionedUserIds: number[];
};

export type PmMovementEmailInput = {
  actorUserId: number;
  projectId: string;
  taskId: string;
  taskTitle: string;
  recipientUserIds: Array<number | null | undefined>;
  fromLabel: string;
  toLabel: string;
  movementLabel: string;
};

function uniqueRecipientIds(
  ids: Array<number | null | undefined>,
  actorUserId: number
): number[] {
  return Array.from(
    new Set(
      ids.filter(
        (id): id is number =>
          typeof id === "number" && Number.isInteger(id) && id !== actorUserId
      )
    )
  );
}

function displayName(user: InternalRecipient): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName.trim() || user.name || user.email.split("@")[0];
}

function truncate(value: string, max: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}...`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char] ?? char;
  });
}

async function actorName(actorUserId: number): Promise<string> {
  const actor = await UserModel.findEmailById(actorUserId);
  return actor?.email ? actor.email.split("@")[0] : `user ${actorUserId}`;
}

async function projectName(projectId: string): Promise<string> {
  const project = await PmProjectModel.findNameById(projectId);
  return project?.name ?? "Alloro project";
}

function taskUrl(projectId: string, taskId: string, tab: "comments" | "details"): string {
  return `${APP_URL}/admin/pm/${projectId}?task=${encodeURIComponent(
    taskId
  )}&tab=${tab}`;
}

function notificationShell(params: {
  eyebrow: string;
  title: string;
  summary: string;
  rows: Array<{ label: string; value: string }>;
  buttonLabel: string;
  url: string;
}): string {
  const rowHtml = params.rows
    .map(
      (row) => `
        <tr>
          <td style="padding: 9px 0; border-bottom: 1px solid ${BRAND_COLORS.border};">
            <p style="margin: 0 0 3px; color: ${BRAND_COLORS.mediumGray}; font-size: 11px; font-weight: 700; text-transform: uppercase;">${escapeHtml(row.label)}</p>
            <p style="margin: 0; color: ${BRAND_COLORS.navy}; font-size: 14px; font-weight: 600;">${escapeHtml(row.value)}</p>
          </td>
        </tr>`
    )
    .join("");

  const content = `
    <p style="margin: 0 0 10px; color: ${BRAND_COLORS.orange}; font-size: 12px; font-weight: 800; text-transform: uppercase;">${escapeHtml(params.eyebrow)}</p>
    <h1 style="margin: 0 0 16px; color: ${BRAND_COLORS.navy}; font-size: 24px; line-height: 1.2;">${escapeHtml(params.title)}</h1>
    <p style="margin: 0 0 20px; color: ${BRAND_COLORS.darkGray}; font-size: 15px; line-height: 1.65;">${escapeHtml(params.summary)}</p>
    ${createCard(`<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">${rowHtml}</table>`)}
    <div style="margin-top: 24px; text-align: center;">${createButton(params.buttonLabel, params.url)}</div>
  `;

  return wrapInBaseTemplate(content, {
    preheader: params.summary,
    showFooterLinks: false,
  });
}

async function sendToRecipients(params: {
  recipients: InternalRecipient[];
  subject: string;
  body: string;
}): Promise<void> {
  const sends = params.recipients.map(async (recipient) => {
    const result = await sendEmail({
      subject: params.subject,
      body: params.body,
      recipients: [recipient.email],
      category: "notification",
    });
    if (!result.success) {
      logger.warn(
        { recipient: recipient.email, error: result.error },
        "[PM-EMAIL] notification send failed"
      );
    }
  });

  await Promise.all(sends);
}

export async function sendPmMentionEmails(
  input: PmMentionEmailInput
): Promise<void> {
  try {
    const recipientIds = uniqueRecipientIds(input.mentionedUserIds, input.actorUserId);
    if (recipientIds.length === 0) return;

    const [recipients, actor, project] = await Promise.all([
      UserModel.findInternalProfilesByIds(recipientIds),
      actorName(input.actorUserId),
      projectName(input.projectId),
    ]);
    if (recipients.length === 0) return;

    const task = truncate(input.taskTitle, TASK_TITLE_MAX);
    const preview = truncate(input.commentBody, COMMENT_PREVIEW_MAX);
    const url = taskUrl(input.projectId, input.taskId, "comments");
    const body = notificationShell({
      eyebrow: "Project board mention",
      title: `${actor} mentioned you`,
      summary: preview,
      rows: [
        { label: "Project", value: project },
        { label: "Task", value: task },
        { label: "Mentioned", value: recipients.map(displayName).join(", ") },
      ],
      buttonLabel: "Open comment",
      url,
    });

    await sendToRecipients({
      recipients,
      subject: `[Alloro PM] ${actor} mentioned you in ${task}`,
      body,
    });
  } catch (error) {
    logger.warn({ err: error, taskId: input.taskId }, "[PM-EMAIL] mention email failed");
  }
}

export async function sendPmMovementEmails(
  input: PmMovementEmailInput
): Promise<void> {
  try {
    const recipientIds = uniqueRecipientIds(input.recipientUserIds, input.actorUserId);
    if (recipientIds.length === 0) return;

    const [recipients, actor, project] = await Promise.all([
      UserModel.findInternalProfilesByIds(recipientIds),
      actorName(input.actorUserId),
      projectName(input.projectId),
    ]);
    if (recipients.length === 0) return;

    const task = truncate(input.taskTitle, TASK_TITLE_MAX);
    const url = taskUrl(input.projectId, input.taskId, "details");
    const summary = `${actor} moved "${task}" from ${input.fromLabel} to ${input.toLabel}.`;
    const body = notificationShell({
      eyebrow: "Project board movement",
      title: input.movementLabel,
      summary,
      rows: [
        { label: "Project", value: project },
        { label: "Task", value: task },
        { label: "From", value: input.fromLabel },
        { label: "To", value: input.toLabel },
      ],
      buttonLabel: "Open task",
      url,
    });

    await sendToRecipients({
      recipients,
      subject: `[Alloro PM] ${input.movementLabel}: ${task}`,
      body,
    });
  } catch (error) {
    logger.warn({ err: error, taskId: input.taskId }, "[PM-EMAIL] movement email failed");
  }
}
