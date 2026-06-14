import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "../BaseModel";
import { Knex } from "knex";
import { db } from "../../database/connection";

export interface FileValue {
  url: string;
  name: string;
  type: string;
  s3Key: string;
}

export interface FormSection {
  title: string;
  fields: [string, string | FileValue][];
}

/** Contents can be flat key-value (legacy) or ordered sections array (new) */
export type FormContents = Record<string, string | FileValue> | FormSection[];

export interface IFormSubmission {
  id: string;
  project_id: string;
  form_name: string;
  contents: FormContents;
  recipients_sent_to: string[];
  submitted_at: Date;
  is_read: boolean;
  sender_ip?: string;
  content_hash?: string;
  is_flagged?: boolean;
  flag_reason?: string;
}

export interface FormSubmissionFormStats {
  form_name: string;
  submission_count: number;
  last_seen: Date | null;
  unread_count: number;
}

type FormSubmissionFilters = {
  is_read?: boolean;
  is_flagged?: boolean;
  form_name?: string;
  form_name_not?: string;
};

export class FormSubmissionModel extends BaseModel {
  protected static tableName = "website_builder.form_submissions";

  static async create(
    data: Omit<IFormSubmission, "id" | "submitted_at" | "is_read">,
    trx?: QueryContext,
  ): Promise<IFormSubmission> {
    // Knex auto-serializes plain objects for JSONB columns but not arrays.
    // Explicitly stringify contents when it's a sections array.
    const insertData = { ...data } as Record<string, unknown>;
    if (Array.isArray(data.contents)) {
      insertData.contents = JSON.stringify(data.contents);
    }
    const [result] = await this.table(trx)
      .insert(insertData)
      .returning("*");
    return result;
  }

  static async findById(
    id: string,
    trx?: QueryContext,
  ): Promise<IFormSubmission | undefined> {
    return super.findById(id, trx);
  }

