import {
  BRAND_COLORS,
  EMAIL_FONT_STACKS,
  createCard,
  escapeHtml,
  wrapInBaseTemplate,
} from "./base";

export type SystemTestEmailData = {
  transport: string;
  recipient: string;
  sentAt: string;
};

function createDetailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid ${BRAND_COLORS.border}; color: ${BRAND_COLORS.mediumGray}; font-size: 13px; font-weight: 700; width: 110px;">
        ${escapeHtml(label)}
      </td>
      <td style="padding: 8px 12px; border-bottom: 1px solid ${BRAND_COLORS.border}; color: ${BRAND_COLORS.navy}; font-size: 14px; overflow-wrap: anywhere;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
}

export function buildSystemTestEmail(data: SystemTestEmailData): string {
  const details = createCard(`
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse: collapse;">
      ${createDetailRow("Transport", data.transport)}
      ${createDetailRow("Recipient", data.recipient)}
      ${createDetailRow("Sent at", data.sentAt)}
    </table>
  `);

  return wrapInBaseTemplate(
    `
      <h1 style="margin: 0 0 16px; color: ${BRAND_COLORS.navy}; font-family: ${EMAIL_FONT_STACKS.display}; font-size: 28px; line-height: 1.2;">
        Alloro Test Email
      </h1>
      <p style="margin: 0 0 12px; color: ${BRAND_COLORS.darkGray}; font-size: 16px; line-height: 1.6;">
        This is a test email sent from the Alloro admin dashboard to verify the email transport is working.
      </p>
      ${details}
      <p style="margin: 16px 0 0; color: ${BRAND_COLORS.mediumGray}; font-size: 13px; line-height: 1.6;">
        If you received this, the transport is working.
      </p>
    `,
    {
      preheader: "Alloro email transport verification.",
      showFooterLinks: false,
    }
  );
}
