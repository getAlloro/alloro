/**
 * Generic Form Submission Controller
 *
 * Handles form submissions from rendered sites at *.sites.getalloro.com
 * and verified custom domains.
 *
 * Security layers (in order):
 * 1. Honeypot — reject if hidden field was filled
 * 2. Timestamp — reject if submitted too fast (<2s) or too stale (>1hr)
 * 3. JS challenge — verify LCG computation matches timestamp
 * 4. Basic field validation
 * 5. Origin validation — check request origin against project domains
 * 6. Payload caps — max fields, key/value length
 * 7. Sanitization — sanitize-html strips all HTML
 * 8. Content pattern scoring — reject high-score submissions
 * 9. Flood detection — IP-based + duplicate content hash
 * 10. AI content analysis — classify and flag spam/sales/malicious
 * 11. File uploads (if multipart) — upload to S3, add metadata to contents
 * 12. Persist submission
 * 13. Email (only if not flagged)
 */

import { Request, Response } from "express";
import { sanitize } from "./websiteContact-utils/sanitization";
import { sendEmailWebhook, WebhookError } from "./websiteContact-services/emailWebhookService";
import { isIpFlooding, isDuplicateContent, hashContents } from "./websiteContact-services/floodDetectionService";
import { analyzePatterns, SPAM_THRESHOLD } from "./websiteContact-services/contentPatternService";
import { analyzeContent } from "./websiteContact-services/aiContentAnalysisService";
import { getSiteUrl, sendConfirmationEmail } from "./websiteContact-services/newsletterConfirmationService";
import { buildEmailBody } from "./websiteContact-services/emailBodyBuilder";
import { resolveFormSubmissionEmailContext } from "./websiteContact-services/formSubmissionEmailContextService";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { FormSubmissionModel, type FileValue, type FormSection, type FormContents } from "../../models/website-builder/FormSubmissionModel";
import { WebsiteIntegrationModel } from "../../models/website-builder/WebsiteIntegrationModel";
import { IntegrationFormMappingModel } from "../../models/website-builder/IntegrationFormMappingModel";
import { CrmSyncLogModel } from "../../models/website-builder/CrmSyncLogModel";
import { getCrmQueue } from "../../workers/queues";
import { db } from "../../database/connection";
import { NewsletterSignupModel } from "../../models/website-builder/NewsletterSignupModel";
import { uploadToS3 } from "../../utils/core/s3";
import { resolveWebsiteFormRecipients } from "../../services/formRecipientRoutingService";
import logger from "../../lib/logger";

const MAX_FIELDS = 100; // Raised from 20 to support onboarding forms with many repeater fields
const MAX_KEY_LENGTH = 100;
const MAX_VALUE_LENGTH = 2000; // Raised from 500 to support longer field values
const MAX_FORM_NAME_LENGTH = 200;
const MIN_SUBMIT_TIME_MS = 2000;
const MAX_SUBMIT_TIME_MS = 3_600_000; // 1 hour

/** Silent 200 — don't reveal rejection to bots */
function silentOk(res: Response): Response {
  return res.json({ success: true });
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

/**
 * Compute the expected JS challenge value for a given timestamp.
 * Must match the client-side LCG computation.
 */
function computeJsChallenge(ts: number): number {
  let jsc = ts;
  for (let i = 0; i < 1000; i++) {
    jsc = ((jsc * 1103515245 + 12345) & 0x7fffffff);
  }
  return jsc;
}

const NEWSLETTER_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Extract the first email-like value from form contents.
 */
function extractEmail(contents: Record<string, string>): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const value of Object.values(contents)) {
    if (typeof value === "string" && emailRegex.test(value.trim())) return value.trim().toLowerCase();
  }
  return null;
}

/**
 * Get a display name for the business from the project.
 * Prefers project_identity.business.name; falls back to legacy step_gbp_scrape.
 */
