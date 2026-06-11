/**
 * Email webhook service for website contact form.
 * Sends email payloads to the n8n webhook for dispatch.
 */

import { interceptEmailPayload } from "../../../emails/emailInterceptor";

export interface EmailWebhookPayload {
  cc: string[];
  bcc: string[];
  body: string;
  from: string;
  subject: string;
  fromName: string;
  recipients: string[];
}

export async function sendEmailWebhook(payload: EmailWebhookPayload): Promise<void> {
  const webhookUrl = process.env.ALLORO_CUSTOM_WEBSITE_EMAIL_WEBHOOK || "";

  if (!webhookUrl) {
    console.error("[Website Contact] ALLORO_CUSTOM_WEBSITE_EMAIL_WEBHOOK not configured");
    throw new Error("Email service not configured");
  }

  // Non-production senders get every email rerouted to the intercept
  // recipient (fail closed) — see emails/emailInterceptor.ts.
  const {
    payload: outboundPayload,
    intercepted,
    originalRecipients,
  } = await interceptEmailPayload(payload);

  if (intercepted) {
    console.log(
      "[Website Contact] Email intercepted (non-production sender). Original recipients:",
      originalRecipients
    );
  }

  const webhookRes = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(outboundPayload),
  });

  if (!webhookRes.ok) {
    console.error(
      "[Website Contact] Webhook failed:",
      webhookRes.status,
      await webhookRes.text()
    );
    throw new WebhookError("Failed to send email");
  }
}

export class WebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookError";
  }
}
