/**
 * Category value-source — the taxonomy and the deterministic resolver behind a
 * more-specific GBP primary-category proposal.
 *
 * WHY THIS IS DETERMINISTIC, NOT AN LLM CALL: the audit's SearchConversion pillar
 * (src/agents/auditAgents/gbp/SearchConversion.md) states the principle we reuse —
 * "Orthodontist beats Dental clinic; Pediatric Dentist beats Dentist." That prompt
 * returns free-text advice; a live GBP write needs a REAL, settable category
 * ({ name: "categories/gcid:*", displayName }), not a sentence. So the principle is
 * encoded here as a resolver over a curated catalog of real Google categories,
 * which is stable, testable, and always yields a settable value or nothing.
 *
 * HONESTY CAVEAT: the gcid strings below are the well-known public Google Business
 * Profile category IDs. They are NOT verified here against Google's live
 * `categories.list` / `categories:search` — that validation belongs at the Google
 * runtime gate that also owns the write (we hold no Google credentials in this
 * layer). The resolver logic is what is proven by tests; the catalog is the seed.
 */

/** The settable Business Profile category reference (mirrors gbpBusinessInfo.schemas.ts). */
export interface GbpCategoryRef {
  /** Google resource name, e.g. "categories/gcid:orthodontist". */
  name: string;
  displayName: string;
}

/** A catalog entry: a real category plus the signals that make it the right specialty. */
interface CategoryCatalogEntry {
  gcid: string;
  displayName: string;
  /** 0 = generic parent (e.g. Dentist); 1 = a specific specialty child. */
  specificity: number;
  /** Lowercase tokens whose presence in the business's signals implies this specialty. */
  signalTokens: string[];
  /**
   * The subset of signalTokens that are specialty-grade on their own — a single one is
   * strong enough to warrant the proposal. Tokens NOT listed here are weak: they only
   * count toward the ">=2 signals" bar, never on their own. Defaults to all signalTokens
   * (every token strong) when omitted. Prevents a lone generic word (e.g. "children" in
   * ordinary family-dentistry copy) from firing a board-specialty proposal.
   */
  strongTokens?: string[];
}

/** What the resolver needs to decide: the current primary category + context signals. */
export interface CategoryRecommendationInput {
  /**
   * The location's current primary category, from client_gbp (categoryName /
   * categories) or the live profile. Either field may be absent.
   */
  currentPrimaryCategory: { displayName?: string | null; name?: string | null } | null;
  /**
   * Free-text signals describing the business — condensed client_gbp fields
   * (categoryName, categories[], title) and any service tokens the caller adds.
   * Case-insensitive; order does not matter.
   */
  signals: string[];
}

/** A staged proposal: swap the current primary category for a more specific settable one. */
export interface CategoryRecommendation {
  current: { displayName: string | null; name: string | null };
  proposed: GbpCategoryRef;
  /** Plain-English, proposal framing (Value #6) — never a rank promise. */
  rationale: string;
}

const CATEGORY_NAME_PREFIX = "categories/";

/**
 * Curated seed catalog — the dental vertical the SearchConversion example names.
 * Generics sit at specificity 0; specialties at 1. Extend per vertical; the
 * resolver is vertical-agnostic and reads only these fields.
 */
const CATEGORY_CATALOG: CategoryCatalogEntry[] = [
  { gcid: "gcid:dentist", displayName: "Dentist", specificity: 0, signalTokens: [] },
  { gcid: "gcid:dental_clinic", displayName: "Dental clinic", specificity: 0, signalTokens: [] },
  {
    gcid: "gcid:orthodontist",
    displayName: "Orthodontist",
    specificity: 1,
    signalTokens: ["orthodontist", "orthodontic", "orthodontics", "braces", "invisalign", "aligner", "aligners"],
  },
  {
    gcid: "gcid:pediatric_dentist",
    displayName: "Pediatric dentist",
    specificity: 1,
    // Weak tokens are kept distinct and non-overlapping ("child" is a substring of "children",
    // so listing both would let one word count twice) — see hasQualifyingEvidence.
    signalTokens: [
      "pediatric dentist",
      "pediatric dentistry",
      "paediatric dentist",
      "paediatric dentistry",
      "pediatric",
      "paediatric",
      "children",
      "kids",
    ],
    // Only explicit specialty words fire on their own. "children"/"kids" are weak: they appear
    // in ordinary family-dentistry copy and must not, alone, propose the board specialty. A
    // weak-only case needs two distinct weak signals to clear the bar.
    strongTokens: [
      "pediatric dentist",
      "pediatric dentistry",
      "paediatric dentist",
      "paediatric dentistry",
      "pediatric",
      "paediatric",
    ],
  },
  {
    gcid: "gcid:endodontist",
    displayName: "Endodontist",
    specificity: 1,
    signalTokens: ["endodontist", "endodontic", "endodontics", "root canal"],
  },
  {
    gcid: "gcid:periodontist",
    displayName: "Periodontist",
    specificity: 1,
    signalTokens: ["periodontist", "periodontal", "periodontics", "gum disease", "gum treatment"],
  },
  {
    gcid: "gcid:oral_surgeon",
    displayName: "Oral surgeon",
    specificity: 1,
    signalTokens: ["oral surgeon", "oral surgery", "maxillofacial", "wisdom teeth", "wisdom tooth"],
  },
  {
    gcid: "gcid:prosthodontist",
    displayName: "Prosthodontist",
    specificity: 1,
    signalTokens: ["prosthodontist", "prosthodontic", "prosthodontics"],
  },
  {
    gcid: "gcid:cosmetic_dentist",
    displayName: "Cosmetic dentist",
    specificity: 1,
    signalTokens: ["cosmetic dentist", "cosmetic dentistry", "veneers", "teeth whitening", "smile makeover"],
  },
];