function getBusinessName(project: any): string | undefined {
  const identity = parseIdentity(project.project_identity);
  const fromIdentity = identity?.business?.name;
  if (fromIdentity) return fromIdentity;

  if (project.step_gbp_scrape && typeof project.step_gbp_scrape === "object") {
    const legacy = project.step_gbp_scrape as { name?: string; title?: string };
    return legacy.name || legacy.title;
  }
  return undefined;
}

function parseIdentity(value: unknown): any {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Handle newsletter signup: debounce, upsert, send confirmation email.
 */
async function handleNewsletterSignup(
  res: Response,
  project: any,
  contents: Record<string, string>,
): Promise<Response> {
  const email = extractEmail(contents);
  if (!email) {
    return silentOk(res); // No valid email found — silent reject
  }

  // Check if already confirmed
  const existing = await NewsletterSignupModel.findByProjectAndEmail(project.id, email);
  if (existing?.confirmed_at) {
    return res.json({ success: true }); // Already subscribed
  }

  // Debounce: don't re-send if pending signup created less than 5min ago
  if (existing && !existing.confirmed_at) {
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age < NEWSLETTER_DEBOUNCE_MS) {
      return res.json({ success: true }); // Recently sent, don't spam
    }
  }

  // Upsert: create or reset token
  const signup = await NewsletterSignupModel.upsert({
    project_id: project.id,
    email,
  });

  // Send branded confirmation email
  const siteUrl = getSiteUrl(project.hostname, project.custom_domain);
  const businessName = getBusinessName(project);

  try {
    await sendConfirmationEmail({
      email,
      token: signup.token,
      primaryColor: project.primary_color || "#0e8988",
      businessName,
      siteUrl,
    });
  } catch (err) {
    logger.error({ err: err }, "[Newsletter] Failed to send confirmation email:");
  }

  return res.json({ success: true });
}

/**
 * Upload files from multipart request to S3 and return file metadata entries
 * to merge into the contents object.
 */
async function uploadFormFiles(
  files: Express.Multer.File[],
  organizationId: number | null,
): Promise<Record<string, { url: string; name: string; type: string; s3Key: string }>> {
  const fileEntries: Record<string, { url: string; name: string; type: string; s3Key: string }> = {};

  for (const file of files) {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const orgFolder = organizationId ? String(organizationId) : "unknown";
    const s3Key = `form-uploads/${orgFolder}/${timestamp}-${safeName}`;

    await uploadToS3(s3Key, file.buffer, file.mimetype);

    // Use the original filename as the content key (e.g., "practice_logo.png")
    const label = `File: ${file.originalname}`;
    fileEntries[label] = {
      url: "", // Will be resolved via pre-signed URL at read time
      name: file.originalname,
      type: file.mimetype,
      s3Key,
    };
  }

  return fileEntries;
}

