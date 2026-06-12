/**
 * User Website Controller
 *
 * Handles HTTP request/response for user-facing website operations.
 * Delegates business logic to userWebsite.service.
 *
 * Endpoints:
 * - GET  / → getUserWebsite (DFY tier website data)
 * - GET  /media → listMedia (DFY tier website media)
 * - POST /media → uploadMedia (DFY tier website media upload)
 * - POST /pages/:pageId/edit → editPageComponent (AI page edit)
 */

import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import * as userWebsiteService from "./user-website-services/userWebsite.service";
import * as customDomainService from "../admin-websites/feature-services/service.custom-domain";
import * as gscIntegration from "../admin-websites/feature-services/service.gsc-integration";
import * as postManager from "../admin-websites/feature-services/service.post-manager";
import * as postTypeManager from "../admin-websites/feature-services/service.post-type-manager";
import * as menuManager from "../admin-websites/feature-services/service.menu-manager";
import {
  getDashboard as getRybbitDashboard,
  fetchRybbitMonthlyUniques,
  fetchRybbitOverview,
  type RybbitMonthlyPoint,
  type RybbitMetricSummary,
} from "../admin-websites/feature-services/service.rybbit-performance";
import { resolveShortcodes } from "./user-website-services/shortcodeResolver.service";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { resolveRybbitTimeZone } from "../../utils/rybbit/rybbit-time-zone";
import { FormSubmissionModel } from "../../models/website-builder/FormSubmissionModel";
import { WebsiteIntegrationModel } from "../../models/website-builder/WebsiteIntegrationModel";
import { db } from "../../database/connection";
import { snapshotPageStateIfChanged } from "../../utils/website-utils/pageSnapshots";
import * as formDetection from "../admin-websites/feature-services/service.form-detection";
import { upsertFormCatalogPreferences } from "../../services/formCatalogPreferenceService";
import { upsertFormRecipientRule } from "../../services/formRecipientRuleService";
import {
  getConfiguredRecipients,
  listOrgUserRecipientOptions,
  updateRecipientSetting,
} from "../../services/recipientSettingsService";

// =====================================================================
// Error handler
// =====================================================================

function handleError(
  res: Response,
  error: any,
  operation: string
): Response {
  // Check for service-level errors with statusCode
  if (error.statusCode) {
    const body: Record<string, unknown> = {
      error: error.errorCode || error.message,
      message: error.message,
    };
    if (error.limit !== undefined) body.limit = error.limit;
    if (error.reset_at !== undefined) body.reset_at = error.reset_at;
    return res.status(error.statusCode).json(body);
  }

  console.error(
    `[User/Website] ${operation} Error:`,
    error?.message || error
  );
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
  });
}

function handleGscError(
  res: Response,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof gscIntegration.GscIntegrationError) {
    return res.status(error.status).json({
      success: false,
      error: error.code,
      message: error.message,
    });
  }

  return handleError(res, error, operation);
}

// =====================================================================
// GET /api/user/website — Fetch user's organization website
// =====================================================================

export async function getUserWebsite(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;

    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const data = await userWebsiteService.fetchUserWebsiteData(orgId);

    // PREPARING state — project not yet created
    if (data.preparing) {
      return res.json({
        status: data.status,
        message: data.message,
      });
    }

    return res.json({
      project: data.project,
      pages: data.pages,
      media: data.media,
      usage: data.usage,
    });
  } catch (error) {
    return handleError(res, error, "Fetch user website");
  }
}

// =====================================================================
// GET /api/user/website/media — List user's website media
// =====================================================================

export async function listMedia(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const { type, search, page = "1", limit = "50" } = req.query;
    const result = await userWebsiteService.listMediaForOrg(orgId, {
      type: type as string | undefined,
      search: search as string | undefined,
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
    });

    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      quota: result.quota,
    });
  } catch (error) {
    return handleError(res, error, "List website media");
  }
}

// =====================================================================
// POST /api/user/website/media — Upload media for user's website
// =====================================================================

