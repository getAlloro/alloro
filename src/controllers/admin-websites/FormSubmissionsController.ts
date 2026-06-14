/**
 * Admin Websites — Form Submissions Controller
 *
 * Submission inbox: list, mark-all-read, single get/read-toggle/send-email/delete,
 * and bulk send-email/delete/read.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import { FormSubmissionModel } from "../../models/website-builder/FormSubmissionModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import type { IProject } from "../../models/website-builder/ProjectModel";
import { generatePresignedUrl } from "../../utils/core/s3";
import { buildEmailBody } from "../websiteContact/websiteContact-services/emailBodyBuilder";
import { resolveFormSubmissionEmailContext } from "../websiteContact/websiteContact-services/formSubmissionEmailContextService";
import { sendEmailWebhook, WebhookError } from "../websiteContact/websiteContact-services/emailWebhookService";
import { resolveWebsiteFormRecipients } from "../../services/formRecipientRoutingService";
import logger from "../../lib/logger";

/** GET /:id/form-submissions — List submissions with pagination */
export async function listFormSubmissions(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const readFilter = req.query.read;
    const filterParam = req.query.filter as string | undefined;
    const formName =
      typeof req.query.formName === "string"
        ? req.query.formName.trim()
        : "";

    const filters: { is_read?: boolean; is_flagged?: boolean; form_name?: string; form_name_not?: string } = {};
    if (readFilter === "true") filters.is_read = true;
    if (readFilter === "false") filters.is_read = false;
    if (formName) filters.form_name = formName;

    if (filterParam === "verified") {
      filters.is_flagged = false;
      if (!formName) filters.form_name_not = "Newsletter Signup";
    } else if (filterParam === "flagged") {
      filters.is_flagged = true;
    } else if (filterParam === "optins" && !formName) {
      filters.form_name = "Newsletter Signup";
    }

    const result = await FormSubmissionModel.findByProjectId(
      id,
      { offset: (page - 1) * limit, limit },
      filters,
    );

    const baseCountFilters = formName ? { form_name: formName } : {};
    const [allCount, unreadCount, flaggedCount, verifiedCount, optinsCount] = await Promise.all([
      FormSubmissionModel.countByProjectId(id, baseCountFilters),
      FormSubmissionModel.countByProjectId(id, { ...baseCountFilters, is_read: false }),
      FormSubmissionModel.countByProjectId(id, { ...baseCountFilters, is_flagged: true }),
      FormSubmissionModel.countByProjectId(id, {
        ...baseCountFilters,
        is_flagged: false,
        ...(formName ? {} : { form_name_not: "Newsletter Signup" }),
      }),
      formName
        ? formName === "Newsletter Signup"
          ? FormSubmissionModel.countByProjectId(id, baseCountFilters)
          : Promise.resolve(0)
        : FormSubmissionModel.countOptinsByProjectId(id),
    ]);

    const totalPages = Math.ceil(result.total / limit);

    return res.json({ success: true, data: result.data, pagination: { page, limit, total: result.total, totalPages }, allCount, unreadCount, flaggedCount, verifiedCount, optinsCount });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing form submissions:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message || "Failed to fetch submissions" });
  }
}

/** PATCH /:id/form-submissions/mark-all-read — Mark submissions read */

/** PATCH /:id/form-submissions/mark-all-read — Mark submissions read */
export async function markAllFormSubmissionsRead(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const formName =
      typeof req.body?.formName === "string" ? req.body.formName.trim() : "";
    const updated = await FormSubmissionModel.markAllAsReadByProjectId(
      id,
      formName || undefined,
    );

    return res.json({ success: true, data: { updated } });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error marking submissions read:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to mark submissions read",
    });
  }
}

/** GET /:id/form-submissions/:submissionId — Get single submission */

