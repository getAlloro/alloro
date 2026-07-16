/**
 * Public website-contact route schemas (src/routes/websiteContact.ts).
 *
 * Two public, unauthenticated endpoints:
 *   • POST /api/websites/contact         — JSON contact form
 *   • POST /api/websites/form-submission — multipart generic form (multer)
 *
 * PERMISSIVE-FIRST and deliberately loose, for two reasons:
 *  1) Warn-only soak — surface real client shapes before any rejection.
 *  2) The /form-submission body is MULTIPART (multer) and `contents` may arrive
 *     as a JSON STRING that the controller parses itself; project resolution
 *     accepts EITHER `projectId` OR `hostname`. So neither is required at the
 *     schema level, and every shape is `.passthrough()`-ed so the anti-bot
 *     honeypot/timing fields (_hp/_ts/_jsc) and arbitrary form keys never
 *     trip a warn. Length caps mirror the controller + GbpInputSanitizer intent.
 *
 * REDACTION: the middleware logs field NAMES + issue codes only, never values —
 * so visitor-entered contact details never reach the logs.
 */

import { z } from "zod";

const EMAIL_MAX = 320;
const NAME_MAX = 200;
const PHONE_MAX = 50;
const SERVICE_MAX = 200;
const MESSAGE_MAX = 3000; // mirrors GBP_INPUT_LIMITS.reviewText / customization intent
const FORM_NAME_MAX = 200; // mirrors MAX_FORM_NAME_LENGTH in the controller
const HOSTNAME_MAX = 255;
/**
 * First-touch attribution caps (§11.2 — the boundary defines every field the
 * controller reads). Mirrors MAX_SOURCE_LEN in
 * controllers/websiteContact/websiteContact-utils/sourceAttribution.ts — the
 * capture contract's own limit for a channel label. Held as a local constant
 * rather than an import so `validation/` does not depend on a controller's
 * feature-utils (§6.2); the same mirroring pattern the caps above already use.
 */
const SOURCE_LABEL_MAX = 100;
/** A raw first-touch referrer URL. 2048 = the conventional browser URL cap. */
const REFERRER_URL_MAX = 2048;

/**
 * The attribution bounds, defined ONCE and used twice: as the contract inside
 * `formSubmissionSchema` (what the warn-only soak logs), and as the enforced
 * subset in `attributionInputSchema` (what actually holds). One definition, so
 * the logged contract and the enforced contract can never drift apart.
 */
const sourceLabelField = z.string().max(SOURCE_LABEL_MAX);
const referrerUrlField = z.string().max(REFERRER_URL_MAX);

/**
 * POST /api/websites/contact
 * Controller hard-requires name, phone, email, captchaToken; service/message
 * optional. Kept loose (presence + caps); reCAPTCHA + sanitize stay in the
 * controller.
 */
export const contactSubmissionSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(NAME_MAX),
    phone: z.string().trim().min(1, "phone is required").max(PHONE_MAX),
    email: z.string().trim().min(1, "email is required").max(EMAIL_MAX),
    service: z.string().max(SERVICE_MAX).optional(),
    message: z.string().max(MESSAGE_MAX).optional(),
    captchaToken: z
      .string({ message: "captchaToken is required" })
      .min(1, "captchaToken is required"),
  })
  .passthrough();

/**
 * POST /api/websites/form-submission (multipart)
 * Everything optional — the controller resolves project by projectId OR
 * hostname and validates field caps itself. `contents` may be an object, an
 * array (sections), or a JSON string (multipart) — accept all three. Honeypot
 * / timing fields are tolerated via passthrough.
 */
export const formSubmissionSchema = z
  .object({
    projectId: z.union([z.string(), z.number()]).optional(),
    hostname: z.string().max(HOSTNAME_MAX).optional(),
    formName: z.string().max(FORM_NAME_MAX).optional(),
    formType: z.string().max(64).optional(),
    contents: z
      .union([z.string(), z.array(z.unknown()), z.record(z.string(), z.unknown())])
      .optional(),
    // First-touch attribution, forwarded by the hosted-site form (M0 sender
    // contract). All optional — the sender is not built yet, and a submission
    // without them is honest "unknown", never a rejection. Defined here because
    // the controller reads all three (formSubmissionController.ts ~439-448) and
    // `.passthrough()` would otherwise let them arrive untyped/unbounded.
    //
    // These bounds are the TYPE/LENGTH floor only. They do not decide whether a
    // label is a real channel — the closed allow-list + server-side classifier
    // in sourceAttribution.ts stays the authority on that (defense in depth), so
    // an in-bounds but unrecognized claim is still dropped to null, never stored.
    //
    // NOTE: this schema runs WARN-ONLY, so these three lines only describe the
    // contract — they do not hold it. `attributionInputSchema` below is what
    // actually enforces them; see the route.
    source: sourceLabelField.optional(),
    utm_source: sourceLabelField.optional(),
    first_touch_referrer: referrerUrlField.optional(),
  })
  .passthrough();

/**
 * The three first-touch attribution fields, ENFORCED — the sanitizing subset.
 *
 * WHY A SECOND SCHEMA INSTEAD OF ENFORCING `formSubmissionSchema`:
 * this is a PUBLIC lead-capture endpoint. Flipping the whole form schema to
 * enforce would 400 a submission whose only sin is a long tracking parameter —
 * the practice loses a real patient inquiry to protect a metadata field. That
 * trade is never worth it. A lead is the asset; attribution is a note about the
 * asset. So we bound the note and ALWAYS keep the lead.
 *
 * Every field is `.catch(undefined)`, which makes this schema TOTAL: it cannot
 * fail, so parsing it can never reject a request. An out-of-contract value
 * resolves to `undefined` (absent) and the `sanitize` middleware drops it before
 * the controller reads it. A bad `source` does not take down a good
 * `utm_source` — each field catches independently.
 *
 * DROPPED, NOT TRUNCATED, on purpose. Truncating a 200-char label to 100 chars
 * would fabricate a label the visitor never sent, and truncating a URL would
 * have us classify a string we invented. Absent → the derivation reads
 * "unknown" and falls through to the next signal, which is true (Value #6).
 *
 * This schema is NOT a replacement for the closed allow-list / classifier in
 * sourceAttribution.ts — that stays the authority on whether a label names a
 * real channel. This is the type/length floor, enforced (§5.2, §11.2).
 */
export const attributionInputSchema = z.object({
  source: sourceLabelField.optional().catch(undefined),
  utm_source: sourceLabelField.optional().catch(undefined),
  first_touch_referrer: referrerUrlField.optional().catch(undefined),
});

/**
 * The exact body keys `sanitize` rewrites for the attribution subset — the same
 * three the controller reads (formSubmissionController.ts ~439-450). Listed
 * explicitly rather than derived from the schema's internals so that adding a
 * field to the schema without wiring it here is a visible omission, not a
 * silent one.
 */
export const ATTRIBUTION_FIELDS = [
  "source",
  "utm_source",
  "first_touch_referrer",
] as const;

export type ContactSubmissionBody = z.infer<typeof contactSubmissionSchema>;
export type FormSubmissionBody = z.infer<typeof formSubmissionSchema>;
export type AttributionInput = z.infer<typeof attributionInputSchema>;