export async function uploadMedia(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const files = req.files as Express.Multer.File[];
    const result = await userWebsiteService.uploadMediaForOrg(orgId, files);

    return res.status(201).json({
      success: true,
      data: result.succeeded,
      failed: result.failed.length > 0 ? result.failed : undefined,
      quota: result.quota,
    });
  } catch (error: any) {
    if (error.statusCode && error.errorCode) {
      const body: Record<string, unknown> = {
        success: false,
        error: error.errorCode,
        message: error.message,
      };
      if (error.quota) {
        body.quota = error.quota;
      }
      return res.status(error.statusCode).json(body);
    }

    return handleError(res, error, "Upload website media");
  }
}

// =====================================================================
// POST /api/user/website/pages/:pageId/edit — AI page component edit
// =====================================================================

export async function editPageComponent(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const { pageId } = req.params;
    const { alloroClass, currentHtml, instruction, chatHistory = [] } =
      req.body;
    const userId = req.userId || 0;
    const orgId = req.organizationId;

    // Input validation
    if (!alloroClass || !currentHtml || !instruction) {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "alloroClass, currentHtml, and instruction are required",
      });
    }

    if (!orgId) {
      return res.status(400).json({ error: "No organization found" });
    }

    const result = await userWebsiteService.editPageComponent({
      orgId,
      userId,
      pageId,
      alloroClass,
      currentHtml,
      instruction,
      chatHistory,
    });

    return res.json({
      success: result.success,
      editedHtml: result.editedHtml,
      message: result.message,
      rejected: result.rejected,
      edits_remaining: result.edits_remaining,
    });
  } catch (error: any) {
    // Rate limit errors need specific response shape
    if (error.errorCode === "RATE_LIMIT_EXCEEDED") {
      return res.status(429).json({
        error: "RATE_LIMIT_EXCEEDED",
        message: error.message,
        limit: error.limit,
        reset_at: error.reset_at,
      });
    }

    // READ_ONLY errors
    if (error.errorCode === "READ_ONLY") {
      return res.status(403).json({
        error: "READ_ONLY",
        message: error.message,
      });
    }

    // DFY_TIER_REQUIRED
    if (error.errorCode === "DFY_TIER_REQUIRED") {
      return res.status(403).json({ error: "DFY_TIER_REQUIRED" });
    }

    // 404 errors (website not found, page not found)
    if (error.statusCode === 404) {
      return res.status(404).json({ error: error.message });
    }

    // Generic edit error — matches original error shape exactly
    console.error("[User/Website] Error editing page component:", error);
    return res.status(500).json({
      error: "EDIT_ERROR",
      message: error?.message || "Failed to edit component",
    });
  }
}

// =====================================================================
// Custom Domain — helpers
// =====================================================================

async function getProjectIdForOrg(orgId: number): Promise<string | null> {
  const project = await ProjectModel.findByOrganizationId(orgId);
  return project?.id || null;
}

// =====================================================================
// Google Search Console integration
// =====================================================================

/** GET /api/user/website/gsc */
export async function getGscIntegration(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const data = await userWebsiteService.getGscIntegration(orgId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleGscError(res, error, "Fetch Search Console integration");
  }
}

/** GET /api/user/website/gsc/connections */
export async function listGscConnections(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const data = await userWebsiteService.listGscConnections(orgId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleGscError(res, error, "List Search Console connections");
  }
}

/** GET /api/user/website/gsc/sites?connectionId=123 */
export async function listGscSites(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const connectionId = Number(req.query.connectionId);
    if (!Number.isInteger(connectionId) || connectionId <= 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "connectionId is required",
      });
    }

    const data = await userWebsiteService.listGscSites(orgId, connectionId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleGscError(res, error, "List Search Console sites");
  }
}

/** POST /api/user/website/gsc */
export async function saveGscIntegration(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const connectionId = Number(req.body?.connectionId);
    const siteUrl = typeof req.body?.siteUrl === "string" ? req.body.siteUrl : "";

    if (!Number.isInteger(connectionId) || connectionId <= 0 || !siteUrl.trim()) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "connectionId and siteUrl are required",
      });
    }

    const data = await userWebsiteService.saveGscIntegration(
      orgId,
      connectionId,
      siteUrl,
    );
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleGscError(res, error, "Save Search Console integration");
  }
}