/** GET /:id/form-submissions/:submissionId — Get single submission */
export async function getFormSubmission(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionId } = req.params;
    const submission = await FormSubmissionModel.findById(submissionId);

    if (!submission) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Submission not found" });
    }

    // Resolve pre-signed URLs for any file values in contents
    if (submission.contents) {
      if (Array.isArray(submission.contents)) {
        // Sections format
        for (const section of submission.contents) {
          if (section && typeof section === "object" && Array.isArray((section as any).fields)) {
            for (const field of (section as any).fields) {
              if (Array.isArray(field) && field[1] && typeof field[1] === "object" && "s3Key" in field[1]) {
                try {
                  field[1].url = await generatePresignedUrl(field[1].s3Key, 3600);
                } catch (err) {
                  logger.error({ err: err }, `[Form Submission] Failed to generate pre-signed URL for ${field[1].s3Key}:`);
                }
              }
            }
          }
        }
      } else if (typeof submission.contents === "object") {
        // Legacy flat format
        for (const [, value] of Object.entries(submission.contents)) {
          if (value && typeof value === "object" && "s3Key" in value) {
            try {
              (value as any).url = await generatePresignedUrl((value as any).s3Key, 3600);
            } catch (err) {
              logger.error({ err: err }, `[Form Submission] Failed to generate pre-signed URL for ${(value as any).s3Key}:`);
            }
          }
        }
      }
    }

    return res.json({ success: true, data: submission });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching submission:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message || "Failed to fetch submission" });
  }
}

/** PATCH /:id/form-submissions/:submissionId/read — Toggle read status */

/** PATCH /:id/form-submissions/:submissionId/read — Toggle read status */
export async function toggleFormSubmissionRead(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionId } = req.params;
    const { is_read } = req.body;

    if (is_read) {
      await FormSubmissionModel.markAsRead(submissionId);
    } else {
      await FormSubmissionModel.markAsUnread(submissionId);
    }

    return res.json({ success: true, data: { is_read } });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error toggling submission read:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message || "Failed to update submission" });
  }
}

/** DELETE /:id/form-submissions/:submissionId — Delete a submission */

/** DELETE /:id/form-submissions/:submissionId — Delete a submission */
export async function deleteFormSubmission(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionId } = req.params;
    await FormSubmissionModel.deleteById(submissionId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting submission:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message || "Failed to delete submission" });
  }
}

const BULK_MAX = 50;

const FROM_EMAIL = process.env.CONTACT_FORM_FROM || "info@getalloro.com";

type FormResendProject = Pick<IProject, "organization_id" | "recipients">;

async function resolveCurrentFormSubmissionRecipients(
  projectId: string,
  formName: string,
  project: FormResendProject,
): Promise<string[]> {
  const resolution = await resolveWebsiteFormRecipients({
    projectId,
    formName,
    organizationId: project.organization_id,
    legacyProjectRecipients: project.recipients,
  });

  return resolution.recipients;
}

/** POST /:id/form-submissions/:submissionId/send-email — Manually send a single submission to current recipients */

/** POST /:id/form-submissions/:submissionId/send-email — Manually send a single submission to current recipients */
export async function sendFormSubmissionEmail(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id: projectId, submissionId } = req.params;
    const submission = await FormSubmissionModel.findById(submissionId);

    if (!submission) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Submission not found" });
    }
    if (submission.project_id !== projectId) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Submission not found" });
    }
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Website project not found" });
    }

    const recipients = await resolveCurrentFormSubmissionRecipients(
      projectId,
      submission.form_name,
      project,
    );
    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: "NO_RECIPIENTS", message: "No recipients configured for this form" });
    }

    const emailContext = await resolveFormSubmissionEmailContext(project);
    const emailBody = buildEmailBody(submission.form_name, submission.contents, {
      headerColor: emailContext.headerColor,
      logoUrl: emailContext.logoUrl,
    });

    await sendEmailWebhook({
      cc: [],
      bcc: [],
      body: emailBody,
      from: FROM_EMAIL,
      subject: `New Entry From ${submission.form_name}`,
      fromName: emailContext.fromName,
      recipients,
    });

    return res.json({ success: true, data: { recipients } });
  } catch (error: any) {
    if (error instanceof WebhookError) {
      return res.status(502).json({ success: false, error: "WEBHOOK_ERROR", message: "Failed to send email" });
    }
    logger.error({ err: error }, "[Admin Websites] Error sending submission email:");
    return res.status(500).json({ success: false, error: "SEND_ERROR", message: error?.message || "Failed to send email" });
  }
}

