/**
 * Website Contact Form Controller
 *
 * Handles contact form submissions from rendered sites at *.sites.getalloro.com.
 * Orchestrates validation, reCAPTCHA verification, sanitization, email building, and webhook dispatch.
 */

import { Request, Response } from "express";
import { sanitize } from "./websiteContact-utils/sanitization";
import { extractHostname } from "./websiteContact-utils/hostnameExtractor";
import { buildEmailBody } from "./websiteContact-utils/emailTemplateBuilder";
import { verifyRecaptcha } from "./websiteContact-services/recaptchaService";
import { sendEmailWebhook, WebhookError } from "./websiteContact-services/emailWebhookService";
import logger from "../../lib/logger";

export async function handleContactSubmission(req: Request, res: Response): Promise<Response> {
  try {
    const { name, phone, email, service, message, captchaToken } = req.body;

    if (!name || !phone || !email) {
      return res
        .status(400)
        .json({ error: "Name, phone, and email are required" });
    }

    if (!captchaToken) {
      return res
        .status(400)
        .json({ error: "reCAPTCHA verification is required" });
    }

    const isValid = await verifyRecaptcha(captchaToken);
    if (!isValid) {
      return res
        .status(400)
        .json({ error: "reCAPTCHA verification failed" });
    }

    const hostname = extractHostname(req);

    const recipients = (process.env.CONTACT_FORM_RECIPIENTS || "")
      .split(",")
      .filter(Boolean);
    const fromEmail = process.env.CONTACT_FORM_FROM || "";

    const sanitizedData = {
      name: sanitize(name),
      phone: sanitize(phone),
      email: sanitize(email),
      service: sanitize(service || ""),
      message: sanitize(message || ""),
      siteName: hostname || "Website",
    };

    const emailBody = buildEmailBody(sanitizedData);

    await sendEmailWebhook({
      cc: [],
      bcc: [],
      body: emailBody,
      from: fromEmail,
      subject: `New Appointment Request — ${sanitizedData.name} (${sanitizedData.service})`,
      fromName: sanitizedData.siteName,
      recipients,
    });

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof WebhookError) {
      return res.status(502).json({ error: "Failed to send email" });
    }

    if (error instanceof Error && error.message === "Email service not configured") {
      return res.status(500).json({ error: "Email service not configured" });
    }

    logger.error({ err: error }, "[Website Contact] Error:");
    return res.status(500).json({ error: "Internal server error" });
  }
}