// =====================================================================
// POST /api/user/website/domain/connect
// =====================================================================

export async function connectDomain(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: "domain is required" });
    }

    const { data, error } = await customDomainService.connectDomain(projectId, domain);
    if (error) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Connect domain");
  }
}

// =====================================================================
// POST /api/user/website/domain/verify
// =====================================================================

export async function verifyDomain(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { data, error } = await customDomainService.verifyDomain(projectId);
    if (error) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Verify domain");
  }
}

// =====================================================================
// DELETE /api/user/website/domain/disconnect
// =====================================================================

export async function disconnectDomain(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { data, error } = await customDomainService.disconnectDomain(projectId);
    if (error) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Disconnect domain");
  }
}

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

    const [recipients, orgUsers] = await Promise.all([
      getConfiguredRecipients({
        organizationId: orgId,
        channel: "website_form",
        legacyProjectRecipients: project.recipients,
      }),
      listOrgUserRecipientOptions(orgId),
    ]);

    return res.json({
      success: true,
      data: {
        recipients,
        orgUsers,
      },
    });
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

    const recipients = await updateRecipientSetting(
      orgId,
      "website_form",
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

    const data = await formDetection.listFormCatalog(project.id);
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

    const data = await upsertFormRecipientRule({
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

    const data = await upsertFormCatalogPreferences({
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

    const [allCount, unreadCount, flaggedCount, verifiedCount] = await Promise.all([
      FormSubmissionModel.countByProjectId(project.id, {
        form_name_not: "Newsletter Signup",
      }),
      FormSubmissionModel.countUnreadByProjectId(project.id),
      FormSubmissionModel.countFlaggedByProjectId(project.id),
      FormSubmissionModel.countVerifiedByProjectId(project.id),
    ]);

    return res.json({
      success: true,
      allCount,
      unreadCount,
      flaggedCount,
      verifiedCount,
      // Blocked attempts are not persisted today; keep the response
      // backward-compatible for the dashboard without implying telemetry exists.
      blockedCount: 0,
    });
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

    const emptyTotals = {
      sessions: 0,
      pageviews: 0,
      users: 0,
      bounceRate: 0,
      pagesPerSession: 0,
      sessionDuration: 0,
    };

    const integration = await WebsiteIntegrationModel.findByProjectAndPlatform(
      project.id,
      "rybbit"
    );
    if (!integration) {
      return res.json({
        success: true,
        hasIntegration: false,
        latestReportDate: null,
        dataDays: 0,
        totals: emptyTotals,
        daily: [],
        monthly: [],
      });
    }

    // Stored daily series powers the daily traffic modal + is a safe fallback.
    const dashboard = await getRybbitDashboard(
      integration,
      req.query.rangeDays,
      0,
      0
    );

    // TRUE unique visitors come from live Rybbit queries (deduped per period) —
    // summing the stored daily `users` over-counts repeat visitors by ~10%.
    // Sessions/pageviews are additive, so the stored daily series stays correct.
    // Both live calls fall back to stored values on any failure (see helpers).
    let monthly: RybbitMonthlyPoint[] = [];
    let liveTotals: RybbitMetricSummary | null = null;
    if (dashboard.fromDate && dashboard.latestReportDate) {
      const timeZone = resolveRybbitTimeZone(
        await ProjectModel.getRybbitTimeZone(integration.project_id),
      );
      const [monthlyResult, totalsResult] = await Promise.all([
        fetchRybbitMonthlyUniques(
          integration,
          dashboard.fromDate,
          dashboard.latestReportDate,
          timeZone
        ),
        fetchRybbitOverview(
          integration,
          dashboard.fromDate,
          dashboard.latestReportDate,
          timeZone
        ),
      ]);
      monthly = monthlyResult ?? [];
      liveTotals = totalsResult;
    }

    return res.json({
      success: true,
      hasIntegration: true,
      latestReportDate: dashboard.latestReportDate,
      dataDays: dashboard.dataDays,
      totals: liveTotals ?? dashboard.totals,
      daily: dashboard.daily,
      monthly,
    });
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
    const monthCount =
      rangeParam === "3m" ? 3 : rangeParam === "6m" ? 6 : 12;

    // Compute the start of the range: first day of (current month - (monthCount - 1))
    const now = new Date();
    const rangeStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthCount - 1), 1)
    );

    // Aggregate by month with per-status counts (Postgres syntax).
    // Project-scoped because submissions live under website_builder.form_submissions
    // keyed by project_id; the project itself is scoped to the org via ProjectModel.findByOrganizationId.
    const rows = await db("website_builder.form_submissions")
      .select(
        db.raw(
          "to_char(date_trunc('month', submitted_at), 'YYYY-MM') AS month"
        ),
        db.raw(
          `COUNT(*) FILTER (WHERE form_name <> 'Newsletter Signup')::int AS total`
        ),
        db.raw(
          `COUNT(*) FILTER (WHERE is_flagged = false AND form_name <> 'Newsletter Signup')::int AS verified`
        ),
        db.raw(`COUNT(*) FILTER (WHERE is_read = false)::int AS unread`),
        db.raw(`COUNT(*) FILTER (WHERE is_flagged = true)::int AS flagged`),
        // Blocked attempts are currently rejected before persistence.
        db.raw(`0::int AS blocked`)
      )
      .where("project_id", project.id)
      .andWhere("submitted_at", ">=", rangeStart.toISOString())
      .groupBy(db.raw("date_trunc('month', submitted_at)"))
      .orderBy("month", "asc");

    // Build a map of month → counts from query results
    const byMonth = new Map<
      string,
      {
        month: string;
        total: number;
        verified: number;
        unread: number;
        flagged: number;
        blocked: number;
      }
    >();
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
    const data: Array<{
      month: string;
      total: number;
      verified: number;
      unread: number;
      flagged: number;
      blocked: number;
    }> = [];
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
    const updated = await FormSubmissionModel.markAllAsReadByProjectId(
      project.id,
      formName || undefined,
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
      project.id,
      { offset: (page - 1) * limit, limit },
      filters,
    );

    const baseCountFilters = formName ? { form_name: formName } : {};
    const [allCount, unreadCount, flaggedCount, verifiedCount, optinsCount] = await Promise.all([
      FormSubmissionModel.countByProjectId(project.id, baseCountFilters),
      FormSubmissionModel.countByProjectId(project.id, {
        ...baseCountFilters,
        is_read: false,
      }),
      FormSubmissionModel.countByProjectId(project.id, {
        ...baseCountFilters,
        is_flagged: true,
      }),
      FormSubmissionModel.countByProjectId(project.id, {
        ...baseCountFilters,
        is_flagged: false,
        ...(formName ? {} : { form_name_not: "Newsletter Signup" }),
      }),
      formName
        ? formName === "Newsletter Signup"
          ? FormSubmissionModel.countByProjectId(project.id, baseCountFilters)
          : Promise.resolve(0)
        : FormSubmissionModel.countOptinsByProjectId(project.id),
    ]);

    const totalPages = Math.ceil(result.total / limit);

    return res.json({ success: true, data: result.data, pagination: { page, limit, total: result.total, totalPages }, allCount, unreadCount, flaggedCount, verifiedCount, optinsCount });
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
    const submission = await FormSubmissionModel.findById(id);

    if (!submission || submission.project_id !== project.id) {
      return res.status(404).json({ error: "Submission not found" });
    }

    return res.json({ success: true, data: submission });
  } catch (error) {
    return handleError(res, error, "Fetch form submission");
  }
}

