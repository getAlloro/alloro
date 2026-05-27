import { BaseModel, PaginatedResult, QueryContext } from "./BaseModel";

export interface IGbpLocalPost {
  id: string;
  organization_id: number;
  location_id: number;
  google_property_id: number | null;
  google_resource_name: string;
  google_post_id: string;
  topic_type: string;
  state: string;
  summary: string;
  featured_image_url: string | null;
  search_url: string | null;
  media: Array<Record<string, unknown>>;
  call_to_action: Record<string, unknown> | null;
  google_response: Record<string, unknown>;
  create_time: Date | null;
  update_time: Date | null;
  last_synced_at: Date;
  deleted_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export type GbpLocalPostUpsertInput = {
  organizationId: number;
  locationId: number;
  googlePropertyId: number | null;
  googleResourceName: string;
  googlePostId: string;
  topicType: string;
  state: string;
  summary: string;
  featuredImageUrl: string | null;
  searchUrl: string | null;
  media: Array<Record<string, unknown>>;
  callToAction: Record<string, unknown> | null;
  googleResponse: Record<string, unknown>;
  createTime: Date | null;
  updateTime: Date | null;
  metadata?: Record<string, unknown>;
};

export class GbpLocalPostModel extends BaseModel {
  protected static tableName = "gbp_local_posts";
  protected static jsonFields = ["media", "call_to_action", "google_response", "metadata"];

  static async findByGoogleResourceName(
    googleResourceName: string,
    trx?: QueryContext
  ): Promise<IGbpLocalPost | undefined> {
    const row = await this.table(trx).where({ google_resource_name: googleResourceName }).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async listForLocation(
    filters: {
      organizationId: number;
      locationId: number;
      page?: number;
      limit?: number;
    },
    trx?: QueryContext
  ): Promise<PaginatedResult<IGbpLocalPost>> {
    const page = Math.max(filters.page || 1, 1);
    const limit = Math.min(Math.max(filters.limit || 10, 1), 50);
    const offset = (page - 1) * limit;

    return this.paginate<IGbpLocalPost>(
      (query) =>
        query
          .where({
            organization_id: filters.organizationId,
            location_id: filters.locationId,
          })
          .whereNull("deleted_at")
          .orderBy("create_time", "desc")
          .orderBy("created_at", "desc"),
      { limit, offset },
      trx
    );
  }

  static async upsertFromGoogle(
    data: GbpLocalPostUpsertInput,
    trx?: QueryContext
  ): Promise<IGbpLocalPost> {
    const now = new Date();
    const row = {
      organization_id: data.organizationId,
      location_id: data.locationId,
      google_property_id: data.googlePropertyId,
      google_resource_name: data.googleResourceName,
      google_post_id: data.googlePostId,
      topic_type: data.topicType,
      state: data.state,
      summary: data.summary,
      featured_image_url: data.featuredImageUrl,
      search_url: data.searchUrl,
      media: data.media,
      call_to_action: data.callToAction,
      google_response: data.googleResponse,
      create_time: data.createTime,
      update_time: data.updateTime,
      last_synced_at: now,
      deleted_at: null,
      metadata: data.metadata || {},
      updated_at: now,
    };

    const [result] = await this.table(trx)
      .insert(this.serializeJsonFields({ ...row, created_at: now }))
      .onConflict("google_resource_name")
      .merge(this.serializeJsonFields(row))
      .returning("*");
    return this.deserializeJsonFields(result);
  }

  static async markMissingAsDeleted(
    organizationId: number,
    locationId: number,
    googleResourceNames: string[],
    trx?: QueryContext
  ): Promise<number> {
    const query = this.table(trx)
      .where({ organization_id: organizationId, location_id: locationId })
      .whereNull("deleted_at");

    if (googleResourceNames.length > 0) {
      query.whereNotIn("google_resource_name", googleResourceNames);
    }

    return query.update({ deleted_at: new Date(), updated_at: new Date() });
  }

  static async markDeletedByGoogleResourceName(
    googleResourceName: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ google_resource_name: googleResourceName })
      .update({ deleted_at: new Date(), updated_at: new Date() });
  }
}
