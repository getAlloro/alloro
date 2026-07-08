/**
 * User Notification Email Template
 *
 * Sent to users in parallel with in-app notifications.
 * Triggered for:
 * - PMS job ready for review
 * - Practice ranking complete
 * - Monthly reports ready
 * - Task updates
 * - System notifications
 */

import type { UserNotificationData, SendEmailOptions } from "../types";
import { sendEmail } from "../emailService";
import {
  wrapInBaseTemplate,
  createButton,
  createCard,
  createTag,
  createDivider,
  BRAND_COLORS,
  APP_URL,
} from "./base";

// Notification type configurations
const NOTIFICATION_CONFIG: Record<
  UserNotificationData["notificationType"],
  {
    icon: string;
    tagLabel: string;
    tagType: "default" | "success" | "warning" | "error";
    defaultActionLabel: string;
    defaultActionPath: string;
  }
> = {
  pms_job_ready: {
    icon: "📊",
    tagLabel: "PMS Ready",
    tagType: "success",
    defaultActionLabel: "View Referral Data",
    defaultActionPath: "/dashboard?tab=referrals",
  },
  ranking_complete: {
    icon: "🏆",
    tagLabel: "Ranking Complete",
    tagType: "success",
    defaultActionLabel: "View Rankings",
    defaultActionPath: "/rankings",
  },
  monthly_report: {
    icon: "📈",
    tagLabel: "Monthly Report",
    tagType: "default",
    defaultActionLabel: "View Report",
    defaultActionPath: "/dashboard",
  },
  task_update: {
    icon: "✅",
    tagLabel: "Task Update",
    tagType: "default",
    defaultActionLabel: "View Tasks",
    defaultActionPath: "/dashboard?tab=tasks",
  },
  system: {
    icon: "🔔",
    tagLabel: "System",
    tagType: "default",
    defaultActionLabel: "Open Dashboard",
    defaultActionPath: "/dashboard",
  },
};

/**
 * Build the user notification email content
 */
export function buildUserNotificationContent(
  data: UserNotificationData
): string {
  const config = NOTIFICATION_CONFIG[data.notificationType];
  const sections: string[] = [];

  // Header with icon
  sections.push(`
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 64px; height: 64px; background-color: ${
        BRAND_COLORS.orange
      }15; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <span style="font-size: 32px;">${config.icon}</span>
      </div>
      <div style="margin-bottom: 12px;">
        ${createTag(config.tagLabel, config.tagType)}
      </div>
      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: ${
        BRAND_COLORS.navy
      };">
        ${escapeHtml(data.title)}
      </h1>
    </div>
  `);

  // Greeting (if name provided)
  if (data.recipientName) {
    sections.push(`
      <p style="margin: 0 0 16px 0; font-size: 15px; color: ${
        BRAND_COLORS.darkGray
      };">
        Hi ${escapeHtml(data.recipientName)},
      </p>
    `);
  }

  // Main message
  sections.push(`
    <div style="background-color: ${
      BRAND_COLORS.lightGray
    }; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 15px; line-height: 1.7; color: ${
        BRAND_COLORS.darkGray
      }; white-space: pre-wrap;">
${escapeHtml(data.message)}
      </p>
    </div>
  `);

  // Metadata card (if provided)
  if (data.metadata && Object.keys(data.metadata).length > 0) {
    const metadataRows = Object.entries(data.metadata)
      .filter(([_, value]) => value !== null && value !== undefined)
      .map(
        ([key, value]) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid ${
            BRAND_COLORS.border
          };">
            <span style="font-size: 12px; color: ${
              BRAND_COLORS.mediumGray
            }; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">
              ${formatMetadataKey(key)}
            </span>
            <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: ${
              BRAND_COLORS.navy
            };">
              ${formatMetadataValue(value)}
            </p>
          </td>
        </tr>
      `
      )
      .join("");

    if (metadataRows) {
      const metadataContent = `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          ${metadataRows}
        </table>
      `;
      sections.push(createCard(metadataContent));
    }
  }

  // Primary CTA
  const actionUrl = data.actionUrl || `${APP_URL}${config.defaultActionPath}`;
  const actionLabel = data.actionLabel || config.defaultActionLabel;

  sections.push(`
    <div style="text-align: center; margin-top: 24px;">
      ${createButton(actionLabel, actionUrl)}
    </div>
  `);

  // Divider before footer note
  sections.push(createDivider());

  // Footer note
  sections.push(`
    <p style="margin: 0; font-size: 12px; color: ${BRAND_COLORS.mediumGray}; text-align: center;">
      This notification was also sent to your Alloro dashboard.
      <br>
      <a href="${APP_URL}/notifications" style="color: ${BRAND_COLORS.orange}; text-decoration: none;">
        View all notifications
      </a>
    </p>
  `);

  return sections.join("");
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Format metadata key for display (snake_case to Title Case)
 */
function formatMetadataKey(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Format metadata value for display
 */
function formatMetadataValue(value: any): string {
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  return String(value);
}

/**
 * Build the full email payload for user notification
 */
export function buildUserNotificationEmail(
  data: UserNotificationData
): SendEmailOptions {
  const content = buildUserNotificationContent(data);
  const body = wrapInBaseTemplate(content, {
    preheader: data.message.slice(0, 100),
    showFooterLinks: true,
  });

  // Build subject with emoji prefix based on type
  const config = NOTIFICATION_CONFIG[data.notificationType];
  const subject = `${config.icon} ${data.title}`;

  return {
    subject,
    body,
    recipients: [data.recipientEmail],
    preheader: data.message.slice(0, 100),
  };
}

/**
 * Send notification email to user
 */
export async function sendUserNotification(data: UserNotificationData) {
  const email = buildUserNotificationEmail(data);
  return sendEmail({ ...email, category: "notification" });
}

export default sendUserNotification;