export async function handleFormSubmission(req: Request, res: Response): Promise<Response> {
  try {
    const { hostname, formName, formType, _hp, _ts, _jsc } = req.body;
    let { projectId, contents } = req.body;

    // ── Multipart support: contents may be a JSON string ──
    if (typeof contents === "string") {
      try {
        contents = JSON.parse(contents);
      } catch {
        return res.status(400).json({ error: "contents must be valid JSON" });
      }
    }

    // ── Security checks: only AI analysis is active, rest disabled for debugging ──
    // TODO: Re-enable honeypot, timing, JS challenge checks
    const flagReasons: string[] = [];

    // // ── 1. Honeypot ──
    // if (_hp) {
    //   flagReasons.push("[honeypot] Hidden field was filled");
    // }

    // // ── 2. Timestamp / timing check ──
    // if (_ts) {
    //   const ts = Number(_ts);
    //   if (isNaN(ts)) {
    //     flagReasons.push("[timing] Invalid timestamp");
    //   } else {
    //     const elapsed = Date.now() - ts;
    //     if (elapsed < MIN_SUBMIT_TIME_MS) {
    //       flagReasons.push(`[timing] Submitted too fast (${elapsed}ms)`);
    //     } else if (elapsed > MAX_SUBMIT_TIME_MS) {
    //       flagReasons.push(`[timing] Submission too stale (${elapsed}ms)`);
    //     } else {
    //       // ── 3. JS challenge verification ──
    //       const jsc = Number(_jsc);
    //       if (!_jsc || isNaN(jsc) || jsc !== computeJsChallenge(ts)) {
    //         flagReasons.push("[js_challenge] LCG computation mismatch");
    //       }
    //     }
    //   }
    // }

    // ── 4. Resolve project: by projectId or hostname ──
    const senderIp = extractClientIp(req);

    let project;
    if (projectId) {
      project = await ProjectModel.findPublicActiveById(String(projectId));
    } else if (hostname) {
      project = await ProjectModel.findActiveByHostnameOrDomain(String(hostname));
      if (project) {
        projectId = project.id;
      }
    }

    if (!projectId || !formName || !contents) {
      return res
        .status(400)
        .json({ error: "projectId (or hostname), formName, and contents are required" });
    }

    if (!project) {
      return silentOk(res);
    }

    // Contents can be a flat object (legacy contact forms) or sections array (onboarding)
    const isSectionsFormat = Array.isArray(contents);

    if (typeof contents !== "object") {
      return res
        .status(400)
        .json({ error: "contents must be a JSON object or sections array" });
    }

    // TODO: Re-enable origin validation
    // // ── 5. Origin validation ──
    // const origin = req.headers.origin || req.headers.referer;
    // if (origin) {
    //   const allowedOrigins: string[] = [];
    //   if (project.generated_hostname) {
    //     allowedOrigins.push(`https://${project.generated_hostname}.sites.getalloro.com`);
    //   }
    //   if (project.hostname) {
    //     allowedOrigins.push(`https://${project.hostname}.sites.getalloro.com`);
    //   }
    //   if (project.custom_domain) {
    //     allowedOrigins.push(`https://${project.custom_domain}`);
    //     allowedOrigins.push(`http://${project.custom_domain}`);
    //   }
    //   if (process.env.NODE_ENV !== "production") {
    //     allowedOrigins.push("http://localhost");
    //     allowedOrigins.push("http://sites.localhost");
    //   }
    //   const originLower = origin.toLowerCase();
    //   const matched = allowedOrigins.some((allowed) =>
    //     originLower.startsWith(allowed.toLowerCase()),
    //   );
    //   if (!matched) {
    //     flagReasons.push(`[origin] Unrecognized origin: ${origin}`);
    //   }
    // }

    // ── 6. Sanitize form name ──
    const sanitizedFormName = sanitize(String(formName));
    if (sanitizedFormName.length > MAX_FORM_NAME_LENGTH) {
      return res.status(400).json({ error: `Form name too long (max ${MAX_FORM_NAME_LENGTH} chars)` });
    }

    // Trusted form types skip spam scoring and AI analysis
    const isTrustedFormType = formType === "onboarding" || formType === "insurance-inquiry";

    // ── 7. Process contents based on format ──
    let finalContents: FormContents;
    let textContents: Record<string, string> = {}; // Flat text for spam scoring / email (legacy only)

    if (isSectionsFormat) {
      // Sections array format — sanitize all text values within sections
      const sanitizedSections: FormSection[] = (contents as FormSection[]).map((section: FormSection) => ({
        title: sanitize(section.title || ""),
        fields: section.fields.map(([key, value]) => [
          sanitize(String(key)),
          typeof value === "string" ? sanitize(value) : value,
        ] as [string, string | FileValue]),
      }));
      finalContents = sanitizedSections;

      // Extract flat text for duplicate detection hash
      for (const section of sanitizedSections) {
        for (const [key, value] of section.fields) {
          if (typeof value === "string") {
            textContents[`${section.title} - ${key}`] = value;
          }
        }
      }
    } else {
      // Legacy flat object format — payload caps + sanitize
      const fieldKeys = Object.keys(contents);
      if (fieldKeys.length > MAX_FIELDS) {
        return res.status(400).json({ error: `Too many fields (max ${MAX_FIELDS})` });
      }

      for (const [key, value] of Object.entries(contents)) {
        if (String(key).length > MAX_KEY_LENGTH) {
          return res.status(400).json({ error: `Field name too long (max ${MAX_KEY_LENGTH} chars)` });
        }
        if (typeof value === "string" && value.length > MAX_VALUE_LENGTH) {
          return res.status(400).json({ error: `Field value too long (max ${MAX_VALUE_LENGTH} chars)` });
        }
      }

      const sanitizedFlat: Record<string, string | FileValue> = {};
      for (const [key, value] of Object.entries(contents)) {
        if (typeof value === "string") {
          const sKey = sanitize(String(key));
          const sVal = sanitize(value);
          sanitizedFlat[sKey] = sVal;
          textContents[sKey] = sVal;
        }
      }
      finalContents = sanitizedFlat;
    }

    // ── BRANCH: Newsletter double opt-in ──
    if (formType === "newsletter") {
      return handleNewsletterSignup(res, project, textContents);
    }

    // TODO: Re-enable content pattern scoring, flood detection, duplicate detection
    // // ── 8. Content pattern scoring ──
    // if (!isTrustedFormType) {
    //   const patternResult = analyzePatterns(textContents);
    //   if (patternResult.score >= SPAM_THRESHOLD) {
    //     flagReasons.push(`[content_pattern] Score ${patternResult.score}: ${patternResult.reasons.join("; ")}`);
    //   }
    // }

    // // ── 9. Flood detection ──
    // if (senderIp !== "unknown") {
    //   const flooding = await isIpFlooding(senderIp);
    //   if (flooding) {
    //     return res.status(429).json({ error: "Too many submissions. Please try again later." });
    //   }
    // }

    const contentHash = hashContents(textContents);
    // const duplicate = await isDuplicateContent(String(projectId), contentHash);
    // if (duplicate) {
    //   flagReasons.push("[duplicate] Identical content already submitted recently");
    // }

    // ── 11. File uploads — upload to S3 ──
    const uploadedFiles = req.files as Express.Multer.File[] | undefined;
    if (uploadedFiles && uploadedFiles.length > 0) {
      const fileEntries = await uploadFormFiles(uploadedFiles, project.organization_id);

      if (isSectionsFormat) {
        // Append files as their own section
        const fileFields: [string, FileValue][] = Object.entries(fileEntries).map(
          ([, fv]) => [fv.name, fv] as [string, FileValue],
        );
        (finalContents as FormSection[]).push({
          title: "Uploaded Files",
          fields: fileFields,
        });
      } else {
        Object.assign(finalContents, fileEntries);
      }
    }

    // ── 12. Resolve recipients through per-form rule, then canonical fallback ──
    let recipients: string[] = [];
    try {
      const resolution = await resolveWebsiteFormRecipients({
        projectId: String(projectId),
        formName: sanitizedFormName,
        organizationId: project?.organization_id,
        legacyProjectRecipients: project?.recipients,
      });
      recipients = resolution.recipients;
    } catch (lookupErr) {
      logger.error({ err: lookupErr }, "[Form Submission] Recipient lookup failed:");
    }

    // ── 13. Persist submission FIRST (unflagged) — guarantees DB record before AI call ──
    let submissionId: string | null = null;
    try {
      const created = await FormSubmissionModel.create({
        project_id: String(projectId),
        form_name: sanitizedFormName,
        contents: finalContents,
        recipients_sent_to: recipients,
        sender_ip: senderIp,
        content_hash: contentHash,
        is_flagged: false,
      });
      submissionId = created.id;
    } catch (saveErr) {
      logger.error({ err: {
                error: saveErr instanceof Error ? saveErr.message : saveErr,
                projectId: String(projectId),
                formName: sanitizedFormName,
                senderIp,
              } }, "[Form Submission] Failed to save submission:");
    }

    // ── 14. AI content analysis — runs AFTER save, then updates flag or sends email ──
    let flagged = flagReasons.length > 0;
    let flagReason = flagReasons.join("; ");

    if (!flagged && !isTrustedFormType) {
      const aiResult = await analyzeContent(sanitizedFormName, textContents);
      if (aiResult.flagged) {
        flagged = true;
        flagReason = `[${aiResult.category}] ${aiResult.reason}`;

        // Update the saved record to flagged
        if (submissionId) {
          try {
            await db("website_builder.form_submissions")
              .where("id", submissionId)
              .update({ is_flagged: true, flag_reason: flagReason });
          } catch (updateErr) {
            logger.error({ err: updateErr }, "[Form Submission] Failed to update flag:");
          }
        }
      }
    }

    // ── 14b. CRM push (idempotent, async) ──
    // Hooks AFTER the AI block so `flagged` is final. Wrapped in its own
    // try/catch so a Redis hiccup or DB blip never breaks the visitor response.
    if (submissionId) {
      try {
        const integration = await WebsiteIntegrationModel.findByProjectAndPlatform(
          String(projectId),
          "hubspot",
        );
        if (integration && integration.status === "active") {
          const mapping = await IntegrationFormMappingModel.findByIntegrationAndWebsiteForm(
            integration.id,
            sanitizedFormName,
          );

          if (flagged) {
            await CrmSyncLogModel.create({
              integration_id: integration.id,
              mapping_id: mapping?.id ?? null,
              submission_id: submissionId,
              platform: integration.platform,
              vendor_form_id: mapping?.vendor_form_id ?? null,
              outcome: "skipped_flagged",
              error: flagReason || null,
            });
          } else if (!mapping || mapping.status !== "active") {
            await CrmSyncLogModel.create({
              integration_id: integration.id,
              mapping_id: null,
              submission_id: submissionId,
              platform: integration.platform,
              vendor_form_id: null,
              outcome: "no_mapping",
            });
          } else {
            const queue = getCrmQueue(`${integration.platform}-push`);
            await queue.add(
              "push-submission",
              { submissionId, mappingId: mapping.id },
              {
                jobId: submissionId, // IDEMPOTENCY KEY — BullMQ refuses duplicate jobIds
                attempts: 5,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 50 },
              },
            );
          }
        }
        // No active integration → no log row (write-amplification rule)
      } catch (err) {
        logger.error({ err: err }, "[Form Submission] CRM enqueue failed:");
        // Do not throw — visitor response must complete normally.
      }
    }

    // ── 15. Email (only if not flagged by AI) ──
    if (!flagged && recipients.length > 0) {
      const emailContext = await resolveFormSubmissionEmailContext(project);
      const emailBody = buildEmailBody(sanitizedFormName, finalContents, {
        headerColor: emailContext.headerColor,
        logoUrl: emailContext.logoUrl,
      });
      const fromEmail = process.env.CONTACT_FORM_FROM || "info@getalloro.com";

      await sendEmailWebhook({
        cc: [],
        bcc: [],
        body: emailBody,
        from: fromEmail,
        subject: `New Entry From ${sanitizedFormName}`,
        fromName: emailContext.fromName,
        recipients,
      });
    } else if (!flagged) {
      logger.warn(
        `[Form Submission] No recipients resolved for project ${projectId}; saved submission without sending email.`
      );
    }

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof WebhookError) {
      return res.status(502).json({ error: "Failed to send email" });
    }

    if (error instanceof Error && error.message === "Email service not configured") {
      return res.status(500).json({ error: "Email service not configured" });
    }

    logger.error({ err: error }, "[Form Submission] Error:");
    return res.status(500).json({ error: "Internal server error" });
  }
}
