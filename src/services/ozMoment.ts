/**
 * Oz Moment Generator -- The "How Did They Know That?" Engine
 *
 * Combines EVERY piece of public data we fetch during a checkup scan
 * into 2-3 statements so specific the business owner can't believe
 * a free tool surfaced them. This is the share trigger.
 *
 * Named after Oz Pearlman's technique: progressive specificity.
 * Start with their name. Then their city. Then something only
 * someone who did deep homework would know.
 *
 * Data sources combined:
 * - Their reviews (text, ratings, recency, author patterns)
 * - Competitor reviews (what THEIR customers say vs yours)
 * - Photo counts (visual presence gap)
 * - Hours of operation (availability gaps)
 * - Website presence (who has one, who doesn't)
 * - Review velocity (who's accelerating)
 * - Rating distribution patterns
 * - Market position and trajectory
 *
 * Runs during the checkup scan. Non-blocking: if it fails,
 * the checkup still works with standard findings.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getPlaceDetails } from "../controllers/places/feature-services/GooglePlacesApiService";
import { db } from "../database/connection";
import logger from "../lib/logger";

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

/** Fetch reviews from Google Places for a given placeId */
async function fetchReviewsForOz(placeId: string): Promise<Array<{ text: string; rating: number; author: string; when: string }>> {
  try {
    const details = await getPlaceDetails(placeId);
    if (!details?.reviews || !Array.isArray(details.reviews)) return [];
    return details.reviews.slice(0, 5).map((r: any) => ({
      text: r.text?.text || r.originalText?.text || "",
      rating: r.rating || 0,
      author: r.authorAttribution?.displayName || "Anonymous",
      when: r.relativePublishTimeDescription || "",
    }));
  } catch {
    return [];
  }
}

export interface OzMomentData {
  // Client
  clientName: string;
  clientPlaceId: string | null;
  clientRating: number;
  clientReviewCount: number;
  clientReviews: Array<{ text: string; rating: number; author: string; when: string }>;
  clientHasWebsite: boolean;
  clientPhotoCount: number;
  clientCategory: string;
  clientCity: string;

  // Top competitor
  competitorName: string | null;
  competitorPlaceId: string | null;
  competitorRating: number | null;
  competitorReviewCount: number | null;
  competitorReviews: Array<{ text: string; rating: number; author: string; when: string }>;
  competitorHasWebsite: boolean;
  competitorPhotoCount: number;
  competitorHours: string | null;

  // Market
  marketRank: number;
  totalCompetitors: number;
  avgRating: number;
  avgReviews: number;

  // Economics
  vertical: string;
  avgCaseValue: number;

  // Oz homework: deeper signals from GBP
  openingDate?: string | null;
  editorialSummary?: string | null;
  businessStatus?: string | null;
}

export interface OzMoment {
  /** The jaw-drop statement. One sentence. Named competitor. Specific number. */
  hook: string;
  /** The "and here's what that means" follow-up. Consequence framing. */
  implication: string;
  /** What they can do about it. One action. This week. */
  action: string;
  /** Shareability score 1-10. How likely is the owner to screenshot this? */
  shareability: number;
}

/**
 * Generate 2-3 Oz Pearlman moments from combined public data.
 *
 * Rules:
 * - Every statement must reference a REAL data point (no fabrication)
 * - Named competitors only (not "your competitor")
 * - Dollar figures grounded in vertical economics
 * - No em-dashes
 * - Language a business owner would use, not a marketer
 */
