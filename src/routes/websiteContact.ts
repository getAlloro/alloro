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

// ─────────────────────────────────────────────────────────────────────────────
// WHY BOTH ROUTES BELOW PIN `mode: "warn"` EXPLICITLY.
//
// `validate`'s default mode is PROCESS-WIDE and env-driven (VALIDATION_ENFORCE,
// read once at module load in middleware/validate.ts). An unpinned `validate` on
// a route therefore inherits whatever that flag says — so the day anyone sets
// VALIDATION_ENFORCE=1 to graduate the auth/billing soak, EVERY unpinned route
// starts answering 400 on a schema miss, these two included.
//
// These two are public lead capture. A 400 here is not a validation error the
// caller retries — it is a person in pain who wanted an appointment, silently
// turned away. The practice never learns that patient existed; nobody is left to
// complain. A dropped lead is unrecoverable and invisible, so these routes must
// never be rejectable as a SIDE EFFECT of a flag flipped for an unrelated route
// group. Graduating a lead-capture route to enforce has to be a deliberate,
// reviewable code change — not an env var's blast radius.
//
// The bound is still HELD, just not with rejection: `sanitize` (below) is the
// third posture — it drops out-of-contract values and keeps the request, which
// is what §5.2 ("sanitize and validate all user input") and §11.2 ("once data
// reaches the controller, it is trusted") actually ask for. Neither Article
// requires a 400; both are satisfied by a value that is in-contract or absent.
// ─────────────────────────────────────────────────────────────────────────────

// The JSON contact form. Warn-only pinned for the reason above: the controller
// imposes NO length cap of its own, so `message`'s 3,000-char schema bound would
// become a live rejection the moment the flag flipped — losing a patient whose
// only mistake was describing their problem at length. The controller's own
// reCAPTCHA / sanitize / required-field checks stay in place alongside this.
router.post(
  "/contact",
  validate(contactSubmissionSchema, { mode: "warn" }),
  handleContactSubmission,
);
// TODO: Re-enable formSubmissionLimiter once protections are restored.
// `validate` runs AFTER multer so req.body is populated from the multipart
// payload (contents may still be a JSON string — the schema tolerates that).
//
// The legacy form schema is the SOAK ONLY, pinned to warn (see the block above):
// it describes the contract and logs would-be misses, and it must never be the
// thing that answers 400 on this route. `formSubmissionSchema` also declares the
// three attribution fields (§11.2 — the boundary defines every field the
// controller reads), which is exactly why the pin matters: without it, an
// oversized tracking parameter the visitor never typed would 400 the whole lead
// the moment VALIDATION_ENFORCE was set.
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
