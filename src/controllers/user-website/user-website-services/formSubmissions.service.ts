/**
 * User Website — Form Submissions Service
 *
 * Business logic for owner-facing form-submission operations: stats, monthly
 * timeseries, listing with filters, read-toggling, deletion, and CSV export,
 * plus form catalog + recipient configuration. No req/res objects — the
 * controller resolves org/project and shapes the HTTP response; this layer
 * takes a resolved `projectId` and returns plain data.
 *
 * Extracted from UserWebsiteController to keep the controller thin
 * (parse -> call service -> shape response).
 */

import {
  FormSubmissionModel,
  type IFormSubmission,
} from "../../../models/website-builder/FormSubmissionModel";
import * as formDetection from "../../admin-websites/feature-services/service.form-detection";
import { upsertFormCatalogPreferences } from "../../../services/formCatalogPreferenceService";
import { upsertFormRecipientRule } from "../../../services/formRecipientRuleService";
import {
  getConfiguredRecipients,
  listOrgUserRecipientOptions,
  updateRecipientSetting,
} from "../../../services/recipientSettingsService";
import { buildSubmissionsCsv } from "../user-website-utils/csv";

// Local mirror of the model's (unexported) filter shape.
type SubmissionFilters = {
  is_read?: boolean;
  is_flagged?: boolean;
  form_name?: string;
  form_name_not?: string;
};

export interface SubmissionStats {
  allCount: number;
  unreadCount: number;
  flaggedCount: number;
  verifiedCount: number;
  blockedCount: number;
}

export interface SubmissionTimeseriesPoint {
  month: string;
  total: number;
  verified: number;
  unread: number;
  flagged: number;
  blocked: number;
}

export interface ListSubmissionsParams {
  page: number;
  limit: number;
  readFilter?: unknown;
  filterParam?: string;
  formName: string;
}