// =====================================================================
// VERSION HISTORY
// =====================================================================

/** GET /api/user/website/pages/:pageId/versions */
export async function getPageVersions(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId)
      return res.status(400).json({ error: "No organization found" });

    const { pageId } = req.params;
    const result = await userWebsiteService.listPageVersions(orgId, pageId);

    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Fetch page versions");
  }
}

/** GET /api/user/website/pages/:pageId/versions/:versionId */
export async function getPageVersionContent(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId)
      return res.status(400).json({ error: "No organization found" });

    const { pageId, versionId } = req.params;
    const version = await userWebsiteService.getPageVersionContent(
      orgId,
      pageId,
      versionId
    );

    return res.json({ success: true, data: version });
  } catch (error) {
    return handleError(res, error, "Fetch page version content");
  }
}

/** POST /api/user/website/pages/:pageId/versions/:versionId/restore */
export async function restorePageVersion(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId)
      return res.status(400).json({ error: "No organization found" });

    const { pageId, versionId } = req.params;
    const result = await userWebsiteService.restorePageVersion(
      orgId,
      pageId,
      versionId
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Restore page version");
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
    const submission = await FormSubmissionModel.findById(id);
    if (!submission || submission.project_id !== project.id) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const { is_read } = req.body;
    if (is_read) {
      await FormSubmissionModel.markAsRead(id);
    } else {
      await FormSubmissionModel.markAsUnread(id);
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
    const submission = await FormSubmissionModel.findById(id);
    if (!submission || submission.project_id !== project.id) {
      return res.status(404).json({ error: "Submission not found" });
    }

    await FormSubmissionModel.deleteById(id);

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

    const result = await FormSubmissionModel.findByProjectId(
      project.id,
      { offset: 0, limit: 10000 },
    );

    const submissions = result.data;

    // Collect all unique field keys across all submissions
    const allKeys = new Set<string>();
    for (const sub of submissions) {
      if (sub.contents && typeof sub.contents === "object") {
        for (const key of Object.keys(sub.contents)) {
          allKeys.add(key);
        }
      }
    }
    const fieldKeys = Array.from(allKeys).sort();

    // Build CSV
    const escCsv = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const headers = ["Date", "Form Name", ...fieldKeys, "Read"];
    const rows = submissions.map((sub) => {
      const date = new Date(sub.submitted_at).toISOString();
      const formName = sub.form_name || "";
      const fields = fieldKeys.map((k) => (sub.contents as Record<string, string>)?.[k] || "");
      const isRead = sub.is_read ? "Yes" : "No";
      return [date, formName, ...fields, isRead].map(escCsv).join(",");
    });

    const csv = [headers.map(escCsv).join(","), ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=form-submissions.csv");
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: "Failed to export submissions" });
  }
}

