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
  })
  .passthrough();

export type ContactSubmissionBody = z.infer<typeof contactSubmissionSchema>;
export type FormSubmissionBody = z.infer<typeof formSubmissionSchema>;