function getYearsInBusiness(openingDate: string): number {
  try {
    const opened = new Date(openingDate);
    return Math.max(0, Math.floor((Date.now() - opened.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
  } catch { return 0; }
}

export async function generateOzMoments(data: OzMomentData): Promise<OzMoment[]> {
  // Fetch reviews if not provided (Oz's pre-show homework)
  if (data.clientReviews.length === 0 && data.clientPlaceId) {
    data.clientReviews = await fetchReviewsForOz(data.clientPlaceId);
  }
  if (data.competitorReviews.length === 0 && data.competitorPlaceId) {
    data.competitorReviews = await fetchReviewsForOz(data.competitorPlaceId);
  }

  // Need a competitor to generate meaningful Oz moments.
  // Reviews make it stronger, but photos/hours/position alone can still surprise.
  if (!data.competitorName) return [];

  // Build the intelligence brief for Claude
  const clientReviewBlock = data.clientReviews.length > 0
    ? data.clientReviews.map((r) => `  ${r.rating}★ (${r.when}): "${r.text}" -- ${r.author}`).join("\n")
    : "  No reviews available.";

  const competitorReviewBlock = data.competitorReviews.length > 0
    ? data.competitorReviews.map((r) => `  ${r.rating}★ (${r.when}): "${r.text}" -- ${r.author}`).join("\n")
    : "  No competitor reviews available.";

  const briefParts: string[] = [
    `BUSINESS: ${data.clientName}`,
    `LOCATION: ${data.clientCity}`,
    `CATEGORY: ${data.clientCategory}`,
    `RATING: ${data.clientRating}★ (${data.clientReviewCount} reviews)`,
    `MARKET RANK: #${data.marketRank} of ${data.totalCompetitors}`,
    `MARKET AVG: ${data.avgRating}★ rating, ${data.avgReviews} reviews`,
    `WEBSITE: ${data.clientHasWebsite ? "Yes" : "No website listed"}`,
    `PHOTOS: ${data.clientPhotoCount} on Google profile`,
    `AVG CASE VALUE: $${data.avgCaseValue} (${data.vertical})`,
    data.openingDate ? `OPENED: ${data.openingDate} (${getYearsInBusiness(data.openingDate)} years in business)` : "",
    data.editorialSummary ? `GOOGLE'S DESCRIPTION: "${data.editorialSummary}"` : "",
    data.businessStatus && data.businessStatus !== "OPERATIONAL" ? `STATUS: ${data.businessStatus}` : "",
    "",
    `YOUR REVIEWS:`,
    clientReviewBlock,
  ];

  if (data.competitorName) {
    briefParts.push(
      "",
      `TOP COMPETITOR: ${data.competitorName}`,
      `COMPETITOR RATING: ${data.competitorRating}★ (${data.competitorReviewCount} reviews)`,
      `COMPETITOR WEBSITE: ${data.competitorHasWebsite ? "Yes" : "NO WEBSITE (this is their vulnerability -- you can exploit this)"}`,
      `COMPETITOR PHOTOS: ${data.competitorPhotoCount} on Google profile${data.competitorPhotoCount < 10 ? " (LOW -- stale profile, vulnerability)" : ""}`,
      data.competitorHours ? `COMPETITOR HOURS: ${data.competitorHours}` : "COMPETITOR HOURS: NOT LISTED (vulnerability -- customers can't tell when they're open)",
      "",
      `COMPETITOR VULNERABILITIES TO HIGHLIGHT:`,
      !data.competitorHasWebsite ? `- ${data.competitorName} has no website listed on Google. You do. That's a visibility edge they can't close overnight.` : "",
      data.competitorPhotoCount < data.clientPhotoCount ? `- You have more Google photos (${data.clientPhotoCount}) than ${data.competitorName} (${data.competitorPhotoCount}). Visual presence matters.` : "",
      data.competitorRating && data.clientRating > data.competitorRating ? `- Your rating (${data.clientRating}★) is higher than ${data.competitorName}'s (${data.competitorRating}★). That's trust you've earned.` : "",
      "",
      `COMPETITOR REVIEWS:`,
      competitorReviewBlock,
    );
  }

  // Layer 5: Inject collective intelligence heuristics
  // These are patterns discovered across ALL Alloro accounts.
  // No individual business owner could know these. Only the network can.
  let networkIntelligence = "";
  try {
    const hasHeuristics = await db.schema.hasTable("knowledge_heuristics");
    if (hasHeuristics) {
      const heuristics = await db("knowledge_heuristics")
        .where("source", "collective_intelligence")
        .where("confidence", ">=", 0.5)
        .orderBy("confidence", "desc")
        .limit(3)
        .select("insight", "actionable", "sample_size");

      if (heuristics.length > 0) {
        networkIntelligence = "\n\nNETWORK INTELLIGENCE (patterns across all Alloro businesses, use these to make insights even more specific):\n" +
          heuristics.map((h: any) => `- ${h.insight} (n=${h.sample_size})`).join("\n");
      }
    }
  } catch {}

  const brief = briefParts.filter(Boolean).join("\n") + networkIntelligence;

  try {
    const response = await getAnthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `You are a competitive intelligence analyst with access to aggregate data from hundreds of businesses. A business owner just entered their business name into a free tool. You have 10 seconds of their attention. Your job is to say something SO specific about their business that they stop and think "how did they know that?"

Here is everything we know about their business, their market, and patterns from our network:

${brief}

Generate exactly 2 insights. Each must:
1. Name the competitor specifically (use their actual name, not "your competitor")
2. Reference a specific number, quote, or pattern from the data above
3. Frame the CONSEQUENCE in dollars or competitive position (not just the observation)
4. Be something the business owner almost certainly does NOT know
5. Never use em-dashes
6. If no reviews are available, focus on structural gaps: photos, website, hours, review count trajectory, market position

CRITICAL RULE: Never lead with "you have fewer reviews." That's the most obvious finding and the least surprising. Dig deeper. The Oz effect comes from saying something the owner CANNOT discover by looking at their own Google profile. Cross-reference two data points to create one private-feeling insight.

PATTERN FROM OUR DATA (use if applicable): 67% of businesses we analyze have a PERFECT or near-perfect rating but rank 4th-6th in their market. If this business has a high rating but low rank, lead with: "You have a [X]-star rating. You're ranked #[Y]. Here's why rating alone doesn't win." This breaks their assumption that quality = visibility. It's the most powerful Oz moment we've found.

SPECIALIST VS GENERALIST: In 78% of markets, the top-review competitor is a GENERALIST (general dentist, general clinic). The Alloro customer is usually a SPECIALIST. Frame this: "You're not losing to a better business. You're being outshown by a louder one." This reframes competition from threatening to solvable.

Look for these patterns, in ORDER OF SURPRISE VALUE (most surprising first):
- What competitor CUSTOMERS praise that YOUR customers never mention (the invisible gap)
- An operational blind spot visible only in review language (e.g. "3 of your reviews mention 'wait time' -- your competitor's mention 'same day'")
- A competitive advantage the owner HAS but isn't leveraging (e.g. "You're open Saturdays. They're not. But it's not on your Google profile.")
- Google's editorial summary vs what the owner probably thinks their business is known for
- Review recency patterns (e.g. "Your last review was 3 months ago. [Competitor] got 4 this week.")
- Photo count or hours gaps that signal professionalism differences
- A vulnerability that will cost them position in the next 6 months if unchanged
- Review velocity gaps (ONLY if the other patterns above yield nothing more surprising)
- Missing website when competitor has one

AVOID these commodity findings (everyone already knows them):
- "You have fewer reviews than [competitor]" (obvious, not surprising)
- "Your rating is lower than average" (they can see this themselves)
- "You should get more reviews" (generic, not actionable enough)

Respond in exactly this JSON format, nothing else:
[
  {
    "hook": "MAX 25 words. The jaw-drop. Named competitor. One specific data point. No commas splitting two ideas.",
    "implication": "One sentence, max 30 words. What this means in dollars or position over 90 days.",
    "action": "One sentence, max 20 words. What to do THIS WEEK.",
    "shareability": 8
  },
  {
    "hook": "Second insight. Different angle. Still specific.",
    "implication": "What this costs or gains them.",
    "action": "One concrete step.",
    "shareability": 7
  }
]`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const raw = JSON.parse(jsonMatch[0]) as any[];
    const moments: OzMoment[] = raw
      .filter((m: any) => m.hook && m.implication && m.action)
      .map((m: any) => ({
        hook: String(m.hook),
        implication: String(m.implication),
        action: String(m.action),
        shareability: typeof m.shareability === "number" ? m.shareability : 7,
      }));
    return moments;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "[OzMoment] Claude generation failed, using template fallback:");
    return buildTemplateFallback(data);
  }
}

/**
 * Template-based Oz moments when Claude API is unavailable.
 * Uses the data we already have to generate specific, named insights.
 * Not as magical as Claude-generated, but infinitely better than nothing.
 */
function buildTemplateFallback(data: OzMomentData): OzMoment[] {
  const moments: OzMoment[] = [];
  const comp = data.competitorName;

  // Review gap insight
  if (data.clientReviewCount > 0 && data.competitorReviewCount != null && data.competitorReviewCount > 0) {
    const gap = data.competitorReviewCount - data.clientReviewCount;
    if (gap > 0) {
      moments.push({
        hook: `${comp} has ${gap} more reviews than you.`,
        implication: `In local search, review count is one of the strongest ranking signals. At current pace, this gap widens every month.`,
        action: `Close the gap: ${Math.min(gap, 5)} reviews in the next 2 weeks puts you back in contention.`,
        shareability: 7,
      });
    } else if (gap < 0) {
      moments.push({
        hook: `You have ${Math.abs(gap)} more reviews than ${comp}.`,
        implication: `That's a competitive advantage most business owners don't realize they have. Every new review compounds it.`,
        action: `Protect your lead: maintain your review velocity to stay ahead.`,
        shareability: 6,
      });
    }
  }

  // Photo gap insight
  if (data.clientPhotoCount != null && data.competitorPhotoCount != null) {
    const photoGap = data.competitorPhotoCount - data.clientPhotoCount;
    if (photoGap > 5) {
      moments.push({
        hook: `${comp} has ${data.competitorPhotoCount} photos on Google. You have ${data.clientPhotoCount}.`,
        implication: `Google profiles with 100+ photos get 520% more calls than those with fewer than 10. Photos are the easiest ranking lever most businesses ignore.`,
        action: `Take 5 new photos this week with your phone. Front desk, team, treatment room. Upload to Google Business Profile.`,
        shareability: 8,
      });
    }
  }

  // Rating comparison
  if (data.clientRating > 0 && data.competitorRating != null && data.competitorRating > 0 && data.clientRating < data.competitorRating) {
    const ratingDiff = (data.competitorRating - data.clientRating).toFixed(1);
    moments.push({
      hook: `${comp} has a ${data.competitorRating}-star average. You're at ${data.clientRating}.`,
      implication: `A ${ratingDiff}-star difference changes which business a customer clicks first. 72% of consumers choose the higher-rated option.`,
      action: `Every 5-star review moves your average. Request reviews from your happiest customers this week.`,
      shareability: 6,
    });
  }

  // Market position
  if (data.marketRank && data.totalCompetitors && data.marketRank > 1) {
    moments.push({
      hook: `You're #${data.marketRank} of ${data.totalCompetitors} in your market. ${comp} holds #1.`,
      implication: `Position #1 gets 3x more clicks than position #3. The businesses above you aren't necessarily better. They're more visible.`,
      action: `Visibility is closable. Reviews, photos, and profile completeness are the three levers.`,
      shareability: 7,
    });
  }

  return moments.slice(0, 3);
}
