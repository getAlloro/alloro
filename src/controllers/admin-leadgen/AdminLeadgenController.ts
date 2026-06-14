/**
 * Admin Leadgen Controller
 *
 * Four read-only handlers for the admin /leadgen-submissions UI. All are
 * mounted behind `authenticateToken` + `superAdminMiddleware` at the route
 * layer — this controller does no auth of its own.
 *
 *   GET /admin/leadgen-submissions          — paginated list (filters + join)
 *   GET /admin/leadgen-submissions/funnel   — stage counts + drop-off %
 *   GET /admin/leadgen-submissions/export   — streaming CSV (filter-respecting)
 *   GET /admin/leadgen-submissions/:id      — session + events + joined audit
 *
 * Note: `/funnel` and `/export` are literal segments and MUST be registered
 * BEFORE `/:id` at the route layer to avoid getting matched as the :id param.
 */

import { Request, Response } from "express";
import { Knex } from "knex";
import { db } from "../../database/connection";
import {
  FinalStage,
  ILeadgenSession,
} from "../../models/LeadgenSessionModel";
import { ILeadgenEvent } from "../../models/LeadgenEventModel";
import { IAuditProcess } from "../../models/AuditProcessModel";
import { aggregateFunnel } from "./feature-services/service.funnel-aggregator";
import {
  escapeCsvField,
  writeCsvRow,
} from "./feature-services/service.csv-exporter";
import { AuthRequest } from "../../middleware/auth";
import { retryAuditById } from "../audit/audit-services/service.audit-retry";
import logger from "../../lib/logger";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ListFilters {
  search?: string;
  status?: "all" | "completed" | "abandoned" | "in_progress";
  from?: string;
  to?: string;
  hasEmail?: boolean;
}

function parseListFilters(query: Request["query"]): ListFilters {
  const status = query.status as string | undefined;
  const allowedStatus: ListFilters["status"][] = [
    "all",
    "completed",
    "abandoned",
    "in_progress",
  ];
  return {
    search:
      typeof query.search === "string" && query.search.length > 0
        ? query.search
        : undefined,
    status:
      status && (allowedStatus as string[]).includes(status)
        ? (status as ListFilters["status"])
        : "all",
    from: typeof query.from === "string" ? query.from : undefined,
    to: typeof query.to === "string" ? query.to : undefined,
    hasEmail: query.hasEmail === "true",
  };
}

/**
 * Applies the shared filter set to a knex query builder against
 * `leadgen_sessions`. Used by both the list endpoint and the export stream
 * so filters stay in lockstep.
 */
function applyListFilters(
  qb: Knex.QueryBuilder,
  filters: ListFilters
): Knex.QueryBuilder {
  if (filters.search) {
    const needle = `%${filters.search}%`;
    qb = qb.where((inner) => {
      inner
        .whereILike("leadgen_sessions.email", needle)
        .orWhereILike("leadgen_sessions.domain", needle);
    });
  }

  switch (filters.status) {
    case "completed":
      qb = qb.where("leadgen_sessions.completed", true);
      break;
    case "abandoned":
      qb = qb.where("leadgen_sessions.abandoned", true);
      break;
    case "in_progress":
      qb = qb
        .where("leadgen_sessions.completed", false)
        .andWhere("leadgen_sessions.abandoned", false);
      break;
    // "all" or default — no filter
  }

  if (filters.from) {
    qb = qb.where("leadgen_sessions.created_at", ">=", filters.from);
  }
  if (filters.to) {
    qb = qb.where("leadgen_sessions.created_at", "<=", filters.to);
  }
  if (filters.hasEmail) {
    qb = qb.whereNotNull("leadgen_sessions.email");
  }

  return qb;
}

// ---------------------------------------------------------------------------
// GET /admin/leadgen-submissions — paginated list
// ---------------------------------------------------------------------------

interface SubmissionSummary {
  id: string;
  email: string | null;
  domain: string | null;
  practice_search_string: string | null;
  audit_id: string | null;
  audit_status: string | null;
  user_agent: string | null;
  final_stage: FinalStage;
  completed: boolean;
  abandoned: boolean;
  first_seen_at: Date;
  last_seen_at: Date;
}