// =====================================================================
// PATCH /api/user/website/pages/:pageId/save — Save page sections
// =====================================================================

export async function savePageSections(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const { pageId } = req.params;
    const { sections, expected_updated_at, force } = req.body;
    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ error: "sections array is required" });
    }

    // Verify page belongs to project
    const page = await db("website_builder.pages")
      .where({ id: pageId, project_id: projectId })
      .first();
    if (!page) return res.status(404).json({ error: "Page not found" });

    // Customer saves write the LIVE published row in place — never history
    // rows or drafts (an inactive id here would rewrite version history).
    if (page.status !== "published") {
      return res.status(400).json({
        error: "INVALID_STATUS",
        message: "Only the live page can be edited here.",
      });
    }

    // Read-only orgs can browse but not write (same gate as restore).
    const project = await db("website_builder.projects")
      .where("id", projectId)
      .first();
    if (project?.is_read_only) {
      return res.status(403).json({
        error: "READ_ONLY",
        message:
          "Your website is in read-only mode. Please upgrade to continue editing.",
      });
    }

    // Optimistic concurrency fast-path: reject when the row changed since
    // the client loaded it, unless the client explicitly forces.
    if (
      expected_updated_at &&
      !force &&
      new Date(page.updated_at).getTime() !==
        new Date(expected_updated_at).getTime()
    ) {
      return res.status(409).json({
        error: "STALE_WRITE",
        message:
          "This page changed since you loaded it. Review the latest version or save anyway.",
      });
    }

    // Preserve the page's pre-save state as a restorable history entry
    // before overwriting it (user-side saves write the live page in place).
    await snapshotPageStateIfChanged(page);

    // Keep the live page as the newest version. The snapshot above takes
    // max+1, so without this the live row would carry a LOWER version than
    // its own archived history and sink beneath it in the History tab (the
    // "latest version is Archived" bug).
    const newest = await db("website_builder.pages")
      .where({ project_id: page.project_id, path: page.path })
      .orderBy("version", "desc")
      .first();
    const nextVersion = (newest?.version ?? page.version) + 1;

    // Update the page sections directly. The write is conditional on the
    // expected timestamp (1ms range — updated_at has microsecond precision,
    // the client echo is millisecond-truncated) so two racing writers can't
    // both pass the JS check above and both land.
    let updateQuery = db("website_builder.pages").where("id", pageId);
    if (expected_updated_at && !force) {
      const expected = new Date(expected_updated_at);
      updateQuery = updateQuery
        .where("updated_at", ">=", expected)
        .where("updated_at", "<", new Date(expected.getTime() + 1));
    }
    const [updatedPage] = await updateQuery
      .update({
        sections: JSON.stringify(sections),
        version: nextVersion,
        change_source: "save",
        updated_at: db.fn.now(),
      })
      .returning(["updated_at"]);

    if (!updatedPage) {
      return res.status(409).json({
        error: "STALE_WRITE",
        message:
          "This page changed since you loaded it. Review the latest version or save anyway.",
      });
    }

    return res.json({
      success: true,
      data: { updated_at: updatedPage.updated_at },
    });
  } catch (error) {
    return handleError(res, error, "Save page sections");
  }
}

