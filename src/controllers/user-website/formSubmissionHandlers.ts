/**
 * User Website — Form Submission, Recipient & Analytics Handlers
 *
 * Thin HTTP handlers for owner-facing form submissions, recipient/forms
 * configuration, and website analytics. Each handler resolves the org's
 * project, delegates to a service, and shapes the response. No business logic
 * lives here.
 *
 * Re-exported from UserWebsiteController so the route file's
 * `import * as controller` surface stays unchanged.
 */

import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import * as formSubmissionsService from "./user-website-services/formSubmissions.service";
import * as analyticsService from "./user-website-services/websiteAnalytics.service";
import { handleError } from "./user-website-utils/responses";

// =====================================================================
// RECIPIENTS
// =====================================================================

/** GET /api/user/website/recipients */
export async function getRecipients(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const data = await formSubmissionsService.getRecipientsForOrg({
      orgId,
      legacyProjectRecipients: project.recipients,
    });

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Fetch recipients");
  }
}

/** PUT /api/user/website/recipients */
export async function updateRecipients(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const recipients = await formSubmissionsService.updateRecipientsForOrg(
      orgId,
      req.body.recipients
    );

    return res.json({ success: true, data: { recipients } });
  } catch (error: any) {
    if (error?.statusCode === 400) {
      return res.status(400).json({ error: error.message });
    }
    return handleError(res, error, "Update recipients");
  }
}

/** GET /api/user/website/forms/catalog */
export async function listFormCatalog(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const data = await formSubmissionsService.getFormCatalog(project.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Fetch form catalog");
  }
}

/** PUT /api/user/website/forms/recipients */
export async function updateFormRecipientRule(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const data = await formSubmissionsService.updateFormRecipients({
      projectId: project.id,
      formName: req.body.formName,
      recipients: req.body.recipients,
      isEnabled: req.body.isEnabled,
    });

    return res.json({ success: true, data });
  } catch (error: any) {
    if (typeof error?.statusCode === "number") {
      return res.status(error.statusCode).json({
        error: error.code || "FORM_RECIPIENT_RULE_ERROR",
        message: error.message || "Failed to update form recipients",
      });
    }
    return handleError(res, error, "Update form recipients");
  }
}

/** PUT /api/user/website/forms/preferences */
export async function updateFormPreferences(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const data = await formSubmissionsService.updateFormPreferences({
      projectId: project.id,
      preferences: req.body?.preferences,
    });

    return res.json({ success: true, data });
  } catch (error: any) {
    if (typeof error?.statusCode === "number") {
      return res.status(error.statusCode).json({
        error: error.code || "FORM_CATALOG_PREFERENCES_ERROR",
        message: error.message || "Failed to update form preferences",
      });
    }
    return handleError(res, error, "Update form preferences");
  }
}

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

/** GET /api/user/website/form-submissions/stats */
export async function getFormSubmissionStats(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const stats = await formSubmissionsService.getSubmissionStats(project.id);

    return res.json({ success: true, ...stats });
  } catch (error) {
    return handleError(res, error, "Fetch submission stats");
  }
}

/** GET /api/user/website/analytics — owner-facing Rybbit performance (slim) */
export async function getWebsiteAnalytics(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const result = await analyticsService.getWebsiteAnalytics(
      project.id,
      req.query.rangeDays
    );

    return res.json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Fetch website analytics");
  }
}

/** GET /api/user/website/form-submissions/timeseries */
export async function getFormSubmissionsTimeseries(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const rangeParam = (req.query.range as string) || "12m";
    const data = await formSubmissionsService.getSubmissionsTimeseries(
      project.id,
      rangeParam
    );

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Fetch form submissions timeseries");
  }
}

/** PATCH /api/user/website/form-submissions/mark-all-read */
export async function markAllFormSubmissionsRead(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const formName =
      typeof req.body?.formName === "string" ? req.body.formName.trim() : "";
    const updated = await formSubmissionsService.markAllSubmissionsRead(
      project.id,
      formName
    );

    return res.json({ success: true, updated });
  } catch (error) {
    return handleError(res, error, "Mark all submissions read");
  }
}

/** GET /api/user/website/form-submissions */
export async function listFormSubmissions(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;

    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const project = await ProjectModel.findByOrganizationId(orgId);

    if (!project) {
      return res.status(404).json({ error: "No website found" });
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const formName =
      typeof req.query.formName === "string"
        ? req.query.formName.trim()
        : "";

    const result = await formSubmissionsService.listSubmissions(project.id, {
      page,
      limit,
      readFilter: req.query.read,
      filterParam: req.query.filter as string | undefined,
      formName,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, "Fetch form submissions");
  }
}

/** GET /api/user/website/form-submissions/:id */
export async function getFormSubmission(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const { id } = req.params;
    const submission = await formSubmissionsService.getOwnedSubmission(
      project.id,
      id
    );

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    return res.json({ success: true, data: submission });
  } catch (error) {
    return handleError(res, error, "Fetch form submission");
  }
}

/** PATCH /api/user/website/form-submissions/:id/read */
export async function toggleFormSubmissionRead(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const { id } = req.params;
    const { is_read } = req.body;
    const ok = await formSubmissionsService.setSubmissionRead(
      project.id,
      id,
      is_read
    );
    if (!ok) {
      return res.status(404).json({ error: "Submission not found" });
    }

    return res.json({ success: true, data: { is_read } });
  } catch (error) {
    return handleError(res, error, "Toggle submission read");
  }
}

/** DELETE /api/user/website/form-submissions/:id */
export async function deleteFormSubmission(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) return res.status(404).json({ error: "No website found" });

    const { id } = req.params;
    const ok = await formSubmissionsService.deleteSubmission(project.id, id);
    if (!ok) {
      return res.status(404).json({ error: "Submission not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error, "Delete form submission");
  }
}

/** GET /api/user/website/form-submissions/export */
export async function exportFormSubmissions(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      res.status(400).json({ error: "No organization found" });
      return;
    }

    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) {
      res.status(404).json({ error: "No website found" });
      return;
    }

    const csv = await formSubmissionsService.buildSubmissionsExportCsv(
      project.id
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=form-submissions.csv");
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: "Failed to export submissions" });
  }
}
