import { db } from "../database/connection";
import type { QueryContext } from "./BaseModel";
import type { GbpContentType } from "./GbpWorkItemModel";
import type { SearchPositionSource } from "./PracticeRankingModel";

const ATTRIBUTABLE_CONTENT_TYPES: GbpContentType[] = [
  "local_post",
  "review_reply",
];

interface CountRow {
  count: string | number;
}

interface RawPublishedWorkRow extends CountRow {
  location_id: number;
  content_type: GbpContentType;
}

export interface ReceiptsReportLocationRow {
  id: number;
  name: string | null;
}

export interface ReceiptsReportPublishedWorkRow {
  location_id: number;
  content_type: GbpContentType;
  count: number;
}

export interface ReceiptsReportRankingObservationRow {
  id: number;
  location_id: number;
  search_position: number;
  search_query: string | null;
  search_results: unknown;
  search_checked_at: Date;
  search_position_source: SearchPositionSource | null;
}

/**
 * Read-only database boundary for the receipts report. Every method requires
 * an organization id so a caller cannot accidentally issue a cross-tenant
 * report query (§5.5/§11.7).
 */
export class ReceiptsReportModel {
  static async listLocationsByOrganization(
    organizationId: number,
    trx?: QueryContext
  ): Promise<ReceiptsReportLocationRow[]> {
    return (trx ?? db)("locations as l")
      .where("l.organization_id", organizationId)
      .select("l.id", "l.name")
      .orderBy("l.id", "asc");
  }

  static async countFormSubmissionsForPeriod(
    organizationId: number,
    startAt: Date,
    endExclusiveAt: Date,
    trx?: QueryContext
  ): Promise<number> {
    const row = (await (trx ?? db)("website_builder.form_submissions as fs")
      .innerJoin("website_builder.projects as p", "fs.project_id", "p.id")
      .where("p.organization_id", organizationId)
      .andWhere("fs.submitted_at", ">=", startAt)
      .andWhere("fs.submitted_at", "<", endExclusiveAt)
      .count({ count: "*" })
      .first()) as CountRow | undefined;

    return Number(row?.count ?? 0);
  }

  static async countPublishedGbpWorkItemsByLocation(
    organizationId: number,
    startAt: Date,
    endExclusiveAt: Date,
    trx?: QueryContext
  ): Promise<ReceiptsReportPublishedWorkRow[]> {
    const rows = (await (trx ?? db)("gbp_work_items as wi")
      .where("wi.organization_id", organizationId)
      .andWhere("wi.status", "published")
      .whereIn("wi.content_type", ATTRIBUTABLE_CONTENT_TYPES)
      .andWhere("wi.published_at", ">=", startAt)
      .andWhere("wi.published_at", "<", endExclusiveAt)
      .groupBy("wi.location_id", "wi.content_type")
      .select("wi.location_id", "wi.content_type")
      .count({ count: "*" })
      .orderBy("wi.location_id", "asc")
      .orderBy("wi.content_type", "asc")) as unknown as RawPublishedWorkRow[];

    return rows.map((row) => ({
      location_id: row.location_id,
      content_type: row.content_type,
      count: Number(row.count),
    }));
  }

  static async listCompletedSearchPositionObservations(
    organizationId: number,
    startAt: Date,
    endExclusiveAt: Date,
    trx?: QueryContext
  ): Promise<ReceiptsReportRankingObservationRow[]> {
    return (trx ?? db)("practice_rankings as pr")
      .where("pr.organization_id", organizationId)
      .andWhere("pr.status", "completed")
      .andWhere("pr.search_status", "ok")
      .whereNotNull("pr.location_id")
      .whereNotNull("pr.search_position")
      .whereNotNull("pr.search_checked_at")
      .andWhere("pr.search_checked_at", ">=", startAt)
      .andWhere("pr.search_checked_at", "<", endExclusiveAt)
      .select(
        "pr.id",
        "pr.location_id",
        "pr.search_position",
        "pr.search_query",
        "pr.search_results",
        "pr.search_checked_at",
        "pr.search_position_source"
      )
      .orderBy("pr.location_id", "asc")
      .orderBy("pr.search_checked_at", "asc")
      .orderBy("pr.id", "asc");
  }
}
