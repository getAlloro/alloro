/**
 * Inbound Mailgun event webhook — PUBLIC (no JWT). Authenticated by HMAC
 * signature verification inside the controller (§11 — signed public webhook,
 * the same exception class as the Stripe billing webhook). Rate-limited as
 * defense-in-depth. Mounted at `/api/webhooks/mailgun-events` from src/app.ts.
 *
 * plans/07062026-email-logs-dashboard T5.
 */

import express from "express";
import { mailgunWebhookLimiter } from "../../middleware/publicRateLimiter";
import { handleMailgunEvent } from "../../controllers/mailgun-events/MailgunEventsController";

const router = express.Router();

router.post("/", mailgunWebhookLimiter, handleMailgunEvent);

export default router;
