/**
 * Backend-side n8n email sender for the FAB email-notify queue.
 *
 * Mirrors the body shape that the leadgen tool's client-side
 * `utils/emailService.ts:sendAuditReportEmail` posts. Single source of
 * truth for the HTML template still lives in the leadgen tool client; we
 * intentionally re-render the template inline here so the worker doesn't
 * have a runtime dep on the leadgen-tool repo.
 *
 * If you change the template in the client, mirror the change here too.
 * Long-term: consolidate sending behind the backend exclusively (flagged
 * in the spec's Pushback section).
 *
 * Env: `N8N_EMAIL_URL` must point at the same webhook the client uses.
 * Falls back to the public production URL if unset.
 */

import axios from "axios";
import { interceptEmailPayload } from "../../../emails/emailInterceptor";

const N8N_EMAIL_URL =
  process.env.N8N_EMAIL_URL ||
  "https://n8n.getalloro.com/webhook/alloro-email-service";

interface SendAuditReportEmailOpts {
  recipientEmail: string;
  auditId: string;
  businessName?: string;
}

function generateEmailHTML(
  auditId: string,
  recipientEmail: string,
  businessName?: string
): string {
  const reportLink = `https://audit.getalloro.com?audit_id=${auditId}`;
  const greeting = businessName
    ? `Greetings to ${businessName} -- ${recipientEmail}`
    : `Greetings -- ${recipientEmail}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Alloro Practice Analysis Report</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f8fafc;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding-bottom:24px;">
          <a href="https://app.getalloro.com" target="_blank">
            <img src="https://app.getalloro.com/logo.png" alt="Alloro" width="140" style="display:block;height:auto;" />
          </a>
        </td></tr>
        <tr><td>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#ffffff;border-radius:16px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
            <tr><td style="padding:40px;">
              <div style="text-align:center;margin-bottom:24px;">
                <div style="width:64px;height:64px;background-color:#d6685315;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
                  <span style="font-size:32px;">📊</span>
                </div>
                <div style="margin-bottom:12px;">
                  <span style="display:inline-block;padding:4px 10px;background-color:#dcfce7;color:#166534;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Report Ready</span>
                </div>
                <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#212D40;">Your Practice Analysis is Complete</h1>
              </div>
              <p style="margin:0 0 16px 0;font-size:15px;color:#334155;">Hi, ${greeting}</p>
              <div style="background-color:#f8fafc;padding:20px;border-radius:12px;margin-bottom:24px;">
                <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">
                  We've completed a comprehensive analysis of your practice's digital presence. Your full report includes:
                  <br><br>
                  ✓ Website Performance Grade &amp; Score<br>
                  ✓ Google Business Profile Readiness Analysis<br>
                  ✓ Local Ranking Position &amp; Insights<br>
                  ✓ Detailed Performance Metrics<br>
                  ✓ Actionable Recommendations<br>
                  ✓ Competitor Analysis
                </p>
              </div>
              <div style="text-align:center;margin-top:24px;">
                <a href="${reportLink}" style="display:inline-block;padding:14px 28px;background-color:#d66853;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">View Your Full Report</a>
              </div>
              <p style="margin:24px 0 0 0;font-size:12px;color:#64748b;text-align:center;">
                Need help implementing these recommendations?<br>
                <a href="https://calendar.app.google/yJsmRsEnBSfDTVyz8" style="color:#d66853;text-decoration:none;">Schedule a free strategy call with our team</a>
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#64748b;">© ${new Date().getFullYear()} Alloro. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * POSTs to the n8n email webhook with the same body shape as the client's
 * `sendAuditReportEmail`. Returns `{ ok, error? }` — never throws.
 */
export async function sendAuditReportEmail(
  opts: SendAuditReportEmailOpts
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = generateEmailHTML(
      opts.auditId,
      opts.recipientEmail,
      opts.businessName
    );

    const builtPayload = {
      cc: [] as string[],
      bcc: ["info@getalloro.com"],
      body,
      from: "info@getalloro.com",
      subject: "📊 Your Alloro Practice Analysis Report",
      fromName: "Alloro",
      recipients: [opts.recipientEmail],
    };

    // Non-production senders get every email rerouted to the intercept
    // recipient (fail closed) — see emails/emailInterceptor.ts.
    const {
      payload,
      intercepted,
      originalRecipients,
    } = await interceptEmailPayload(builtPayload);

    if (intercepted) {
      console.log(
        "[Leadgen Email] Email intercepted (non-production sender). Original recipients:",
        originalRecipients
      );
    }

    const response = await axios.post(N8N_EMAIL_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15_000,
      validateStatus: () => true,
    });

    if (response.status >= 200 && response.status < 300) {
      return { ok: true };
    }
    return {
      ok: false,
      error: `n8n responded with HTTP ${response.status}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