/** Strip the "categories/" prefix so a name and a bare gcid compare equal. */
function toGcid(nameOrGcid: string | null | undefined): string | null {
  if (!nameOrGcid) return null;
  const trimmed = nameOrGcid.trim();
  if (!trimmed) return null;
  return trimmed.startsWith(CATEGORY_NAME_PREFIX)
    ? trimmed.slice(CATEGORY_NAME_PREFIX.length)
    : trimmed;
}

function toCategoryRef(entry: CategoryCatalogEntry): GbpCategoryRef {
  return { name: `${CATEGORY_NAME_PREFIX}${entry.gcid}`, displayName: entry.displayName };
}

/**
 * Resolve the current primary category to a KNOWN catalog entry, or `null` when the
 * catalog does not recognize it. Returning null is the honest answer: if we do not know
 * what the current category is, we cannot claim a proposed one is "more specific" than it.
 * An already-specialized profile (e.g. "Oral and maxillofacial surgeon") that is not in
 * the catalog resolves to null here, so no lateral/downgrade proposal is ever manufactured.
 */
function resolveCurrent(input: CategoryRecommendationInput): {
  gcid: string;
  displayName: string;
  specificity: number;
} | null {
  const gcid = toGcid(input.currentPrimaryCategory?.name);
  const displayName = input.currentPrimaryCategory?.displayName?.trim().toLowerCase() || null;
  const match = CATEGORY_CATALOG.find(
    (entry) =>
      (gcid !== null && entry.gcid === gcid) ||
      (displayName !== null && entry.displayName.toLowerCase() === displayName)
  );
  if (!match) return null; // unknown baseline — never propose off it
  return { gcid: match.gcid, displayName: match.displayName, specificity: match.specificity };
}

/** How many of a candidate's signal tokens appear anywhere in the business's signals. */
function countSignalMatches(entry: CategoryCatalogEntry, haystack: string): number {
  return entry.signalTokens.reduce(
    (count, token) => (haystack.includes(token) ? count + 1 : count),
    0
  );
}

/**
 * Whether a candidate's evidence is strong enough to warrant the proposal: at least one
 * specialty-grade (strong) token, OR at least two signals of any strength. A single weak
 * token — e.g. "children" in "we welcome children" — never clears this bar on its own.
 * Entries without an explicit `strongTokens` treat every token as strong (>=1 = qualifies).
 */
function hasQualifyingEvidence(entry: CategoryCatalogEntry, haystack: string): boolean {
  const strongTokens = entry.strongTokens ?? entry.signalTokens;
  const strongMatches = strongTokens.filter((token) => haystack.includes(token)).length;
  if (strongMatches >= 1) return true;
  // No specialty-grade token. Entries with no weak tier (strongTokens omitted) stop here.
  if (!entry.strongTokens) return false;
  // Weak-only path: require at least two DISTINCT weak signals (e.g. "children" + "kids").
  const weakTokens = entry.signalTokens.filter((token) => !entry.strongTokens!.includes(token));
  const weakMatches = weakTokens.filter((token) => haystack.includes(token)).length;
  return weakMatches >= 2;
}

/**
 * Find a strictly-more-specific, settable primary category for this location, or
 * `null` when none is warranted (already specific, no supporting signal, or the
 * only match is the current category). Never manufactures a change.
 */
export function findMoreSpecificPrimaryCategory(
  input: CategoryRecommendationInput
): CategoryRecommendation | null {
  const current = resolveCurrent(input);
  if (!current) return null; // unknown/absent baseline: never propose off it
  const haystack = input.signals.map((s) => s.toLowerCase()).join("  ");

  let best: { entry: CategoryCatalogEntry; matches: number } | null = null;
  for (const entry of CATEGORY_CATALOG) {
    if (entry.specificity <= current.specificity) continue; // not more specific
    if (entry.gcid === current.gcid) continue; // same category
    if (!hasQualifyingEvidence(entry, haystack)) continue; // no strong-enough evidence
    const matches = countSignalMatches(entry, haystack);
    // Deterministic pick: most signal matches wins; catalog order breaks ties.
    if (!best || matches > best.matches) {
      best = { entry, matches };
    }
  }

  if (!best) return null;

  // Only reached for a catalog-verified generic (specificity 0) to specialty (specificity 1)
  // pair, so "more specific" is provably true from the catalog, never an unproven claim.
  const proposed = toCategoryRef(best.entry);
  return {
    current: {
      displayName: input.currentPrimaryCategory?.displayName ?? null,
      name: input.currentPrimaryCategory?.name ?? null,
    },
    proposed,
    rationale:
      `"${proposed.displayName}" is a more specific primary category than ` +
      `"${current.displayName}" — it is a closer match to what this business does. ` +
      `This is a proposal for the owner to approve — nothing changes on Google until they do.`,
  };
}
