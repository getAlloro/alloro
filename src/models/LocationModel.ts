import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

/**
 * Downstream tables that reference `location_id` with no FK constraint, so
 * deleting a location requires nulling these out first to avoid dangling
 * references. Moved verbatim from LocationService.DOWNSTREAM_TABLES.
 */
const LOCATION_REFERENCE_TABLES = [
  "agent_results",
  "tasks",
  "pms_jobs",
  "practice_rankings",
  "notifications",
];

export type LocationCompetitorOnboardingStatus =
  | "pending"
  | "curating"
  | "finalized";

export interface ILocation {
  id: number;
  organization_id: number;
  name: string;
  domain: string | null;
  is_primary: boolean;
  business_data: Record<string, unknown> | null;
  location_competitor_onboarding_status: LocationCompetitorOnboardingStatus;
  location_competitor_onboarding_finalized_at: Date | null;
  competitor_set_revision: number;
  competitor_discovery_radius_meters: number;
  client_place_id: string | null;
  client_lat: number | null;
  client_lng: number | null;
  created_at: Date;
  updated_at: Date;
}

export class LocationModel extends BaseModel {
  protected static tableName = "locations";
  protected static jsonFields = ["business_data"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<ILocation | undefined> {
    return super.findById(id, trx);
  }

  static async findByOrganizationId(
    organizationId: number,
    trx?: QueryContext
  ): Promise<ILocation[]> {
    return this.table(trx)
      .where({ organization_id: organizationId })
      .orderBy("is_primary", "desc")
      .orderBy("name", "asc");
  }

  static async findPrimaryByOrganizationId(
    organizationId: number,
    trx?: QueryContext
  ): Promise<ILocation | undefined> {
    return this.table(trx)
      .where({ organization_id: organizationId, is_primary: true })
      .first();
  }

  /**
   * COUNT(id) of locations for an org. Mirrors the billing-service inline
   * `count("id as count")` verbatim (count of id, not *). Returns the raw
   * count row so the caller's `Number(row?.count)` coercion is unchanged.
   */
  static async countByOrganizationId(
    organizationId: number,
    trx?: QueryContext
  ): Promise<{ count: string | number } | undefined> {
    return this.table(trx)
      .where({ organization_id: organizationId })
      .count("id as count")
      .first();
  }

  /**
   * Null out `location_id` on every downstream table that references this
   * location (no FK constraint). Must run before deleting the location.
   * Moved verbatim from LocationService.nullOutLocationId.
   */
  static async nullOutLocationReferences(
    locationId: number,
    trx?: QueryContext
  ): Promise<void> {
    const conn = trx || db;
    for (const table of LOCATION_REFERENCE_TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (conn as any)(table)
        .where({ location_id: locationId })
        .update({ location_id: null });
    }
  }

  static async findByDomain(
    domain: string,
    trx?: QueryContext
  ): Promise<ILocation | undefined> {
    return this.table(trx).where({ domain }).first();
  }

  static async create(
    data: Omit<
      ILocation,
      | "id"
      | "created_at"
      | "updated_at"
      | "business_data"
      | "location_competitor_onboarding_status"
      | "location_competitor_onboarding_finalized_at"
      | "competitor_set_revision"
      | "competitor_discovery_radius_meters"
      | "client_place_id"
      | "client_lat"
      | "client_lng"
    > & {
      business_data?: Record<string, unknown> | null;
      location_competitor_onboarding_status?: LocationCompetitorOnboardingStatus;
      location_competitor_onboarding_finalized_at?: Date | null;
      competitor_set_revision?: number;
      competitor_discovery_radius_meters?: number;
      client_place_id?: string | null;
      client_lat?: number | null;
      client_lng?: number | null;
    },
    trx?: QueryContext
  ): Promise<ILocation> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<ILocation>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  /**
   * Cache the practice's resolved Google Places identifiers on the location.
   * Used by the curate flow to filter the practice out of its own competitor
   * list deterministically (vs. re-running a name lookup on every discovery).
   */
  static async setClientIdentifiers(
    locationId: number,
    data: { placeId: string; lat: number | null; lng: number | null },
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: locationId })
      .update({
        client_place_id: data.placeId,
        client_lat: data.lat,
        client_lng: data.lng,
        updated_at: new Date(),
      });
  }

  static async setCompetitorDiscoveryRadius(
    locationId: number,
    radiusMeters: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: locationId })
      .update({
        competitor_discovery_radius_meters: radiusMeters,
        updated_at: new Date(),
      });
  }

  /**
   * Competitor-onboarding projection for a set of location ids:
   * (id, status, finalized_at). Used by the latest-rankings dashboard to
   * render the per-location "set up your competitor list" banner.
   */
  static async findOnboardingStatusByIds(
    ids: number[],
    trx?: QueryContext
  ): Promise<
    Array<{
      id: number;
      location_competitor_onboarding_status: LocationCompetitorOnboardingStatus;
      location_competitor_onboarding_finalized_at: Date | null;
    }>
  > {
    return this.table(trx)
      .whereIn("id", ids)
      .select(
        "id",
        "location_competitor_onboarding_status",
        "location_competitor_onboarding_finalized_at"
      );
  }
}
