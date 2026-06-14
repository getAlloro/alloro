/**
 * Review Theme Extractor
 *
 * Reads all Google reviews for a business and extracts:
 * 1. The top 3 themes customers mention most
 * 2. The single most powerful review quote (hero headline candidate)
 * 3. The gap: what customers value that the business doesn't market
 *
 * This powers the website generation engine. The website doesn't
 * start from a template. It starts from what customers actually say.
 *
 * The barber's customers mention "the hot towel" in 40% of reviews
 * but the barber's website says "precision haircuts." The theme
 * extractor identifies that gap. The website builder closes it.
 */

import Anthropic from "@anthropic-ai/sdk";
import logger from "../lib/logger";

export interface ReviewTheme {
  theme: string;
  frequency: number;
  sentiment: "positive" | "neutral" | "negative";
  exampleQuote: string;
  reviewerName: string;
}

export interface ThemeExtractionResult {
  heroQuote: string;
  heroReviewerName: string;
  topThemes: ReviewTheme[];
  uniqueStrength: string;
  suggestedHeadline: string;
  customerVoiceSummary: string;
}

interface ReviewInput {
  text: string;
  rating: number;
  authorName: string;
  relativeTime?: string;
}

/**
 * Extract themes from reviews using Claude.
 * Fast path: if fewer than 3 reviews, return basic extraction.
 * Full path: analyze all reviews for patterns the owner can't see.
 */
export async function extractReviewThemes(
  reviews: ReviewInput[],
  businessName: string,
  businessCategory: string,
): Promise<ThemeExtractionResult> {
  // Fast path: not enough reviews for theme analysis
  if (!reviews || reviews.length < 3) {
    return {
      heroQuote: reviews?.[0]?.text?.slice(0, 150) || "",
      heroReviewerName: reviews?.[0]?.authorName || "",
      topThemes: [],
      uniqueStrength: "",
      suggestedHeadline: `${businessName}. Trusted by your community.`,
      customerVoiceSummary: "",
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback without Claude: extract the highest-rated, longest review
    const best = [...reviews]
      .filter((r) => r.rating >= 4)
      .sort((a, b) => b.text.length - a.text.length)[0];

    return {
      heroQuote: best?.text?.slice(0, 150) || "",
      heroReviewerName: best?.authorName || "",
      topThemes: [],
      uniqueStrength: "",
      suggestedHeadline: `${businessName}. See why customers keep coming back.`,
      customerVoiceSummary: "",
    };
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    // Prepare review text (limit to 50 reviews, 4+ stars)
    const goodReviews = reviews
      .filter((r) => r.rating >= 4 && r.text && r.text.length > 20)
      .slice(0, 50);

    const reviewBlock = goodReviews
      .map((r) => `[${r.authorName}, ${r.rating} stars]: "${r.text}"`)
      .join("\n\n");

    const response = await anthropic.messages.create({
      model: process.env.THEME_EXTRACTION_MODEL || "claude-sonnet-4-6",
      max_tokens: 800,
      system: `You analyze customer reviews to find what makes a business special. You find the thing customers love that the owner probably doesn't realize is their biggest differentiator. Output JSON only. No markdown. No explanation.`,
      messages: [
        {
          role: "user",
          content: `Business: ${businessName} (${businessCategory})

Reviews:
${reviewBlock}

Extract:
1. "heroQuote": The single most specific, authentic, powerful sentence from any review. Not generic praise. The sentence that would make the owner say "that's exactly right." Max 120 characters.
2. "heroReviewerName": Who wrote it.
3. "topThemes": Array of top 3 recurring themes. Each: { "theme": short label, "frequency": estimated % of reviews mentioning it, "sentiment": "positive", "exampleQuote": one sentence, "reviewerName": who said it }
4. "uniqueStrength": The ONE thing customers consistently mention that a competitor probably doesn't have. One sentence.
5. "suggestedHeadline": A website hero headline using the customer's language, not marketing language. Under 10 words. Specific to THIS business.
6. "customerVoiceSummary": One paragraph (3 sentences max) summarizing what customers collectively say about this business. Written in third person. Use specific details from the reviews.

Return valid JSON only.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";

    // Parse, handling potential JSON issues
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      heroQuote: parsed.heroQuote || "",
      heroReviewerName: parsed.heroReviewerName || "",
      topThemes: parsed.topThemes || [],
      uniqueStrength: parsed.uniqueStrength || "",
      suggestedHeadline: parsed.suggestedHeadline || `${businessName}. Trusted by your community.`,
      customerVoiceSummary: parsed.customerVoiceSummary || "",
    };
  } catch (err: any) {
    logger.error({ err: err.message }, "[ReviewThemeExtractor] Error:");
    // Graceful fallback
    const best = [...reviews]
      .filter((r) => r.rating >= 4)
      .sort((a, b) => b.text.length - a.text.length)[0];

    return {
      heroQuote: best?.text?.slice(0, 150) || "",
      heroReviewerName: best?.authorName || "",
      topThemes: [],
      uniqueStrength: "",
      suggestedHeadline: `${businessName}. See why customers keep coming back.`,
      customerVoiceSummary: "",
    };
  }
}
