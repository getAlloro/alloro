/**
 * Client Taste Profile — composition + Tier-2 honesty gate (Slice 2).
 *
 * Wires together the outputs of extractors Alloro ALREADY has into one
 * persisted, source-linked profile per business. This is a compose + gate,
 * NOT a new extraction engine (§6.1 analog: `gbp-automation`'s feature-services
 * orchestrate; the extractors stay where they are):
 *
 *   - `reviewThemeExtractor` (ThemeExtractionResult)  → hero quote, praise
 *     themes, unique strength, suggested headline.
 *   - `service.identity-distillation` (DistilledContent) → voice archetype,
 *     doctor credentials (already source_url-disciplined).
 *   - `extractPracticeFacts` (verbatim source_excerpt facts) → practice facts.
 *
 * ALLORO'S ADDITION (Owner.com does not do this): the Customer-Journey /
 * hesitation layer — WHY customers choose (derived from the same sourced praise
 * themes) and WHAT makes them hesitate (only from real hesitation signals; empty
 * when absent, never fabricated).
 *
 * HONESTY (Tier 2, Value #6): every claim is run through the gate in
 * `../feature-utils/util.taste-profile-honesty`:
 *   - no real source  → DROPPED (Tier 1: empty field, never invented).
 *   - banned language → REJECTED (rank/visibility/guarantee/invented metric).
 * The kept result + a full audit of what was dropped/rejected is returned; the
 * caller persists it via `TasteProfileModel`. This module does NO DB access and
 * makes NO network calls — it operates on already-computed extractor outputs,
 * which is what makes it deterministically testable with mocked inputs.
 */

import type { ThemeExtractionResult } from "../../../services/reviewThemeExtractor";
import type { DistilledContent } from "./service.identity-distillation";
import {
  enforceHonesty,
  isRealSource,
} from "../feature-utils/util.taste-profile-honesty";

// ---------------------------------------------------------------------------
// PUBLIC SHAPES
// ---------------------------------------------------------------------------

/** A single verifiable claim: the text plus the real source it traces back to. */
export interface SourcedClaim {
  value: string;
  /** review id, GBP field, page URL, or intake ref — a human can click it back. */
  source: string;
}

/** The persisted, gated profile the website reads for its content slots. */
export interface TasteProfile {
  business_name: string;
  business_category: string;
  voice: {
    archetype: string;
    tone_descriptor: string;
  };
  hero_quote: SourcedClaim | null;
  /** Generated hero copy — honesty-gated, but not a sourced factual claim. */
  suggested_headline: string;
  unique_strength: SourcedClaim | null;
  praise_themes: SourcedClaim[];
  credentials: SourcedClaim[];
  practice_facts: SourcedClaim[];
  customer_journey: {
    why_they_choose: SourcedClaim[];
    what_makes_them_hesitate: SourcedClaim[];
  };
}

/** A claim candidate before gating — source may be missing (then it's dropped). */
export interface SourcedCandidate {
  value: string;
  source: string | null | undefined;
}

/** The full set of candidate claims feeding one profile (what the gate consumes). */
export interface TasteProfileCandidates {
  business_name: string;
  business_category: string;
  voice: { archetype: string; tone_descriptor: string };
  suggested_headline?: string;
  hero_quote?: SourcedCandidate | null;
  unique_strength?: SourcedCandidate | null;
  praise_themes?: SourcedCandidate[];
  credentials?: SourcedCandidate[];
  practice_facts?: SourcedCandidate[];
  why_they_choose?: SourcedCandidate[];
  what_makes_them_hesitate?: SourcedCandidate[];
}

export interface DroppedClaim {
  field: string;
  value: string;
  reason: "no_source";
}

export interface RejectedClaim {
  field: string;
  value: string;
  reasonCodes: string[];
}

export interface TasteProfileAudit {
  kept: number;
  dropped: DroppedClaim[];
  rejected: RejectedClaim[];
}

export interface TasteProfileCompositionResult {
  profile: TasteProfile;
  audit: TasteProfileAudit;
}

// ---------------------------------------------------------------------------
// THE GATE (per-claim)
// ---------------------------------------------------------------------------

type GateOutcome =
  | { kind: "empty" }
  | { kind: "kept"; claim: SourcedClaim }
  | { kind: "dropped"; dropped: DroppedClaim }
  | { kind: "rejected"; rejected: RejectedClaim };

/**
 * Gate one candidate:
 *  - empty value    → absent (Tier 1: empty field, not an error).
 *  - no real source → DROPPED (cannot trace the line to a receipt).
 *  - banned language→ REJECTED (rank/visibility/guarantee/invented metric).
 *  - otherwise      → KEPT with a normalized {value, source}.
 */
