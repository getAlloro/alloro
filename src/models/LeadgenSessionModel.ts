import { Knex } from "knex";
import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";
import { LeadgenEventModel } from "./LeadgenEventModel";

/**
 * Funnel stages for the leadgen audit tool. Ordered roughly by user progress;
 * see `STAGE_ORDER` below for the numeric ordinal used by the never-downgrade
 * logic in the tracking controller.
 *
 * Shared with `LeadgenEventName` in `LeadgenEventModel.ts` — every event name
 * matches a possible `final_stage` value.
 */
export type FinalStage =
  | "landed"
  | "input_started"
  | "input_submitted"
  | "audit_started"
  | "stage_viewed_1"
  | "stage_viewed_2"
  | "stage_viewed_3"
  | "stage_viewed_4"
  | "stage_viewed_5"
  | "results_viewed"
  | "report_engaged_1min"
  | "email_gate_shown"
  | "email_submitted"
  | "account_created"
  | "account_linked"
  | "abandoned";

/** Report-surface activity is valid only when the session owns an audit. */
export const REPORT_SURFACE_EVENT_NAMES: readonly FinalStage[] = [
  "stage_viewed_5",
  "email_gate_shown",
  "email_submitted",
  "results_viewed",
  "report_engaged_1min",
] as const;

export type LeadgenDataQuality =
  | "valid"
  | "empty"
  | "report_without_audit";

/**
 * Ordinal map used by the controller's never-downgrade logic. A session's
 * `final_stage` only advances to `incoming` when `STAGE_ORDER[incoming] >
 * STAGE_ORDER[current]`.
 *
 * `abandoned` is pinned at 99 so it never "downgrades" a more-progressed
 * funnel position — a user who hit `results_viewed` and then closed the tab
 * stays at `results_viewed`, not `abandoned`.
 */
export const STAGE_ORDER: Record<FinalStage, number> = {
  landed: 0,
  input_started: 1,
  input_submitted: 2,
  audit_started: 3,
  stage_viewed_1: 4,
  stage_viewed_2: 5,
  stage_viewed_3: 6,
  stage_viewed_4: 7,
  stage_viewed_5: 8,
  email_gate_shown: 9,
  email_submitted: 10,
  results_viewed: 11,
  report_engaged_1min: 12,
  // `account_linked` (new label) and `account_created` (legacy label that
  // historic rows still carry) share the same ordinal so both render into
  // the same funnel bucket and neither "downgrades" the other.
  account_created: 13,
  account_linked: 13,
  abandoned: 99,
};

/**
 * Convenience accessor for `STAGE_ORDER`. Used by the cumulative-funnel
 * aggregator (T1) and the account-linking service (T6) to avoid repeatedly
 * keying into the ordinal map.
 */
export function stageOrdinal(stage: FinalStage): number {
  return STAGE_ORDER[stage];
}

