import { BaseModel, QueryContext } from "./BaseModel";

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

export class GoogleDataStoreModel extends BaseModel {
  protected static tableName = "google_data_store";

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
