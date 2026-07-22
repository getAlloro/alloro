/**
 * CTR principles — the graded, cited knowledge base behind the educated-hypothesis
 * rewrite (brick 2 of the CTR self-optimization loop).
 *
 * WHY THIS FILE IS SHAPED LIKE THIS: "cite your sources" is satisfiable from memory
 * with a fake string. So a principle is not a sentence here — it is a record that
 * cannot exist without a working URL, the specific claim taken from that URL, the
 * date it was fetched, and a GRADE separating a measured study from expert advice.
 * A heuristic can never masquerade as data, because the grade travels with the claim
 * all the way into the returned hypothesis.
 *
 * Every entry below was fetched live on 2026-07-22 and quoted from the page — not
 * recalled. Anything that could not be fetched and quoted did not ship; three such
 * claims are recorded in DISPROVEN_CLAIMS so they cannot quietly re-enter.
 *
 * Alloro invents nothing; it finds and applies.
 */

/** A study reporting numbers, versus expert/official guidance without them. */
export type CtrPrincipleGrade = "measured-finding" | "practitioner-heuristic";

export interface CtrPrincipleSource {
  publisher: string;
  url: string;
  /** YYYY-MM-DD the claim was fetched and quoted from the live page. */
  verifiedViaFetch: string;
}

export interface CtrPrinciple {
  id: string;
  grade: CtrPrincipleGrade;
  /** The specific claim taken from the source, in one line. */
  claim: string;
  /** What the rewrite should actually do about it. */
  guidance: string;
  source: CtrPrincipleSource;
  /** Anything that weakens or bounds the claim. Surfaced, never hidden. */
  caveat?: string;
}

// ---------------------------------------------------------------------------
// Targets
//
// Two different sweet spots from two different metrics:
//   • Backlinko measures CTR      → 40–60 characters click best.
//   • Zyppy measures REWRITE RATE → 51–60 characters are rewritten least.
// A title only wins clicks if Google actually displays it, so the target is the
// overlap that satisfies both: 51–60.
// ---------------------------------------------------------------------------

export const TITLE_TARGET_MIN_CHARS = 51;
export const TITLE_TARGET_MAX_CHARS = 60;
/** Below this, the Backlinko CTR band is missed outright. */
export const TITLE_CTR_BAND_MIN_CHARS = 40;
export const TITLE_MIN_WORDS = 6;
export const TITLE_MAX_WORDS = 9;
/** The house title convention's separator — measured as the most-replaced one. */
export const PIPE_SEPARATOR = "|";

const BACKLINKO: CtrPrincipleSource = {
  publisher: "Backlinko",
  url: "https://backlinko.com/google-ctr-stats",
  verifiedViaFetch: "2026-07-22",
};

const ZYPPY: CtrPrincipleSource = {
  publisher: "Zyppy SEO",
  url: "https://zyppy.com/seo/google-title-rewrite-study/",
  verifiedViaFetch: "2026-07-22",
};

const AHREFS: CtrPrincipleSource = {
  publisher: "Ahrefs",
  url: "https://ahrefs.com/blog/meta-description-study/",
  verifiedViaFetch: "2026-07-22",
};

const GOOGLE_TITLE_DOCS: CtrPrincipleSource = {
  publisher: "Google Search Central",
  url: "https://developers.google.com/search/docs/appearance/title-link",
  verifiedViaFetch: "2026-07-22",
};

const GOOGLE_SNIPPET_DOCS: CtrPrincipleSource = {
  publisher: "Google Search Central",
  url: "https://developers.google.com/search/docs/appearance/snippet",
  verifiedViaFetch: "2026-07-22",
};

// ---------------------------------------------------------------------------
// Opportunity principles — each one FIRES only when the current metadata
// measurably violates it. If none fire, there is no evidence-backed reason to
// rewrite, and the engine says so instead of inventing one.
// ---------------------------------------------------------------------------

