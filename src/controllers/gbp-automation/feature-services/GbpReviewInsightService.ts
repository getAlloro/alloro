import {
  GbpReviewInsightModel,
  GbpReviewSentiment,
  GbpReviewUrgency,
  IGbpReviewInsight,
} from "../../../models/GbpReviewInsightModel";
import { IReview } from "../../../models/website-builder/ReviewModel";

const THEME_PATTERNS: Array<{ theme: string; patterns: RegExp[] }> = [
  { theme: "comfort", patterns: [/\bpain\b/i, /\banxious\b/i, /\bcomfortable\b/i] },
  { theme: "scheduling", patterns: [/\bschedule\b/i, /\bappointment\b/i, /\bwait\b/i] },
  { theme: "team", patterns: [/\bstaff\b/i, /\bteam\b/i, /\bdoctor\b/i, /\bdr\./i] },
  { theme: "billing", patterns: [/\bbill\b/i, /\bcharge\b/i, /\bcost\b/i, /\bpaid\b/i] },
  { theme: "service recovery", patterns: [/\bconcern\b/i, /\bissue\b/i, /\bproblem\b/i] },
];

function sentimentForReview(review: IReview): GbpReviewSentiment {
  if (review.stars >= 4) return "positive";
  if (review.stars === 3) return "neutral";
  return "negative";
}

function urgencyForReview(review: IReview): GbpReviewUrgency {
  const text = review.text || "";
  if (review.stars <= 2 && /\bscam|fraud|lawsuit|board|emergency|infection\b/i.test(text)) {
    return "urgent";
  }
  if (review.stars <= 3) return "watch";
  return "normal";
}

function themesForReview(review: IReview): string[] {
  const text = review.text || "";
  const themes = THEME_PATTERNS.filter(({ patterns }) =>
    patterns.some((pattern) => pattern.test(text))
  ).map(({ theme }) => theme);
  return themes.length > 0 ? themes : [review.stars >= 4 ? "praise" : "general feedback"];
}

export class GbpReviewInsightService {
  static classify(review: IReview): Omit<IGbpReviewInsight, "id" | "created_at" | "updated_at"> {
    const sentiment = sentimentForReview(review);
    const urgency = urgencyForReview(review);
    const themes = themesForReview(review);

    return {
      review_id: review.id,
      sentiment,
      themes,
      urgency,
      post_candidate:
        sentiment === "positive" &&
        review.stars >= 5 &&
        Boolean(review.text && review.text.trim().length >= 20),
      metadata: { classifier: "rules_v1" },
    };
  }

  static async ensureForReviews(reviews: IReview[]): Promise<Map<string, IGbpReviewInsight>> {
    const reviewIds = reviews.map((review) => review.id);
    const existing = await GbpReviewInsightModel.findByReviewIds(reviewIds);
    const byReviewId = new Map(existing.map((insight) => [insight.review_id, insight]));

    for (const review of reviews) {
      if (byReviewId.has(review.id)) continue;
      const insight = await GbpReviewInsightModel.upsertForReview(this.classify(review));
      byReviewId.set(insight.review_id, insight);
    }

    return byReviewId;
  }
}
