/**
 * Unit tests — PatientJourneyService.assemblePatientJourney (T4).
 *
 * Data strategy: Option B (mock the data layer). The entity models
 * (Organization/Location/Project) and the per-stage readers (stageReaders) are
 * mocked, so the assembler runs with NO live Postgres and NO network. We assert
 * the funnel-assembly *contract*, not any single source:
 *
 *   • response shape — location/period/stages/conversions/leak/revenue/context/
 *     headline, with the five funnel stages in journey order.
 *   • per-stage empty path — an unavailable reader yields value:null /
 *     available:false (an honest "not connected" stage), never a fake zero, and
 *     conversions touching it are null.
 *   • leak selection — the single smallest non-null step is flagged isLeak and
 *     drives leakStageKey + the descriptive (never predictive) headline.
 *   • org-type wording — a generic org says "customers", a health org "patients"
 *     (no hardcoding the clinical word).
 *   • multi-location labelling — shared traffic stages get the whole-practice note.
 *   • tenant scope (§5.5/§11.7/§20.2) — a location that belongs to another org
 *     is rejected (PatientJourneyNotFoundError); the service never crosses tenants.
 *
 * Synthetic only (§20.4): all ids/values are invented; readers are stubbed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StageRead, PmsRead, RankRead, ReviewsRead } from "../controllers/patient-journey/feature-services/stageReaders";

// ── Entity-resolution seam ────────────────────────────────────────────────
const findLocationById = vi.fn();
const findOrgById = vi.fn();
const countLocations = vi.fn();
const findProjectByOrg = vi.fn();

vi.mock("../models/LocationModel", () => ({
  LocationModel: {
    findById: (...a: unknown[]) => findLocationById(...a),
    countByOrganizationId: (...a: unknown[]) => countLocations(...a),
  },
}));
vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: { findById: (...a: unknown[]) => findOrgById(...a) },
}));
vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: { findByOrganizationId: (...a: unknown[]) => findProjectByOrg(...a) },
}));

// ── Per-stage reader seam ─────────────────────────────────────────────────
const readImpressions = vi.fn();
const readVisits = vi.fn();
const readLeads = vi.fn();
const readPms = vi.fn();
const readMarketDemand = vi.fn();
const readRank = vi.fn();
const readReviews = vi.fn();

vi.mock("../controllers/patient-journey/feature-services/stageReaders", () => ({
  readImpressions: (...a: unknown[]) => readImpressions(...a),
  readVisits: (...a: unknown[]) => readVisits(...a),
  readLeads: (...a: unknown[]) => readLeads(...a),
  readPms: (...a: unknown[]) => readPms(...a),
  readMarketDemand: (...a: unknown[]) => readMarketDemand(...a),
  readRank: (...a: unknown[]) => readRank(...a),
  readReviews: (...a: unknown[]) => readReviews(...a),
}));

// Keep the Pino logger inert (no transport noise during the assertion).
vi.mock("../lib/logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  assemblePatientJourney,
  PatientJourneyNotFoundError,
} from "../controllers/patient-journey/feature-services/PatientJourneyService";

const ORG = 7;
const LOCATION = 42;
const MONTH = "2026-06-01";

const stage = (value: number | null, available: boolean): StageRead => ({
  value,
  available,
  asOf: available ? "2026-06-28" : null,
});

const FULL_PMS: PmsRead = {
  patients: stage(50, true),
  revenue: { value: 120000, available: true },
};
const FULL_RANK: RankRead = { position: 2, totalCompetitors: 9, available: true };
const FULL_REVIEWS: ReviewsRead = {
  rating: 4.8,
  count: 210,
  newThisMonth: 5,
  replyRatePct: 92,
  available: true,
};

/** Default = single-location health org, project present, every stage live. */
function seedHappyPath(): void {
  findLocationById.mockResolvedValue({ id: LOCATION, name: "Main St", organization_id: ORG });
  findOrgById.mockResolvedValue({ id: ORG, organization_type: "health" });
  countLocations.mockResolvedValue({ count: 1 });
  findProjectByOrg.mockResolvedValue({ id: "proj-1" });

  readMarketDemand.mockResolvedValue(stage(10000, true));
  readImpressions.mockResolvedValue(stage(4000, true));
  readVisits.mockResolvedValue(stage(800, true));
  readLeads.mockResolvedValue(stage(120, true));
  readPms.mockResolvedValue(FULL_PMS);
  readRank.mockResolvedValue(FULL_RANK);
  readReviews.mockResolvedValue(FULL_REVIEWS);
}

beforeEach(() => {
  vi.clearAllMocks();
  seedHappyPath();
});

describe("assemblePatientJourney — contract shape", () => {
  it("returns the full contract with the five stages in journey order", async () => {
    const result = await assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH });

    expect(result.location).toMatchObject({ id: LOCATION, organizationId: ORG, orgType: "health", isMultiLocation: false });
    expect(result.period).toMatchObject({ label: "June 2026", startDate: MONTH });
    expect(result.stages.map((s) => s.key)).toEqual([
      "market_demand",
      "impressions",
      "visits",
      "leads",
      "patients",
    ]);
    // One conversion per adjacent pair (5 stages → 4 steps).
    expect(result.conversions).toHaveLength(4);
    expect(result.revenue).toEqual({ value: 120000, available: true });
    expect(result.context.rank).toEqual({ position: 2, totalCompetitors: 9, available: true });
    expect(result.context.reviews).toMatchObject({ rating: 4.8, count: 210, available: true });
    expect(typeof result.headline.text).toBe("string");
  });

  it("computes per-step conversion percentages from the stage values", async () => {
    const result = await assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH });

    const byStep = Object.fromEntries(result.conversions.map((c) => [`${c.fromKey}>${c.toKey}`, c.pct]));
    // impressions 4000 → visits 800 = 20.0 %
    expect(byStep["impressions>visits"]).toBe(20);
    // visits 800 → leads 120 = 15.0 %
    expect(byStep["visits>leads"]).toBe(15);
  });
});

