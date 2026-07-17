type RankingRecommendation = {
  priority?: number;
  title?: string;
  description?: string;
  impact?: string;
  effort?: string;
  timeline?: string;
  expected_outcome?: string;
  generic?: boolean;
};

type RankingGap = {
  type?: string;
  area?: string;
  reason?: string;
  recommended_action?: string;
};

type RankingLlmGuardrailContext = {
  visibleScore?: number | null;
  searchPosition?: number | null;
};

const WEBSITE_ACTION_PATTERN =
  /\b(website|web provider|page speed|pagespeed|site speed|speed up|load time|loading|core web vitals|lighthouse|performance score)\b/i;
const GOOGLE_POST_PATTERN =
  /\b(?:google(?: business profile)?|gbp|business profile)\s+(?:posts?|updates?)\b|\bposting\b|\bposts?\b/i;
const POST_RANK_OUTCOME_PATTERN =
  /\b(?:(?:protect|improve|widen|boost|lift|raise|strengthen|maintain|hold|advance|move|recover)\w*\b[^.!?]{0,96}\b(?:rank(?:ing)?|position|standing|lead|top[- ](?:three|3|20)|local search|map pack|visibility|findability)\b|(?:break into|move (?:closer|toward)|show up in|climb|outrank)\b|(?:rank(?:ing)?|position|standing|lead|top[- ](?:three|3|20)|local search|map pack|visibility|findability)\b[^.!?]{0,80}\b(?:by|from|through|with|because of)\b)/i;
const RECOMMENDED_ACTION_PREFIX = /^recommended action:\s*/i;
const WEEKLY_POST_PATTERN = /\b(?:weekly|each week|every week|once a week)\b/i;
const HONEST_POST_ACTION =
  "Publish a useful Google post to keep your profile current for patients who are deciding";
const HONEST_WEEKLY_POST_ACTION =
  "Publish a useful Google post weekly to keep your profile current for patients who are deciding";
const LEADER_SEARCH_POSITION = 1;
const TOP_THREE_SEARCH_POSITIONS = new Set([2, 3]);

// Generic, data-less safety net. Each entry is flagged `generic: true` as a forward
// contract: the cross-stage selector (Summary v2) is meant to de-prioritize a generic
// candidate in favor of a specific, caught-unseen one from another stage. Wiring that
// consumer is Chapter 7's job; today the flag is an honest passthrough (emitted, not
// yet read). Copy is relief-first (leads with what is already working), never
// deficit-framed. This should fire rarely; a specific LLM recommendation is the norm.
const SAFE_RECOMMENDATION_BACKFILL: RankingRecommendation[] = [
  {
    title: "Your reviews are already working for you",
    description:
      "Recent reviews are helping patients choose you. Asking each happy patient for one keeps that trust growing.",
    impact: "high",
    effort: "low",
    timeline: "30 days",
    expected_outcome: "Fresh reviews that keep your local search trust signals strong.",
    generic: true,
  },
  {
    title: "Your Google profile is active, keep it fresh",
    description:
      "An active profile reassures patients before they call. One useful Google post a week keeps it looking cared-for.",
    impact: "medium",
    effort: "low",
    timeline: "30 days",
    expected_outcome: "A profile that stays current without extra dashboard clutter.",
    generic: true,
  },
  {
    title: "Your photos make a strong first impression",
    description:
      "Patients look at your photos before they call. A few current office and team photos keep that impression current.",
    impact: "medium",
    effort: "low",
    timeline: "2 weeks",
    expected_outcome: "A complete profile that reassures patients at the first look.",
    generic: true,
  },
];

function textMatchesWebsiteAction(...values: unknown[]): boolean {
  return values.some(
    (value) => typeof value === "string" && WEBSITE_ACTION_PATTERN.test(value),
  );
}

function stripWebsiteActionSentences(value: unknown): unknown {
  if (typeof value !== "string" || !WEBSITE_ACTION_PATTERN.test(value)) {
    return value;
  }

  const cleaned = value
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !WEBSITE_ACTION_PATTERN.test(sentence))
    .join(" ")
    .trim();

  return cleaned || null;
}

function normalizeVisibleScoreMentions(
  value: unknown,
  visibleScore: number | null | undefined,
): unknown {
  if (typeof value !== "string" || typeof visibleScore !== "number") {
    return value;
  }
  if (!Number.isFinite(visibleScore)) return value;
  const scoreLabel = `${Math.round(visibleScore)}/100`;

  return value
    .replace(/\b\d{2,3}\s*\/\s*\d{2,3}\s*\/\s*100\b/g, scoreLabel)
    .replace(/\b\d{2,3}(?:\.\d+)?\s*\/\s*100\b/g, scoreLabel)
    .replace(
      /(?<!\/)\b\d{2,3}(?:\.\d+)?(?!\s*\/)\s+score\b/g,
      `${scoreLabel} score`,
    )
    .replace(/\ban\s+(\d{2,3}\/100 score)\b/g, "a $1");
}

