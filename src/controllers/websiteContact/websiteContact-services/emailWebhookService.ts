/**
 * Email webhook service for website contact form.
 * Sends email payloads to the n8n webhook for dispatch.
 */

import { interceptEmailPayload } from "../../../emails/emailInterceptor";
import logger from "../../../lib/logger";

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
    logger.error("[Website Contact] ALLORO_CUSTOM_WEBSITE_EMAIL_WEBHOOK not configured");
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
    logger.info({ detail: originalRecipients }, "[Website Contact] Email intercepted (non-production sender). Original recipients:");
  }

  const webhookRes = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(outboundPayload),
  });

  if (!webhookRes.ok) {
    logger.error({ details: [webhookRes.status, await webhookRes.text()] }, "[Website Contact] Webhook failed:");
    throw new WebhookError("Failed to send email");
  }
}

export class WebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookError";
  }
}
