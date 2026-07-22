/**
 * Newsletter Confirmation Service
 *
 * Builds a branded confirmation email and derives the confirm URL
 * from the project's hostname or custom domain.
 */

import { sendEmailWebhook } from "./emailWebhookService";

interface ConfirmEmailParams {
  email: string;
  token: string;
  primaryColor: string;
  businessName?: string;
  siteUrl: string;
}

/**
 * Derive the public site URL for a project.
 */
export function getSiteUrl(generatedHostname: string | null, customDomain: string | null): string {
  if (customDomain) return `https://${customDomain}`;
  if (generatedHostname) return `https://${generatedHostname}.sites.getalloro.com`;
  return "https://getalloro.com";
}

/**
 * Build and send the branded confirmation email.
 */
export async function sendConfirmationEmail(params: ConfirmEmailParams): Promise<void> {
  const { email, token, primaryColor, businessName, siteUrl } = params;
  const color = primaryColor || "#0e8988";
  const name = businessName || "this website";
  const apiBase = process.env.API_BASE_URL || "https://app.getalloro.com";
  const confirmUrl = `${apiBase}/api/websites/confirm-newsletter?token=${token}`;

  const body = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:${color};color:#fff;padding:32px;border-radius:16px 16px 0 0;text-align:center;">
    <h1 style="margin:0;font-size:24px;font-weight:700;">Confirm Your Subscription</h1>
  </div>
  <div style="background:#f9fafb;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;text-align:center;">
    <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 8px;">
      You signed up for updates from <strong>${name}</strong>.
    </p>
    <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Click the button below to confirm your email address.
    </p>
    <a href="${confirmUrl}" style="display:inline-block;padding:14px 32px;background:${color};color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 14px ${color}40;">
      Confirm Subscription
    </a>
    <p style="color:#9ca3af;font-size:13px;margin-top:24px;line-height:1.5;">
      If you didn't sign up for this, you can safely ignore this email.
    </p>
    <p style="color:#d1d5db;font-size:12px;margin-top:16px;">
      This link expires in 24 hours.
    </p>
  </div>
  <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center;">
    Powered by <a href="${siteUrl}" style="color:${color};text-decoration:none;">Alloro</a>
  </p>
</div>`;

  const fromEmail = process.env.CONTACT_FORM_FROM || "info@getalloro.com";

  await sendEmailWebhook({
    cc: [],
    bcc: [],
    body,
    from: fromEmail,
    subject: `Confirm your subscription to ${name}`,
    fromName: businessName || "Alloro Sites",
    recipients: [email],
  });
}
