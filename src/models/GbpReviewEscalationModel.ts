import { BaseModel, QueryContext } from "./BaseModel";

export type GbpReviewEscalationStatus = "open" | "resolved" | "dismissed";

export interface IGbpReviewEscalation {
  id: string;
  review_id: string;
  organization_id: number;
  location_id: number;
  status: GbpReviewEscalationStatus;
  reason: string;
  note: string | null;
  created_by_user_id: number | null;
  resolved_by_user_id: number | null;
  resolved_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class GbpReviewEscalationModel extends BaseModel {
  protected static tableName = "gbp_review_escalations";
  protected static jsonFields = ["metadata"];

  static async findByReviewIds(
    reviewIds: string[],
    trx?: QueryContext
  ): Promise<IGbpReviewEscalation[]> {
    if (reviewIds.length === 0) return [];
    const rows = await this.table(trx).whereIn("review_id", reviewIds);
    return rows.map((row: IGbpReviewEscalation) => this.deserializeJsonFields(row));
  }

  static async upsertForReview(
    data: {
      reviewId: string;
      organizationId: number;
      locationId: number;
      status: GbpReviewEscalationStatus;
      reason: string;
      note?: string | null;
      actorUserId: number | null;
    },
    trx?: QueryContext
  ): Promise<IGbpReviewEscalation> {
    const now = new Date();
    const payload = {
      review_id: data.reviewId,
      organization_id: data.organizationId,
      location_id: data.locationId,
      status: data.status,
      reason: data.reason,
      note: data.note || null,
      resolved_by_user_id: data.status === "resolved" ? data.actorUserId : null,
      resolved_at: data.status === "resolved" ? new Date() : null,
    };
    const insertData = this.serializeJsonFields({
      ...payload,
      created_by_user_id: data.actorUserId,
      metadata: {},
      created_at: now,
      updated_at: now,
    });
    const updateData = this.serializeJsonFields({
      ...payload,
      updated_at: now,
    });
    const [row] = await this.table(trx)
      .insert(insertData)
      .onConflict("review_id")
      .merge(updateData)
      .returning("*");
    return this.deserializeJsonFields(row);
  }
}
