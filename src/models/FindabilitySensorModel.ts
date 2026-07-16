import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";
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

/**
 * Columns an on-conflict re-run refreshes. Deliberately excludes the identity
 * key (organization_id, location_id, keyword, run_date) and `created_at`, so a
 * same-day re-scan updates the measurement in place and keeps the row's
 * original birth timestamp.
 */
const READING_MERGE_COLUMNS = [
  "keyword_source",
  "grid_size",
  "radius_miles",
  "center_lat",
  "center_lng",
  "solv_percent",
  "arp",
  "atrp",
  "total_pins",
  "known_pins",
  "unknown_pins",
  "ranked_pins",
  "top_three_pins",
  "coverage",
  "per_pin",
  "open_hours_known",
  "observed_at",
  "updated_at",
];

export class FindabilitySensorReadingModel extends BaseModel {
  protected static tableName = "findability_sensor_readings";
  protected static jsonFields: string[] = ["per_pin"];

  /**
   * Idempotent write: one snapshot per (organization, location, keyword,
   * run_date). A re-run on the same day updates the existing row rather than
   * stacking duplicates (spec: "one snapshot per (location, keyword-family,
   * run-date)").
   *
   * Race-safe by construction: a single INSERT ... ON CONFLICT DO UPDATE that
   * the DB resolves atomically against `fs_readings_dedup_uidx`. There is no
   * check-then-write window for a concurrent (scheduled + manual) scan to slip
   * through, and — unlike a catch-23505-and-retry — it never aborts a caller's
   * surrounding transaction, so it is safe with or without a `trx`.
   *
   * The conflict target must match the index expression exactly (including the
   * COALESCE), or Postgres cannot infer the index and raises 42P10.
   */
  static async upsertReading(
    input: FindabilitySensorReadingInput,
    trx?: QueryContext,
  ): Promise<IFindabilitySensorReading> {
    const now = new Date();
    const row = this.serializeJsonFields({
      ...input,
      location_id: input.location_id ?? null,
      created_at: now,
      updated_at: now,
    });
    const [written] = await this.table(trx)
      .insert(row)
      .onConflict(
        (trx || db).raw(
          "(organization_id, COALESCE(location_id, -1), keyword, run_date)",
        ),
      )
      .merge(READING_MERGE_COLUMNS)
      .returning("*");
    return this.deserializeJsonFields(written);
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

/**
 * Columns an on-conflict save refreshes. Excludes the identity key
 * (organization_id, location_id) and `created_at` — a re-save edits the
 * location's one config in place rather than creating a second one.
 */
const CONFIG_MERGE_COLUMNS = [
  "keywords",
  "grid_size",
  "radius_miles",
  "enabled",
  "updated_at",
];

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

  /**
   * One config per (organization, location) — enforced by the DB, not by this
   * method (review finding #1).
   *
   * A single INSERT ... ON CONFLICT DO UPDATE against `fs_configs_dedup_uidx`.
   * The previous check-then-create was a TOCTOU race: two concurrent saves for
   * the same location (a double-clicked save, or onboarding racing an owner
   * edit) could both read "no existing row" and both insert, leaving two
   * configs for one location and a scan whose keyword set depends on which row
   * it happened to read. The unique index makes that unrepresentable, and this
   * upsert converges on it instead of colliding with it.
   *
   * The conflict target must match the index expression exactly (including the
   * COALESCE, which is what stops a null-location config from escaping the
   * constraint — Postgres treats NULLs as DISTINCT in a plain unique index).
   */
  static async upsertConfig(
    input: FindabilitySensorKeywordConfigInput,
    trx?: QueryContext,
  ): Promise<IFindabilitySensorKeywordConfig> {
    const now = new Date();
    const row = this.serializeJsonFields({
      ...input,
      location_id: input.location_id ?? null,
      created_at: now,
      updated_at: now,
    });
    const [written] = await this.table(trx)
      .insert(row)
      .onConflict((trx || db).raw("(organization_id, COALESCE(location_id, -1))"))
      .merge(CONFIG_MERGE_COLUMNS)
      .returning("*");
    return this.deserializeJsonFields(written);
  }
}
