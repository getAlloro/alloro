/**
 * Findability Sensor — service-not-name keyword selection
 *
 * Pure. Chooses which keyword-families the sensor tracks. The rule from the
 * research + VoC: track the SERVICE searches that bring NEW customers
 * ("orthodontist near me", "invisalign millburn") and exclude the BRAND / name
 * search — ranking #1 for your own name is the flattering vanity trap; those
 * are people who already know you (research/rank-geo-grid-mechanism.md §C.3;
 * research/rank-findability-voc-and-fuel-gauge.md).
 *
 * Inputs are the org's REAL Google demand (A1's shipped GSC->content loop) plus
 * the owner-declared service list — never the owner guessing keywords. GSC
 * query text is UNTRUSTED external data; it is normalized and bounded here and
 * used only to pick tracking targets.
 */

import type { GscTopQuery } from "../../admin-websites/feature-utils/util.seo-gsc-demand";
import type { KeywordFamily } from "../../../types/findability-sensor";

/** Cost knob: pins x keywords x SerpApi per scan. Cap the keyword count. */
export const MAX_KEYWORD_FAMILIES = 5;
const MAX_KEYWORD_LENGTH = 80;
const MIN_BRAND_TOKEN_LENGTH = 3;

/**
 * Generic industry / geo / filler tokens that also appear inside business names
 * (e.g. "Garrison Orthodontics"). They are NOT distinctive brand tokens, so a
 * query is not branded merely for containing one — otherwise "orthodontist near
 * me" would be wrongly excluded because the brand contains "orthodontics".
 */
const GENERIC_NAME_TOKENS = new Set([
  "dental", "dentist", "dentistry", "orthodontics", "orthodontist", "endodontics",
  "endodontist", "periodontics", "oral", "surgery", "surgeon", "clinic", "care",
  "health", "center", "centre", "group", "associates", "partners", "family",
  "smile", "smiles", "co", "company", "llc", "inc", "pllc", "pc", "the", "and",
  "of", "for", "near", "me", "in", "at", "a", "an",
]);

function normalizeText(value: string): string {
  // Lowercase, then map every non-letter/number char (punctuation, hyphens,
  // en/em dashes, control chars) to a space so word boundaries survive
  // ("invisalign-millburn" -> "invisalign millburn"), collapse, and bound.
  // Unicode-aware (\p{L}\p{N} + u flag) so accented/CJK service terms survive —
  // e.g. "ortodoncista para niños", "牙医" — instead of being mangled or dropped
  // (bilingual practices are common in the dental ICP; GSC demand is real).
  return (value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_KEYWORD_LENGTH);
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized.split(" ") : [];
}

/** The distinctive (non-generic) tokens of a business name — used to detect branded queries. */
function distinctiveBrandTokens(businessName: string): string[] {
  return tokenize(businessName).filter(
    (token) => token.length >= MIN_BRAND_TOKEN_LENGTH && !GENERIC_NAME_TOKENS.has(token),
  );
}

/**
 * A GSC query is "branded" (a vanity search we do NOT track) when it contains
 * any distinctive brand token. When the business name has no distinctive token
 * (e.g. "Family Dental Care"), branded queries can't be reliably detected, so we
 * do not exclude — better to keep a possibly-branded service query than to drop
 * a real service query. (Owner's declared service list is always service-safe.)
 */
export interface KeywordSelectionInput {
  gscTopQueries: GscTopQuery[];
  serviceList: string[];
  businessName: string;
}

export function resolveServiceKeywordFamilies(input: KeywordSelectionInput): KeywordFamily[] {
  const brandTokens = distinctiveBrandTokens(input.businessName || "");
  // Fallback for names with no distinctive token (e.g. "Family Dental Care"):
  // still exclude a query that IS the full business name — the exact vanity
  // search — even though no single token flags it.
  const normalizedBrand = normalizeText(input.businessName || "");
  const seen = new Set<string>();
  const families: KeywordFamily[] = [];

  const add = (raw: string, source: KeywordFamily["source"]) => {
    const keyword = normalizeText(raw);
    if (keyword.length === 0 || seen.has(keyword)) return;
    seen.add(keyword);
    families.push({ keyword, source });
  };

  // Owner-declared services first — definitionally service-not-name.
  for (const service of input.serviceList || []) {
    add(service, "service_list");
  }

  // Real Google demand, minus branded (vanity) queries.
  const rankedQueries = [...(input.gscTopQueries || [])]
    .filter((q) => q && typeof q.key === "string" && q.key.trim().length > 0)
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0));

  for (const query of rankedQueries) {
    const normalizedQuery = normalizeText(query.key);
    const queryTokens = new Set(normalizedQuery.split(" ").filter(Boolean));
    const isBranded = brandTokens.some((token) => queryTokens.has(token));
    const isExactName = normalizedBrand.length > 0 && normalizedQuery === normalizedBrand;
    if (isBranded || isExactName) continue;
    add(query.key, "gsc_demand");
  }

  // No demand + no services -> empty (honest skip; the runner records nothing).
  return families.slice(0, MAX_KEYWORD_FAMILIES);
}