function gateClaim(field: string, candidate: SourcedCandidate): GateOutcome {
  const value = (candidate.value ?? "").trim();
  if (value.length === 0) return { kind: "empty" };

  if (!isRealSource(candidate.source)) {
    return { kind: "dropped", dropped: { field, value, reason: "no_source" } };
  }

  const honesty = enforceHonesty(value);
  if (!honesty.ok) {
    return {
      kind: "rejected",
      rejected: { field, value, reasonCodes: honesty.reasonCodes },
    };
  }

  return {
    kind: "kept",
    claim: { value, source: (candidate.source as string).trim() },
  };
}

// ---------------------------------------------------------------------------
// COMPOSITION
// ---------------------------------------------------------------------------

/**
 * Compose + honesty-gate a set of candidates into one Taste Profile plus a full
 * audit of what was kept / dropped / rejected. Pure and deterministic — no DB,
 * no network. Absent inputs yield empty fields (never fabricated ones).
 */
export function composeTasteProfile(
  candidates: TasteProfileCandidates
): TasteProfileCompositionResult {
  const audit: TasteProfileAudit = { kept: 0, dropped: [], rejected: [] };

  const single = (field: string, c?: SourcedCandidate | null): SourcedClaim | null => {
    if (!c) return null;
    const outcome = gateClaim(field, c);
    return applyOutcome(outcome, audit);
  };

  const many = (field: string, list?: SourcedCandidate[]): SourcedClaim[] => {
    if (!Array.isArray(list)) return [];
    const kept: SourcedClaim[] = [];
    for (const c of list) {
      const claim = applyOutcome(gateClaim(field, c), audit);
      if (claim) kept.push(claim);
    }
    return kept;
  };

  // Generated copy (no source) — honesty-gated only; a tripped headline is
  // dropped to empty and recorded, never shown.
  const suggested_headline = gateGeneratedCopy(
    "suggested_headline",
    candidates.suggested_headline,
    audit
  );

  const profile: TasteProfile = {
    business_name: candidates.business_name,
    business_category: candidates.business_category,
    voice: {
      archetype: candidates.voice.archetype,
      tone_descriptor: candidates.voice.tone_descriptor,
    },
    hero_quote: single("hero_quote", candidates.hero_quote),
    suggested_headline,
    unique_strength: single("unique_strength", candidates.unique_strength),
    praise_themes: many("praise_themes", candidates.praise_themes),
    credentials: many("credentials", candidates.credentials),
    practice_facts: many("practice_facts", candidates.practice_facts),
    customer_journey: {
      why_they_choose: many("why_they_choose", candidates.why_they_choose),
      what_makes_them_hesitate: many(
        "what_makes_them_hesitate",
        candidates.what_makes_them_hesitate
      ),
    },
  };

  return { profile, audit };
}

function applyOutcome(
  outcome: GateOutcome,
  audit: TasteProfileAudit
): SourcedClaim | null {
  switch (outcome.kind) {
    case "kept":
      audit.kept += 1;
      return outcome.claim;
    case "dropped":
      audit.dropped.push(outcome.dropped);
      return null;
    case "rejected":
      audit.rejected.push(outcome.rejected);
      return null;
    case "empty":
    default:
      return null;
  }
}

/**
 * Generated copy carries no source, so it is honesty-gated only. Banned
 * language empties the field (recorded as rejected); clean copy passes through.
 */
function gateGeneratedCopy(
  field: string,
  text: string | undefined,
  audit: TasteProfileAudit
): string {
  const value = (text ?? "").trim();
  if (value.length === 0) return "";
  const honesty = enforceHonesty(value);
  if (!honesty.ok) {
    audit.rejected.push({ field, value, reasonCodes: honesty.reasonCodes });
    return "";
  }
  return value;
}

// ---------------------------------------------------------------------------
// ADAPTER — real extractor outputs → candidates
// ---------------------------------------------------------------------------

/** A review as Alloro stores it, carrying the id/url the source link points at. */
export interface ReviewRef {
  id?: string | number;
  url?: string;
  authorName?: string;
  text?: string;
}

/** A practice fact as produced by extractPracticeFacts (verbatim-sourced). */
export interface PracticeFactRef {
  fact_text: string;
  source_field: string;
  source_excerpt: string;
}