const TITLE_LENGTH: CtrPrinciple = {
  id: "title-length",
  grade: "measured-finding",
  claim:
    'Titles of 40–60 characters have the highest organic CTR — "Titles inside of this range have an 8.9% better average click-through rate compared to those that fall outside of this range" (4M results, 1,312,881 pages, 12,166,560 queries).',
  guidance: `Bring the title into ${TITLE_TARGET_MIN_CHARS}–${TITLE_TARGET_MAX_CHARS} characters.`,
  source: BACKLINKO,
  caveat:
    'The source states this finding twice with different magnitudes — "a 33.3% higher CTR" in its summary list and "an 8.9% better average click-through rate" in the analysis body. The direction is consistent; the magnitude is disputed within the source. The conservative figure is quoted, and no prediction is computed from it.',
};

const TITLE_REWRITE_LENGTH: CtrPrinciple = {
  id: "title-rewrite-length",
  grade: "measured-finding",
  claim:
    "Google rewrote 61.6% of 80,959 titles studied; titles over 70 characters were \"rewritten 99.9% of the time\", titles over 60 characters more than 76% of the time, while 51–60 characters were rewritten least (39–42%).",
  guidance:
    "A title Google replaces cannot win the click, whatever it says. Keep it inside the low-rewrite band so the rewrite is the one that actually appears.",
  source: ZYPPY,
  caveat: "Study data is Q1 2022 across 2,370 sites; rewrite rates may have moved since.",
};

const TITLE_WORD_COUNT: CtrPrinciple = {
  id: "title-word-count",
  grade: "measured-finding",
  claim: '"Title tags between 6 to 9 words have the highest CTR."',
  guidance: `Aim for ${TITLE_MIN_WORDS}–${TITLE_MAX_WORDS} words.`,
  source: BACKLINKO,
};

const TITLE_SEPARATOR: CtrPrinciple = {
  id: "title-separator",
  grade: "measured-finding",
  claim:
    "Pipe separators were removed or replaced by Google 41.0% of the time, versus 19.7% for dashes; bracketed portions were rewritten 77.6% of the time versus 61.9% for parentheses.",
  guidance:
    "Prefer a dash over a pipe, or drop the separator entirely, so the segment structure survives into the displayed title.",
  source: ZYPPY,
};

const DESCRIPTION_MISSING: CtrPrinciple = {
  id: "description-rewrite-rate",
  grade: "measured-finding",
  claim:
    '"Google rewrites meta descriptions 62.78% of the time" (20,000 keywords / 192,656 pages), and 25.02% of top-ranking pages have no meta description at all; length barely changes the rewrite rate (61.46% truncated vs 63.69% not).',
  guidance:
    "With no description at all there is nothing to influence the snippet with. Write one — while expecting Google to often compose its own.",
  source: AHREFS,
  caveat:
    "Because Google rewrites the majority of descriptions, a description is an influence on the snippet, not control of it.",
};

/** Fires only when the current metadata violates it. Order is display order. */
export const CTR_PRINCIPLES: readonly CtrPrinciple[] = [
  TITLE_REWRITE_LENGTH,
  TITLE_LENGTH,
  TITLE_WORD_COUNT,
  TITLE_SEPARATOR,
  DESCRIPTION_MISSING,
] as const;

// ---------------------------------------------------------------------------
// Guardrails — always-on constraints on any rewrite. These are NOT opportunity
// triggers: they never manufacture a reason to rewrite, they only bound one.
// (Sentiment lives here rather than as a trigger because we cannot reliably
// detect a title's sentiment mechanically, and we do not claim to.)
// ---------------------------------------------------------------------------

