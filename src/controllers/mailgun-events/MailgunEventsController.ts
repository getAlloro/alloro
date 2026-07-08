/**
 * Mailgun Events Controller
 *
 * Handles the inbound Mailgun event webhook (delivered/opened/failed/
 * complained) and flips the matching email_logs row via provider_message_id.
 * PUBLIC endpoint — authenticated by HMAC signature, not JWT.
 *
 * Fail-safe: if MAILGUN_WEBHOOK_SIGNING_KEY is unset, the tracking feature is
 * simply dormant (events dropped, app boot unaffected). Set the key + configure
 * the Mailgun event webhook + open-tracking to activate (plan T5, ops step).
 *
 * plans/07062026-email-logs-dashboard T5.
 */

import { Request, Response } from "express";
import { EmailLogModel, EmailLogEvent } from "../../models/EmailLogModel";
import { verifyMailgunSignature } from "./feature-utils/verifyMailgunSignature";
import logger from "../../lib/logger";

interface MailgunSignature {
  timestamp?: string;
  token?: string;
  signature?: string;
}

interface MailgunEventData {
  event?: string;
  severity?: string;
  message?: { headers?: { "message-id"?: string } };
}

/** Map a Mailgun event to our log status; null = an event we don't track. */
function mapEvent(event: string, severity?: string): EmailLogEvent | null {
  switch (event) {
    case "delivered":
      return "delivered";
    case "opened":
      return "opened";
    case "complained":
      return "complained";
    case "failed":
      // Only permanent failures are true bounces; temporary ones may still
      // deliver on retry, so we leave the row as-is.
      return severity === "permanent" ? "bounced" : null;
    default:
      return null;
  }
}

export async function handleMailgunEvent(
  req: Request,
  res: Response
): Promise<Response> {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || "";
  if (!signingKey) {
    logger.warn(
      "[MailgunEvents] MAILGUN_WEBHOOK_SIGNING_KEY not set — event ignored (tracking dormant)"
    );
    return res.status(503).json({ ok: false, error: "not_configured" });
  }

  const body = req.body as {
    signature?: MailgunSignature;
    "event-data"?: MailgunEventData;
  };
  const sig = body?.signature;
  const eventData = body?.["event-data"];

  if (!sig?.timestamp || !sig?.token || !sig?.signature || !eventData?.event) {
    return res.status(400).json({ ok: false, error: "malformed" });
  }

  if (
    !verifyMailgunSignature(signingKey, sig.timestamp, sig.token, sig.signature)
  ) {
    logger.warn("[MailgunEvents] signature verification failed");
    return res.status(401).json({ ok: false, error: "bad_signature" });
  }

  const mapped = mapEvent(eventData.event, eventData.severity);
  if (!mapped) {
    // Ack uninteresting events (accepted/clicked/unsubscribed/temp-fail) so
    // Mailgun stops retrying them.
    return res.status(200).json({ ok: true, ignored: eventData.event });
  }

  const rawMessageId = eventData.message?.headers?.["message-id"];
  if (!rawMessageId) {
    return res.status(200).json({ ok: true, ignored: "no_message_id" });
  }
  const providerMessageId = rawMessageId.replace(/^<|>$/g, "");

  try {
    const updated = await EmailLogModel.recordEvent(providerMessageId, mapped);
    return res.status(200).json({ ok: true, updated });
  } catch (error) {
    logger.error({ err: error }, "[MailgunEvents] recordEvent failed");
    // 200 so Mailgun does not hammer retries on our internal error (logged).
    return res.status(200).json({ ok: false, error: "internal" });
  }
}
