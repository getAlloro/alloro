/**
 * Competitor Specialty Taxonomy
 *
 * Pure data tables + types shared by the Places competitor-discovery pipeline:
 * the DiscoveredCompetitor shape, specialty evidence tiers, Google Places
 * primaryType mappings, dental type lists, the comparison-specialty config
 * (with the public COMPARISON_SPECIALTY_OPTIONS), and the fallback
 * broadening map.
 *
 * Extracted verbatim from service.places-competitor-discovery.ts so the
 * discovery service stays an orchestrator. No I/O, no logging — pure data.
 */

// =====================================================================
// TYPES
// =====================================================================

export interface DiscoveredCompetitor {
  placeId: string;
  name: string;
  address: string;
  category: string;
  primaryType: string;
  types: string[];
  totalScore: number;
  reviewsCount: number;
  url: string;
  website?: string;
  phone?: string;
  hasHours: boolean;
  hoursComplete: boolean;
  photosCount: number;
  photoName?: string;
  discoveryPosition?: number;
  discoveryQuery?: string;
  discoverySource?: "places_text";
  discoveryCheckedAt?: Date;
  specialtyEvidenceTier?: CompetitorSpecialtyEvidenceTier;
  location?: {
    lat: number;
    lng: number;
  };
}

export type CompetitorSpecialtyEvidenceTier =
  | "exact_specialist"
  | "multi_specialty_evidence"
  | "general_only"
  | "unknown";

export interface ComparisonSpecialty {
  value: string;
  label: string;
  query: string;
  normalizedSpecialty: string;
  primaryTypes: string[];
  isDental: boolean;
  isDentalSpecialist: boolean;
}

// Google Places API primaryType values mapped to our specialty keys
// These are the machine-readable types Google uses (snake_case)
export const SPECIALTY_PRIMARY_TYPES: Record<string, string[]> = {
  // Dental
  orthodontics: ["orthodontist"],
  endodontics: ["endodontist"],
  periodontics: ["periodontist"],
  oral_surgery: ["oral_surgeon"],
  pediatric: ["pediatric_dentist"],
  prosthodontics: ["prosthodontist"],
  general: ["dentist", "dental_clinic"],
  // Non-dental verticals: Google Places types
  barber: ["barber_shop", "beauty_salon", "hair_salon"],
  hair_salon: ["beauty_salon", "hair_salon", "hair_care"],
  veterinary: ["veterinary_care", "animal_hospital"],
  legal: ["lawyer", "law_firm", "attorney"],
  accounting: ["accounting", "tax_preparation_service", "financial_planner"],
  chiropractic: ["chiropractor"],
  physical_therapy: ["physical_therapist", "physiotherapist"],
  optometry: ["optometrist", "optician", "eye_care_center"],
  home_services: ["plumber", "electrician", "hvac_contractor", "roofing_contractor", "contractor", "locksmith"],
  real_estate: ["real_estate_agency", "real_estate_agent"],
  fitness: ["gym", "fitness_center", "personal_trainer"],
  automotive: ["auto_repair", "mechanic", "car_repair", "auto_body_shop"],
  food_service: ["restaurant", "cafe", "bakery", "coffee_shop"],
  medspa: ["medical_spa", "spa", "dermatologist"],
  plastic_surgery: ["plastic_surgeon", "cosmetic_surgeon"],
  financial_advisor: ["financial_planner", "financial_advisor", "investment_service"],
};

// Dental-related primary types (used for dental specialty sub-filtering)
export const DENTAL_TYPES = [
  "dentist",
  "dental_clinic",
  "orthodontist",
  "endodontist",
  "periodontist",
  "oral_surgeon",
  "pediatric_dentist",
  "prosthodontist",
];

export const GENERAL_DENTAL_TYPES = ["dentist", "dental_clinic"];

interface ComparisonSpecialtyConfig {
  value: string;
  label: string;
  query: string;
  primaryTypes: string[];
  evidenceTerms: string[];
}

export const COMPARISON_SPECIALTY_CONFIG: Record<string, ComparisonSpecialtyConfig> = {
  endodontics: {
    value: "endodontist",
    label: "Endodontists",
    query: "endodontist",
    primaryTypes: ["endodontist"],
    evidenceTerms: ["endodont", "root canal"],
  },
  orthodontics: {
    value: "orthodontist",
    label: "Orthodontists",
    query: "orthodontist",
    primaryTypes: ["orthodontist"],
    evidenceTerms: ["orthodont", "braces", "invisalign"],
  },
  periodontics: {
    value: "periodontist",
    label: "Periodontists",
    query: "periodontist",
    primaryTypes: ["periodontist"],
    evidenceTerms: ["periodont", "gum disease", "gum surgery"],
  },
  oral_surgery: {
    value: "oral_surgeon",
    label: "Oral surgeons",
    query: "oral surgeon",
    primaryTypes: ["oral_surgeon"],
    evidenceTerms: ["oral surgeon", "oral surgery", "wisdom teeth"],
  },
  pediatric: {
    value: "pediatric_dentist",
    label: "Pediatric dentists",
    query: "pediatric dentist",
    primaryTypes: ["pediatric_dentist"],
    evidenceTerms: ["pediatric", "children", "kids"],
  },
  prosthodontics: {
    value: "prosthodontist",
    label: "Prosthodontists",
    query: "prosthodontist",
    primaryTypes: ["prosthodontist"],
    evidenceTerms: ["prosthodont", "denture", "implant restoration"],
  },
  general: {
    value: "dentist",
    label: "General dentists",
    query: "dentist",
    primaryTypes: ["dentist", "dental_clinic"],
    evidenceTerms: [],
  },
};

export const COMPARISON_SPECIALTY_OPTIONS = Object.values(
  COMPARISON_SPECIALTY_CONFIG
).map((config) => ({
  value: config.value,
  label: config.label,
  query: config.query,
}));

// All known valid business types across all verticals
export const ALL_KNOWN_TYPES = [
  ...DENTAL_TYPES,
  ...Object.values(SPECIALTY_PRIMARY_TYPES).flat(),
];

// =====================================================================
// BROADENING MAP: specialty -> adjacent broader category for fallback
// =====================================================================

export const BROADENING_MAP: Record<string, string> = {
  // Dental specialties broaden to general dentist
  endodontics: "dentist",
  orthodontics: "dentist",
  periodontics: "dentist",
  oral_surgery: "dentist",
  pediatric: "dentist",
  prosthodontics: "dentist",
  // Medical specialties broaden to their parent category
  plastic_surgery: "cosmetic doctor",
  medspa: "dermatologist",
  chiropractic: "doctor",
  physical_therapy: "doctor",
  optometry: "eye doctor",
  // Professional services broaden generically
  accounting: "financial services",
  financial_advisor: "financial services",
  // Home services broaden to general contractor
  home_services: "contractor",
};
