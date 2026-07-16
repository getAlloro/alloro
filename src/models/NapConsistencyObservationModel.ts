import { BaseModel, QueryContext } from "./BaseModel";

/**
 * NAP-consistency observation — Alloro Funnel Engine A4. A time-series log: one
 * row per (location, run_date). `conflicts` is the specific listings that
 * disagree (source/host/matchState), so an operator can act. A log, never a score.
 */

export interface INapConsistencyObservation {
  id: string;
  organization_id: number;
  location_id: number;
  run_date: string;
  sources_checked: number;
  consistent_count: number;
  conflict_count: number;
  conflicts: unknown[];
  observed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RecordNapObservationInput {
  organizationId: number;
  locationId: number;
  runDate: string;
  sourcesChecked: number;
  consistentCount: number;
  conflictCount: number;
  conflicts: unknown[];
  observedAt: Date;
}

export class NapConsistencyObservationModel extends BaseModel {
  protected static tableName = "nap_consistency_observation";

  /**
   * Idempotent per (location, run_date): a second write for the same run day is
   * ignored (a log, not a score).
   *
   * Returns whether a row was ACTUALLY inserted. `false` means the conflict
   * target already had a row and this call was a no-op — callers must not count
   * that as a new observation. `ON CONFLICT DO NOTHING RETURNING id` yields zero
   * rows on the ignore path, which is the signal.
   */
  static async record(
    input: RecordNapObservationInput,
    trx?: QueryContext
  ): Promise<boolean> {
    const inserted = await this.table(trx)
      .insert({
        organization_id: input.organizationId,
        location_id: input.locationId,
        run_date: input.runDate,
        sources_checked: input.sourcesChecked,
        consistent_count: input.consistentCount,
        conflict_count: input.conflictCount,
        conflicts: JSON.stringify(input.conflicts),
        observed_at: input.observedAt,
      })
      .onConflict(["location_id", "run_date"])
      .ignore()
      .returning("id");
    return inserted.length > 0;
  }

  /**
   * Tenant-scoped read (§11.7): organizationId is a REQUIRED argument and the
   * query filters by BOTH organization and location, so one tenant can never
   * read another's observations even if a location_id is guessed or reused.
   */
  static async listForLocation(
    organizationId: number,
    locationId: number,
    limit = 100,
    trx?: QueryContext
  ): Promise<INapConsistencyObservation[]> {
    const rows = await this.table(trx)
      .where({ organization_id: organizationId, location_id: locationId })
      .orderBy("observed_at", "desc")
      .limit(limit);
    // jsonb comes back parsed under node-pg, but be explicit either way.
    return rows.map((r: INapConsistencyObservation) => ({
      ...r,
      conflicts:
        typeof r.conflicts === "string"
          ? JSON.parse(r.conflicts)
          : r.conflicts ?? [],
    }));
  }
}