/** POST /:id/form-submissions/bulk/send-email — Manually send multiple flagged submissions */

/** POST /:id/form-submissions/bulk/send-email — Manually send multiple flagged submissions */
export async function bulkSendFormSubmissionsEmail(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { submissionIds } = req.body;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ success: false, error: "INVALID_PAYLOAD", message: "submissionIds must be a non-empty array" });
    }
    if (submissionIds.length > BULK_MAX) {
      return res.status(400).json({ success: false, error: "TOO_MANY", message: `Max ${BULK_MAX} submissions per bulk request` });
    }

    let sent = 0;
    let skipped = 0;
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Website project not found" });
    }
    const emailContext = await resolveFormSubmissionEmailContext(project);
    const recipientsByFormName = new Map<string, string[]>();

    for (const id of submissionIds) {
      const submission = await FormSubmissionModel.findById(String(id));
      if (
        !submission ||
        submission.project_id !== projectId
      ) {
        skipped++;
        continue;
      }

      try {
        let recipients = recipientsByFormName.get(submission.form_name);
        if (!recipients) {
          recipients = await resolveCurrentFormSubmissionRecipients(
            projectId,
            submission.form_name,
            project,
          );
          recipientsByFormName.set(submission.form_name, recipients);
        }

        if (recipients.length === 0) {
          skipped++;
          continue;
        }

        const emailBody = buildEmailBody(
          submission.form_name,
          submission.contents,
          {
            headerColor: emailContext.headerColor,
            logoUrl: emailContext.logoUrl,
          },
        );
        await sendEmailWebhook({
          cc: [],
          bcc: [],
          body: emailBody,
          from: FROM_EMAIL,
          subject: `New Entry From ${submission.form_name}`,
          fromName: emailContext.fromName,
          recipients,
        });
        sent++;
      } catch {
        skipped++;
      }
    }

    return res.json({ success: true, data: { sent, skipped } });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error bulk sending submission emails:");
    return res.status(500).json({ success: false, error: "BULK_SEND_ERROR", message: error?.message || "Failed to bulk send emails" });
  }
}

/** DELETE /:id/form-submissions/bulk — Delete multiple submissions */

/** DELETE /:id/form-submissions/bulk — Delete multiple submissions */
export async function bulkDeleteFormSubmissions(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionIds } = req.body;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ success: false, error: "INVALID_PAYLOAD", message: "submissionIds must be a non-empty array" });
    }
    if (submissionIds.length > BULK_MAX) {
      return res.status(400).json({ success: false, error: "TOO_MANY", message: `Max ${BULK_MAX} submissions per bulk request` });
    }

    const deleted = await FormSubmissionModel.bulkDeleteByIds(submissionIds.map(String));
    return res.json({ success: true, data: { deleted } });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error bulk deleting submissions:");
    return res.status(500).json({ success: false, error: "BULK_DELETE_ERROR", message: error?.message || "Failed to bulk delete submissions" });
  }
}

/** PATCH /:id/form-submissions/bulk/read — Toggle read status for multiple submissions */

/** PATCH /:id/form-submissions/bulk/read — Toggle read status for multiple submissions */
export async function bulkToggleFormSubmissionsRead(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { submissionIds, is_read } = req.body;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ success: false, error: "INVALID_PAYLOAD", message: "submissionIds must be a non-empty array" });
    }
    if (submissionIds.length > BULK_MAX) {
      return res.status(400).json({ success: false, error: "TOO_MANY", message: `Max ${BULK_MAX} submissions per bulk request` });
    }

    const ids = submissionIds.map(String);
    if (is_read) {
      await FormSubmissionModel.bulkMarkAsRead(ids);
    } else {
      await FormSubmissionModel.bulkMarkAsUnread(ids);
    }

    return res.json({ success: true, data: { is_read, count: ids.length } });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error bulk toggling submission read:");
    return res.status(500).json({ success: false, error: "BULK_READ_ERROR", message: error?.message || "Failed to bulk update submissions" });
  }
}

// =====================================================================
// POST TYPES
// =====================================================================

/** GET /templates/:templateId/post-types */
