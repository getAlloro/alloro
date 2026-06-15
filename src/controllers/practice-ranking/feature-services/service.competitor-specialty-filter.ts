/**
 * Competitor Specialty Filter
 *
 * Filters raw discovered competitors down to same-category businesses.
 * Universal across verticals: strict specialty matching for dental
 * specialists, Google Places type matching for other verticals, and a
 * junk/cross-specialty guard for unknown verticals.
 *
 * Extracted verbatim from service.places-competitor-discovery.ts. Logs via
 * the shared Pino logger using the original [PLACES-DISCOVERY] prefix.
 */

import { SPECIALTY_CATEGORIES } from "./service.ranking-algorithm";
import logger from "../../../lib/logger";
import { classifyCompetitorSpecialtyEvidence, resolveComparisonSpecialty } from "./service.competitor-specialty-classifier";
import {
  DENTAL_TYPES,
  SPECIALTY_PRIMARY_TYPES,
  type DiscoveredCompetitor,
} from "../feature-utils/util.competitor-specialty-taxonomy";

function log(message: string): void {
  logger.info(`[PLACES-DISCOVERY] ${message}`);
}

/**
 * Filter competitors to same-category businesses.
 *
 * Universal: works for any GBP-listed business type. For dental specialists,
 * applies strict specialty matching. For all other verticals, uses the
 * Google Places types from SPECIALTY_PRIMARY_TYPES to reject junk results
 * while trusting the Text Search query's category scoping.
 *
 * @param competitors - Raw discovered competitors
 * @param specialty - Target specialty (e.g. "endodontist", "barber", "cpa")
 * @returns Filtered competitors in the same business category
 */
export function filterBySpecialty(
  competitors: DiscoveredCompetitor[],
  specialty: string,
): DiscoveredCompetitor[] {
  const comparison = resolveComparisonSpecialty(specialty);
  const normalizedSpecialty = comparison.normalizedSpecialty;
  const targetDisplayNames = (
    SPECIALTY_CATEGORIES[normalizedSpecialty] || []
  ).map((name) => name.toLowerCase());

  const beforeCount = competitors.length;
  const isDentalVertical = comparison.isDental || normalizedSpecialty === "general";
  const isGeneral = normalizedSpecialty === "general";
  const specialtyTypes =
    comparison.primaryTypes.length > 0
      ? comparison.primaryTypes
      : SPECIALTY_PRIMARY_TYPES[normalizedSpecialty] || [];

  const filtered = competitors.map((comp) => ({
    ...comp,
    specialtyEvidenceTier: classifyCompetitorSpecialtyEvidence(
      comp,
      comparison.query
    ),
  })).filter((comp) => {
    const pt = comp.primaryType.toLowerCase();
    const displayCat = comp.category.toLowerCase();

    if (isDentalVertical) {
      if (comparison.isDentalSpecialist) {
        return (
          comp.specialtyEvidenceTier === "exact_specialist" ||
          comp.specialtyEvidenceTier === "multi_specialty_evidence"
        );
      }
      // Dental verticals: type filtering with name/category fallback.
      // Google often lists specialists under generic "dentist" primaryType,
      // so we also check display category and business name for the specialty term.
      const isDental =
        DENTAL_TYPES.includes(pt) ||
        comp.types?.some((t) => DENTAL_TYPES.includes(t.toLowerCase()));
      if (!isDental) return false;
      if (isGeneral) return true;
      // Exact type match (e.g. primaryType === "orthodontist")
      if (specialtyTypes.includes(pt)) return true;
      if (comp.types?.some((t) => specialtyTypes.includes(t.toLowerCase()))) return true;
      // Display category match (e.g. "Orthodontist" in category text)
      if (targetDisplayNames.some((name) => displayCat.includes(name))) return true;
      // Name-based match: if business name contains the specialty term,
      // trust it. Google's text search already scoped to this specialty.
      const specTerms = specialtyTypes.map((t) => t.replace(/_/g, " "));
      const nameLower = comp.name.toLowerCase();
      if (specTerms.some((term) => nameLower.includes(term))) return true;
      // Display category keyword fallback for specialists listed as "dentist":
      // check if the original specialty word appears in the category or name
      const specWord = specialty.toLowerCase().replace(/s$/, "");
      if (displayCat.includes(specWord) || nameLower.includes(specWord)) return true;
      return false;
    }

    // Non-dental verticals: accept if type matches any of the vertical's known types
    if (specialtyTypes.length > 0) {
      const matchesType =
        specialtyTypes.includes(pt) ||
        comp.types?.some((t) => specialtyTypes.includes(t.toLowerCase()));
      if (matchesType) return true;

      // Fallback: check display category contains the specialty keyword
      const specLower = specialty.toLowerCase();
      if (displayCat.includes(specLower)) return true;

      return false;
    }

    // Unknown vertical with no type mapping: trust the Text Search results,
    // but reject obvious junk and cross-specialty medical businesses.
    const junkTypes = [
      "hospital", "school", "university", "government", "church", "museum", "library",
      // Medical cross-contamination: urgent care and general medical should not
      // match specialist searches (e.g. plastic surgeon should not match urgent care)
      "urgent_care", "emergency_room", "pharmacy", "drugstore",
    ];
    if (junkTypes.some((j) => pt.includes(j) || comp.types?.some((t) => t.toLowerCase().includes(j)))) {
      return false;
    }

    // For unknown specialties that look medical/specialist, require the competitor's
    // display category to share at least one significant word with the search specialty.
    // This prevents "Plastic Surgeon" from matching "Urgent Care" or "Family Medicine".
    const specWords = specialty.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (specWords.length > 0) {
      const catWords = displayCat.toLowerCase().split(/\s+/);
      const nameWords = comp.name.toLowerCase().split(/\s+/);
      const hasOverlap = specWords.some(
        (sw) => catWords.some((cw) => cw.includes(sw) || sw.includes(cw))
          || nameWords.some((nw) => nw.includes(sw) || sw.includes(nw))
      );
      if (!hasOverlap) {
        // Also check if the competitor's types overlap with the client types
        // (e.g. both have "doctor" or "plastic_surgeon" in their types)
        return false;
      }
    }

    return true;
  });

  const afterCount = filtered.length;
  log(
    `Category filter (${specialty}): ${beforeCount} → ${afterCount} competitors`,
  );

  if (afterCount < 5) {
    log(
      `⚠ Only ${afterCount} competitors match specialty "${specialty}". Consider broadening search.`,
    );
  }

  return filtered;
}
