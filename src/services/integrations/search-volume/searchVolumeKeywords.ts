/**
 * Keyword + geo helpers for the DataForSEO search-volume harvest.
 *
 * Pure, framework-free utilities (no I/O): keyword normalization (expanding
 * ranking stems, dropping ambiguous terms) and US location-name resolution for
 * the DataForSEO `location_name` field. Kept out of the adapter so the adapter
 * stays a thin I/O orchestrator under the size tier (§2.4).
 */

/**
 * Ranking stems that DataForSEO returns little/no volume for, expanded to the
 * patient-intent term people actually search. Longest stems first so
 * "orthodont" wins before a hypothetical "ortho" partial.
 */
const KEYWORD_STEM_EXPANSIONS: ReadonlyArray<readonly [string, string]> = [
  ["orthodont", "orthodontist"],
  ["endodont", "endodontist"],
  ["ortho", "orthodontist"],
  ["endo", "endodontist"],
];

/**
 * Ambiguous single-word terms that are weak/misleading market signals (they
 * carry huge off-topic volume). Dropped from the harvested set. Matched on the
 * whole normalized keyword, case-insensitive.
 */
const AMBIGUOUS_KEYWORDS: ReadonlySet<string> = new Set([
  "smile",
  "align",
  "teeth",
  "save tooth",
  "tooth nerve",
]);

/**
 * Split a raw `rank_keywords` value (comma- or newline-separated) into trimmed,
 * non-empty keyword strings.
 */
export function splitRankKeywords(rankKeywords: string): string[] {
  return rankKeywords
    .split(/[,\n]/)
    .map((kw) => kw.trim())
    .filter((kw) => kw.length > 0);
}

/**
 * Expand any known ranking stem inside a keyword to its patient-intent term.
 * Case-insensitive substring replacement; first matching expansion wins.
 */
function expandStems(keyword: string): string {
  const lower = keyword.toLowerCase();
  for (const [stem, expansion] of KEYWORD_STEM_EXPANSIONS) {
    if (lower.includes(stem) && !lower.includes(expansion)) {
      return lower.replace(stem, expansion);
    }
  }
  return lower;
}

/**
 * Normalize a location's ranking keywords into the curated patient-intent set
 * the harvest sends to DataForSEO: split, expand stems, drop ambiguous terms,
 * de-duplicate. Returns lowercased keywords. Empty input yields an empty array.
 */
export function buildHarvestKeywords(rankKeywords: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of splitRankKeywords(rankKeywords)) {
    const expanded = expandStems(raw);
    if (AMBIGUOUS_KEYWORDS.has(expanded)) {
      continue;
    }
    if (!seen.has(expanded)) {
      seen.add(expanded);
      result.push(expanded);
    }
  }
  return result;
}

/**
 * US state abbreviation → full name. DataForSEO `location_name` expects the full
 * state name (e.g. "Sterling,Virginia,United States"), not the postal code.
 */
const US_STATE_NAMES: Readonly<Record<string, string>> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

/**
 * Resolve a `search_state` value (postal code like "VA", or already a full
 * name) to the full state name DataForSEO expects. Returns null when it can't
 * be resolved to a known US state.
 */
export function resolveStateName(state: string | null): string | null {
  if (!state) {
    return null;
  }
  const trimmed = state.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const upper = trimmed.toUpperCase();
  if (US_STATE_NAMES[upper]) {
    return US_STATE_NAMES[upper];
  }
  // Already a full name? Match case-insensitively against the known set.
  const match = Object.values(US_STATE_NAMES).find(
    (name) => name.toLowerCase() === trimmed.toLowerCase()
  );
  return match ?? null;
}

/**
 * The ordered list of DataForSEO `location_name` candidates to try for a
 * location, from most specific (City,State,United States) to least
 * (United States). The harvest falls back through these on a DataForSEO
 * location error. Always ends with "United States" so there is a valid floor.
 */
export function buildLocationNameCandidates(
  city: string | null,
  state: string | null
): string[] {
  const candidates: string[] = [];
  const stateName = resolveStateName(state);
  const cityName = city?.trim() || null;
  if (cityName && stateName) {
    candidates.push(`${cityName},${stateName},United States`);
  }
  if (stateName) {
    candidates.push(`${stateName},United States`);
  }
  candidates.push("United States");
  // De-duplicate while preserving order (city+state may equal nothing extra).
  return Array.from(new Set(candidates));
}
