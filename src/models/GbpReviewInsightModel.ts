import { BaseModel, QueryContext } from "./BaseModel";

export type GbpReviewSentiment = "positive" | "neutral" | "negative" | "mixed";
export type GbpReviewUrgency = "normal" | "watch" | "urgent";

export interface IGbpReviewInsight {
  id: string;
  review_id: string;
  sentiment: GbpReviewSentiment;
  themes: string[];
  urgency: GbpReviewUrgency;
  post_candidate: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class GbpReviewInsightModel extends BaseModel {
  protected static tableName = "gbp_review_insights";
  protected static jsonFields = ["themes", "metadata"];

  static async findByReviewId(
    reviewId: string,
    trx?: QueryContext
  ): Promise<IGbpReviewInsight | undefined> {
    const row = await this.table(trx).where({ review_id: reviewId }).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByReviewIds(
    reviewIds: string[],
    trx?: QueryContext
  ): Promise<IGbpReviewInsight[]> {
    if (reviewIds.length === 0) return [];
    const rows = await this.table(trx).whereIn("review_id", reviewIds);
    return rows.map((row: IGbpReviewInsight) => this.deserializeJsonFields(row));
  }

  static async upsertForReview(
    data: Omit<IGbpReviewInsight, "id" | "created_at" | "updated_at">,
    trx?: QueryContext
  ): Promise<IGbpReviewInsight> {
    const now = new Date();
    const insertData = this.serializeJsonFields({
      ...data,
      created_at: now,
      updated_at: now,
    });
    const updateData = this.serializeJsonFields({
      sentiment: data.sentiment,
      themes: data.themes,
      urgency: data.urgency,
      post_candidate: data.post_candidate,
      metadata: data.metadata,
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
