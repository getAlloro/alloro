/**
 * Competitor Specialty Classifier
 *
 * Resolves a raw specialty string to its internal comparison config and
 * classifies a discovered competitor's specialty-evidence tier. Pure logic
 * over the shared taxonomy tables — no I/O, no logging.
 *
 * Extracted verbatim from service.places-competitor-discovery.ts.
 */

import {
  COMPARISON_SPECIALTY_CONFIG,
  DENTAL_TYPES,
  GENERAL_DENTAL_TYPES,
  SPECIALTY_PRIMARY_TYPES,
  type ComparisonSpecialty,
  type CompetitorSpecialtyEvidenceTier,
  type DiscoveredCompetitor,
} from "../feature-utils/util.competitor-specialty-taxonomy";

/**
 * Normalize specialty input to internal key.
 * Supports dental specialties + all universal verticals.
 */
export function normalizeSpecialty(specialty: string): string {
  const aliases: Record<string, string> = {
    // Dental
    orthodontist: "orthodontics",
    orthodontists: "orthodontics",
    endodontist: "endodontics",
    endodontists: "endodontics",
    periodontist: "periodontics",
    periodontists: "periodontics",
    "oral surgeon": "oral_surgery",
    "oral surgeons": "oral_surgery",
    oral_surgeon: "oral_surgery",
    prosthodontist: "prosthodontics",
    prosthodontists: "prosthodontics",
    "pediatric dentist": "pediatric",
    "pediatric dentists": "pediatric",
    pediatric_dentist: "pediatric",
    dentist: "general",
    dentists: "general",
    "general dentist": "general",
    "general dentists": "general",
    "general dentistry": "general",
    dental_clinic: "general",
    "dental clinic": "general",
    orthodontics: "orthodontics",
    endodontics: "endodontics",
    periodontics: "periodontics",
    oral_surgery: "oral_surgery",
    pediatric: "pediatric",
    prosthodontics: "prosthodontics",
    general: "general",
    // Non-dental
    barber: "barber",
    "barber shop": "barber",
    "hair salon": "hair_salon",
    salon: "hair_salon",
    veterinarian: "veterinary",
    veterinary: "veterinary",
    attorney: "legal",
    lawyer: "legal",
    legal: "legal",
    accountant: "accounting",
    cpa: "accounting",
    accounting: "accounting",
    chiropractor: "chiropractic",
    chiropractic: "chiropractic",
    "physical therapist": "physical_therapy",
    physical_therapy: "physical_therapy",
    optometrist: "optometry",
    optometry: "optometry",
    plumber: "home_services",
    electrician: "home_services",
    hvac: "home_services",
    contractor: "home_services",
    home_services: "home_services",
    "real estate agent": "real_estate",
    realtor: "real_estate",
    real_estate: "real_estate",
    "financial advisor": "financial_advisor",
    financial_advisor: "financial_advisor",
    gym: "fitness",
    "personal trainer": "fitness",
    fitness: "fitness",
    "auto repair": "automotive",
    mechanic: "automotive",
    automotive: "automotive",
    restaurant: "food_service",
    cafe: "food_service",
    food_service: "food_service",
    "med spa": "medspa",
    medspa: "medspa",
    dermatologist: "medspa",
    "plastic surgeon": "plastic_surgery",
    "plastic surgery": "plastic_surgery",
    "cosmetic surgeon": "plastic_surgery",
    plastic_surgery: "plastic_surgery",
  };
  return aliases[specialty.toLowerCase().trim()] || specialty.toLowerCase().trim();
}

export function resolveComparisonSpecialty(raw: string | null | undefined): ComparisonSpecialty {
  const input = raw?.trim() || "dentist";
  const normalizedSpecialty = normalizeSpecialty(input);
  const config = COMPARISON_SPECIALTY_CONFIG[normalizedSpecialty];
  if (config) {
    return {
      value: config.value,
      label: config.label,
      query: config.query,
      normalizedSpecialty,
      primaryTypes: config.primaryTypes,
      isDental: DENTAL_TYPES.some((type) =>
        config.primaryTypes.includes(type)
      ),
      isDentalSpecialist: normalizedSpecialty !== "general",
    };
  }

  const primaryTypes = SPECIALTY_PRIMARY_TYPES[normalizedSpecialty] || [];
  const title = input
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return {
    value: input.toLowerCase().replace(/\s+/g, "_"),
    label: title,
    query: input,
    normalizedSpecialty,
    primaryTypes,
    isDental: primaryTypes.some((type) => DENTAL_TYPES.includes(type)),
    isDentalSpecialist:
      primaryTypes.some((type) => DENTAL_TYPES.includes(type)) &&
      normalizedSpecialty !== "general",
  };
}

function hasSpecialtyTextEvidence(
  comp: DiscoveredCompetitor,
  normalizedSpecialty: string
): boolean {
  const terms =
    COMPARISON_SPECIALTY_CONFIG[normalizedSpecialty]?.evidenceTerms || [];
  if (terms.length === 0) return false;
  const haystack = [
    comp.name,
    comp.category,
    comp.primaryType,
    ...(comp.types || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/_/g, " ");
  return terms.some((term) => haystack.includes(term));
}

export function classifyCompetitorSpecialtyEvidence(
  comp: DiscoveredCompetitor,
  specialty: string
): CompetitorSpecialtyEvidenceTier {
  const comparison = resolveComparisonSpecialty(specialty);
  const pt = comp.primaryType.toLowerCase();
  const types = (comp.types || []).map((type) => type.toLowerCase());
  const isDental =
    DENTAL_TYPES.includes(pt) ||
    types.some((type) => DENTAL_TYPES.includes(type));
  const hasExactType =
    comparison.primaryTypes.includes(pt) ||
    types.some((type) => comparison.primaryTypes.includes(type));

  if (hasExactType) {
    return "exact_specialist";
  }

  if (!comparison.isDentalSpecialist) {
    return hasSpecialtyTextEvidence(comp, comparison.normalizedSpecialty)
      ? "multi_specialty_evidence"
      : "unknown";
  }

  if (!isDental) {
    return "unknown";
  }

  if (hasSpecialtyTextEvidence(comp, comparison.normalizedSpecialty)) {
    return "multi_specialty_evidence";
  }

  if (
    GENERAL_DENTAL_TYPES.includes(pt) ||
    types.some((type) => GENERAL_DENTAL_TYPES.includes(type))
  ) {
    return "general_only";
  }

  return "unknown";
}