export async function listSubmissions(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const pageRaw = parseInt(String(req.query.page ?? "1"), 10);
    const pageSizeRaw = parseInt(String(req.query.pageSize ?? "25"), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = Math.min(
      Math.max(Number.isFinite(pageSizeRaw) ? pageSizeRaw : 25, 1),
      100
    );

    const filters = parseListFilters(req.query);

    const countQuery = applyListFilters(
      db("leadgen_sessions"),
      filters
    )
      .count<{ count: string }[]>({ count: "* " })
      .first();
    const totalRow = await countQuery;
    const total = parseInt((totalRow?.count as string) ?? "0", 10) || 0;

    // Account-linked reconciliation join.
    //   - users: exact case-insensitive email match against the session's email
    //   - organizations: exact domain match against a normalised version of
    //     audit_processes.domain (strip protocol/www/trailing slash; lower-case)
    //     EXCLUDING well-known platform domains that would collapse unrelated
    //     practices onto the same org (facebook.com, wixsite.com, etc.)
    //
    // The derived `linked_via` column is what the admin UI reads to decide
    // whether to render the row as "Account Linked" (and which badge to show).
    //   'persisted' — session already has user_id set (real conversion happened
    //                 at OTP verify time)
    //   'email'    — a users row matches this session's email
    //   'domain'   — an organizations row matches the audit's normalised domain
    //   null       — not linked
    // Embedded directly in the SQL below rather than passed as bindings —
    // knex would otherwise treat the `?` characters in the regex patterns
    // (https?, (www\.)?) as binding placeholders and mis-count them.
    // These values are constants, not user input — no injection risk.
    //
    // Keep in sync with the NOT IN list inside the joinRaw block:
    //   facebook.com / instagram.com / wixsite.com / squarespace.com /
    //   weebly.com / wordpress.com / godaddysites.com / sites.google.com

    const rowsQuery = applyListFilters(
      db("leadgen_sessions")
        .leftJoin(
          "audit_processes",
          "leadgen_sessions.audit_id",
          "audit_processes.id"
        )
        // Raw JOIN clauses — knex's JoinClause.on() types want plain strings;
        // raw-SQL comparisons go through joinRaw instead. Same semantic:
        //   users: case-insensitive email match
        //   organizations: normalised-domain exact match, excluding
        //     well-known platform domains that would collapse unrelated
        //     practices.
        //
        // Normalisation uses three non-`?` regex_replace calls:
        //   1. strip leading http:// or https://   (alternation, not https?)
        //   2. strip leading www.
        //   3. strip trailing slashes (/+$)
        // This avoids `?` characters that knex would otherwise interpret
        // as binding placeholders.
        .joinRaw(
          "LEFT JOIN users AS u ON LOWER(u.email) = LOWER(leadgen_sessions.email)"
        )
        .joinRaw(
          `LEFT JOIN organizations AS org_by_domain ON
             LOWER(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(COALESCE(audit_processes.domain, ''), '^(http|https)://', ''),
                   '^www\\.', ''
                 ),
                 '/+$', ''
               )
             )
             = LOWER(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(COALESCE(org_by_domain.domain, ''), '^(http|https)://', ''),
                   '^www\\.', ''
                 ),
                 '/+$', ''
               )
             )
             AND COALESCE(audit_processes.domain, '') <> ''
             AND LOWER(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(COALESCE(audit_processes.domain, ''), '^(http|https)://', ''),
                   '^www\\.', ''
                 ),
                 '/+$', ''
               )
             ) NOT IN (
               'facebook.com', 'instagram.com', 'wixsite.com',
               'squarespace.com', 'weebly.com', 'wordpress.com',
               'godaddysites.com', 'sites.google.com'
             )`
        )
        .select(
          "leadgen_sessions.id as id",
          "leadgen_sessions.email as email",
          "leadgen_sessions.domain as domain",
          "leadgen_sessions.practice_search_string as practice_search_string",
          "leadgen_sessions.audit_id as audit_id",
          "audit_processes.status as audit_status",
          "leadgen_sessions.user_agent as user_agent",
          "leadgen_sessions.final_stage as final_stage",
          "leadgen_sessions.completed as completed",
          "leadgen_sessions.abandoned as abandoned",
          "leadgen_sessions.first_seen_at as first_seen_at",
          "leadgen_sessions.last_seen_at as last_seen_at",
          db.raw(`
            CASE
              WHEN leadgen_sessions.user_id IS NOT NULL THEN 'persisted'
              WHEN u.id IS NOT NULL THEN 'email'
              WHEN org_by_domain.id IS NOT NULL THEN 'domain'
              ELSE NULL
            END AS linked_via
          `)
        ),
      filters
    )
      .orderBy("leadgen_sessions.created_at", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items = (await rowsQuery) as SubmissionSummary[];

    return res.json({ items, total, page, pageSize });
  } catch (error) {
    logger.error({ err: error }, "[AdminLeadgen] listSubmissions error:");
    return res
      .status(500)
      .json({ error: "internal_error", message: "Failed to list submissions" });
  }
}

// ---------------------------------------------------------------------------
// GET /admin/leadgen-submissions/funnel — stage counts + drop-off
// ---------------------------------------------------------------------------

export async function getFunnel(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const stages = await aggregateFunnel({ from, to });
    return res.json({ stages });
  } catch (error) {
    logger.error({ err: error }, "[AdminLeadgen] getFunnel error:");
    return res
      .status(500)
      .json({ error: "internal_error", message: "Failed to compute funnel" });
  }
}