  static async findByProjectId(
    projectId: string,
    pagination: PaginationParams,
    filters?: FormSubmissionFilters,
    trx?: QueryContext,
  ): Promise<PaginatedResult<IFormSubmission>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      qb = qb.where("project_id", projectId);
      if (filters?.is_read !== undefined) {
        qb = qb.where("is_read", filters.is_read);
      }
      if (filters?.is_flagged !== undefined) {
        qb = qb.where("is_flagged", filters.is_flagged);
      }
      if (filters?.form_name !== undefined) {
        qb = qb.where("form_name", filters.form_name);
      }
      if (filters?.form_name_not !== undefined) {
        qb = qb.whereNot("form_name", filters.form_name_not);
      }
      return qb.orderBy("submitted_at", "desc");
    };
    return this.paginate<IFormSubmission>(buildQuery, pagination, trx);
  }

  static async countByProjectId(
    projectId: string,
    filters?: FormSubmissionFilters,
    trx?: QueryContext,
  ): Promise<number> {
    let query = this.table(trx).where("project_id", projectId);

    if (filters?.is_read !== undefined) {
      query = query.where("is_read", filters.is_read);
    }
    if (filters?.is_flagged !== undefined) {
      query = query.where("is_flagged", filters.is_flagged);
    }
    if (filters?.form_name !== undefined) {
      query = query.where("form_name", filters.form_name);
    }
    if (filters?.form_name_not !== undefined) {
      query = query.whereNot("form_name", filters.form_name_not);
    }

    const result = await query.count("* as count").first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async markAsRead(
    id: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where("id", id).update({ is_read: true });
  }

  /**
   * Flag a submission with a reason (post-save AI content analysis). Mirrors
   * the inline update in websiteContact/formSubmissionController verbatim.
   */
  static async markAsFlagged(
    id: string,
    flagReason: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({ is_flagged: true, flag_reason: flagReason });
  }

  static async markAsUnread(
    id: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where("id", id).update({ is_read: false });
  }

  static async countUnreadByProjectId(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ project_id: projectId, is_read: false })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async countFlaggedByProjectId(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ project_id: projectId, is_flagged: true })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async countVerifiedByProjectId(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ project_id: projectId, is_flagged: false })
      .whereNot("form_name", "Newsletter Signup")
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async countOptinsByProjectId(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ project_id: projectId, form_name: "Newsletter Signup" })
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  /**
   * Count verified (non-flagged, non-newsletter) submissions for a project
   * created on/after a cutoff. Mirrors the verifiedThisWeek query in
   * utils/dashboard-metrics/service.dashboard-metrics.buildFormSubmissionsMetrics.
   */
  static async countVerifiedSinceByProjectId(
    projectId: string,
    since: Date,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where({ project_id: projectId, is_flagged: false })
      .whereNot("form_name", "Newsletter Signup")
      .where("submitted_at", ">=", since)
      .count<{ count: string }[]>("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  /**
   * submitted_at of the oldest unread submission for a project (raw row, or
   * undefined). Mirrors the oldestUnreadRow query in
   * utils/dashboard-metrics/service.dashboard-metrics.buildFormSubmissionsMetrics.
   */
  static async findOldestUnreadSubmittedAt(
    projectId: string,
    trx?: QueryContext,
  ): Promise<{ submitted_at: Date | string } | undefined> {
    return this.table(trx)
      .where({ project_id: projectId, is_read: false })
      .orderBy("submitted_at", "asc")
      .select("submitted_at")
      .first();
  }

  static async listDetectedFormStats(
    projectId: string,
    excludedFormNames: string[] = [],
    trx?: QueryContext,
  ): Promise<FormSubmissionFormStats[]> {
    let query = this.table(trx)
      .select("form_name")
      .count("* as submission_count")
      .max("submitted_at as last_seen")
      .where({ project_id: projectId })
      .groupBy("form_name")
      .orderBy("last_seen", "desc");

    if (excludedFormNames.length > 0) {
      query = query.whereNotIn("form_name", excludedFormNames);
    }

    let unreadQuery = this.table(trx)
      .select("form_name")
      .count("* as unread_count")
      .where({ project_id: projectId, is_read: false })
      .groupBy("form_name");

    if (excludedFormNames.length > 0) {
      unreadQuery = unreadQuery.whereNotIn("form_name", excludedFormNames);
    }

    const [rows, unreadRows] = await Promise.all([query, unreadQuery]);
    const unreadCounts = new Map(
      unreadRows.map((row: {
        form_name: string;
        unread_count: string | number;
      }) => [
        row.form_name,
        typeof row.unread_count === "number"
          ? row.unread_count
          : parseInt(String(row.unread_count), 10) || 0,
      ]),
    );

    return rows.map((row: {
      form_name: string;
      submission_count: string | number;
      last_seen: Date | null;
    }) => ({
      form_name: row.form_name,
      submission_count:
        typeof row.submission_count === "number"
          ? row.submission_count
          : parseInt(String(row.submission_count), 10) || 0,
      last_seen: row.last_seen,
      unread_count: unreadCounts.get(row.form_name) ?? 0,
    }));
  }

  static async listRecentContentsByProjectAndForm(
    projectId: string,
    formName: string,
    sampleSize: number,
    trx?: QueryContext,
  ): Promise<Array<{ contents: FormContents }>> {
    return this.table(trx)
      .select("contents")
      .where({ project_id: projectId, form_name: formName })
      .orderBy("submitted_at", "desc")
      .limit(sampleSize);
  }

  static async deleteById(
    id: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where("id", id).del();
  }

  static async bulkDeleteByIds(
    ids: string[],
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).del();
  }

  static async markAllAsReadByProjectId(
    projectId: string,
    formName?: string,
    trx?: QueryContext,
  ): Promise<number> {
    let query = this.table(trx).where({
      project_id: projectId,
      is_read: false,
    });

    if (formName) query = query.where("form_name", formName);

    return query.update({ is_read: true });
  }

  static async bulkMarkAsRead(
    ids: string[],
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).update({ is_read: true });
  }

  static async bulkMarkAsUnread(
    ids: string[],
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).update({ is_read: false });
  }

  static async countRecentByIp(
    senderIp: string,
    windowMinutes: number,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where("sender_ip", senderIp)
      .where("submitted_at", ">=", new Date(Date.now() - windowMinutes * 60_000))
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async countRecentByContentHash(
    projectId: string,
    contentHash: string,
    windowMinutes: number,
    trx?: QueryContext,
  ): Promise<number> {
    const result = await this.table(trx)
      .where("project_id", projectId)
      .where("content_hash", contentHash)
      .where("submitted_at", ">=", new Date(Date.now() - windowMinutes * 60_000))
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }

  /**
   * Per-month submission counts (total/verified/unread/flagged/blocked) for a
   * project from a start date forward, grouped by month. Mirrors the inline
   * aggregation in UserWebsiteController's monthly form-stats endpoint
   * verbatim, including the Postgres FILTER expressions. Returns raw rows.
   */
  static async getMonthlyStatsByProject(
    projectId: string,
    rangeStartIso: string,
    trx?: QueryContext,
  ): Promise<
    Array<{
      month: string;
      total: number | string;
      verified: number | string;
      unread: number | string;
      flagged: number | string;
      blocked: number | string;
    }>
  > {
    return (trx || db)("website_builder.form_submissions")
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
      .where("project_id", projectId)
      .andWhere("submitted_at", ">=", rangeStartIso)
      .groupBy(db.raw("date_trunc('month', submitted_at)"))
      .orderBy("month", "asc");
  }

  /**
   * All form-submission rows for a project, ordered submitted_at desc, as raw
   * rows (unpaginated). Mirrors the inline export query in
   * workers/processors/websiteBackup verbatim. Distinct from findByProjectId,
   * which paginates — the backup needs every row, so it gets its own method to
   * keep the serialized output identical.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAllByProjectIdForBackup(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return (trx || db)("website_builder.form_submissions")
      .where({ project_id: projectId })
      .orderBy("submitted_at", "desc");
  }
}
