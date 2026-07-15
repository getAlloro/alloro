import { BaseModel, QueryContext } from "./BaseModel";
import type { KeywordFamily, PinObservation } from "../types/findability-sensor";

/**
 * Findability Sensor persistence (A5, slice 1).
 *
 * Two models over the additive sensor tables:
 *   - FindabilitySensorReadingModel  the honest SoLV time-series (one snapshot
 *     per organization/location/keyword/run_date; upsert = idempotent).
 *   - FindabilitySensorKeywordConfigModel  the done-for-you + owner-steerable
 *     keyword/area config (one per organization/location).
 *
 * All DB access lives here (Constitution §7.4). jsonb columns are declared as
 * jsonFields so BaseModel (de)serializes them.
 */

export interface IFindabilitySensorReading {
  id: number;
  organization_id: number;
  location_id: number | null;
  keyword: string;
  keyword_source: KeywordFamily["source"] | null;
  grid_size: number;
  radius_miles: number;
  center_lat: number | null;
  center_lng: number | null;
  solv_percent: number | null;
  arp: number | null;
  atrp: number | null;
  total_pins: number;
  known_pins: number;
  unknown_pins: number;
  ranked_pins: number;
  top_three_pins: number;
  coverage: number;
  per_pin: PinObservation[];
  open_hours_known: boolean;
  observed_at: Date;
  run_date: string;
  created_at: Date;
  updated_at: Date;
}

/** The fields a runner supplies for one snapshot. */
export type FindabilitySensorReadingInput = Omit<
  IFindabilitySensorReading,
  "id" | "created_at" | "updated_at"
>;

export class FindabilitySensorReadingModel extends BaseModel {
  protected static tableName = "findability_sensor_readings";
  protected static jsonFields: string[] = ["per_pin"];

  /**
   * Idempotent write: one snapshot per (organization, location, keyword,
   * run_date). A re-run on the same day updates the existing row rather than
   * stacking duplicates (spec: "one snapshot per (location, keyword-family,
   * run-date)"). Location may be null; knex renders `location_id is null`.
   *
   * Race-safe: the DB enforces uniqueness via `fs_readings_dedup_uidx`. If two
   * concurrent scans both pass the initial existence check, the losing insert
   * hits a unique violation (23505); we catch it and resolve to an update, so
   * the guarantee holds even without a surrounding transaction. (Callers that
   * pass their own `trx` own conflict handling — a 23505 aborts a Postgres
   * transaction, so the retry path assumes the no-trx runner call.)
   */
  static async upsertReading(
    input: FindabilitySensorReadingInput,
    trx?: QueryContext,
  ): Promise<IFindabilitySensorReading> {
    const key = {
      organization_id: input.organization_id,
      location_id: input.location_id ?? null,
      keyword: input.keyword,
      run_date: input.run_date,
    };
    const existing = await this.findOne(key, trx);
    if (existing) {
      await this.updateById(existing.id, input as Record<string, unknown>, trx);
      return this.findById(existing.id, trx);
    }
    try {
      return await this.create(input as Record<string, unknown>, trx);
    } catch (error: unknown) {
      // Unique violation → another scan inserted the same run first. Resolve
      // to an update so the day's snapshot converges, never duplicates.
      if ((error as { code?: string })?.code === "23505" && !trx) {
        const raced = await this.findOne(key);
        if (raced) {
          await this.updateById(raced.id, input as Record<string, unknown>);
          return this.findById(raced.id);
        }
      }
      throw error;
    }
  }

  static async latestForLocation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext,
  ): Promise<IFindabilitySensorReading[]> {
    const rows = await this.table(trx)
      .where({ organization_id: organizationId, location_id: locationId ?? null })
      .orderBy("observed_at", "desc");
    return rows.map((row: unknown) => this.deserializeJsonFields(row));
  }
}

export interface IFindabilitySensorKeywordConfig {
  id: number;
  organization_id: number;
  location_id: number | null;
  keywords: KeywordFamily[];
  grid_size: number;
  radius_miles: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export type FindabilitySensorKeywordConfigInput = Omit<
  IFindabilitySensorKeywordConfig,
  "id" | "created_at" | "updated_at"
>;

export class FindabilitySensorKeywordConfigModel extends BaseModel {
  protected static tableName = "findability_sensor_keyword_configs";
  protected static jsonFields: string[] = ["keywords"];

  static async findForLocation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext,
  ): Promise<IFindabilitySensorKeywordConfig | undefined> {
    return this.findOne(
      { organization_id: organizationId, location_id: locationId ?? null },
      trx,
    );
  }

  /** One config per (organization, location) — upsert keeps it single. */
  static async upsertConfig(
    input: FindabilitySensorKeywordConfigInput,
    trx?: QueryContext,
  ): Promise<IFindabilitySensorKeywordConfig> {
    const existing = await this.findForLocation(
      input.organization_id,
      input.location_id ?? null,
      trx,
    );
    if (existing) {
      await this.updateById(existing.id, input as Record<string, unknown>, trx);
      return this.findById(existing.id, trx);
    }
    return this.create(input as Record<string, unknown>, trx);
  }
}
