import type { MarketKeywordSource } from "../../../models/MarketKeywordModel";

export const MARKET_KEYWORD_LIMIT_PER_LOCATION = 300;

const DUPLICATE_PUNCTUATION_RE = /[.,;:!?]{2,}/g;
const WHITESPACE_RE = /\s+/g;
const MEANINGFUL_QUERY_RE = /[a-z]/i;
const URL_OR_EMAIL_RE = /(https?:\/\/|www\.|@)/i;

const LOW_VALUE_QUERIES = new Set([
  "google",
  "maps",
  "directions",
  "website",
  "phone number",
]);

export interface KeywordCandidate {
  keyword: string;
  cluster?: string | null;
  intent?: string | null;
  confidence?: number | null;
  source: MarketKeywordSource;
  metadata?: Record<string, unknown>;
}

export interface NormalizedKeywordCandidate extends KeywordCandidate {
  normalizedKeyword: string;
  canonicalKeyword: string;
}

export function normalizeKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .trim()
    .replace(DUPLICATE_PUNCTUATION_RE, ".")
    .replace(WHITESPACE_RE, " ");
}

export function canonicalizeKeyword(keyword: string): string {
  return normalizeKeyword(keyword)
    .replace(/\bdentists\b/g, "dentist")
    .replace(/\borthodontists\b/g, "orthodontist")
    .replace(/\bendodontists\b/g, "endodontist")
    .replace(/\bbraces prices\b/g, "braces cost")
    .trim();
}

export function isMeaningfulSearchQuery(query: string): boolean {
  const normalized = normalizeKeyword(query);
  if (normalized.length < 3 || normalized.length > 120) return false;
  if (!MEANINGFUL_QUERY_RE.test(normalized)) return false;
  if (URL_OR_EMAIL_RE.test(normalized)) return false;
  if (LOW_VALUE_QUERIES.has(normalized)) return false;
  return true;
}

export function splitKeywordText(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function dedupeKeywords<T extends KeywordCandidate>(
  candidates: T[],
): Array<T & { normalizedKeyword: string; canonicalKeyword: string }> {
  const seen = new Set<string>();
  const result: Array<T & { normalizedKeyword: string; canonicalKeyword: string }> = [];
  for (const candidate of candidates) {
    const normalizedKeyword = normalizeKeyword(candidate.keyword);
    if (!normalizedKeyword || seen.has(normalizedKeyword)) continue;
    seen.add(normalizedKeyword);
    result.push({
      ...candidate,
      normalizedKeyword,
      canonicalKeyword: canonicalizeKeyword(normalizedKeyword),
    });
  }
  return result;
}

export function limitKeywordCandidates<T>(
  candidates: T[],
  limit = MARKET_KEYWORD_LIMIT_PER_LOCATION,
): T[] {
  return candidates.slice(0, limit);
}

export function inferIntent(keyword: string): string {
  const normalized = normalizeKeyword(keyword);
  if (normalized.includes("near me")) return "near_me";
  if (normalized.includes("cost") || normalized.includes("price")) return "commercial";
  if (normalized.includes("emergency") || normalized.includes("urgent")) return "emergency";
  if (normalized.includes("best")) return "commercial";
  return "service";
}

export function defaultCluster(keyword: string, specialty?: string | null): string {
  const normalized = normalizeKeyword(keyword);
  if (normalized.includes("invisalign")) return "Invisalign";
  if (normalized.includes("braces")) return "Braces";
  if (normalized.includes("root canal")) return "Root Canal";
  if (normalized.includes("emergency")) return "Emergency";
  if (specialty) return specialty;
  return "General";
}
