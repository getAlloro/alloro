/**
 * Admin Notification Email Template
 *
 * Sent to admin team after:
 * - Monthly agents run completion
 * - Practice ranking completion
 */

import type { AdminNotificationData, SendEmailOptions } from "../types";
import { sendToAdmins } from "../emailService";
import {
  wrapInBaseTemplate,
  createButton,
  createCard,
  createTag,
  createDivider,
  createList,
  highlight,
  BRAND_COLORS,
  APP_URL,
} from "./base";

/**
 * Build the admin notification email content
 */
export function buildAdminNotificationContent(
  data: AdminNotificationData
): string {
  const sections: string[] = [];

  // Header
  sections.push(`
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: ${BRAND_COLORS.navy};">
      Admin Update
    </h1>
    <p style="margin: 0 0 24px 0; font-size: 14px; color: ${BRAND_COLORS.mediumGray};">
      New results are available in the Alloro admin dashboard.
    </p>
  `);

  // Summary section
  if (data.summary) {
    sections.push(`
      <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: ${BRAND_COLORS.darkGray};">
        ${data.summary}
      </p>
    `);
  }

  // Practice Rankings Completed
  if (
    data.practiceRankingsCompleted &&
    data.practiceRankingsCompleted.length > 0
  ) {
    const rankingsContent = `
      <div style="margin-bottom: 12px;">
        ${createTag("Rankings Complete", "success")}
      </div>
      <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: ${
        BRAND_COLORS.navy
      };">
        Practice Rankings Completed
      </h3>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        ${data.practiceRankingsCompleted
          .map(
            (ranking) => `
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid ${
              BRAND_COLORS.border
            };">
              <p style="margin: 0; font-size: 14px; font-weight: 600; color: ${
                BRAND_COLORS.navy
              };">
                ${ranking.practiceName}
              </p>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: ${
                BRAND_COLORS.mediumGray
              };">
                ${ranking.locationName}
              </p>
            </td>
            <td style="padding: 8px 0; border-bottom: 1px solid ${
              BRAND_COLORS.border
            }; text-align: right;">
              <p style="margin: 0; font-size: 18px; font-weight: 800; color: ${
                BRAND_COLORS.orange
              };">
                #${ranking.rankPosition}
              </p>
              <p style="margin: 0; font-size: 11px; color: ${
                BRAND_COLORS.mediumGray
              };">
                Score: ${ranking.rankScore.toFixed(1)}
              </p>
            </td>
          </tr>
        `
          )
          .join("")}
      </table>
    `;
    sections.push(createCard(rankingsContent));
  }

  // Monthly Agents Completed
  if (data.monthlyAgentsCompleted && data.monthlyAgentsCompleted.length > 0) {
    const agentsContent = `
      <div style="margin-bottom: 12px;">
        ${createTag("Agents Complete", "success")}
      </div>
      <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: ${
        BRAND_COLORS.navy
      };">
        Monthly Agents Completed
      </h3>
      ${createList(
        data.monthlyAgentsCompleted.map(
          (agent) =>
            `<strong>${agent.practiceName}</strong> - ${agent.agentType} (${agent.status})`
        )
      )}
    `;
    sections.push(createCard(agentsContent));
  }

  // Divider before CTA
  sections.push(createDivider());

  // Call to action
  sections.push(`
    <div style="text-align: center;">
      <p style="margin: 0 0 20px 0; font-size: 14px; color: ${
        BRAND_COLORS.darkGray
      };">
        Review the latest results in the admin dashboard.
      </p>
      ${createButton("Open Admin Dashboard", `${APP_URL}/admin`)}
    </div>
  `);

  return sections.join("");
}

/**
 * Build the full email payload for admin notification
 */
export function buildAdminNotificationEmail(
  data: AdminNotificationData
): SendEmailOptions {
  const content = buildAdminNotificationContent(data);
  const body = wrapInBaseTemplate(content, {
    preheader: data.summary || "New results are available for review",
    showFooterLinks: false,
  });

  // Build subject line
  const subjectParts: string[] = [];
  if (data.practiceRankingsCompleted?.length) {
    subjectParts.push(
      `${data.practiceRankingsCompleted.length} rankings complete`
    );
  }
  if (data.monthlyAgentsCompleted?.length) {
    subjectParts.push(`${data.monthlyAgentsCompleted.length} agents complete`);
  }

  const subject =
    subjectParts.length > 0
      ? `[Alloro Admin] ${subjectParts.join(", ")}`
      : "[Alloro Admin] System Update";

  return {
    subject,
    body,
    recipients: [], // Will be populated by sendAdminNotification
    preheader: data.summary || "New results are available for review",
  };
}

/**
 * Send admin notification email
 */
export async function sendAdminNotification(data: AdminNotificationData) {
  const email = buildAdminNotificationEmail(data);
  return sendToAdmins(email.subject, email.body);
}

export default sendAdminNotification;