// ---------------------------------------------------------------------------
// GET /admin/leadgen-submissions/stats — headline conversion metrics
// ---------------------------------------------------------------------------

/**
 * Returns four headline metrics for the admin stats strip:
 *   - total_sessions        (count of leadgen_sessions in window)
 *   - total_conversions     (count with non-null converted_at)
 *   - conversion_rate_pct   (conversions / sessions * 100, null when sessions=0)
 *   - median_time_to_convert_ms (median of converted_at - first_seen_at in ms)
 *
 * Uses the same from/to date params as `listSubmissions` and `getFunnel` so
 * the strip respects whatever date filter is active on the admin page.
 */
export async function getStats(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;

    // Single round-trip SQL: aggregate everything in one query. Median uses
    // percentile_cont(0.5) over the epoch-millisecond delta for converted
    // sessions (NULL rows are excluded by the WITHIN GROUP, so the median
    // naturally scopes to converted sessions only).
    // Cast the bindings to timestamptz BOTH in the IS NULL test and the
    // range comparison so the pg driver can infer the type when the
    // binding itself is NULL. The previous shape `(? IS NULL OR ...)` with
    // an untyped NULL produced `could not determine data type of
    // parameter $1` on every call from the admin UI.
    const rowRaw = await db.raw(
      `
      SELECT
        COUNT(*)::int AS total_sessions,
        COUNT(converted_at)::int AS total_conversions,
        CASE
          WHEN COUNT(*) = 0 THEN NULL
          ELSE ROUND((COUNT(converted_at)::numeric / COUNT(*)::numeric) * 100, 2)
        END AS conversion_rate_pct,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (converted_at - first_seen_at)) * 1000
        ) AS median_time_to_convert_ms
      FROM leadgen_sessions
      WHERE (?::timestamptz IS NULL OR first_seen_at >= ?::timestamptz)
        AND (?::timestamptz IS NULL OR first_seen_at <= ?::timestamptz)
      `,
      [from ?? null, from ?? null, to ?? null, to ?? null]
    );

    const row = (rowRaw as { rows: Array<Record<string, unknown>> }).rows[0] ?? {};

    const totalSessions = Number(row.total_sessions ?? 0);
    const totalConversions = Number(row.total_conversions ?? 0);
    const conversionRateRaw = row.conversion_rate_pct;
    const medianRaw = row.median_time_to_convert_ms;

    return res.json({
      total_sessions: totalSessions,
      total_conversions: totalConversions,
      conversion_rate_pct:
        conversionRateRaw === null || conversionRateRaw === undefined
          ? null
          : Number(conversionRateRaw),
      median_time_to_convert_ms:
        medianRaw === null || medianRaw === undefined
          ? null
          : Number(medianRaw),
    });
  } catch (error) {
    logger.error({ err: error }, "[AdminLeadgen] getStats error:");
    return res
      .status(500)
      .json({ error: "internal_error", message: "Failed to compute stats" });
  }
}

// ---------------------------------------------------------------------------
// GET /admin/leadgen-submissions/export — streaming CSV
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  "session_id",
  "email",
  "domain",
  "practice_search_string",
  "audit_id",
  "audit_status",
  "final_stage",
  "completed",
  "abandoned",
  "first_seen_at",
  "last_seen_at",
];