export const CTR_GUARDRAILS: readonly CtrPrinciple[] = [
  {
    id: "title-descriptive",
    grade: "practitioner-heuristic",
    claim:
      '"Write descriptive and concise text for your <title> elements"; "Avoid keyword stuffing… there\'s no reason to have the same words or phrases appear multiple times"; "Avoid repeated or boilerplate text".',
    guidance:
      "Describe this specific page accurately and distinctly. No repetition, no stuffing, no boilerplate shared with other pages.",
    source: GOOGLE_TITLE_DOCS,
  },
  {
    id: "description-pitch",
    grade: "practitioner-heuristic",
    claim:
      'Descriptions are "like a pitch that convince the user that the page is exactly what they\'re looking for"; identical descriptions across pages "aren\'t helpful"; keyword-string descriptions are "less likely to be displayed as a snippet".',
    guidance:
      "Write the description as a specific promise about this page, unique to it, in plain sentences rather than keyword lists.",
    source: GOOGLE_SNIPPET_DOCS,
  },
  {
    id: "title-sentiment",
    grade: "measured-finding",
    claim: '"Positive titles have a 4.1% higher absolute CTR compared to negative titles."',
    guidance: "Prefer positive framing over negative, without overstating.",
    source: BACKLINKO,
    caveat:
      "A small effect, and applied as a preference on the rewrite rather than as a reason to rewrite — sentiment is not detected mechanically here.",
  },
] as const;

// ---------------------------------------------------------------------------
// Negative knowledge — claims that were asserted, checked, and killed.
//
// Recorded at the exact spot they would re-enter: any future session extending
// this KB reads these before adding a principle. All three arrived as confident
// search-result summaries and were refuted against the primary source.
// ---------------------------------------------------------------------------

export interface DisprovenClaim {
  claim: string;
  status: "refuted" | "unverified";
  refutation: string;
  source: string;
}

export const DISPROVEN_CLAIMS: readonly DisprovenClaim[] = [
  {
    claim: "Titles phrased as a question get roughly 14% higher CTR.",
    status: "refuted",
    refutation:
      'The primary source says titles with and without a question "have similar CTRs" and that the difference "was not significant" (15.5% vs 16.3%).',
    source: "https://backlinko.com/google-ctr-stats",
  },
  {
    claim: "Power words in a title lower CTR by 13.9%.",
    status: "refuted",
    refutation: "The study does not analyze power words at all.",
    source: "https://backlinko.com/google-ctr-stats",
  },
  {
    claim: "Google rewrote 76% of title tags in Q1 2025.",
    status: "unverified",
    refutation:
      "Found only in secondary summaries; never fetched to a primary source. Excluded rather than quoted.",
    source: "secondary summaries only",
  },
] as const;

// ---------------------------------------------------------------------------
// Diagnosis — deterministic, no model involved
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Which principles this page's current metadata measurably violates.
 *
 * Deterministic and evidence-bound: a principle is returned only when the
 * current title/description actually breaks it. An empty result means there is
 * no cited reason to rewrite — which the engine reports honestly instead of
 * generating a proposal anyway.
 */
export function selectApplicablePrinciples(
  currentTitle: string,
  currentDescription?: string,
): CtrPrinciple[] {
  const applicable: CtrPrinciple[] = [];
  const title = currentTitle.trim();
  const titleLength = title.length;

  if (titleLength > TITLE_TARGET_MAX_CHARS) {
    applicable.push(TITLE_REWRITE_LENGTH);
  }

  if (titleLength < TITLE_CTR_BAND_MIN_CHARS || titleLength > TITLE_TARGET_MAX_CHARS) {
    applicable.push(TITLE_LENGTH);
  }

  const wordCount = countWords(title);
  if (wordCount < TITLE_MIN_WORDS || wordCount > TITLE_MAX_WORDS) {
    applicable.push(TITLE_WORD_COUNT);
  }

  if (title.includes(PIPE_SEPARATOR)) {
    applicable.push(TITLE_SEPARATOR);
  }

  if (!currentDescription || !currentDescription.trim()) {
    applicable.push(DESCRIPTION_MISSING);
  }

  return applicable;
}
