/**
 * Website-form email sender.
 *
 * Thin adapter over the central emails/emailService.sendEmail — the single
 * webhook choke-point for all outbound mail. It preserves the throw-based
 * contract (WebhookError) that the website controllers rely on for their
 * HTTP 502 mapping. Interception, payload validation, transport, and logging
 * are all owned by sendEmail; this file only adapts the payload shape and the
 * error contract (sendEmail returns { success } and never throws).
 */

import { sendEmail } from "../../../emails";

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
  const result = await sendEmail({
    subject: payload.subject,
    body: payload.body,
    recipients: payload.recipients,
    cc: payload.cc,
    bcc: payload.bcc,
    from: payload.from,
    fromName: payload.fromName,
  });

  if (!result.success) {
    throw new WebhookError(result.error ?? "Failed to send email");
  }
}

export class WebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookError";
  }
}
