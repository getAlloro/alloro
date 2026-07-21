import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

/**
 * google_data_store — flat raw GBP data captured per agent run
 * (daily/monthly). Rows are written by the agent orchestrator with their
 * own created_at/updated_at already set on the payload, so inserts here are
 * verbatim passthroughs to preserve the original caller-built shape.
 */
export interface IGoogleDataStore {
  id: number;
  organization_id: number | null;
  location_id: number | null;
  domain: string;
  date_start: string;
  date_end: string;
  run_type: string;
  gbp_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * A daily google_data_store row, projected down to exactly what the
 * patient-journey impressions reader needs (`location_id` included so the reader
 * can dedup and sum per location). `date_start`/`date_end` are cast to text so
 * they come back as clean YYYY-MM-DD strings regardless of the underlying column
 * type.
 *
 * The whole `gbp_data` blob is deliberately NOT selected. It carries the full
 * review objects (reviewer text included), profile and engagement for BOTH days
 * of every row — measured at 283 kB for one org's month, against 126 bytes per
 * row-side for the `visibility` object that is actually read — and this query
 * runs on the main Dashboard render path. Only the two `visibility` objects are
 * projected (§10.4).
 *
 * `yesterday_visibility`/`day_before_visibility` are `null` when that side
 * carried no stored `visibility` — the distinction the reader depends on, since
 * a missing side is a MISSING metric (it must not count toward day-coverage)
 * while a stored `visibility` of zeros is a real measured zero. The value is
 * byte-identical to what `gbp_data.yesterday?.visibility` yielded when the whole
 * blob was fetched, so the reader's arithmetic is unchanged.
 */
export type GoogleDataStoreDailyRow = Pick<
  IGoogleDataStore,
  "id" | "organization_id" | "location_id" | "date_start" | "date_end"
> & {
  yesterday_visibility: Record<string, unknown> | null;
  day_before_visibility: Record<string, unknown> | null;
};

export class GoogleDataStoreModel extends BaseModel {
  protected static tableName = "google_data_store";

  /**
   * Daily GBP rows for an ENTIRE org (all of its locations) that overlap
   * [startDate, endDate]. The impressions gate is a whole-practice aggregate:
   * an org has many locations but the Maps term sums across every one of them.
   *
   * Each daily run stores two consecutive days (date_start = day-before,
   * date_end = the later day), so a row is "in the window" if its two-day span
   * touches it: date_end >= startDate AND date_start <= endDate. The caller
   * de-duplicates per (location_id, calendar day) — a single location's
   * consecutive/retried runs overlap by one day. Scoped to run_type = "daily"
   * only (monthly rows carry a different gbp_data shape) and to real locations
   * (location_id NOT NULL). A NULL location_id is NOT an "org-level aggregate":
   * it's the daily processor writing `location_id: locationId || null`
   * (service.daily-agent-processor.ts) for a run with no resolved location —
   * the row still holds ONE listing's data, so it has no location key to dedup
   * or attribute by. Excluding it keeps the whole-practice sum keyed to real,
   * dedup-able locations rather than folding in an unkeyable single listing.
   *
   * Ordered by (date_start, id) so duplicate rows for the same dates resolve
   * deterministically — the caller's last-write-wins dedup is then predictable.
   */
  static async findDailyByOrgAndDateRange(
    organizationId: number,
    startDate: string,
    endDate: string,
    trx?: QueryContext
  ): Promise<GoogleDataStoreDailyRow[]> {
    return this.table(trx)
      .select("id", "organization_id", "location_id")
      .select(db.raw("date_start::text as date_start"))
      .select(db.raw("date_end::text as date_end"))
      // Project ONLY the two visibility objects instead of the whole blob
      // (§10.4). `#>` path-extraction is used rather than a SQL sum of the four
      // integers so the value handed to the reader is exactly the object it used
      // to pull out of `gbp_data` itself: the summing/validation stays in the one
      // already-tested place, and this change cannot move a computed number.
      //
      // `#>` also works identically on `json` and `jsonb` columns, unlike
      // `jsonb_typeof`/`jsonb_path_query` — the table predates this repo's
      // migration history, so the column type is not asserted anywhere in-tree.
      //
      // The paths are fixed literals (no caller input is interpolated) and the
      // tenant/date predicates below stay parameterized through the builder
      // (§10.1). Keys are case-sensitive: `dayBefore` matches the writer.
      .select(
        db.raw("gbp_data #> '{yesterday,visibility}' as yesterday_visibility"),
      )
      .select(
        db.raw("gbp_data #> '{dayBefore,visibility}' as day_before_visibility"),
      )
      .where("run_type", "daily")
      .where("organization_id", organizationId)
      .whereNotNull("location_id")
      .where("date_end", ">=", startDate)
      .where("date_start", "<=", endDate)
      .orderBy("date_start", "asc")
      .orderBy("id", "asc");
  }

  /**
   * Insert a raw GBP data row verbatim. The caller supplies the full payload
   * (including created_at/updated_at), matching the original inline
   * db("google_data_store").insert(rawData) call.
   */
  static async insertRaw(
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert(data);
  }

  /**
   * Delete the monthly-run rows for an org/date-range (optionally scoped to a
   * location). Mirrors the inline google_data_store delete in
   * pms-retry.cleanupMonthlyRunData's transaction. Trx-aware.
   */
  static async deleteMonthlyRun(
    organizationId: number,
    dateStart: string,
    dateEnd: string,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<number> {
    const query = this.table(trx).where({
      organization_id: organizationId,
      date_start: dateStart,
      date_end: dateEnd,
      run_type: "monthly",
    });
    if (locationId) {
      query.where({ location_id: locationId });
    }
    return query.del();
  }
}