describe("assemblePatientJourney — empty / not-connected paths", () => {
  it("propagates an unavailable PMS stage as value:null / available:false (no fake zero)", async () => {
    readPms.mockResolvedValue({ patients: stage(null, false), revenue: { value: null, available: false } });

    const result = await assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH });

    const patients = result.stages.find((s) => s.key === "patients");
    expect(patients).toMatchObject({ value: null, available: false });
    expect(result.revenue).toEqual({ value: null, available: false });
    // The leads → patients step cannot be computed → null (never a real 0%).
    const lastStep = result.conversions.find((c) => c.toKey === "patients");
    expect(lastStep?.pct).toBeNull();
  });

  it("renders honest empty stages (and a guidance headline) when no project / no sources are connected", async () => {
    findProjectByOrg.mockResolvedValue(null); // no website → traffic stages empty
    readMarketDemand.mockResolvedValue(stage(null, false));
    readPms.mockResolvedValue({ patients: stage(null, false), revenue: { value: null, available: false } });

    const result = await assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH });

    expect(result.stages.every((s) => s.available === false && s.value === null)).toBe(true);
    expect(result.conversions.every((c) => c.pct === null && c.isLeak === false)).toBe(true);
    expect(result.leakStageKey).toBeNull();
    expect(result.headline.text).toMatch(/connect more of your data/i);
  });
});

describe("assemblePatientJourney — leak selection", () => {
  it("flags the single smallest non-null step as the biggest leak and names it in the headline", async () => {
    // Make visits → leads the worst step (5%), others healthier.
    readMarketDemand.mockResolvedValue(stage(10000, true));
    readImpressions.mockResolvedValue(stage(8000, true)); // 80%
    readVisits.mockResolvedValue(stage(4000, true)); // 50%
    readLeads.mockResolvedValue(stage(200, true)); // 5%  ← leak
    readPms.mockResolvedValue({ patients: stage(100, true), revenue: { value: 1, available: true } }); // 50%

    const result = await assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH });

    const leakSteps = result.conversions.filter((c) => c.isLeak);
    expect(leakSteps).toHaveLength(1);
    expect(leakSteps[0]).toMatchObject({ fromKey: "visits", toKey: "leads" });
    expect(result.leakStageKey).toBe("leads");
    expect(result.headline.leakStageKey).toBe("leads");
    expect(result.headline.text).toMatch(/Visited your site.*Reached out/);
  });
});

describe("assemblePatientJourney — org-type wording", () => {
  it("uses health wording (patients) for a health org", async () => {
    const result = await assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH });
    const patients = result.stages.find((s) => s.key === "patients");
    expect(patients?.label).toBe("Became patients");
    expect(patients?.metaLabel).toBe("New patients");
  });

  it("uses generic wording (customers) for a generic org — no hardcoded clinical word", async () => {
    findOrgById.mockResolvedValue({ id: ORG, organization_type: "generic" });

    const result = await assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH });

    expect(result.location.orgType).toBe("generic");
    const patients = result.stages.find((s) => s.key === "patients");
    expect(patients?.label).toBe("Became customers");
    expect(patients?.metaLabel).toBe("New customers");
  });
});

describe("assemblePatientJourney — multi-location labelling", () => {
  it("flags shared website-traffic stages as whole-practice for a multi-location org", async () => {
    countLocations.mockResolvedValue({ count: 3 });

    const result = await assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH });

    expect(result.location.isMultiLocation).toBe(true);
    const impressions = result.stages.find((s) => s.key === "impressions");
    const leads = result.stages.find((s) => s.key === "leads");
    expect(impressions?.shared).toBe(true);
    expect(impressions?.note).toMatch(/whole-practice/i);
    expect(leads?.note).toMatch(/whole-practice/i);
    // A per-location stage is NOT labelled whole-practice.
    const marketDemand = result.stages.find((s) => s.key === "market_demand");
    expect(marketDemand?.shared).toBe(false);
    expect(marketDemand?.note ?? "").not.toMatch(/whole-practice/i);
  });
});

describe("assemblePatientJourney — tenant scope (§5.5/§11.7)", () => {
  it("rejects a location that belongs to a different organization", async () => {
    findLocationById.mockResolvedValue({ id: LOCATION, name: "Main St", organization_id: 999 });

    await expect(
      assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH })
    ).rejects.toBeInstanceOf(PatientJourneyNotFoundError);
  });

  it("rejects a missing location (cannot leak another tenant's data via a bad id)", async () => {
    findLocationById.mockResolvedValue(undefined);

    await expect(
      assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH })
    ).rejects.toBeInstanceOf(PatientJourneyNotFoundError);
  });

  it("passes the server-supplied org/location into the per-location readers unchanged", async () => {
    await assemblePatientJourney({ organizationId: ORG, locationId: LOCATION, reportMonth: MONTH });

    expect(readMarketDemand).toHaveBeenCalledWith(ORG, LOCATION, MONTH);
    expect(readPms).toHaveBeenCalledWith(ORG, LOCATION);
    expect(readRank).toHaveBeenCalledWith(ORG, LOCATION);
  });
});