function normalizeOwnerRankingLanguage(value: unknown): unknown {
  if (typeof value !== "string") return value;

  return value
    .replace(
      /\bestimated at position\s+(\d+)\s+on\s+Google Maps\b/gi,
      "ranked #$1 in Local Search",
    )
    .replace(
      /\bestimated at position\s+(\d+)\b/gi,
      "ranked #$1",
    )
    .replace(
      /\bestimated\s+#?(\d+)\s+(?:on|in)\s+(?:Google Maps|Maps|Local Search)\b/gi,
      "ranked #$1 in Local Search",
    )
    .replace(/\bposition\s+(\d+)\s+on\s+Maps\b/gi, "position #$1 in Local Search")
    .replace(/\bon\s+Google Maps\b/g, "in Local Search")
    .replace(/\bon\s+Maps\b/g, "in Local Search");
}

function normalizeLeadProtectionLanguage(
  value: unknown,
  context: RankingLlmGuardrailContext,
): unknown {
  if (typeof value !== "string") return value;
  if (context.searchPosition === LEADER_SEARCH_POSITION) return value;

  if (
    context.searchPosition != null &&
    TOP_THREE_SEARCH_POSITIONS.has(context.searchPosition)
  ) {
    return value
      .replace(
        /\bto protect and improve the position\b/gi,
        "to widen the top-three standing",
      )
      .replace(
        /\bprotect and improve the position\b/gi,
        "widen the top-three standing",
      )
      .replace(/\bto protect the lead\b/gi, "to protect the top-three standing")
      .replace(/\bprotect the lead\b/gi, "protect the top-three standing")
      .replace(/\bprotecting the lead\b/gi, "protecting the top-three standing")
      .replace(/\bprotect that lead\b/gi, "protect that top-three standing");
  }

  return value
    .replace(/\bto protect and improve the position\b/gi, "to improve the position")
    .replace(/\bprotect and improve the position\b/gi, "improve the position")
    .replace(/\bto protect the lead\b/gi, "to improve the position")
    .replace(/\bprotect the lead\b/gi, "improve the position")
    .replace(/\bprotecting the lead\b/gi, "improving the position")
    .replace(/\bprotect that lead\b/gi, "improve that position");
}

function rewritePostRankSentence(sentence: string): string {
  if (
    !GOOGLE_POST_PATTERN.test(sentence) ||
    !POST_RANK_OUTCOME_PATTERN.test(sentence)
  ) {
    return sentence;
  }

  const trimmed = sentence.trim();
  const punctuation = /[.!?]$/.test(trimmed) ? trimmed.slice(-1) : "";
  const withoutPunctuation = punctuation ? trimmed.slice(0, -1) : trimmed;
  const prefixMatch = withoutPunctuation.match(RECOMMENDED_ACTION_PREFIX);
  const actionPrefix = prefixMatch?.[0] ?? "";
  const body = actionPrefix
    ? withoutPunctuation.slice(actionPrefix.length)
    : withoutPunctuation;
  const postIndex = body.search(GOOGLE_POST_PATTERN);
  const factSeparator = postIndex > 0 ? body.lastIndexOf(",", postIndex) : -1;
  const rankFactPrefix =
    factSeparator >= 0 ? body.slice(0, factSeparator).trim() : "";
  const honestAction = WEEKLY_POST_PATTERN.test(body)
    ? HONEST_WEEKLY_POST_ACTION
    : HONEST_POST_ACTION;
  const rewrittenAction = `${actionPrefix}${honestAction}${punctuation}`;

  return rankFactPrefix
    ? `${rankFactPrefix}. ${rewrittenAction}`
    : rewrittenAction;
}

function rewritePostRankClaims(value: unknown): unknown {
  if (
    typeof value !== "string" ||
    !GOOGLE_POST_PATTERN.test(value) ||
    !POST_RANK_OUTCOME_PATTERN.test(value)
  ) {
    return value;
  }

  return value
    .split(/(?<=[.!?])\s+/u)
    .map(rewritePostRankSentence)
    .join(" ");
}

function sanitizeText(
  value: unknown,
  context: RankingLlmGuardrailContext,
): unknown {
  return rewritePostRankClaims(
    normalizeLeadProtectionLanguage(
      normalizeOwnerRankingLanguage(
        normalizeVisibleScoreMentions(
          stripWebsiteActionSentences(value),
          context.visibleScore,
        ),
      ),
      context,
    ),
  );
}

