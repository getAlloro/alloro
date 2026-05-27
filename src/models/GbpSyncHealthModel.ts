import { BaseModel, QueryContext } from "./BaseModel";

export type GbpSyncHealthStatus = "pending" | "running" | "succeeded" | "failed";
export type GbpSyncType = "reviews" | "local_posts";
export type GbpSyncSource = "manual" | "auto";

export interface IGbpSyncHealth {
  id: string;
  organization_id: number;
  location_id: number;
  google_property_id: number | null;
  sync_type: GbpSyncType;
  status: GbpSyncHealthStatus;
  started_at: Date | null;
  completed_at: Date | null;
  synced_count: number;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class GbpSyncHealthModel extends BaseModel {
  protected static tableName = "gbp_sync_health";
  protected static jsonFields = ["metadata"];

  static async latestForLocation(
    locationId: number,
    syncType: GbpSyncType = "reviews",
    trx?: QueryContext
  ): Promise<IGbpSyncHealth | undefined> {
    const row = await this.table(trx)
      .where({ location_id: locationId, sync_type: syncType })
      .orderBy("created_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async markStarted(data: {
    organizationId: number;
    locationId: number;
    googlePropertyId: number | null;
    syncType?: GbpSyncType;
    metadata?: Record<string, unknown>;
  }): Promise<IGbpSyncHealth> {
    return this.create({
      organization_id: data.organizationId,
      location_id: data.locationId,
      google_property_id: data.googlePropertyId,
      sync_type: data.syncType || "reviews",
      status: "running",
      started_at: new Date(),
      synced_count: 0,
      metadata: data.metadata || {},
    });
  }

  static async markSucceeded(
    id: string,
    syncedCount: number,
    metadata?: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.updateById(id, {
      status: "succeeded",
      completed_at: new Date(),
      synced_count: syncedCount,
      error_code: null,
      error_message: null,
      ...(metadata ? { metadata } : {}),
    }, trx);
  }

  static async markFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
    metadata?: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.updateById(id, {
      status: "failed",
      completed_at: new Date(),
      error_code: errorCode,
      error_message: errorMessage,
      ...(metadata ? { metadata } : {}),
    }, trx);
  }
}
