/**
 * Business Metrics -- Single Source of Truth
 *
 * EVERY calculation that produces a dollar figure, health status, or score
 * benchmark MUST live in this file. If it's not here, it's wrong.
 *
 * This file is enforced by preflight-check.sh: any ORG_MONTHLY_RATE
 * definition outside this file fails the build.
 */

import { OrganizationModel } from "../models/OrganizationModel";

// ---- Per-Org Pricing (actual contracted rates) --------------------------------
// Update this map when pricing changes. It is the ONLY place pricing lives.

export const ORG_MONTHLY_RATE: Record<number, number> = {
  5: 2000,   // Garrison Orthodontics
  6: 3500,   // DentalEMR
  8: 1500,   // Artful Orthodontics
  21: 0,     // McPherson Endodontics (beta)
  25: 5000,  // Caswell Orthodontics (3 locations)
  34: 0,     // Alloro (team org)
  39: 1500,  // One Endodontics
  42: 0,     // Valley Endodontics (demo)
};

// Default burn rate -- overridden by system_config "monthly_burn" when set
export const MONTHLY_BURN_DEFAULT = 9500;

// Synchronous access for components that can't await (uses cached/default value)
export let MONTHLY_BURN = MONTHLY_BURN_DEFAULT;

// Call this at startup or when config changes to refresh the burn rate
export async function refreshBurnRate(): Promise<void> {
  try {
    const { getConfig } = await import("./configStore");
    MONTHLY_BURN = await getConfig("monthly_burn", MONTHLY_BURN_DEFAULT);
  } catch {
    // configStore not available (e.g., frontend import) -- keep default
  }
}

// ---- MRR Calculations ---------------------------------------------------------

export function getOrgMRR(orgId: number): number {
  return ORG_MONTHLY_RATE[orgId] ?? 0;
}

export function getTotalMRR(orgs: { id: number }[]): number {
  return orgs.reduce((sum, o) => sum + getOrgMRR(o.id), 0);
}

export interface MRRBreakdown {
  total: number;
  byOrg: Record<number, number>;
  burn: number;
  delta: number;
  isProfitable: boolean;
  payingCount: number;
}

export function getMRRBreakdown(orgs: { id: number }[]): MRRBreakdown {
  const byOrg: Record<number, number> = {};
  let total = 0;
  let payingCount = 0;

  for (const org of orgs) {
    const rate = getOrgMRR(org.id);
    byOrg[org.id] = rate;
    total += rate;
    if (rate > 0) payingCount++;
  }

  return {
    total,
    byOrg,
    burn: MONTHLY_BURN,
    delta: total - MONTHLY_BURN,
    isProfitable: total >= MONTHLY_BURN,
    payingCount,
  };
}

// ---- Database-backed MRR (for backend services) --------------------------------

export async function getMRRFromDB(): Promise<MRRBreakdown> {
  const orgs = await OrganizationModel.findMrrEligibleIds();

  return getMRRBreakdown(orgs);
}

// ---- Per-Specialty Benchmarks --------------------------------------------------
// Used by clarityScoring.ts and checkup.ts. Defined here, imported everywhere.

export const REVIEW_VOLUME_BENCHMARKS: Record<string, number> = {
  endodontist: 40,
  orthodontist: 100,
  dentist: 100,
  "general dentist": 100,
  "pediatric dentist": 80,
  periodontist: 40,
  prosthodontist: 30,
  "oral surgeon": 50,
  barber: 150,
  "med spa": 200,
  medspa: 200,
  "plastic surgeon": 100,
  chiropractor: 80,
  optometrist: 60,
  veterinarian: 100,
  "physical therapist": 40,
  attorney: 30,
  lawyer: 30,
  accountant: 20,
  cpa: 20,
  "hair salon": 150,
  plumber: 50,
  electrician: 50,
  hvac: 50,
  roofer: 30,
  landscaper: 40,
  "garden designer": 20,
  "landscape designer": 20,
  "auto repair": 60,
  "financial advisor": 20,
  "real estate agent": 40,
};

// Per-specialty competitive search radii (miles)
export const COMPETITIVE_RADII_MILES: Record<string, number> = {
  barber: 5,
  chiropractor: 5,
  dentist: 10,
  "general dentist": 10,
  "hair salon": 10,
  optometrist: 10,
  "physical therapist": 10,
  veterinarian: 10,
  "pediatric dentist": 10,
  orthodontist: 15,
  "med spa": 15,
  medspa: 15,
  endodontist: 25,
  periodontist: 25,
  "oral surgeon": 25,
  "garden designer": 25,
  "landscape designer": 25,
  "plastic surgeon": 40,
  "oculofacial surgeon": 75,
  prosthodontist: 75,
};

// Score label thresholds (used by clarity scoring and checkup)
export function getScoreLabel(score: number): string {
  if (score >= 80) return "Strong first impression";
  if (score >= 60) return "Solid foundation";
  if (score >= 40) return "Room to grow";
  return "Needs attention";
}