// =====================================================================
// RESOLVE PREVIEW (shortcodes → HTML)
// =====================================================================

/** POST /api/user/website/resolve-preview */
export async function resolvePreview(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const { html } = req.body;
    if (!html || typeof html !== "string") {
      return res.status(400).json({ error: "html string is required" });
    }

    const resolved = await resolveShortcodes(html, ids.projectId, ids.templateId);
    return res.json({ html: resolved });
  } catch (error) {
    return handleError(res, error, "Resolve preview");
  }
}

// =====================================================================
// POSTS
// =====================================================================

/** Helper: resolve projectId + templateId from orgId */
async function getProjectAndTemplate(orgId: number) {
  const project = await ProjectModel.findByOrganizationId(orgId);
  if (!project) return null;
  return { projectId: project.id, templateId: project.template_id };
}

/** GET /api/user/website/posts */
export async function listPosts(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const { post_type_id, status } = req.query as Record<string, string>;
    const result = await postManager.listPosts(ids.projectId, { post_type_id, status });
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.posts });
  } catch (error) {
    return handleError(res, error, "List posts");
  }
}

/** POST /api/user/website/posts */
export async function createUserPost(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const result = await postManager.createPost(ids.projectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.post });
  } catch (error) {
    return handleError(res, error, "Create post");
  }
}

/** GET /api/user/website/posts/:postId */
export async function getPost(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const post = await postManager.getPost(ids.projectId, req.params.postId);
    if (!post) return res.status(404).json({ error: "Post not found" });
    return res.json({ success: true, data: post });
  } catch (error) {
    return handleError(res, error, "Get post");
  }
}

/** PATCH /api/user/website/posts/:postId */
export async function updateUserPost(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const result = await postManager.updatePost(ids.projectId, req.params.postId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.post });
  } catch (error) {
    return handleError(res, error, "Update post");
  }
}

/** DELETE /api/user/website/posts/:postId */
export async function deleteUserPost(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const result = await postManager.deletePost(ids.projectId, req.params.postId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error, "Delete post");
  }
}

/** GET /api/user/website/post-types */
export async function listPostTypes(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids || !ids.templateId) return res.status(404).json({ error: "No website or template found" });

    const result = await postTypeManager.listPostTypes(ids.templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postTypes });
  } catch (error) {
    return handleError(res, error, "List post types");
  }
}