export async function exportSubmissionsCsv(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const filters = parseListFilters(req.query);

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="leadgen-submissions-${today}.csv"`
    );

    // Header row.
    res.write(CSV_COLUMNS.map(escapeCsvField).join(",") + "\n");

    // Paginate in chunks of 1000 to keep memory bounded. We avoid knex
    // .stream() here because it needs explicit pool management and the
    // chunked approach plays nicer with Express + our connection pool.
    const CHUNK = 1000;
    let offset = 0;

    while (true) {
      const rows = await applyListFilters(
        db("leadgen_sessions")
          .leftJoin(
            "audit_processes",
            "leadgen_sessions.audit_id",
            "audit_processes.id"
          )
          .select(
            "leadgen_sessions.id as session_id",
            "leadgen_sessions.email as email",
            "leadgen_sessions.domain as domain",
            "leadgen_sessions.practice_search_string as practice_search_string",
            "leadgen_sessions.audit_id as audit_id",
            "audit_processes.status as audit_status",
            "leadgen_sessions.final_stage as final_stage",
            "leadgen_sessions.completed as completed",
            "leadgen_sessions.abandoned as abandoned",
            "leadgen_sessions.first_seen_at as first_seen_at",
            "leadgen_sessions.last_seen_at as last_seen_at"
          ),
        filters
      )
        .orderBy("leadgen_sessions.created_at", "desc")
        .limit(CHUNK)
        .offset(offset);

      if (rows.length === 0) break;

      for (const row of rows as Array<Record<string, unknown>>) {
        writeCsvRow(
          res,
          CSV_COLUMNS.map((col) => row[col])
        );
      }

      if (rows.length < CHUNK) break;
      offset += CHUNK;
    }

    res.end();
  } catch (error) {
    logger.error({ err: error }, "[AdminLeadgen] exportSubmissionsCsv error:");
    // If we've already started streaming, we can't change status — just
    // end the response. Otherwise return 500.
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "internal_error", message: "Failed to export CSV" });
      return;
    }
    res.end();
  }
}

// ---------------------------------------------------------------------------
// GET /admin/leadgen-submissions/:id — full detail
// ---------------------------------------------------------------------------

export async function getSubmissionDetail(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;

    const session = (await db("leadgen_sessions")
      .where({ id })
      .first()) as ILeadgenSession | undefined;

    if (!session) {
      return res
        .status(404)
        .json({ error: "not_found", message: "Session not found" });
    }

    const events = (await db("leadgen_events")
      .where({ session_id: id })
      .orderBy("created_at", "asc")) as ILeadgenEvent[];

    let audit: IAuditProcess | null = null;
    if (session.audit_id) {
      const auditRow = await db("audit_processes")
        .where({ id: session.audit_id })
        .first();
      audit = (auditRow as IAuditProcess | undefined) ?? null;
    }

    return res.json({ session, events, audit });
  } catch (error) {
    logger.error({ err: error }, "[AdminLeadgen] getSubmissionDetail error:");
    return res
      .status(500)
      .json({ error: "internal_error", message: "Failed to fetch submission" });
  }
}

// ---------------------------------------------------------------------------
// DELETE /admin/leadgen-submissions/:id — destroy a session + cascade events
// ---------------------------------------------------------------------------

/**
 * Hard-deletes a leadgen session row. FK cascade on `leadgen_events.session_id`
 * drops all associated events; the `audit_processes.audit_id` FK is
 * `ON DELETE SET NULL` so the audit process row survives with a null back-ref.
 *
 * Admin-only; auth + super-admin middleware enforced at the route layer.
 */
export async function deleteSubmission(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !UUID_REGEX.test(id)) {
      return res
        .status(400)
        .json({ error: "invalid_id", message: "Invalid session id" });
    }

    const deleted = await db("leadgen_sessions").where({ id }).del();

    if (deleted === 0) {
      return res
        .status(404)
        .json({ error: "not_found", message: "Session not found" });
    }

    logger.info({ detail: {
            session_id: id,
            admin_user_id: req.user?.userId ?? null,
            admin_email: req.user?.email ?? null,
          } }, "[AdminLeadgen] deleteSubmission");

    return res.json({ deleted: true, id });
  } catch (error) {
    logger.error({ err: error }, "[AdminLeadgen] deleteSubmission error:");
    return res
      .status(500)
      .json({ error: "internal_error", message: "Failed to delete submission" });
  }
}

// ---------------------------------------------------------------------------
// DELETE /admin/leadgen-submissions/bulk — cascade-delete many sessions at once
// ---------------------------------------------------------------------------

const MAX_BULK_DELETE = 500;

/**
 * Bulk-delete leadgen sessions by id.
 *
 * Body: { ids: string[] } — every id UUID-validated; invalid ids rejected
 * without partial execution. Cascade on `leadgen_events` /
 * `leadgen_email_notifications` FK handles the downstream cleanup.
 *
 * Capped at MAX_BULK_DELETE per call so a typo in admin UI can't nuke
 * the whole table in one go.
 */
export async function bulkDeleteSubmissions(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const ids = req.body?.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: "invalid_ids", message: "ids must be a non-empty array" });
    }

    if (ids.length > MAX_BULK_DELETE) {
      return res.status(400).json({
        error: "too_many",
        message: `Cannot delete more than ${MAX_BULK_DELETE} at once`,
      });
    }

    const allValid = ids.every(
      (id) => typeof id === "string" && UUID_REGEX.test(id)
    );
    if (!allValid) {
      return res.status(400).json({
        error: "invalid_ids",
        message: "Every id must be a valid UUID",
      });
    }

    const deleted = await db("leadgen_sessions").whereIn("id", ids).del();

    logger.info({ detail: {
            requested: ids.length,
            deleted,
            admin_user_id: req.user?.userId ?? null,
            admin_email: req.user?.email ?? null,
          } }, "[AdminLeadgen] bulkDeleteSubmissions");

    return res.json({ deleted });
  } catch (error) {
    logger.error({ err: error }, "[AdminLeadgen] bulkDeleteSubmissions error:");
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to bulk delete",
    });
  }
}

// ---------------------------------------------------------------------------
// POST /admin/leadgen-submissions/:id/rerun — re-enqueue a failed audit
// ---------------------------------------------------------------------------

/**
 * Admin override for a failed leadgen audit. Resets the underlying
 * `audit_processes` row to `pending` and re-enqueues the BullMQ job —
 * reusing the SAME audit_id so session → audit continuity is preserved.
 *
 * Bypasses the 3-retry cap that the public `/audit/:auditId/retry`
 * endpoint enforces, and does NOT increment `retry_count` (admin retries
 * are out-of-band manual overrides, not part of the user's automatic
 * budget).
 *
 * Admin-only; auth + super-admin middleware enforced at the route layer.
 */
export async function rerunAuditFromAdmin(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !UUID_REGEX.test(id)) {
      return res
        .status(400)
        .json({ error: "invalid_id", message: "Invalid session id" });
    }

    const session = (await db("leadgen_sessions")
      .select("id", "audit_id")
      .where({ id })
      .first()) as Pick<ILeadgenSession, "id" | "audit_id"> | undefined;

    if (!session) {
      return res
        .status(404)
        .json({ error: "not_found", message: "Session not found" });
    }
    if (!session.audit_id) {
      return res.status(409).json({
        error: "no_audit",
        message: "Session has no associated audit to rerun",
      });
    }

    const result = await retryAuditById(session.audit_id, {
      skipLimit: true,
      countsTowardLimit: false,
    });

    logger.info({ detail: {
            session_id: session.id,
            audit_id: session.audit_id,
            result_ok: result.ok,
            admin_user_id: req.user?.userId ?? null,
            admin_email: req.user?.email ?? null,
          } }, "[AdminLeadgen] rerunAuditFromAdmin");

    if (result.ok) {
      return res.json({
        ok: true,
        audit_id: result.auditId,
        retry_count: result.retryCount,
      });
    }
    if (result.reason === "not_found") {
      return res
        .status(404)
        .json({ error: "not_found", message: "Audit row missing" });
    }
    if (result.reason === "not_failed") {
      return res.status(409).json({
        error: "not_failed",
        status: result.currentStatus,
        message: "Audit is not in a failed state",
      });
    }
    // limit_exceeded is unreachable when skipLimit=true; surface defensively.
    return res.status(500).json({
      error: "internal_error",
      message: "Unexpected retry state",
    });
  } catch (error) {
    logger.error({ err: error }, "[AdminLeadgen] rerunAuditFromAdmin error:");
    return res
      .status(500)
      .json({ error: "internal_error", message: "Failed to rerun audit" });
  }
}
