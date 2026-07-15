/**
 * Base Email Template
 *
 * Provides consistent Alloro branding for all email templates.
 * Brand colors:
 * - Navy: #212D40
 * - Orange: #d66853
 * - Light Gray: #f8fafc
 */

export const BRAND_COLORS = {
  navy: "#212D40",
  orange: "#d66853",
  lightGray: "#f8fafc",
  mediumGray: "#64748b",
  darkGray: "#334155",
  white: "#ffffff",
  border: "#e2e8f0",
};

export const EMAIL_FONT_STACKS = {
  display: "Spectral, Georgia, 'Times New Roman', serif",
  body: "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif",
  code: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
};

export const LOGO_URL = "https://app.getalloro.com/logo.png";
// Use explicit APP_URL environment variable, fallback to production URL by default
export const APP_URL =
  process.env.APP_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://app.getalloro.com"
    : "https://app.getalloro.com"); // Default to production URL for safety in emails

/**
 * Wrap email content with Alloro branded header and footer
 */
export function wrapInBaseTemplate(
  content: string,
  options?: {
    preheader?: string;
    showFooterLinks?: boolean;
  }
): string {
  const { preheader = "", showFooterLinks = true } = options || {};
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Alloro</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      outline: none;
      text-decoration: none;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      font-family: ${EMAIL_FONT_STACKS.body};
    }
    h1, h2, h3, .display-font {
      font-family: ${EMAIL_FONT_STACKS.display};
    }
    code, .code-font {
      font-family: ${EMAIL_FONT_STACKS.code};
    }
    /* Custom styles */
    .button {
      display: inline-block;
      padding: 14px 28px;
      background-color: ${BRAND_COLORS.orange};
      color: ${BRAND_COLORS.white} !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      font-family: ${EMAIL_FONT_STACKS.body};
    }
    .button:hover {
      background-color: #c55a47;
    }
    .secondary-button {
      display: inline-block;
      padding: 12px 24px;
      background-color: transparent;
      color: ${BRAND_COLORS.navy} !important;
      text-decoration: none;
      border: 2px solid ${BRAND_COLORS.border};
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      font-family: ${EMAIL_FONT_STACKS.body};
    }
    .highlight {
      color: ${BRAND_COLORS.orange};
      font-weight: 600;
    }
    .tag {
      display: inline-block;
      padding: 4px 10px;
      background-color: ${BRAND_COLORS.lightGray};
      color: ${BRAND_COLORS.darkGray};
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .card {
      background-color: ${BRAND_COLORS.white};
      border: 1px solid ${BRAND_COLORS.border};
      border-radius: 12px;
      padding: 24px;
      margin: 16px 0;
    }
    @media only screen and (max-width: 600px) {
      .container {
        width: 100% !important;
        padding: 16px !important;
      }
      .content {
        padding: 24px 16px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${
    BRAND_COLORS.lightGray
  }; font-family: ${EMAIL_FONT_STACKS.body};">
  <!-- Preheader text (hidden) -->
  ${
    preheader
      ? `
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${escapeHtml(preheader)}
  </div>
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>
  `
      : ""
  }
  
  <!-- Main container -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${
    BRAND_COLORS.lightGray
  };">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Email container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="container" style="max-width: 600px; width: 100%;">
          <!-- Header with logo -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <a href="${APP_URL}" target="_blank">
                <img src="${LOGO_URL}" alt="Alloro" width="140" style="display: block; height: auto;" />
              </a>
            </td>
          </tr>
          
          <!-- Main content card -->
          <tr>
            <td>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${
                BRAND_COLORS.white
              }; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <tr>
                  <td class="content" style="padding: 40px; font-family: ${EMAIL_FONT_STACKS.body};">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px; text-align: center;">
              ${
                showFooterLinks
                  ? `
              <p style="margin: 0 0 16px 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray};">
                <a href="${APP_URL}/dashboard" style="color: ${BRAND_COLORS.mediumGray}; text-decoration: none;">Dashboard</a>
                &nbsp;&nbsp;•&nbsp;&nbsp;
                <a href="${APP_URL}/settings" style="color: ${BRAND_COLORS.mediumGray}; text-decoration: none;">Settings</a>
                &nbsp;&nbsp;•&nbsp;&nbsp;
                <a href="${APP_URL}/help" style="color: ${BRAND_COLORS.mediumGray}; text-decoration: none;">Help</a>
              </p>
              `
                  : ""
              }
              <p style="margin: 0; font-size: 12px; color: ${
                BRAND_COLORS.mediumGray
              };">
                © ${currentYear} Alloro. All rights reserved.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: ${
                BRAND_COLORS.mediumGray
              };">
                Sent from <span style="color: ${
                  BRAND_COLORS.orange
                };">info@getalloro.com</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Create a primary CTA button
 */
export function createButton(text: string, url: string): string {
  return `
    <a href="${escapeHtml(url)}" class="button" style="display: inline-block; padding: 14px 28px; background-color: ${BRAND_COLORS.orange}; color: ${BRAND_COLORS.white}; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; font-family: ${EMAIL_FONT_STACKS.body};">
      ${escapeHtml(text)}
    </a>
  `;
}

/**
 * Create a secondary button
 */
export function createSecondaryButton(text: string, url: string): string {
  return `
    <a href="${escapeHtml(url)}" class="secondary-button" style="display: inline-block; padding: 12px 24px; background-color: transparent; color: ${BRAND_COLORS.navy}; text-decoration: none; border: 2px solid ${BRAND_COLORS.border}; border-radius: 8px; font-weight: 600; font-size: 14px; font-family: ${EMAIL_FONT_STACKS.body};">
      ${escapeHtml(text)}
    </a>
  `;
}

/**
 * Create a styled card section
 */
export function createCard(
  content: string,
  options?: {
    borderColor?: string;
    backgroundColor?: string;
  }
): string {
  const {
    borderColor = BRAND_COLORS.border,
    backgroundColor = BRAND_COLORS.white,
  } = options || {};
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${backgroundColor}; border: 1px solid ${borderColor}; border-radius: 12px; margin: 16px 0;">
      <tr>
        <td style="padding: 20px;">
          ${content}
        </td>
      </tr>
    </table>
  `;
}

/**
 * Create a status tag/badge
 */
export function createTag(
  text: string,
  type: "default" | "success" | "warning" | "error" = "default"
): string {
  const colors = {
    default: { bg: BRAND_COLORS.lightGray, text: BRAND_COLORS.darkGray },
    success: { bg: "#dcfce7", text: "#166534" },
    warning: { bg: "#fef3c7", text: "#92400e" },
    error: { bg: "#fee2e2", text: "#991b1b" },
  };
  const { bg, text: textColor } = colors[type];

  return `
    <span style="display: inline-block; padding: 4px 10px; background-color: ${bg}; color: ${textColor}; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
      ${escapeHtml(text)}
    </span>
  `;
}

/**
 * Create a divider line
 */
export function createDivider(): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="padding: 24px 0;">
          <hr style="border: none; border-top: 1px solid ${BRAND_COLORS.border}; margin: 0;">
        </td>
      </tr>
    </table>
  `;
}

/**
 * Create highlighted text
 */
export function highlight(text: string): string {
  return `<span style="color: ${BRAND_COLORS.orange}; font-weight: 600;">${escapeHtml(text)}</span>`;
}

/**
 * Escape plain text before inserting it into email HTML or an attribute value.
 */
export function escapeHtml(value: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return value.replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

/**
 * Create the consistent high-contrast treatment for verification codes and
 * temporary passwords.
 */
export function createCodeCard(label: string, value: string): string {
  return createCard(
    `
      <p style="margin: 0 0 8px; color: ${BRAND_COLORS.mediumGray}; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
        ${escapeHtml(label)}
      </p>
      <p class="code-font" style="margin: 0; color: ${BRAND_COLORS.navy}; font-family: ${EMAIL_FONT_STACKS.code}; font-size: 26px; font-weight: 700; letter-spacing: 0.16em; line-height: 1.35; overflow-wrap: anywhere;">
        ${escapeHtml(value)}
      </p>
    `,
    { backgroundColor: BRAND_COLORS.lightGray }
  );
}

/**
 * Create a list of items
 */
export function createList(items: string[]): string {
  return `
    <ul style="margin: 16px 0; padding-left: 20px; color: ${
      BRAND_COLORS.darkGray
    };">
      ${items
        .map(
          (item) =>
            `<li style="margin-bottom: 8px; font-size: 14px; line-height: 1.6;">${item}</li>`
        )
        .join("")}
    </ul>
  `;
}
