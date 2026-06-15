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
import { validate } from "../middleware/validate";
import {
  contactSubmissionSchema,
  formSubmissionSchema,
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

// Validation: WARN-ONLY for this pass — logs would-be rejections (field names
// + issue codes only, never visitor-entered values) and lets the request
// through. Flip to enforce only after a clean soak. The controller's own
// reCAPTCHA / sanitize / field-cap checks stay in place alongside this.
router.post("/contact", validate(contactSubmissionSchema), handleContactSubmission);
// TODO: Re-enable formSubmissionLimiter once protections are restored.
// `validate` runs AFTER multer so req.body is populated from the multipart
// payload (contents may still be a JSON string — the schema tolerates that).
router.post(
  "/form-submission",
  // formSubmissionLimiter,
  formUpload.array("files", 10),
  validate(formSubmissionSchema),
  handleFormSubmission,
);
router.get("/confirm-newsletter", handleNewsletterConfirm);

export default router;
