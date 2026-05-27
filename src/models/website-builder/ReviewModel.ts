import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export type ReviewSource = "oauth" | "apify";

export interface IReview {
  id: string;
  location_id: number | null;
  google_review_name: string | null;
  source: ReviewSource;
  place_id: string | null;
  stars: number;
  text: string | null;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  is_anonymous: boolean;
  review_created_at: Date | null;
  has_reply: boolean;
  reply_text: string | null;
  reply_date: Date | null;
  hidden: boolean;
  synced_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ReviewFilters {
  minRating?: number;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

export interface ReviewReplyabilityCounts {
  total: number;
  replyable_oauth: number;
  replyable_oauth_last_30d: number;
  oauth_already_replied: number;
  maps_only: number;
  hidden: number;
}

export interface ReviewReplyOpsMetrics {
  totalOauthReviews: number;
  totalUnreplied: number;
  unrepliedLast30d: number;
  unrepliedOver7d: number;
  unrepliedOver30d: number;
  oldestUnrepliedAt: Date | null;
  averageReplyHours: number | null;
  averageReplyDays: number | null;
  medianReplyDays: number | null;
  replyCoveragePercent: number;
}

export interface ReviewMonthBucket {
  month: string;
  label: string;
  count: number;
}

export interface ProjectReviewListFilters {
  locationIds: number[];
  placeIds: string[];
  search?: string;
  stars?: number;
  minRating?: number;
  showHidden?: boolean;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

export type ApifyReviewInput = {
  place_id: string;
  location_id: number | null;
  stars: number;
  text: string | null;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  is_anonymous: boolean;
  review_created_at: Date | null;
  has_reply: boolean;
  reply_text: string | null;
  reply_date: Date | null;
};

function monthBounds(month: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

function monthKeyForDate(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const bounds = monthBounds(month);
  if (!bounds) return month;
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(bounds.start);
}

function validDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function differenceDays(left: Date, right: Date): number {
  return Math.max(0, (left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000));
}

export class ReviewModel extends BaseModel {
  protected static tableName = "website_builder.reviews";

  static async findByLocationId(
    locationId: number,
    filters?: ReviewFilters,
    trx?: QueryContext
  ): Promise<IReview[]> {
    let query = this.table(trx).where({ location_id: locationId });

    if (filters?.minRating) {
      query = query.where("stars", ">=", filters.minRating);
    }

    query = query.orderBy(
      "review_created_at",
      filters?.order || "desc"
    );

    query = query.limit(filters?.limit || 10);
    query = query.offset(filters?.offset || 0);

    return query;
  }

  static async upsertByGoogleName(
    data: Omit<IReview, "id" | "hidden" | "created_at" | "updated_at" | "synced_at">,
    trx?: QueryContext
  ): Promise<IReview> {
    const now = new Date();
    const insertData = {
      ...data,
      hidden: false,
      synced_at: now,
      created_at: now,
      updated_at: now,
    };

    const updateData = { ...data, synced_at: now, updated_at: now };
    delete (updateData as any).google_review_name;

    const [result] = await (trx || db)("website_builder.reviews")
      .insert(insertData)
      .onConflict(db.raw("(google_review_name) WHERE google_review_name IS NOT NULL"))
      .merge(updateData)
      .returning("*");

    return result;
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IReview | undefined> {
    return super.findById(id, trx);
  }

  static async findReplyableForLocation(
    locationId: number,
    filters?: { limit?: number; month?: string | null },
    trx?: QueryContext
  ): Promise<IReview[]> {
    let query = this.table(trx)
      .where({
        location_id: locationId,
        source: "oauth",
        hidden: false,
        has_reply: false,
      })
      .whereNotNull("google_review_name");

    const bounds = filters?.month ? monthBounds(filters.month) : null;
    if (bounds) {
      query = query
        .where("review_created_at", ">=", bounds.start)
        .where("review_created_at", "<", bounds.end);
    }

    query = query.orderBy("review_created_at", "desc");
    if (!bounds) query = query.limit(filters?.limit || 25);
    return query;
  }

  static async findRepliedForLocation(
    locationId: number,
    filters?: { limit?: number; month?: string | null },
    trx?: QueryContext
  ): Promise<IReview[]> {
    let query = this.table(trx)
      .where({
        location_id: locationId,
        source: "oauth",
        hidden: false,
        has_reply: true,
      })
      .whereNotNull("google_review_name");

    const bounds = filters?.month ? monthBounds(filters.month) : null;
    if (bounds) {
      query = query
        .where("review_created_at", ">=", bounds.start)
        .where("review_created_at", "<", bounds.end);
    }

    query = query.orderBy("reply_date", "desc").orderBy("review_created_at", "desc");
    if (!bounds) query = query.limit(filters?.limit || 100);
    return query;
  }

  static async findLocalPostCandidatesForLocation(
    locationId: number,
    filters?: { limit?: number },
    trx?: QueryContext
  ): Promise<IReview[]> {
    return this.table(trx)
      .where({
        location_id: locationId,
        hidden: false,
      })
      .where("stars", ">=", 5)
      .whereNotNull("text")
      .whereRaw("length(trim(text)) >= 20")
      .orderBy("review_created_at", "desc")
      .limit(Math.min(Math.max(filters?.limit || 25, 1), 100));
  }

  static async listReplyReviewMonths(
    locationId: number,
    hasReply: boolean,
    trx?: QueryContext
  ): Promise<ReviewMonthBucket[]> {
    const rows: Array<Pick<IReview, "review_created_at" | "created_at">> =
      await this.table(trx)
        .where({
          location_id: locationId,
          source: "oauth",
          hidden: false,
          has_reply: hasReply,
        })
        .whereNotNull("google_review_name")
        .select("review_created_at", "created_at");
    const countByMonth = rows.reduce((counts, row) => {
      const month = monthKeyForDate(row.review_created_at || row.created_at);
      if (!month) return counts;
      counts.set(month, (counts.get(month) || 0) + 1);
      return counts;
    }, new Map<string, number>());

    return Array.from(countByMonth.entries())
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([month, count]) => ({ month, label: monthLabel(month), count }));
  }

  static async getReplyabilityCounts(
    locationId: number,
    trx?: QueryContext
  ): Promise<ReviewReplyabilityCounts> {
    const rows: Array<
      Pick<
        IReview,
        "source" | "google_review_name" | "has_reply" | "hidden" | "review_created_at"
      >
    > =
      await this.table(trx)
      .where({ location_id: locationId })
      .select("source", "google_review_name", "has_reply", "hidden", "review_created_at");
    const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return rows.reduce(
      (counts: ReviewReplyabilityCounts, review) => {
        counts.total += 1;
        const createdAt = review.review_created_at
          ? new Date(review.review_created_at)
          : null;
        const isLast30d = Boolean(
          createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= last30d
        );
        if (review.hidden) counts.hidden += 1;
        if (review.source !== "oauth" || !review.google_review_name) {
          counts.maps_only += 1;
        } else if (review.has_reply) {
          counts.oauth_already_replied += 1;
        } else if (!review.hidden) {
          counts.replyable_oauth += 1;
          if (isLast30d) counts.replyable_oauth_last_30d += 1;
        }
        return counts;
      },
      {
        total: 0,
        replyable_oauth: 0,
        replyable_oauth_last_30d: 0,
        oauth_already_replied: 0,
        maps_only: 0,
        hidden: 0,
      }
    );
  }

  static async getReplyOpsMetrics(
    locationId: number,
    trx?: QueryContext
  ): Promise<ReviewReplyOpsMetrics> {
    const rows: Array<
      Pick<
        IReview,
        "google_review_name" | "has_reply" | "hidden" | "review_created_at" | "reply_date"
      >
    > = await this.table(trx)
      .where({
        location_id: locationId,
        source: "oauth",
        hidden: false,
      })
      .whereNotNull("google_review_name")
      .select("google_review_name", "has_reply", "hidden", "review_created_at", "reply_date");

    const now = new Date();
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const over7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const over30d = last30d;
    const replyDurationsDays: number[] = [];
    let totalUnreplied = 0;
    let unrepliedLast30d = 0;
    let unrepliedOver7d = 0;
    let unrepliedOver30d = 0;
    let oldestUnrepliedAt: Date | null = null;
    let totalReplied = 0;

    for (const review of rows) {
      const reviewCreatedAt = validDate(review.review_created_at);
      const replyDate = validDate(review.reply_date);

      if (review.has_reply) {
        totalReplied += 1;
        if (reviewCreatedAt && replyDate) {
          replyDurationsDays.push(differenceDays(replyDate, reviewCreatedAt));
        }
        continue;
      }

      totalUnreplied += 1;
      if (reviewCreatedAt && reviewCreatedAt >= last30d) unrepliedLast30d += 1;
      if (reviewCreatedAt && reviewCreatedAt <= over7d) unrepliedOver7d += 1;
      if (reviewCreatedAt && reviewCreatedAt <= over30d) unrepliedOver30d += 1;
      if (reviewCreatedAt && (!oldestUnrepliedAt || reviewCreatedAt < oldestUnrepliedAt)) {
        oldestUnrepliedAt = reviewCreatedAt;
      }
    }

    const averageReplyDays =
      replyDurationsDays.length > 0
        ? replyDurationsDays.reduce((sum, value) => sum + value, 0) / replyDurationsDays.length
        : null;
    const sortedDurations = [...replyDurationsDays].sort((left, right) => left - right);
    const medianReplyDays =
      sortedDurations.length > 0
        ? sortedDurations[Math.floor(sortedDurations.length / 2)]
        : null;
    const totalOauthReviews = rows.length;

    return {
      totalOauthReviews,
      totalUnreplied,
      unrepliedLast30d,
      unrepliedOver7d,
      unrepliedOver30d,
      oldestUnrepliedAt,
      averageReplyHours: averageReplyDays === null ? null : averageReplyDays * 24,
      averageReplyDays,
      medianReplyDays,
      replyCoveragePercent:
        totalOauthReviews > 0 ? Math.round((totalReplied / totalOauthReviews) * 100) : 0,
    };
  }

  static async updateReplyFields(
    id: string,
    replyText: string,
    replyDate: Date,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({
      has_reply: true,
      reply_text: replyText,
      reply_date: replyDate,
      updated_at: new Date(),
    });
  }

  static async clearReplyFields(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({
      has_reply: false,
      reply_text: null,
      reply_date: null,
      updated_at: new Date(),
    });
  }

  static async upsertApifyReview(
    data: ApifyReviewInput,
    trx?: QueryContext
  ): Promise<IReview> {
    const now = new Date();
    const insertData = {
      ...data,
      source: "apify" as const,
      google_review_name: null,
      synced_at: now,
      created_at: now,
      updated_at: now,
    };

    const updateData = {
      stars: data.stars,
      text: data.text,
      reviewer_photo_url: data.reviewer_photo_url,
      has_reply: data.has_reply,
      reply_text: data.reply_text,
      reply_date: data.reply_date,
      location_id: data.location_id,
      synced_at: now,
      updated_at: now,
    };

    const [result] = await (trx || db)("website_builder.reviews")
      .insert(insertData)
      .onConflict(db.raw("(place_id, reviewer_name, review_created_at) WHERE source = 'apify'"))
      .merge(updateData)
      .returning("*");

    return result;
  }

  static async replaceApifyReviewsForPlace(
    placeId: string,
    reviews: ApifyReviewInput[]
  ): Promise<number> {
    return db.transaction(async (trx) => {
      await this.table(trx)
        .where({ source: "apify", place_id: placeId })
        .del();

      for (const review of reviews) {
        await this.upsertApifyReview(review, trx);
      }

      return reviews.length;
    });
  }

  static async findByPlaceIds(
    placeIds: string[],
    filters?: ReviewFilters,
    trx?: QueryContext
  ): Promise<IReview[]> {
    let query = this.table(trx).whereIn("place_id", placeIds);

    if (filters?.minRating) {
      query = query.where("stars", ">=", filters.minRating);
    }

    query = query.orderBy("review_created_at", filters?.order || "desc");
    query = query.limit(filters?.limit || 10);
    query = query.offset(filters?.offset || 0);

    return query;
  }

  static async listForProject(
    opts: ProjectReviewListFilters,
    trx?: QueryContext
  ): Promise<IReview[]> {
    const hasLocations = opts.locationIds.length > 0;
    const hasPlaces = opts.placeIds.length > 0;
    if (!hasLocations && !hasPlaces) return [];

    let query = this.table(trx).where(function () {
      if (hasLocations) this.whereIn("location_id", opts.locationIds);
      if (hasPlaces) this.orWhereIn("place_id", opts.placeIds);
    });

    if (opts.stars) {
      query = query.where("stars", opts.stars);
    }

    if (opts.minRating) {
      query = query.where("stars", ">=", opts.minRating);
    }

    if (opts.search) {
      const term = `%${opts.search}%`;
      query = query.where(function () {
        this.whereILike("reviewer_name", term).orWhereILike("text", term);
      });
    }

    if (!opts.showHidden) {
      query = query.where("hidden", false);
    }

    return query
      .orderBy("review_created_at", opts.order || "desc")
      .limit(opts.limit || 500)
      .offset(opts.offset || 0);
  }

  static async toggleHidden(id: string, hidden: boolean, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id }).update({ hidden, updated_at: new Date() });
  }

  static async deleteReview(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id }).del();
  }

  static async deleteByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ location_id: locationId }).del();
  }

  static async countByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.count({ location_id: locationId }, trx);
  }
}
