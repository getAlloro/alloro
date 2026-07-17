/**
 * Website Contact Form API Route (Public — no auth required)
 *
 * Handles contact form submissions from rendered sites at *.sites.getalloro.com.
 * Verifies reCAPTCHA, sanitizes input, builds HTML email, and forwards to n8n webhook.
 */

import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { handleContactSubmission } from "../controllers/websiteContact/websiteContactController";
import { handleFormSubmission } from "../controllers/websiteContact/formSubmissionController";
import { handleNewsletterConfirm } from "../controllers/websiteContact/newsletterConfirmController";
import { validate, sanitize } from "../middleware/validate";
import {
  contactSubmissionSchema,
  formSubmissionSchema,
  attributionInputSchema,
  ATTRIBUTION_FIELDS,
} from "../validation/websiteContact.schemas";

const router = express.Router();

const formSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." },
});

const formUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
});

// The JSON contact form always enforces its boundary schema. Every value passed
// to the controller's string sanitizer is therefore a string, never an
// array/object that can throw and turn a malformed public request into a 500.
// `message` has a generous finite cap defined in config: legitimate long
// histories fit, while this unauthenticated route remains bounded (§5.2,
// §11.2). The request-size and rate gates run earlier in app.ts, before the
// app-wide 50 MB JSON parser.
router.post(
  "/contact",
  validate(contactSubmissionSchema, { mode: "enforce" }),
  handleContactSubmission,
);
// TODO: Re-enable formSubmissionLimiter once protections are restored.
// `validate` runs AFTER multer so req.body is populated from the multipart
// payload (contents may still be a JSON string — the schema tolerates that).
//
// The legacy generic-form schema remains a WARN-ONLY soak because it describes
// many unvetted hosted-site payload shapes. It must not reject the whole lead as
// a side effect of VALIDATION_ENFORCE. This pin is deliberately limited to this
// broad legacy schema; it is not the /contact posture above.
//
// The attribution subset is SANITIZED, not warn-logged and not rejected. That is
// what actually HOLDS the bound: `sanitize` drops the three fields when they are
// out of contract (→ honest "unknown") and always lets the lead through — the
// enforcement warn mode cannot give, without the lead loss enforce mode would
// cost (§5.2, §11.2). Mounted as its own middleware, AFTER the soak and BEFORE
// the controller, so it still holds on requests where the legacy form schema
// fails for an unrelated reason.
router.post(
  "/form-submission",
  // formSubmissionLimiter,
  formUpload.array("files", 10),
  validate(formSubmissionSchema, { mode: "warn" }),
  sanitize(attributionInputSchema, ATTRIBUTION_FIELDS),
  handleFormSubmission,
);
router.get("/confirm-newsletter", handleNewsletterConfirm);

export default router;
