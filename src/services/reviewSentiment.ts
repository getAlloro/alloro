/**
 * Review Sentiment Analysis Service
 *
 * Fetches Google reviews for a practice and its top competitor,
 * then uses Claude to extract one specific, actionable insight
 * the practice owner didn't know.
 *
 * This is the "how did they know that?" feature.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getPlaceDetails } from "../controllers/places/feature-services/GooglePlacesApiService";
import logger from "../lib/logger";

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

interface ReviewData {
  text: string;
  rating: number;
  authorName: string;
  relativePublishTimeDescription: string;
}

interface SentimentInsight {
  type: "sentiment_insight";
  title: string;
  detail: string;
  yourTheme: string;
  competitorTheme: string;
  actionable: string;
}

/**
 * Fetch reviews for a place from Google Places API.
 * Returns up to 5 most relevant reviews.
 */
async function fetchReviews(placeId: string): Promise<ReviewData[]> {
  try {
    const details = await getPlaceDetails(placeId);
    if (!details?.reviews || !Array.isArray(details.reviews)) return [];
    return details.reviews.slice(0, 5).map((r: any) => ({
      text: r.text?.text || r.originalText?.text || "",
      rating: r.rating || 0,
      authorName: r.authorAttribution?.displayName || "Anonymous",
      relativePublishTimeDescription: r.relativePublishTimeDescription || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Analyze reviews for one "how did they know that" insight.
 *
 * Rules:
 * - One finding only. Specific, not generic.
 * - Must reference something from the actual review text.
 * - Must be something the practice owner likely doesn't know.
 * - No em-dashes. Ever.
 */
export async function analyzeReviewSentiment(
  clientPlaceId: string,
  clientName: string,
  competitorPlaceId: string | null,
  competitorName: string | null,
  specialty: string,
): Promise<SentimentInsight | null> {
  // Fetch reviews in parallel
  const [clientReviews, competitorReviews] = await Promise.all([
    fetchReviews(clientPlaceId),
    competitorPlaceId ? fetchReviews(competitorPlaceId) : Promise.resolve([]),
  ]);

  // Need at least 2 client reviews to generate meaningful insight
  if (clientReviews.length < 2) return null;

  const clientReviewText = clientReviews
    .map((r) => `[${r.rating}★] "${r.text}"`)
    .join("\n");

  const competitorReviewText = competitorReviews.length > 0
    ? competitorReviews.map((r) => `[${r.rating}★] "${r.text}"`).join("\n")
    : "No competitor reviews available.";

  try {
    const response = await getAnthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are analyzing Google reviews for a ${specialty} business called "${clientName}".

YOUR REVIEWS:
${clientReviewText}

${competitorName ? `TOP COMPETITOR (${competitorName}) REVIEWS:\n${competitorReviewText}` : ""}

Extract ONE specific insight the business owner probably doesn't know. Look for:
- A recurring theme customers mention (positive or negative) that the owner may not realize is visible
- A specific strength customers praise that the competitor's customers don't mention (or vice versa)
- A pattern in negative feedback that reveals an operational blind spot

Respond in exactly this JSON format, nothing else:
{
  "title": "short title, 5-8 words",
  "detail": "one sentence, specific, references actual review language, no em-dashes",
  "yourTheme": "the recurring theme in your reviews, 3-5 words",
  "competitorTheme": "what competitor reviews highlight that yours don't, 3-5 words, or 'N/A'",
  "actionable": "one specific action the owner can take this week"
}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);

    return {
      type: "sentiment_insight",
      title: parsed.title,
      detail: parsed.detail,
      yourTheme: parsed.yourTheme,
      competitorTheme: parsed.competitorTheme,
      actionable: parsed.actionable,
    };
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "[ReviewSentiment] Claude analysis failed:");
    return null;
  }
}
