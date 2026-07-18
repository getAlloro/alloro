import { OrgType } from "../../../config/orgLabels";
import { substitutePromptPlaceholders } from "../../../agents/service.prompt-substituter";

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
  orgType?: OrgType;
};

const WEBSITE_ACTION_PATTERN =
  /\b(website|web provider|page speed|pagespeed|site speed|speed up|load time|loading|core web vitals|lighthouse|performance score)\b/i;
const GOOGLE_POST_PATTERN =
  /\b(?:google(?: business profile)?|gbp|business profile)\s+(?:posts?|updates?)\b|\bposting\b|\bposts?\b/i;
const POST_SOURCE =
  "(?:(?:google(?: business profile)?|gbp|business profile)\\s+(?:posts?|updates?)|posting|posts?)";
const RANK_OUTCOME =
  "(?:rank(?:ing|ings)?|position|standing|lead|top[- ](?:three|3|20)|" +
  "local search|map pack|google maps|maps|visibility|visible|findability)";
const POST_CAUSAL_VERB =
  "(?:protect|improve|widen|boost|lift|raise|strengthen|maintain|hold|" +
  "advance|move|recover|stay|remain|support|help|keep|get|show|appear|" +
  "rank|break|climb|outrank|drive|push|give|lead|result|produce|cause|" +
  "deliver|secure)";
/**
 * A coordinator ends the post-source clause only when it introduces an
 * explicit subject before another causal predicate. The negative lookahead
 * prevents the predicate itself (or a normal adverb) from being mistaken for
 * that subject, so "posts consistently improve rankings" remains a claim while
 * "posts help patients and review growth improves rank" splits at `and`.
 */
const COORDINATED_NEW_CAUSAL_SUBJECT = new RegExp(
  `\\b(?:and|but|or|yet|while|whereas)\\s+` +
    `(?:(?!(?:${POST_CAUSAL_VERB})\\w*\\b|[a-z][a-z'-]*ly\\b)` +
    `[a-z][a-z'-]{0,23}\\s+){1,4}` +
    `(?=(?:${POST_CAUSAL_VERB})\\w*\\b)`,
  "i",
);
const POST_SOURCE_CAUSAL_OUTCOME = new RegExp(
  `\\b${POST_CAUSAL_VERB}\\w*\\b[^.!?;]{0,64}\\b${RANK_OUTCOME}\\b`,
  "i",
);
const RANK_OUTCOME_FROM_POST = new RegExp(
  `\\b${RANK_OUTCOME}\\b[^.!?;]{0,80}\\b` +
    `(?:by|from|through|with|because\\s+of|due\\s+to|using)\\b` +
    `[^.!?;]{0,48}\\b${POST_SOURCE}\\b`,
  "i",
);
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
// yet read).
// HONESTY CONSTRAINT (do not weaken): this path receives NO practice data, so every line
// must be true for ANY practice. State only why a lever matters (a general truth) and the
// forward action to take. NEVER assert this practice's current state — "your reviews are
// working", "your profile is active", "your photos are strong" — because with no data
// those can be false, and a false claim to an owner breaks the honesty bar. Relief-first
// means non-deficit framing, not a claim of a good state we cannot see.
// This should fire rarely; a specific LLM recommendation is the norm.
const SAFE_RECOMMENDATION_BACKFILL: RankingRecommendation[] = [
  {
    title: "Reviews are the signal {{customers}} weigh most",
    description:
      "A steady stream of reviews is one of the strongest things that helps {{customers}} choose a {{org_noun}}. Asking each happy {{customer}} for one is the simplest way to keep them coming.",
    impact: "high",
    effort: "low",
    timeline: "30 days",
    expected_outcome: "Fresh reviews that strengthen your local search trust signals.",
    generic: true,
  },
  {
    title: "An up-to-date profile reassures {{customers}}",
    description:
      "An up-to-date Google profile reassures {{customers}} before they call. One useful post a week is enough to keep it current.",
    impact: "medium",
    effort: "low",
    timeline: "30 days",
    expected_outcome: "A profile that stays current without extra dashboard clutter.",
    generic: true,
  },
  {
    title: "Photos are often the first thing {{customers}} check",
    description:
      "Many {{customers}} look at your photos before they call. A few current office and team photos keep that first impression strong.",
    impact: "medium",
    effort: "low",
    timeline: "2 weeks",
    expected_outcome: "Photos that reassure {{customers}} at the first look.",
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
  if (!hasPostToRankCausalClaim(sentence)) {
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

function hasPostToRankCausalClaim(sentence: string): boolean {
  if (RANK_OUTCOME_FROM_POST.test(sentence)) {
    return true;
  }

  const sourceScan = new RegExp(`\\b${POST_SOURCE}\\b`, "gi");
  let source: RegExpExecArray | null;
  while ((source = sourceScan.exec(sentence)) !== null) {
    const afterSource = sentence.slice(source.index + source[0].length);
    const boundaryCandidates = [
      afterSource.search(/[.!?;]/),
      afterSource.search(COORDINATED_NEW_CAUSAL_SUBJECT),
    ].filter((index) => index >= 0);
    const boundary =
      boundaryCandidates.length > 0 ? Math.min(...boundaryCandidates) : -1;
    const sourceClause =
      boundary >= 0 ? afterSource.slice(0, boundary) : afterSource;
    if (POST_SOURCE_CAUSAL_OUTCOME.test(sourceClause)) {
      return true;
    }
  }
  return false;
}

function rewritePostRankClaims(value: unknown): unknown {
  if (typeof value !== "string" || !hasPostToRankCausalClaim(value)) {
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

// The prompt bans these as a single recommendation ("generic homework any tool
// says"). Enforce it in code: a recommendation whose action IS one of these
// literal generic phrases is dropped so backfillRecommendations replaces it with
// the honest safe copy. The regex catches the explicit ban list, not every
// paraphrase — full "no generic homework" needs the recommendation-quality eval.
const BANNED_GENERIC_ACTION_PATTERN =
  /\b(get more reviews|post more often|add more photos|keep review momentum|rating is lower than average)\b/i;

function isBannedGenericHomework(rec: RankingRecommendation): boolean {
  return (
    BANNED_GENERIC_ACTION_PATTERN.test(rec.title ?? "") ||
    BANNED_GENERIC_ACTION_PATTERN.test(rec.description ?? "")
  );
}

// Translate the static fallback copy into the org's vocabulary. The fallback
// tokens ({{customers}}, {{org_noun}}) resolve to health terms for health orgs
// (byte-identical) and business terms for generic orgs.
function substituteVocab(
  text: string | undefined,
  orgType?: OrgType,
): string | undefined {
  if (!text) return text;
  // Default to health when unknown so tokens always resolve (never leak a raw
  // {{token}}); health terms are byte-identical to the original copy.
  return substitutePromptPlaceholders(text, orgType ?? "health");
}

function backfillRecommendations(
  recommendations: RankingRecommendation[],
  orgType?: OrgType,
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
    next.push({
      ...fallback,
      title: substituteVocab(fallback.title, orgType),
      description: substituteVocab(fallback.description, orgType),
      expected_outcome: substituteVocab(fallback.expected_outcome, orgType),
      priority: next.length + 1,
    });
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
          (rec: RankingRecommendation) =>
            !isWebsiteActionRecommendation(rec) &&
            !isBannedGenericHomework(rec),
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

  next.top_recommendations = backfillRecommendations(
    recommendations,
    context.orgType,
  );
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
