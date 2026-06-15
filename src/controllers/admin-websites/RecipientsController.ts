/**
 * Admin Websites — Recipients Controller
 *
 * Per-project form-recipient settings: configured recipients + org user options,
 * with validation.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { getConfiguredRecipients, listOrgUserRecipientOptions, updateRecipientSetting, validateRecipientList } from "../../services/recipientSettingsService";
import logger from "../../lib/logger";

/** GET /:id/recipients — Get configured recipients + org users */
export async function getRecipients(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const project = await ProjectModel.findRecipientsContextById(id);

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    let orgUsers: { name: string; email: string; role: string }[] = [];
    let recipients = Array.isArray(project.recipients) ? project.recipients : [];
    if (project.organization_id) {
      [recipients, orgUsers] = await Promise.all([
        getConfiguredRecipients({
          organizationId: project.organization_id,
          channel: "website_form",
          legacyProjectRecipients: project.recipients,
        }),
        listOrgUserRecipientOptions(project.organization_id),
      ]);
    }

    return res.json({
      success: true,
      data: {
        recipients,
        orgUsers,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching recipients:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message || "Failed to fetch recipients" });
  }
}

/** PUT /:id/recipients — Update recipients list */

/** PUT /:id/recipients — Update recipients list */
export async function updateRecipients(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;
    const { recipients } = req.body;

    const project = await ProjectModel.findOrganizationContextById(id);

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    let normalized: string[];
    if (project.organization_id) {
      normalized = await updateRecipientSetting(
        project.organization_id,
        "website_form",
        recipients
      );
    } else {
      normalized = validateRecipientList(recipients);
      await ProjectModel.updateRecipientsById(id, JSON.stringify(normalized));
    }

    return res.json({ success: true, data: { recipients: normalized } });
  } catch (error: any) {
    if (error?.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: error.message,
      });
    }
    logger.error({ err: error }, "[Admin Websites] Error updating recipients:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message || "Failed to update recipients" });
  }
}

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

/** GET /:id/form-submissions — List submissions with pagination */