export interface ListSubmissionsResult {
  data: IFormSubmission[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  allCount: number;
  unreadCount: number;
  flaggedCount: number;
  verifiedCount: number;
  optinsCount: number;
}

// =====================================================================
// Stats — top-level submission counts for the dashboard
// =====================================================================

export async function getSubmissionStats(
  projectId: string
): Promise<SubmissionStats> {
  const [allCount, unreadCount, flaggedCount, verifiedCount] = await Promise.all([
    FormSubmissionModel.countByProjectId(projectId, {
      form_name_not: "Newsletter Signup",
    }),
    FormSubmissionModel.countUnreadByProjectId(projectId),
    FormSubmissionModel.countFlaggedByProjectId(projectId),
    FormSubmissionModel.countVerifiedByProjectId(projectId),
  ]);

  return {
    allCount,
    unreadCount,
    flaggedCount,
    verifiedCount,
    // Blocked attempts are not persisted today; keep the response
    // backward-compatible for the dashboard without implying telemetry exists.
    blockedCount: 0,
  };
}

// =====================================================================
// Timeseries — per-month, per-status counts (zero-filled)
// =====================================================================

export async function getSubmissionsTimeseries(
  projectId: string,
  rangeParam: string
): Promise<SubmissionTimeseriesPoint[]> {
  const monthCount = rangeParam === "3m" ? 3 : rangeParam === "6m" ? 6 : 12;

  // Compute the start of the range: first day of (current month - (monthCount - 1))
  const now = new Date();
  const rangeStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthCount - 1), 1)
  );

  // Aggregate by month with per-status counts (Postgres syntax).
  // Project-scoped because submissions live under website_builder.form_submissions
  // keyed by project_id; the project itself is scoped to the org via ProjectModel.findByOrganizationId.
  const rows = await FormSubmissionModel.getMonthlyStatsByProject(
    projectId,
    rangeStart.toISOString()
  );

  // Build a map of month → counts from query results
  const byMonth = new Map<string, SubmissionTimeseriesPoint>();
  for (const r of rows as Array<{
    month: string;
    total: number | string;
    verified: number | string;
    unread: number | string;
    flagged: number | string;
    blocked: number | string;
  }>) {
    byMonth.set(r.month, {
      month: r.month,
      total: Number(r.total) || 0,
      verified: Number(r.verified) || 0,
      unread: Number(r.unread) || 0,
      flagged: Number(r.flagged) || 0,
      blocked: Number(r.blocked) || 0,
    });
  }

  // Zero-fill every month in the range, oldest-first
  const data: SubmissionTimeseriesPoint[] = [];
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthCount - 1 - i), 1)
    );
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}`;
    data.push(
      byMonth.get(key) || {
        month: key,
        total: 0,
        verified: 0,
        unread: 0,
        flagged: 0,
        blocked: 0,
      }
    );
  }

  return data;
}

// =====================================================================
// Mark all read
// =====================================================================

export async function markAllSubmissionsRead(
  projectId: string,
  formName: string
): Promise<number> {
  return FormSubmissionModel.markAllAsReadByProjectId(
    projectId,
    formName || undefined
  );
}

// =====================================================================
// List — filtered, paginated, with sidebar counts
// =====================================================================

export async function listSubmissions(
  projectId: string,
  params: ListSubmissionsParams
): Promise<ListSubmissionsResult> {
  const { page, limit, readFilter, filterParam, formName } = params;

  const filters: SubmissionFilters = {};
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
    projectId,
    { offset: (page - 1) * limit, limit },
    filters
  );

  const baseCountFilters: SubmissionFilters = formName
    ? { form_name: formName }
    : {};
  const [allCount, unreadCount, flaggedCount, verifiedCount, optinsCount] =
    await Promise.all([
      FormSubmissionModel.countByProjectId(projectId, baseCountFilters),
      FormSubmissionModel.countByProjectId(projectId, {
        ...baseCountFilters,
        is_read: false,
      }),
      FormSubmissionModel.countByProjectId(projectId, {
        ...baseCountFilters,
        is_flagged: true,
      }),
      FormSubmissionModel.countByProjectId(projectId, {
        ...baseCountFilters,
        is_flagged: false,
        ...(formName ? {} : { form_name_not: "Newsletter Signup" }),
      }),
      formName
        ? formName === "Newsletter Signup"
          ? FormSubmissionModel.countByProjectId(projectId, baseCountFilters)
          : Promise.resolve(0)
        : FormSubmissionModel.countOptinsByProjectId(projectId),
    ]);

  const totalPages = Math.ceil(result.total / limit);

  return {
    data: result.data,
    pagination: { page, limit, total: result.total, totalPages },
    allCount,
    unreadCount,
    flaggedCount,
    verifiedCount,
    optinsCount,
  };
}

// =====================================================================
// Single-submission ops (ownership-checked)
// =====================================================================

/** Returns the submission iff it exists and belongs to the project, else null. */
export async function getOwnedSubmission(
  projectId: string,
  id: string
): Promise<IFormSubmission | null> {
  const submission = await FormSubmissionModel.findById(id);
  if (!submission || submission.project_id !== projectId) return null;
  return submission;
}

/**
 * Toggle a submission's read flag. Returns false when the submission doesn't
 * exist or belongs to another project (controller maps to 404).
 */
export async function setSubmissionRead(
  projectId: string,
  id: string,
  isRead: boolean
): Promise<boolean> {
  const submission = await getOwnedSubmission(projectId, id);
  if (!submission) return false;

  if (isRead) {
    await FormSubmissionModel.markAsRead(id);
  } else {
    await FormSubmissionModel.markAsUnread(id);
  }
  return true;
}

/**
 * Delete a submission. Returns false when it doesn't exist or belongs to
 * another project (controller maps to 404).
 */
export async function deleteSubmission(
  projectId: string,
  id: string
): Promise<boolean> {
  const submission = await getOwnedSubmission(projectId, id);
  if (!submission) return false;

  await FormSubmissionModel.deleteById(id);
  return true;
}

// =====================================================================
// Export — CSV of all submissions
// =====================================================================

export async function buildSubmissionsExportCsv(
  projectId: string
): Promise<string> {
  const result = await FormSubmissionModel.findByProjectId(projectId, {
    offset: 0,
    limit: 10000,
  });
  return buildSubmissionsCsv(result.data);
}

// =====================================================================
// Form catalog + recipients
// =====================================================================

export async function getFormCatalog(projectId: string) {
  return formDetection.listFormCatalog(projectId);
}

export async function updateFormRecipients(params: {
  projectId: string;
  formName: unknown;
  recipients: unknown;
  isEnabled: unknown;
}) {
  return upsertFormRecipientRule({
    projectId: params.projectId,
    formName: params.formName,
    recipients: params.recipients,
    isEnabled: params.isEnabled,
  });
}

export async function updateFormPreferences(params: {
  projectId: string;
  preferences: unknown;
}) {
  return upsertFormCatalogPreferences({
    projectId: params.projectId,
    preferences: params.preferences,
  });
}

export async function getRecipientsForOrg(params: {
  orgId: number;
  legacyProjectRecipients: unknown;
}) {
  const [recipients, orgUsers] = await Promise.all([
    getConfiguredRecipients({
      organizationId: params.orgId,
      channel: "website_form",
      legacyProjectRecipients: params.legacyProjectRecipients,
    }),
    listOrgUserRecipientOptions(params.orgId),
  ]);

  return { recipients, orgUsers };
}

export async function updateRecipientsForOrg(
  orgId: number,
  recipients: unknown
) {
  return updateRecipientSetting(orgId, "website_form", recipients);
}