/** The already-computed extractor outputs to compose into one profile. */
export interface ExtractorBundle {
  businessName: string;
  businessCategory: string;
  themeResult: ThemeExtractionResult;
  distilled: DistilledContent;
  archetype: { archetype: string; tone_descriptor: string; voice_samples?: string[] };
  practiceFacts?: PracticeFactRef[];
  reviews?: ReviewRef[];
  /**
   * Real hesitation signals (e.g. from reviewSentiment negative reviews). The
   * "what makes them hesitate" layer is populated ONLY from these — absent →
   * empty, never invented.
   */
  hesitationSignals?: SourcedCandidate[];
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Resolve a review-derived quote/name back to a real review's id or url so the
 * claim is source-linked. Returns null when no review matches — the claim is
 * then dropped by the gate (we never fabricate a source).
 */
function resolveReviewSource(
  reviewerName: string | undefined,
  quote: string | undefined,
  reviews: ReviewRef[]
): string | null {
  const nameKey = reviewerName ? normalize(reviewerName) : "";
  const quoteKey = quote ? normalize(quote) : "";

  const match = reviews.find((r) => {
    const rName = r.authorName ? normalize(r.authorName) : "";
    const rText = r.text ? normalize(r.text) : "";
    if (nameKey && rName && rName === nameKey) return true;
    if (quoteKey && rText && (rText.includes(quoteKey) || quoteKey.includes(rText)))
      return true;
    return false;
  });

  if (!match) return null;
  if (match.url) return match.url;
  if (match.id !== undefined && match.id !== null) return `review:${match.id}`;
  return null;
}

/**
 * Map real extractor outputs onto candidate claims, attaching sources where the
 * extractors provide them. This is the wire-together; the honesty gate in
 * `composeTasteProfile` then drops/rejects per Value #6.
 *
 * Note on provenance coverage (honest V1): reviewThemeExtractor's hero quote /
 * themes are resolved to review ids; identity-distillation's doctor entries
 * carry `source_url`; practice facts carry a verbatim `source_excerpt`. The
 * distilled UVP / core_values are NOT emitted with per-item provenance by the
 * current extractor, so they are intentionally omitted here rather than shipped
 * without a source — adding them is a fast-follow once the extractor attaches
 * per-claim sources.
 */
export function buildCandidatesFromExtractors(
  bundle: ExtractorBundle
): TasteProfileCandidates {
  const reviews = bundle.reviews ?? [];
  const theme = bundle.themeResult;

  const hero_quote: SourcedCandidate | null = theme.heroQuote
    ? {
        value: theme.heroQuote,
        source: resolveReviewSource(theme.heroReviewerName, theme.heroQuote, reviews),
      }
    : null;

  const praise_themes: SourcedCandidate[] = (theme.topThemes ?? []).map((t) => ({
    value: t.exampleQuote ? `${t.theme}: ${t.exampleQuote}` : t.theme,
    source: resolveReviewSource(t.reviewerName, t.exampleQuote, reviews),
  }));

  // "Why they choose" = the same sourced praise themes, framed as the journey
  // driver. Kept honest by carrying the identical review source.
  const why_they_choose: SourcedCandidate[] = (theme.topThemes ?? []).map((t) => ({
    value: `Customers choose ${bundle.businessName} for ${t.theme.toLowerCase()}.`,
    source: resolveReviewSource(t.reviewerName, t.exampleQuote, reviews),
  }));

  // unique_strength is a synthesized line with no per-item review source in the
  // extractor output; without a real source it will be dropped by the gate.
  const unique_strength: SourcedCandidate | null = theme.uniqueStrength
    ? { value: theme.uniqueStrength, source: null }
    : null;

  // Doctor credentials from identity-distillation — already source_url-disciplined.
  const credentials: SourcedCandidate[] = (bundle.distilled.doctors ?? []).flatMap((d) =>
    (d.credentials ?? []).map((cred) => ({
      value: `${d.name}: ${cred}`,
      source: d.source_url,
    }))
  );

  // Practice facts — verbatim source_excerpt IS the receipt; the GBP/page field
  // plus the excerpt form the clickable-back source reference. A fact whose
  // excerpt is empty/whitespace has no receipt, so it is dropped here rather
  // than built into a hollow `page_content: ""` source.
  const practice_facts: SourcedCandidate[] = (bundle.practiceFacts ?? [])
    .filter((f) => (f.source_excerpt ?? "").trim().length > 0)
    .map((f) => ({
      value: f.fact_text,
      source: `${f.source_field}: "${f.source_excerpt.slice(0, 80)}"`,
    }));

  return {
    business_name: bundle.businessName,
    business_category: bundle.businessCategory,
    voice: {
      archetype: bundle.archetype.archetype,
      tone_descriptor: bundle.archetype.tone_descriptor,
    },
    suggested_headline: theme.suggestedHeadline,
    hero_quote,
    unique_strength,
    praise_themes,
    credentials,
    practice_facts,
    why_they_choose,
    what_makes_them_hesitate: bundle.hesitationSignals ?? [],
  };
}

/** Convenience: adapter + compose in one call (used by the persist orchestration). */
export function composeFromExtractors(
  bundle: ExtractorBundle
): TasteProfileCompositionResult {
  return composeTasteProfile(buildCandidatesFromExtractors(bundle));
}
