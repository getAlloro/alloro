import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

/**
 * Single pillar inside a website or GBP analysis payload.
 * Matches the shape produced by the n8n-ported agent prompts.
 */
export interface AnalysisPillar {
  category: string;
  score: number;
  key_finding: string;
  action_items: string[];
}

/**
 * Output shape of the WebsiteAnalysis agent.
 */
export interface WebsiteAnalysisResult {
  top_action_items: string[];
  overall_score: number;
  overall_grade: string;
  pillars: AnalysisPillar[];
}

/**
 * Output shape of the GBPAnalysis agent.
 */
export interface GbpAnalysisResult {
  top_action_items: string[];
  gbp_readiness_score: number;
  gbp_grade: string;
  competitor_analysis: {
    rank_score: number;
    rank_grade: string;
    key_findings: string;
    top_action_items: string[];
  };
  sync_audit: {
    nap_match: boolean;
    mismatched_fields: string[];
    trust_gap_severity: string;
  };
  pillars: AnalysisPillar[];
}

/**
 * The 23-field minimized Google Business Profile shape used by the audit
 * pipeline. Mirrors n8n's `parse1` / `parse3` code nodes verbatim. Permissive
 * inner types are used where the Apify actor's shape is not stably documented,
 * but every field is named explicitly so consumers know what to expect.
 */
export interface GbpMinimized {
  title?: string | null;
  categoryName?: string | null;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
  location?: Record<string, unknown> | null;
  averageStarRating?: number | null;
  placeId?: string | null;
  categories?: string[] | null;
  reviewsCount?: number | null;
  reviewsDistribution?: Record<string, unknown> | null;
  imagesCount?: number | null;
  imageCategories?: unknown[] | null;
  openingHours?: unknown[] | null;
  reviewsTags?: unknown[] | null;
  additionalInfo?: Record<string, unknown> | null;
  url?: string | null;
  searchPageUrl?: string | null;
  searchString?: string | null;
  imageUrl?: string | null;
  ownerUpdates?: unknown[] | null;
  imageUrls?: string[] | null;
  reviews?: unknown[] | null;
}

export interface IAuditProcess {
  id: string;
  domain?: string;
  practice_search_string?: string;
  status?: string;
  realtime_status?: number;
  error_message?: string | null;
  step_screenshots?: { desktop_url: string; mobile_url: string | null } | null;
  step_website_analysis?: WebsiteAnalysisResult | null;
  step_self_gbp?: GbpMinimized | null;
  step_competitors?: { competitors: GbpMinimized[] } | null;
  step_gbp_analysis?: GbpAnalysisResult | null;
  // Set to true when the homepage scrape was blocked by bot protection
  // (Cloudflare etc.) and both default + stealth methods exhausted. Drives
  // the frontend's "Your website blocks Alloro scanners" placeholder and
  // tells the GBP analysis prompts to skip website-related advice.
  website_blocked?: boolean;
  [key: string]: unknown;
  created_at: Date;
  updated_at: Date;
}

export class AuditProcessModel extends BaseModel {
  protected static tableName = "audit_processes";

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IAuditProcess | undefined> {
    return super.findById(id, trx);
  }

  static async updateById(
    id: string,
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data, trx);
  }

  /**
   * Lite projection used by the leadgen email-notify queue: just the fields
   * needed to decide whether the audit is done and to pick a business name.
   */
  static async findStatusAndGbpById(
    id: string,
    trx?: QueryContext
  ): Promise<
    Pick<IAuditProcess, "id" | "status" | "step_self_gbp"> | undefined
  > {
    return this.table(trx)
      .select("id", "status", "step_self_gbp")
      .where({ id })
      .first();
  }

  /**
   * Update audit fields while never downgrading `realtime_status` — parallel
   * pipeline branches write it in arbitrary order, so GREATEST guards against
   * a slow branch rewinding the UI stage. SQL preserved verbatim from
   * auditUpdateService.updateAuditFields.
   */
  static async updateFieldsWithRealtimeFloor(
    id: string,
    rest: Record<string, unknown>,
    realtimeStatus: unknown,
    trx?: QueryContext
  ): Promise<number> {
    const conn = trx || db;
    return conn("audit_processes")
      .where({ id })
      .update({
        ...rest,
        realtime_status: conn.raw("GREATEST(realtime_status, ?)", [
          realtimeStatus,
        ]),
        updated_at: conn.fn.now(),
      });
  }

  /**
   * Atomic retry reset. Flips a `failed` row back to `pending` (and resets
   * realtime_status/error_message) in a single conditional UPDATE so two
   * concurrent retries can't both pass the cap — the DB enforces the
   * invariant. `countsTowardLimit` increments retry_count; `skipLimit` (admin)
   * drops the `retry_count < MAX` guard. Returns the `.returning(...)` rows.
   * Query shape preserved verbatim from service.audit-retry.
   */
  static async resetFailedForRetry(
    id: string,
    opts: {
      countsTowardLimit: boolean;
      skipLimit: boolean;
      maxRetries: number;
    },
    trx?: QueryContext
  ): Promise<
    Array<{
      id: string;
      domain: string | null;
      practice_search_string: string | null;
      retry_count: number;
    }>
  > {
    const conn = trx || db;

    const updatePatch: Record<string, unknown> = {
      status: "pending",
      realtime_status: 0,
      error_message: null,
      updated_at: new Date(),
    };
    if (opts.countsTowardLimit) {
      updatePatch.retry_count = conn.raw("retry_count + 1");
    }

    const query = conn("audit_processes")
      .where({ id, status: "failed" })
      .update(updatePatch)
      .returning(["id", "domain", "practice_search_string", "retry_count"]);

    if (!opts.skipLimit) {
      query.andWhere("retry_count", "<", opts.maxRetries);
    }

    return query;
  }

  /**
   * Retry-disambiguation projection — the full row used to explain why the
   * conditional retry UPDATE matched zero rows. Verbatim from
   * service.audit-retry.disambiguateFailure.
   */
  static async findRetryStateById(
    id: string,
    trx?: QueryContext
  ): Promise<
    | {
        id: string;
        domain: string | null;
        practice_search_string: string | null;
        status: string;
        retry_count: number;
      }
    | undefined
  > {
    return this.table(trx)
      .select("id", "domain", "practice_search_string", "status", "retry_count")
      .where({ id })
      .first();
  }
}
