import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

/**
 * Projection for the review-sync selection query: a selected GBP property
 * joined to its connection + organization. Mirrors the shape consumed by
 * workers/processors/reviewSync (ReviewSyncProperty).
 */
export interface ISelectedGbpPropertyForSync {
  google_property_id: number;
  location_id: number;
  external_id: string;
  account_id: string | null;
  google_connection_id: number;
  organization_id: number;
}

export interface IGoogleProperty {
  id: number;
  location_id: number;
  google_connection_id: number;
  type: "gbp";
  external_id: string;
  account_id: string | null;
  display_name: string | null;
  metadata: Record<string, unknown> | null;
  selected: boolean;
  created_at: Date;
  updated_at: Date;
}

export class GooglePropertyModel extends BaseModel {
  protected static tableName = "google_properties";
  protected static jsonFields = ["metadata"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IGoogleProperty | undefined> {
    return super.findById(id, trx);
  }

  static async findByConnectionId(
    googleConnectionId: number,
    trx?: QueryContext
  ): Promise<IGoogleProperty[]> {
    const rows = await this.table(trx).where({
      google_connection_id: googleConnectionId,
    });
    return rows.map((row: IGoogleProperty) => this.deserializeJsonFields(row));
  }

  static async findByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<IGoogleProperty[]> {
    const rows = await this.table(trx).where({ location_id: locationId });
    return rows.map((row: IGoogleProperty) => this.deserializeJsonFields(row));
  }

  static async findSelectedGbpByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<IGoogleProperty | undefined> {
    const row = await this.table(trx)
      .where({ location_id: locationId, type: "gbp", selected: true })
      .orderBy("updated_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByExternalId(
    externalId: string,
    trx?: QueryContext
  ): Promise<IGoogleProperty | undefined> {
    const row = await this.table(trx)
      .where({ external_id: externalId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByConnectionAndExternalId(
    connectionId: number,
    externalId: string,
    trx?: QueryContext
  ): Promise<IGoogleProperty | undefined> {
    const row = await this.table(trx)
      .where({ google_connection_id: connectionId, external_id: externalId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async deleteByConnectionId(
    connectionId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ google_connection_id: connectionId }).del();
  }

  static async deleteByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ location_id: locationId }).del();
  }

  static async create(
    data: Omit<IGoogleProperty, "id" | "created_at" | "updated_at">,
    trx?: QueryContext
  ): Promise<IGoogleProperty> {
    return super.create(data as Record<string, unknown>, trx);
  }

  /**
   * Selected GBP properties for active organizations, joined to their
   * connection + organization, optionally narrowed by organization and/or
   * location. Mirrors the inline selection query in
   * workers/processors/reviewSync.processReviewSync verbatim (google_properties
   * join google_connections join organizations, where gp.type='gbp',
   * gp.selected=true, o.archived_at is null, optional gc.organization_id /
   * gp.location_id filters; same projected/aliased columns).
   */
  static async findSelectedGbpForSync(
    filters: { organizationId?: number; locationId?: number },
    trx?: QueryContext
  ): Promise<ISelectedGbpPropertyForSync[]> {
    let query = (trx || db)("google_properties as gp")
      .join("google_connections as gc", "gp.google_connection_id", "gc.id")
      .join("organizations as o", "gc.organization_id", "o.id")
      .where("gp.type", "gbp")
      .where("gp.selected", true)
      .whereNull("o.archived_at")
      .select(
        "gp.id as google_property_id",
        "gp.location_id",
        "gp.external_id",
        "gp.account_id",
        "gp.google_connection_id",
        "gc.organization_id"
      );

    if (filters.organizationId) {
      query = query.where("gc.organization_id", filters.organizationId);
    }
    if (filters.locationId) {
      query = query.where("gp.location_id", filters.locationId);
    }

    return query;
  }

  /**
   * Selected GBP locations for the "sync all published local posts" sweep.
   * Verbatim move of GbpPublishedLocalPostService.syncAll's inline join
   * (type=gbp, selected, location_id NOT NULL, org not archived; ordered by location_id asc).
   */
  static async findSelectedGbpLocationsForSyncAll(
    filters: { organizationId?: number; locationId?: number; limit?: number },
    trx?: QueryContext
  ): Promise<Array<{ organization_id: number; location_id: number }>> {
    let query = (trx || db)("google_properties as gp")
      .join("google_connections as gc", "gp.google_connection_id", "gc.id")
      .join("organizations as o", "gc.organization_id", "o.id")
      .where("gp.type", "gbp")
      .where("gp.selected", true)
      .whereNotNull("gp.location_id")
      .whereNull("o.archived_at")
      .select(
        "gc.organization_id as organization_id",
        "gp.location_id as location_id"
      )
      .orderBy("gp.location_id", "asc");

    if (filters.organizationId) query = query.where("gc.organization_id", filters.organizationId);
    if (filters.locationId) query = query.where("gp.location_id", filters.locationId);
    if (filters.limit) query = query.limit(Math.min(Math.max(filters.limit, 1), 500));

    return query;
  }
}