export interface ILeadgenSession {
  id: string;
  audit_id: string | null;
  email: string | null;
  domain: string | null;
  practice_search_string: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  user_agent: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  user_id: number | null;
  converted_at: Date | null;
  final_stage: FinalStage;
  completed: boolean;
  abandoned: boolean;
  first_seen_at: Date;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface LockedLeadgenSession {
  session: ILeadgenSession;
  wasCreated: boolean;
}

/** Subset selected by the audit-milestone + tracking flows. */
export type SessionLite = Pick<
  ILeadgenSession,
  "id" | "final_stage" | "completed"
>;

/** Shared filter set for the admin leadgen list + export queries. */
export interface AdminListFilters {
  search?: string;
  status?: "all" | "completed" | "abandoned" | "in_progress";
  from?: string;
  to?: string;
  hasEmail?: boolean;
}

export interface AdminSubmissionRow {
  id: string;
  email: string | null;
  domain: string | null;
  practice_search_string: string | null;
  audit_id: string | null;
  audit_status: string | null;
  user_agent: string | null;
  user_id: number | null;
  converted_at: Date | null;
  final_stage: FinalStage;
  completed: boolean;
  abandoned: boolean;
  first_seen_at: Date;
  last_seen_at: Date;
  linked_via: "persisted" | "email" | "domain" | null;
  data_quality: LeadgenDataQuality;
}

/**
 * Applies the shared admin filter set to a knex query builder against
 * `leadgen_sessions`. Used by the list, count, and export queries so filters
 * stay in lockstep. Moved verbatim from AdminLeadgenController.applyListFilters.
 */
function applyAdminListFilters(
  qb: Knex.QueryBuilder,
  filters: AdminListFilters
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

function buildEventOrdinalCase(column: string): string {
  const cases = (Object.entries(STAGE_ORDER) as Array<[FinalStage, number]>)
    .filter(([eventName]) => eventName !== "abandoned")
    .map(([eventName, ordinal]) => `WHEN '${eventName}' THEN ${ordinal}`)
    .join(" ");
  return `CASE ${column} ${cases} ELSE 0 END`;
}

const REPORT_EVENT_PLACEHOLDERS = REPORT_SURFACE_EVENT_NAMES.map(() => "?").join(
  ", "
);

const ADMIN_EMAIL_MATCH_SQL = `
  EXISTS (
    SELECT 1 FROM users AS matched_user
    WHERE leadgen_sessions.email IS NOT NULL
      AND LOWER(matched_user.email) = LOWER(leadgen_sessions.email)
  )
`;

const ADMIN_DOMAIN_MATCH_SQL = `
  EXISTS (
    SELECT 1 FROM organizations AS matched_org
    WHERE COALESCE(audit_processes.domain, '') <> ''
      AND LOWER(
        regexp_replace(
          regexp_replace(
            regexp_replace(COALESCE(audit_processes.domain, ''), '^(http|https)://', ''),
            '^www\\.', ''
          ),
          '/+$', ''
        )
      ) = LOWER(
        regexp_replace(
          regexp_replace(
            regexp_replace(COALESCE(matched_org.domain, ''), '^(http|https)://', ''),
            '^www\\.', ''
          ),
          '/+$', ''
        )
      )
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
      )
  )
`;

function adminLinkedViaExpression(conn: QueryContext): Knex.Raw {
  return conn.raw(`
    CASE
      WHEN leadgen_sessions.user_id IS NOT NULL THEN 'persisted'
      WHEN ${ADMIN_EMAIL_MATCH_SQL} THEN 'email'
      WHEN ${ADMIN_DOMAIN_MATCH_SQL} THEN 'domain'
      ELSE NULL
    END AS linked_via
  `);
}

function adminDataQualityExpression(conn: QueryContext): Knex.Raw {
  return conn.raw(
    `
      CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM leadgen_events AS any_event
          WHERE any_event.session_id = leadgen_sessions.id
        ) THEN 'empty'
        WHEN leadgen_sessions.audit_id IS NULL AND EXISTS (
          SELECT 1 FROM leadgen_events AS report_event
          WHERE report_event.session_id = leadgen_sessions.id
            AND report_event.event_name IN (${REPORT_EVENT_PLACEHOLDERS})
        ) THEN 'report_without_audit'
        ELSE 'valid'
      END AS data_quality
    `,
    [...REPORT_SURFACE_EVENT_NAMES]
  );
}

export class LeadgenSessionModel extends BaseModel {
  protected static tableName = "leadgen_sessions";

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<ILeadgenSession | undefined> {
    return super.findById(id, trx);
  }

  /**
   * Establish a missing session and lock the row for serialized event
   * ingestion. `ON CONFLICT DO NOTHING` makes concurrent first events safe;
   * both callers then queue on the same primary-key row lock.
   */
  static async findOrCreateLockedForEvent(
    id: string,
    createData: Record<string, unknown>,
    trx: QueryContext
  ): Promise<LockedLeadgenSession> {
    const inserted = await this.table(trx)
      .insert(createData)
      .onConflict("id")
      .ignore()
      .returning("id");
    const session = (await this.table(trx)
      .where({ id })
      .forUpdate()
      .first()) as ILeadgenSession | undefined;

    if (!session) {
      throw new Error(`Unable to lock leadgen session ${id} for event ingestion.`);
    }

    return { session, wasCreated: inserted.length > 0 };
  }

  /** Lock an existing session for a server-authoritative multi-table write. */
  static async findByIdForUpdate(
    id: string,
    trx: QueryContext
  ): Promise<ILeadgenSession | undefined> {
    return this.table(trx).where({ id }).forUpdate().first();
  }

  static async updateById(
    id: string,
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data, trx);
  }

  /** Raw upsert-time insert — column set + timestamps owned by the caller. */
  static async insertRow(
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert(data);
  }

  /** Patch a session by id with an arbitrary column set (no auto timestamps). */
  static async patchById(
    id: string,
    patch: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update(patch);
  }

  /** Lite projection (id, final_stage, completed) for every session of an audit. */
  static async findLiteByAuditId(
    auditId: string,
    trx?: QueryContext
  ): Promise<SessionLite[]> {
    return this.table(trx)
      .select("id", "final_stage", "completed")
      .where({ audit_id: auditId });
  }

  /** id + email projection for every session matching an audit. */
  static async findIdEmailByAuditId(
    auditId: string,
    trx?: QueryContext
  ): Promise<Array<Pick<ILeadgenSession, "id" | "email">>> {
    return this.table(trx).select("id", "email").where({ audit_id: auditId });
  }

  /** Oldest session id that owns the given audit, or undefined. */
  static async findOldestByAuditId(
    auditId: string,
    trx?: QueryContext
  ): Promise<Pick<ILeadgenSession, "id"> | undefined> {
    return this.table(trx)
      .select("id")
      .where({ audit_id: auditId })
      .orderBy("first_seen_at", "asc")
      .first();
  }

  /**
   * Account-linking candidate lookup: sessions matching the explicit session
   * id OR a case-insensitive email match. When `sessionId` is undefined, only
   * the email branch runs.
   */
  static async findCandidatesForAccountLinking(
    normalizedEmail: string,
    sessionId: string | undefined,
    trx?: QueryContext
  ): Promise<Array<Pick<ILeadgenSession, "id" | "email">>> {
    const query = this.table(trx).select("id", "email");

    if (typeof sessionId === "string") {
      query.where(function () {
        this.where("id", sessionId).orWhereRaw("LOWER(email) = ?", [
          normalizedEmail,
        ]);
      });
    } else {
      query.whereRaw("LOWER(email) = ?", [normalizedEmail]);
    }

    return query;
  }

  /**
   * Atomically stamp account creation on a session: insert the
   * `account_created` event row and promote the session to converted.
   * Owns its own transaction (mirrors ReviewModel.replaceApifyReviewsForPlace)
   * so the event + session write can never partially apply.
   */
  static async markAccountCreated(
    sessionId: string,
    userId: number,
    matchedVia: string,
    now: Date
  ): Promise<void> {
    await this.transaction(async (trx) => {
      await LeadgenEventModel.insertRow(
        {
          session_id: sessionId,
          event_name: "account_created",
          event_data: JSON.stringify({
            user_id: userId,
            linked_via: matchedVia,
          }),
          created_at: now,
        },
        trx
      );

      await this.table(trx).where({ id: sessionId }).update({
        final_stage: "account_created",
        completed: true,
        user_id: userId,
        converted_at: now,
        last_seen_at: now,
        updated_at: now,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Admin leadgen-submissions queries (moved verbatim from
  // AdminLeadgenController). The JS aggregation/CSV-streaming stays in the
  // controller/service; only the DB access lives here.
  // -------------------------------------------------------------------------

  /** Total sessions matching the admin list filters. */
  static async countForAdminList(
    filters: AdminListFilters,
    trx?: QueryContext
  ): Promise<number> {
    const totalRow = await applyAdminListFilters(this.table(trx), filters)
      .count<{ count: string }[]>({ count: "*" })
      .first();
    return parseInt((totalRow?.count as string) ?? "0", 10) || 0;
  }

  /**
   * Paginated admin list rows, with the account-linked reconciliation join
   * (users by email, organizations by normalised domain) and derived
   * `linked_via` column. SQL preserved verbatim — see controller comments
   * for the normalisation rationale.
   */
  static async findForAdminList(
    filters: AdminListFilters,
    pageSize: number,
    page: number,
    trx?: QueryContext
  ): Promise<AdminSubmissionRow[]> {
    const conn = trx || db;
    return applyAdminListFilters(
      this.table(trx)
        .leftJoin(
          "audit_processes",
          "leadgen_sessions.audit_id",
          "audit_processes.id"
        )
        .select(
          "leadgen_sessions.id as id",
          "leadgen_sessions.email as email",
          "leadgen_sessions.domain as domain",
          "leadgen_sessions.practice_search_string as practice_search_string",
          "leadgen_sessions.audit_id as audit_id",
          "audit_processes.status as audit_status",
          "leadgen_sessions.user_agent as user_agent",
          "leadgen_sessions.user_id as user_id",
          "leadgen_sessions.converted_at as converted_at",
          "leadgen_sessions.final_stage as final_stage",
          "leadgen_sessions.completed as completed",
          "leadgen_sessions.abandoned as abandoned",
          "leadgen_sessions.first_seen_at as first_seen_at",
          "leadgen_sessions.last_seen_at as last_seen_at",
          adminLinkedViaExpression(conn),
          adminDataQualityExpression(conn)
        ),
      filters
    )
      .orderBy("leadgen_sessions.created_at", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize) as unknown as AdminSubmissionRow[];
  }

  /**
   * Headline conversion metrics in a single round-trip (raw SQL preserved
   * verbatim, incl. the timestamptz casts that fix the NULL-binding inference).
   * Returns the raw row object so the controller maps it as before.
   */
  static async getAdminStatsRow(
    from: string | null,
    to: string | null,
    trx?: QueryContext
  ): Promise<Record<string, unknown>> {
    const rowRaw = await (trx || db).raw(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM leadgen_events
            WHERE leadgen_events.session_id = leadgen_sessions.id
          )
        )::int AS total_sessions,
        COUNT(converted_at) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM leadgen_events
            WHERE leadgen_events.session_id = leadgen_sessions.id
          )
        )::int AS total_conversions,
        CASE
          WHEN COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM leadgen_events
              WHERE leadgen_events.session_id = leadgen_sessions.id
            )
          ) = 0 THEN NULL
          ELSE ROUND((
            COUNT(converted_at) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM leadgen_events
                WHERE leadgen_events.session_id = leadgen_sessions.id
              )
            )::numeric
            /
            COUNT(*) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM leadgen_events
                WHERE leadgen_events.session_id = leadgen_sessions.id
              )
            )::numeric
          ) * 100, 2)
        END AS conversion_rate_pct,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (converted_at - first_seen_at)) * 1000
        ) FILTER (
          WHERE converted_at IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM leadgen_events
              WHERE leadgen_events.session_id = leadgen_sessions.id
            )
        ) AS median_time_to_convert_ms
      FROM leadgen_sessions
      WHERE (?::timestamptz IS NULL OR first_seen_at >= ?::timestamptz)
        AND (?::timestamptz IS NULL OR first_seen_at <= ?::timestamptz)
      `,
      [from, from, to, to]
    );

    return (rowRaw as { rows: Array<Record<string, unknown>> }).rows[0] ?? {};
  }

  /** One CSV-export chunk (filter-respecting, paginated). */
  static async findForAdminExportChunk(
    filters: AdminListFilters,
    limit: number,
    offset: number,
    trx?: QueryContext
  ): Promise<Array<Record<string, unknown>>> {
    return applyAdminListFilters(
      this.table(trx)
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
      .limit(limit)
      .offset(offset);
  }

  /** Full session detail row (admin detail view). */
  static async findDetailById(
    id: string,
    trx?: QueryContext
  ): Promise<ILeadgenSession | undefined> {
    return this.table(trx).where({ id }).first();
  }

  /** id + audit_id projection (admin rerun handler). */
  static async findIdAuditById(
    id: string,
    trx?: QueryContext
  ): Promise<Pick<ILeadgenSession, "id" | "audit_id"> | undefined> {
    return this.table(trx).select("id", "audit_id").where({ id }).first();
  }

  /** Hard-delete a session by id (FK cascade drops events). */
  static async deleteByIdReturningCount(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).del();
  }

  /** Bulk hard-delete sessions by id (FK cascade). */
  static async deleteManyByIds(
    ids: string[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).del();
  }

  // -------------------------------------------------------------------------
  // Funnel aggregation source queries (moved verbatim from
  // service.funnel-aggregator). The JS aggregation stays in the service.
  // -------------------------------------------------------------------------

  /**
   * One row per event-backed session with its maximum valid stage ordinal.
   * Report-surface events on audit-less sessions collapse to ordinal zero, so
   * they remain visible as traffic without inflating valid report metrics.
   */
  static async findSessionMaxOrdinalRows(
    from: string | undefined,
    to: string | undefined,
    trx?: QueryContext
  ): Promise<
    Array<{
      max_ordinal: number | string | null;
      abandoned: boolean;
      completed: boolean;
    }>
  > {
    const conn = trx || db;
    const reportPlaceholders = REPORT_SURFACE_EVENT_NAMES.map(() => "?").join(
      ", "
    );
    const validOrdinal = conn.raw(
      `
        CASE
          WHEN s.audit_id IS NULL
            AND e.event_name IN (${reportPlaceholders})
          THEN 0
          ELSE ${buildEventOrdinalCase("e.event_name")}
        END
      `,
      [...REPORT_SURFACE_EVENT_NAMES]
    );

    let base = conn("leadgen_sessions as s")
      .innerJoin("leadgen_events as e", "e.session_id", "s.id")
      .select<
        Array<{
          max_ordinal: number | string | null;
          abandoned: boolean;
          completed: boolean;
        }>
      >(
        "s.abandoned as abandoned",
        "s.completed as completed"
      )
      .max({ max_ordinal: validOrdinal })
      .groupBy("s.id", "s.abandoned", "s.completed");

    if (from) {
      base = base.where("s.first_seen_at", ">=", from);
    }
    if (to) {
      base = base.where("s.first_seen_at", "<=", to);
    }

    return base;
  }

  /**
   * First-event-per-(session,event_name) timestamps for the timing pass,
   * filtered by the funnel date window. SQL preserved verbatim.
   */
  static async findFirstEventTimings(
    from: string | undefined,
    to: string | undefined,
    trx?: QueryContext
  ): Promise<
    Array<{ session_id: string; event_name: FinalStage; first_at: Date }>
  > {
    const conn = trx || db;
    let firstEventQuery = conn("leadgen_events as e")
      .innerJoin("leadgen_sessions as s", "s.id", "e.session_id")
      .select<
        Array<{
          session_id: string;
          event_name: FinalStage;
          first_at: Date;
        }>
      >("e.session_id", "e.event_name", conn.raw("MIN(e.created_at) as first_at"))
      .where((query) => {
        query
          .whereNotIn("e.event_name", [...REPORT_SURFACE_EVENT_NAMES])
          .orWhereNotNull("s.audit_id");
      })
      .groupBy("e.session_id", "e.event_name");

    if (from) {
      firstEventQuery = firstEventQuery.where("s.first_seen_at", ">=", from);
    }
    if (to) {
      firstEventQuery = firstEventQuery.where("s.first_seen_at", "<=", to);
    }

    return firstEventQuery;
  }
}
