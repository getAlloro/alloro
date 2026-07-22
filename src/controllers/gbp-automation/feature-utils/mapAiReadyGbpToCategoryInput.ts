import { CategoryRecommendationInput } from "./gbpCategoryTaxonomy";

/**
 * Adapt the already-fetched `getGBPAIReadyData()` result (the same source the
 * organization audit and completeness scoring read) into the category resolver's
 * input: the location's current primary category plus free-text signals (category
 * names, business title, description) that imply a specialty.
 *
 * Mirrors `mapAiReadyGbpToCompletenessInput` (ai-seo-audit): reads only `profile`,
 * and returns `null` when there is no gradable profile — an absent profile is not a
 * proposal opportunity, not a manufactured one (Value #6). Signal richness is bounded
 * by what the AI-ready payload carries; a thin profile yields thin signals, and the
 * resolver then honestly proposes nothing rather than guessing.
 *
 * Self-contained accessors (not the ai-seo-audit private helpers) keep this a pure
 * feature-util with no cross-domain import (§4.3).
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function mapAiReadyGbpToCategoryInput(
  gbpData: Record<string, unknown> | null | undefined
): CategoryRecommendationInput | null {
  const profile = asRecord(gbpData?.profile);
  if (!profile) return null;

  const primaryCategory = asString(profile.primaryCategory);
  const additionalCategories = asStringArray(profile.additionalCategories);

  // Free-text signals: category names + any business title/description the payload
  // carries. Absent fields drop out (filtered), so a lean profile is safe.
  const signals = [
    primaryCategory,
    ...additionalCategories,
    asString(profile.title),
    asString(profile.description),
  ].filter((signal): signal is string => Boolean(signal));

  return {
    // getGBPAIReadyData flattens primaryCategory to a display string; the resolver
    // matches on displayName (case-insensitive) when the gcid name is absent.
    currentPrimaryCategory: primaryCategory
      ? { displayName: primaryCategory, name: null }
      : null,
    signals,
  };
}