function sanitizeOptionalText(
  value: string | undefined,
  context: RankingLlmGuardrailContext,
): string | undefined {
  const sanitized = sanitizeText(value, context);
  return typeof sanitized === "string" ? sanitized : undefined;
}

function sanitizeHighlights(
  value: unknown,
  context: RankingLlmGuardrailContext,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => sanitizeText(entry, context))
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, 3);
}

function sanitizeRecommendation(
  recommendation: RankingRecommendation,
  context: RankingLlmGuardrailContext,
): RankingRecommendation {
  return {
    ...recommendation,
    title: sanitizeOptionalText(recommendation.title, context),
    description: sanitizeOptionalText(recommendation.description, context),
    timeline: sanitizeOptionalText(recommendation.timeline, context),
    expected_outcome: sanitizeOptionalText(
      recommendation.expected_outcome,
      context,
    ),
  };
}

function sanitizeGap(
  gap: RankingGap,
  context: RankingLlmGuardrailContext,
): RankingGap {
  return {
    ...gap,
    reason: sanitizeOptionalText(gap.reason, context),
    recommended_action: sanitizeOptionalText(gap.recommended_action, context),
  };
}

function isWebsiteActionRecommendation(rec: RankingRecommendation): boolean {
  return textMatchesWebsiteAction(
    rec.title,
    rec.description,
    rec.expected_outcome,
    rec.timeline,
  );
}

function isWebsiteActionGap(gap: RankingGap): boolean {
  return textMatchesWebsiteAction(
    gap.type,
    gap.area,
    gap.reason,
    gap.recommended_action,
  );
}

function backfillRecommendations(
  recommendations: RankingRecommendation[],
): RankingRecommendation[] {
  const titles = new Set(
    recommendations.map((rec) => rec.title?.toLowerCase()).filter(Boolean),
  );
  const next = [...recommendations];

  // The Local Rankings 1-ACTION banner shows a single recommendation. Pad to
  // 1 (covers an empty LLM result) and cap at 1.
  // plans/06102026-local-rankings-simplification.
  for (const fallback of SAFE_RECOMMENDATION_BACKFILL) {
    if (next.length >= 1) break;
    const key = fallback.title?.toLowerCase();
    if (key && titles.has(key)) continue;
    next.push({ ...fallback, priority: next.length + 1 });
    if (key) titles.add(key);
  }

  return next.map((rec, index) => ({ ...rec, priority: index + 1 })).slice(0, 1);
}

export function sanitizeRankingLlmAnalysis<T extends Record<string, any>>(
  analysis: T,
  context: RankingLlmGuardrailContext = {},
): T {
  const next: Record<string, any> = { ...analysis };
  const recommendations = Array.isArray(next.top_recommendations)
    ? next.top_recommendations
        .filter(
          (rec: RankingRecommendation) => !isWebsiteActionRecommendation(rec),
        )
        .map((rec: RankingRecommendation) =>
          sanitizeRecommendation(rec, context),
        )
    : [];
  const gaps = Array.isArray(next.gaps)
    ? next.gaps
        .filter((gap: RankingGap) => !isWebsiteActionGap(gap))
        .map((gap: RankingGap) => sanitizeGap(gap, context))
    : [];

  next.top_recommendations = backfillRecommendations(recommendations);
  next.gaps = gaps.slice(0, 4);
  next.render_text = sanitizeText(next.render_text, context);
  next.client_summary = sanitizeText(next.client_summary, context);
  next.one_line_summary = sanitizeText(next.one_line_summary, context);
  next.drivers = Array.isArray(next.drivers)
    ? next.drivers.map((driver: Record<string, any>) => ({
        ...driver,
        insight: sanitizeText(driver.insight, context),
      }))
    : next.drivers;
  next.citations = Array.isArray(next.citations)
    ? next.citations.filter(
        (citation: unknown) => !textMatchesWebsiteAction(citation),
      )
    : next.citations;

  if (next.overview_card && typeof next.overview_card === "object") {
    next.overview_card = {
      ...next.overview_card,
      text: sanitizeText(next.overview_card.text, context),
      highlights: sanitizeHighlights(next.overview_card.highlights, context),
    };
  }

  if (next.engagement_card && typeof next.engagement_card === "object") {
    next.engagement_card = {
      ...next.engagement_card,
      title: sanitizeText(next.engagement_card.title, context),
      text: sanitizeText(next.engagement_card.text, context),
      highlights: sanitizeHighlights(next.engagement_card.highlights, context),
      sentiment: sanitizeText(next.engagement_card.sentiment, context),
    };
  }

  return next as T;
}