/** GET /api/user/website/post-types/:postTypeId/categories */
export async function listCategories(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const categories = await db("website_builder.post_categories")
      .where("post_type_id", req.params.postTypeId)
      .orderBy("sort_order", "asc");
    return res.json({ success: true, data: categories });
  } catch (error) {
    return handleError(res, error, "List categories");
  }
}

/** POST /api/user/website/post-types/:postTypeId/categories */
export async function createUserCategory(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const { name, slug, parent_id } = req.body;
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const [category] = await db("website_builder.post_categories")
      .insert({ post_type_id: req.params.postTypeId, name, slug: finalSlug, parent_id: parent_id || null })
      .returning("*");
    return res.status(201).json({ success: true, data: category });
  } catch (error) {
    return handleError(res, error, "Create category");
  }
}

/** GET /api/user/website/post-types/:postTypeId/tags */
export async function listTags(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const tags = await db("website_builder.post_tags")
      .where("post_type_id", req.params.postTypeId)
      .orderBy("name", "asc");
    return res.json({ success: true, data: tags });
  } catch (error) {
    return handleError(res, error, "List tags");
  }
}

/** POST /api/user/website/post-types/:postTypeId/tags */
export async function createUserTag(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const { name, slug } = req.body;
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const [tag] = await db("website_builder.post_tags")
      .insert({ post_type_id: req.params.postTypeId, name, slug: finalSlug })
      .returning("*");
    return res.status(201).json({ success: true, data: tag });
  } catch (error) {
    return handleError(res, error, "Create tag");
  }
}

/** PATCH /api/user/website/posts/:postId/seo */
export async function updateUserPostSeo(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const post = await postManager.getPost(ids.projectId, req.params.postId);
    if (!post) return res.status(404).json({ error: "Post not found" });

    await db("website_builder.posts").where("id", req.params.postId).update({
      seo_data: JSON.stringify(req.body),
      updated_at: db.fn.now(),
    });
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error, "Update post SEO");
  }
}

// =====================================================================
// MENUS
// =====================================================================

/** GET /api/user/website/menus */
export async function listUserMenus(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.listMenus(projectId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menus });
  } catch (error) {
    return handleError(res, error, "List menus");
  }
}

/** POST /api/user/website/menus */
export async function createUserMenu(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.createMenu(projectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.menu });
  } catch (error) {
    return handleError(res, error, "Create menu");
  }
}

/** GET /api/user/website/menus/:menuId */
export async function getUserMenu(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.getMenu(projectId, req.params.menuId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menu });
  } catch (error) {
    return handleError(res, error, "Get menu");
  }
}

/** PATCH /api/user/website/menus/:menuId */
export async function updateUserMenu(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.updateMenu(projectId, req.params.menuId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menu });
  } catch (error) {
    return handleError(res, error, "Update menu");
  }
}

/** DELETE /api/user/website/menus/:menuId */
export async function deleteUserMenu(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.deleteMenu(projectId, req.params.menuId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error, "Delete menu");
  }
}

/** POST /api/user/website/menus/:menuId/items */
export async function createUserMenuItem(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.createMenuItem(projectId, req.params.menuId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.item });
  } catch (error) {
    return handleError(res, error, "Create menu item");
  }
}

/** PATCH /api/user/website/menus/:menuId/items/:itemId */
export async function updateUserMenuItem(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.updateMenuItem(projectId, req.params.menuId, req.params.itemId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.item });
  } catch (error) {
    return handleError(res, error, "Update menu item");
  }
}

/** DELETE /api/user/website/menus/:menuId/items/:itemId */
export async function deleteUserMenuItem(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.deleteMenuItem(projectId, req.params.menuId, req.params.itemId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error, "Delete menu item");
  }
}

/** PATCH /api/user/website/menus/:menuId/items/reorder */
export async function reorderUserMenuItems(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.reorderItems(projectId, req.params.menuId, req.body.items || []);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error, "Reorder menu items");
  }
}
