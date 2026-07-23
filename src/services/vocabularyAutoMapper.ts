/**
 * Vocabulary Auto-Mapper
 *
 * Reads a business's GBP category and automatically configures
 * the vocabulary for that vertical. No manual setup. No dropdowns.
 * Alloro figures out the business type from Google and speaks
 * the owner's language from the first interaction.
 *
 * The Marcus Lemonis play: walk in, look around, know the business.
 */

import { VocabularyConfigModel } from "../models/VocabularyConfigModel";
import logger from "../lib/logger";

export interface VocabularyPreset {
  vertical: string;
  patientTerm: string;
  referralTerm: string;
  caseType: string;
  primaryMetric: string;
  healthScoreLabel: string;
  competitorTerm: string;
  providerTerm: string;
  locationTerm: string;
  avgCaseValue: number;
  intelligenceMode: "referral_based" | "direct_acquisition" | "hybrid";
}

// GBP category patterns mapped to vocabulary presets
const CATEGORY_MAP: { patterns: string[]; preset: VocabularyPreset }[] = [
  {
    patterns: ["endodontist", "root canal"],
    preset: {
      vertical: "endodontics",
      patientTerm: "patient",
      referralTerm: "referring dentist",
      caseType: "referral case",
      primaryMetric: "referral volume",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "doctor",
      locationTerm: "practice",
      avgCaseValue: 1500,
      intelligenceMode: "referral_based",
    },
  },
  {
    patterns: ["orthodontist", "orthodontic"],
    preset: {
      vertical: "orthodontics",
      patientTerm: "patient",
      referralTerm: "referring dentist",
      caseType: "new patient",
      primaryMetric: "case starts",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "doctor",
      locationTerm: "practice",
      avgCaseValue: 5500,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["oral surg", "maxillofac"],
    preset: {
      vertical: "endodontics",
      patientTerm: "patient",
      referralTerm: "referring dentist",
      caseType: "surgical case",
      primaryMetric: "referral volume",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "surgeon",
      locationTerm: "practice",
      avgCaseValue: 3000,
      intelligenceMode: "referral_based",
    },
  },
  {
    patterns: ["periodont"],
    preset: {
      vertical: "general_dentistry", // Dental specialist; overrides ensure perio-specific terms
      patientTerm: "patient",
      referralTerm: "referring dentist",
      caseType: "periodontal case",
      primaryMetric: "referral volume",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "periodontist",
      providerTerm: "periodontist",
      locationTerm: "practice",
      avgCaseValue: 2000,
      intelligenceMode: "referral_based",
    },
  },
  {
    patterns: ["prosthodont"],
    preset: {
      vertical: "endodontics",
      patientTerm: "patient",
      referralTerm: "referring dentist",
      caseType: "prosthetic case",
      primaryMetric: "referral volume",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "prosthodontist",
      locationTerm: "practice",
      avgCaseValue: 4000,
      intelligenceMode: "referral_based",
    },
  },
  {
    patterns: ["pediatric dent", "children.*dent"],
    preset: {
      vertical: "general_dental",
      patientTerm: "patient",
      referralTerm: "parent referral",
      caseType: "new patient",
      primaryMetric: "new patients",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "pediatric dentist",
      locationTerm: "practice",
      avgCaseValue: 400,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["dentist", "dental"],
    preset: {
      vertical: "general_dental",
      patientTerm: "patient",
      referralTerm: "referral source",
      caseType: "new patient",
      primaryMetric: "new patients",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "dentist",
      locationTerm: "practice",
      avgCaseValue: 800,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["veterinar", "animal hospital", "pet clinic"],
    preset: {
      vertical: "veterinary",
      patientTerm: "pet owner",
      referralTerm: "referral source",
      caseType: "new client",
      primaryMetric: "new clients",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "veterinarian",
      locationTerm: "clinic",
      avgCaseValue: 400,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["attorney", "lawyer", "law firm", "legal"],
    preset: {
      vertical: "legal",
      patientTerm: "client",
      referralTerm: "referral source",
      caseType: "new case",
      primaryMetric: "intake calls",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "attorney",
      locationTerm: "firm",
      avgCaseValue: 3000,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["accountant", "cpa", "tax preparer", "bookkeep"],
    preset: {
      vertical: "accounting",
      patientTerm: "client",
      referralTerm: "referral source",
      caseType: "new engagement",
      primaryMetric: "new clients",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "accountant",
      locationTerm: "firm",
      avgCaseValue: 2000,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["chiropract"],
    preset: {
      vertical: "chiropractic",
      patientTerm: "patient",
      referralTerm: "referral source",
      caseType: "new patient",
      primaryMetric: "new patients",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "chiropractor",
      locationTerm: "office",
      avgCaseValue: 600,
      intelligenceMode: "referral_based",
    },
  },
  {
    patterns: ["physical therap", "physiotherap", "pt clinic"],
    preset: {
      vertical: "physical_therapy",
      patientTerm: "patient",
      referralTerm: "referring physician",
      caseType: "referral",
      primaryMetric: "referral volume",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "therapist",
      locationTerm: "clinic",
      avgCaseValue: 800,
      intelligenceMode: "referral_based",
    },
  },
  {
    patterns: ["optometrist", "optician", "eye care", "vision"],
    preset: {
      vertical: "optometry",
      patientTerm: "patient",
      referralTerm: "referral source",
      caseType: "exam",
      primaryMetric: "new patients",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "optometrist",
      locationTerm: "office",
      avgCaseValue: 500,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["barber", "hair salon", "salon", "beauty", "nail", "tattoo", "piercing", "wax"],
    preset: {
      vertical: "beauty",
      patientTerm: "customer",
      referralTerm: "word of mouth",
      caseType: "appointment",
      primaryMetric: "bookings",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "stylist",
      locationTerm: "shop",
      avgCaseValue: 50,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["plumb", "hvac", "electric", "roofing", "contractor", "handyman", "landscap"],
    preset: {
      vertical: "home_services",
      patientTerm: "customer",
      referralTerm: "referral partner",
      caseType: "job",
      primaryMetric: "jobs booked",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "contractor",
      locationTerm: "service area",
      avgCaseValue: 1200,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["restaurant", "cafe", "coffee", "bakery", "food"],
    preset: {
      vertical: "food_service",
      patientTerm: "customer",
      referralTerm: "word of mouth",
      caseType: "visit",
      primaryMetric: "daily covers",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "owner",
      locationTerm: "restaurant",
      avgCaseValue: 30,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["auto repair", "mechanic", "body shop", "car wash", "tire"],
    preset: {
      vertical: "automotive",
      patientTerm: "customer",
      referralTerm: "referral source",
      caseType: "repair",
      primaryMetric: "work orders",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "mechanic",
      locationTerm: "shop",
      avgCaseValue: 600,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["real estate", "realtor", "property"],
    preset: {
      vertical: "real_estate",
      patientTerm: "client",
      referralTerm: "referral source",
      caseType: "listing",
      primaryMetric: "closings",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "agent",
      locationTerm: "office",
      avgCaseValue: 8000,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["fitness", "gym", "personal trainer", "yoga", "pilates", "crossfit"],
    preset: {
      vertical: "fitness",
      patientTerm: "member",
      referralTerm: "referral",
      caseType: "membership",
      primaryMetric: "new members",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "trainer",
      locationTerm: "gym",
      avgCaseValue: 150,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["med spa", "medspa", "aesthetic", "cosmetic", "dermatolog", "plastic surg"],
    preset: {
      vertical: "medspa",
      patientTerm: "patient",
      referralTerm: "referral source",
      caseType: "treatment",
      primaryMetric: "bookings",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "provider",
      locationTerm: "practice",
      avgCaseValue: 1200,
      intelligenceMode: "hybrid",
    },
  },
  // ── Long-tail service verticals ───────────────────────────────
  {
    patterns: ["pet groom", "dog groom", "grooming"],
    preset: {
      vertical: "beauty",
      patientTerm: "pet owner",
      referralTerm: "word of mouth",
      caseType: "grooming appointment",
      primaryMetric: "bookings",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "groomer",
      locationTerm: "shop",
      avgCaseValue: 60,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["interior design", "home staging", "decorator"],
    preset: {
      vertical: "home_services",
      patientTerm: "client",
      referralTerm: "referral partner",
      caseType: "project",
      primaryMetric: "projects booked",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "designer",
      locationTerm: "studio",
      avgCaseValue: 5000,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["photographer", "photo studio", "videograph"],
    preset: {
      vertical: "general",
      patientTerm: "client",
      referralTerm: "referral",
      caseType: "booking",
      primaryMetric: "sessions booked",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "photographer",
      locationTerm: "studio",
      avgCaseValue: 800,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["tutor", "learning center", "test prep", "education"],
    preset: {
      vertical: "general",
      patientTerm: "student",
      referralTerm: "parent referral",
      caseType: "enrollment",
      primaryMetric: "new enrollments",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "instructor",
      locationTerm: "center",
      avgCaseValue: 200,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["clean", "maid", "janitorial", "pressure wash"],
    preset: {
      vertical: "home_services",
      patientTerm: "client",
      referralTerm: "referral",
      caseType: "service",
      primaryMetric: "recurring clients",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "owner",
      locationTerm: "service area",
      avgCaseValue: 200,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["pest control", "exterminator", "termite"],
    preset: {
      vertical: "home_services",
      patientTerm: "customer",
      referralTerm: "referral partner",
      caseType: "service call",
      primaryMetric: "service calls",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "technician",
      locationTerm: "service area",
      avgCaseValue: 250,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["insurance", "insurance agent", "insurance broker", "financial planner", "wealth manag", "financial advisor"],
    preset: {
      vertical: "financial_advisor",
      patientTerm: "client",
      referralTerm: "referral source",
      caseType: "new policy",
      primaryMetric: "policies written",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "agent",
      locationTerm: "office",
      avgCaseValue: 1500,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["florist", "flower shop"],
    preset: {
      vertical: "general",
      patientTerm: "customer",
      referralTerm: "word of mouth",
      caseType: "order",
      primaryMetric: "weekly orders",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "florist",
      locationTerm: "shop",
      avgCaseValue: 75,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["daycare", "child care", "preschool", "montessori"],
    preset: {
      vertical: "general",
      patientTerm: "family",
      referralTerm: "parent referral",
      caseType: "enrollment",
      primaryMetric: "enrolled families",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "director",
      locationTerm: "center",
      avgCaseValue: 1200,
      intelligenceMode: "hybrid",
    },
  },
  {
    patterns: ["massage", "spa", "wellness center", "acupunctur"],
    preset: {
      vertical: "medspa",
      patientTerm: "client",
      referralTerm: "word of mouth",
      caseType: "appointment",
      primaryMetric: "weekly bookings",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "therapist",
      locationTerm: "studio",
      avgCaseValue: 100,
      intelligenceMode: "direct_acquisition",
    },
  },
  {
    patterns: ["moving company", "mover", "storage"],
    preset: {
      vertical: "home_services",
      patientTerm: "customer",
      referralTerm: "referral partner",
      caseType: "move",
      primaryMetric: "jobs booked",
      healthScoreLabel: "Business Clarity Score",
      competitorTerm: "competitor",
      providerTerm: "owner",
      locationTerm: "service area",
      avgCaseValue: 1500,
      intelligenceMode: "hybrid",
    },
  },
];

// Universal fallback for any business not matched
const UNIVERSAL_FALLBACK: VocabularyPreset = {
  vertical: "general",
  patientTerm: "customer",
  referralTerm: "referral source",
  caseType: "new customer",
  primaryMetric: "customer acquisition",
  healthScoreLabel: "Business Clarity Score",
  competitorTerm: "competitor",
  providerTerm: "owner",
  locationTerm: "business",
  avgCaseValue: 500,
  intelligenceMode: "direct_acquisition",
};

/**
 * Detect the vocabulary preset from a GBP category string.
 * Returns the best-matching preset or the universal fallback.
 */
export function detectPreset(gbpCategory: string, gbpTypes?: string[]): VocabularyPreset {
  const searchText = [gbpCategory, ...(gbpTypes || [])].join(" ").toLowerCase();

  for (const entry of CATEGORY_MAP) {
    if (entry.patterns.some((pattern) => searchText.includes(pattern))) {
      return entry.preset;
    }
  }

  return UNIVERSAL_FALLBACK;
}

/**
 * Auto-configure vocabulary for an organization based on GBP data.
 * Called at account creation after checkup completes.
 */
export async function autoConfigureVocabulary(
  orgId: number,
  gbpCategory: string,
  gbpTypes?: string[],
): Promise<VocabularyPreset> {
  const preset = detectPreset(gbpCategory, gbpTypes);

  // Check if vocabulary already configured (first-write-wins, idempotent)
  const existing = await VocabularyConfigModel.findByOrgId(orgId);
  if (existing) return preset;

  // Insert vocabulary config. A failed write must not break the caller's
  // lifecycle event, but it must be visible — never a silent swallow (§3.2).
  try {
    await VocabularyConfigModel.insertConfig({
      org_id: orgId,
      vertical: preset.vertical,
      overrides: JSON.stringify(preset),
    });
  } catch (error) {
    logger.warn(
      `[VocabMapper] Failed to persist vocabulary for org ${orgId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return preset;
  }

  logger.info(`[VocabMapper] Auto-configured ${preset.vertical} vocabulary for org ${orgId} from GBP category "${gbpCategory}"`);

  return preset;
}

/**
 * Read an organization's resolved vocabulary preset from the persisted config.
 * Returns the stored VocabularyPreset, or null if none has been configured yet.
 *
 * This is the read side of autoConfigureVocabulary: the write path populates
 * vocabulary_configs when GBP data lands; this serves that resolved preset back
 * to callers (e.g. the onboarding/vocabulary read endpoint).
 */
export async function getResolvedVocabulary(
  orgId: number,
): Promise<VocabularyPreset | null> {
  const existing = await VocabularyConfigModel.findByOrgId(orgId);
  if (!existing) return null;

  const { overrides } = existing;
  try {
    const preset =
      typeof overrides === "string"
        ? (JSON.parse(overrides) as VocabularyPreset)
        : (overrides as VocabularyPreset);
    return preset ?? null;
  } catch (error) {
    logger.warn(
      `[VocabMapper] Failed to parse stored vocabulary overrides for org ${orgId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
