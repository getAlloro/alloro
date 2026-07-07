/**
 * Unit tests — PatientJourneyService.assemblePatientJourney (T4).
 *
 * Data strategy: Option B (mock the data layer). The entity models
 * (Organization/Location/Project) and the per-stage readers (stageReaders) are
 * mocked, so the assembler runs with NO live Postgres and NO network. We assert
 * the funnel-assembly *contract*, not any single source:
 *
 *   • response shape — location/period/stages/conversions/leak/revenue/context/
 *     headline, with the three monitored lead-generation stages in journey order.
 *   • per-stage empty path — an unavailable reader yields value:null /
 *     available:false (an honest "not connected" stage), never a fake zero, and
 *     conversions touching it are null.
 *   • leak selection — the single smallest non-null step is flagged isLeak and
 *     drives leakStageKey + the descriptive (never predictive) headline.
 *   • org-type context — generic orgs keep generic metadata without creating a
 *     clinical patient-conversion stage.
 *   • multi-location labelling — shared traffic stages get the whole-practice note.
 *   • tenant scope (§5.5/§11.7/§20.2) — a location that belongs to another org
 *     is rejected (PatientJourneyNotFoundError); the service never crosses tenants.
 *
 * Synthetic only (§20.4): all ids/values are invented; readers are stubbed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  StageRead,
  PmsRead,
  RankRead,
  ReviewsRead,
} from "../controllers/patient-journey/feature-services/stageReaders";

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
  ProjectModel: {
    findByOrganizationId: (...a: unknown[]) => findProjectByOrg(...a),
  },
}));

const findReplyableForLocation = vi.fn();
vi.mock("../models/website-builder/ReviewModel", () => ({
  ReviewModel: {
    findReplyableForLocation: (...a: unknown[]) =>
      findReplyableForLocation(...a),
  },
}));

const getLocationReadiness = vi.fn();
vi.mock(
  "../controllers/gbp-automation/feature-services/GbpReadinessService",
  () => ({
    GbpReadinessService: {
      getLocationReadiness: (...a: unknown[]) => getLocationReadiness(...a),
    },
  }),
);

const findLatestForJourney = vi.fn();
vi.mock("../services/MetricActionService", () => ({
  MetricActionService: {
    findLatestForJourney: (...a: unknown[]) => findLatestForJourney(...a),
  },
}));

// ── Per-stage reader seam ─────────────────────────────────────────────────
const readImpressions = vi.fn();
const readVisits = vi.fn();
const readLeads = vi.fn();
const readPms = vi.fn();
const readRank = vi.fn();
const readReviews = vi.fn();

vi.mock("../controllers/patient-journey/feature-services/stageReaders", () => ({
  readImpressions: (...a: unknown[]) => readImpressions(...a),
  readVisits: (...a: unknown[]) => readVisits(...a),
  readLeads: (...a: unknown[]) => readLeads(...a),
  readPms: (...a: unknown[]) => readPms(...a),
  readRank: (...a: unknown[]) => readRank(...a),
  readReviews: (...a: unknown[]) => readReviews(...a),
}));

const warnLog = vi.fn();
// Keep the Pino logger inert (no transport noise during the assertion).
vi.mock("../lib/logger", () => ({
  default: { info: vi.fn(), warn: (...a: unknown[]) => warnLog(...a), error: vi.fn() },
}));

import {
  assemblePatientJourney,
  PatientJourneyNotFoundError,
} from "../controllers/patient-journey/feature-services/PatientJourneyService";

const ORG = 7;
const LOCATION = 42;
const MONTH = "2026-06-01";

const stage = (
  value: number | null,
  available: boolean,
  metadata?: StageRead["metadata"],
  note?: string,
): StageRead => ({
  value,
  available,
  asOf: available ? "2026-06-28" : null,
  metadata,
  note,
});

const FULL_PMS: PmsRead = {
  patients: stage(50, true),
  revenue: { value: 120000, available: true },
};
const FULL_RANK: RankRead = {
  position: 2,
  totalCompetitors: 9,
  available: true,
  notInTop20: false,
};
const FULL_REVIEWS: ReviewsRead = {
  rating: 4.8,
  count: 210,
  newThisMonth: 5,
  replyRatePct: 92,
  available: true,
};

/** Default = single-location health org, project present, every stage live. */
function seedHappyPath(): void {
  findLocationById.mockResolvedValue({
    id: LOCATION,
    name: "Main St",
    organization_id: ORG,
  });
  findOrgById.mockResolvedValue({ id: ORG, organization_type: "health" });
  countLocations.mockResolvedValue({ count: 1 });
  findProjectByOrg.mockResolvedValue({ id: "proj-1" });

  readImpressions.mockResolvedValue(stage(4000, true));
  readVisits.mockResolvedValue(stage(800, true));
  readLeads.mockResolvedValue(stage(120, true));
  readPms.mockResolvedValue(FULL_PMS);
  readRank.mockResolvedValue(FULL_RANK);
  readReviews.mockResolvedValue(FULL_REVIEWS);
  findReplyableForLocation.mockResolvedValue([]);
  getLocationReadiness.mockResolvedValue({ ready: false });
  findLatestForJourney.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  seedHappyPath();
});

describe("assemblePatientJourney — contract shape", () => {
  it("returns the full contract with the three monitored stages in journey order", async () => {
    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(result.location).toMatchObject({
      id: LOCATION,
      organizationId: ORG,
      orgType: "health",
      isMultiLocation: false,
    });
    expect(result.period).toMatchObject({
      label: "June 2026",
      startDate: MONTH,
    });
    expect(result.stages.map((s) => s.key)).toEqual([
      "impressions",
      "visits",
      "leads",
    ]);
    // One conversion per adjacent pair (3 stages → 2 steps).
    expect(result.conversions).toHaveLength(2);
    expect(result.revenue).toEqual({ value: 120000, available: true });
    expect(result.stages.find((s) => s.key === "patients")).toBeUndefined();
    expect(result.context.rank).toEqual({
      position: 2,
      totalCompetitors: 9,
      available: true,
      notInTop20: false,
    });
    expect(result.context.reviews).toMatchObject({
      rating: 4.8,
      count: 210,
      available: true,
      card: null,
    });
    expect(typeof result.headline.text).toBe("string");
    expect(result.stages[0]).toMatchObject({
      key: "impressions",
      label: "Google Visibility",
      metaLabel: "How often you showed up on Google",
      source: "Google Search Console + Business Profile",
      shared: true,
    });
  });

  it("computes per-step conversion percentages from trusted count stages only", async () => {
    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    const byStep = Object.fromEntries(
      result.conversions.map((c) => [`${c.fromKey}>${c.toKey}`, c.pct]),
    );
    // impressions 4000 → visits 800 = 20.0 %
    expect(byStep["impressions>visits"]).toBe(20);
    // visits 800 → leads 120 = 15.0 %
    expect(byStep["visits>leads"]).toBe(15);
    expect(byStep["leads>patients"]).toBeUndefined();
  });

  it("builds the reply-gap card from the mocked optional enrichment seams", async () => {
    findReplyableForLocation.mockResolvedValue([
      { id: "review-1" },
      { id: "review-2" },
    ]);
    getLocationReadiness.mockResolvedValue({ ready: true });

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(findReplyableForLocation).toHaveBeenCalledWith(LOCATION, {
      limit: 25,
    });
    expect(getLocationReadiness).toHaveBeenCalledWith(ORG, LOCATION);
    expect(result.context.reviews.card).toMatchObject({
      rung: "reply_gap",
      execution_state: "built",
      caught_number: 2,
    });
  });

  it("keeps the funnel available when optional reply enrichment fails", async () => {
    findReplyableForLocation.mockRejectedValue(new Error("reviews unavailable"));
    getLocationReadiness.mockRejectedValue(new Error("readiness unavailable"));

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(result.stages).toHaveLength(3);
    expect(result.context.reviews.card).toBeNull();
    expect(warnLog).toHaveBeenCalledTimes(2);
  });
});

describe("assemblePatientJourney — empty / not-connected paths", () => {
  it("does not create a patient-conversion stage from unavailable PMS data", async () => {
    readPms.mockResolvedValue({
      patients: stage(null, false),
      revenue: { value: null, available: false },
    });

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(result.stages.find((s) => s.key === "patients")).toBeUndefined();
    expect(result.revenue).toEqual({ value: null, available: false });
    expect(
      result.conversions.find((c) => c.toKey === "patients"),
    ).toBeUndefined();
  });

  it("renders honest empty stages (and a guidance headline) when no project / no sources are connected", async () => {
    findProjectByOrg.mockResolvedValue(null); // no website → traffic stages empty
    readPms.mockResolvedValue({
      patients: stage(null, false),
      revenue: { value: null, available: false },
    });

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(
      result.stages.every((s) => s.available === false && s.value === null),
    ).toBe(true);
    expect(
      result.conversions.every((c) => c.pct === null && c.isLeak === false),
    ).toBe(true);
    expect(result.leakStageKey).toBeNull();
    expect(result.headline.text).toMatch(/which growth gate needs attention/i);
  });
});

describe("assemblePatientJourney — metric actions", () => {
  it("attaches the latest matching action to the impressions stage only", async () => {
    const action = {
      id: "action-1",
      actionType: "seo_meta_update" as const,
      metricKey: "ctr" as const,
      occurredAt: "2026-06-12T08:30:00.000Z",
      activeUntil: "2026-07-12T08:30:00.000Z",
      summary: "Updated Google search titles on 3 pages.",
      measurementNote: "Watching Google click-through through July 12.",
    };
    findLatestForJourney.mockResolvedValue(action);

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(
      result.stages.find((item) => item.key === "impressions")?.actions,
    ).toEqual([action]);
    expect(
      result.stages.find((item) => item.key === "visits"),
    ).not.toHaveProperty("actions");
    expect(
      result.stages.find((item) => item.key === "leads"),
    ).not.toHaveProperty("actions");
  });

  it("returns an empty impressions action array when no action matches", async () => {
    findLatestForJourney.mockResolvedValue(null);

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(
      result.stages.find((item) => item.key === "impressions")?.actions,
    ).toEqual([]);
  });

  it("passes resolved tenant, project, and half-open month bounds to the action service", async () => {
    await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(findLatestForJourney).toHaveBeenCalledWith({
      organizationId: ORG,
      locationId: LOCATION,
      projectId: "proj-1",
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-01T00:00:00.000Z"),
    });
  });
});

describe("assemblePatientJourney — impressions unavailable reason", () => {
  it("copies the impressions reader's unavailableReason onto the stage only", async () => {
    readImpressions.mockResolvedValue({
      value: null,
      available: false,
      asOf: null,
      unavailableReason: "pending",
    });

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    const impressions = result.stages.find((s) => s.key === "impressions");
    expect(impressions?.available).toBe(false);
    expect(impressions?.unavailableReason).toBe("pending");
    expect(
      result.stages.find((s) => s.key === "visits")?.unavailableReason,
    ).toBeUndefined();
    expect(
      result.stages.find((s) => s.key === "leads")?.unavailableReason,
    ).toBeUndefined();
  });

  it("omits the reason for a legacy reason-less empty read", async () => {
    readImpressions.mockResolvedValue(stage(null, false));

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    const impressions = result.stages.find((s) => s.key === "impressions");
    expect(impressions?.available).toBe(false);
    expect(impressions?.unavailableReason).toBeUndefined();
  });

  it("tells the impressions reader whether the report month is the current UTC month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 15))); // June 15, 2026 (UTC)
    try {
      await assemblePatientJourney({
        organizationId: ORG,
        locationId: LOCATION,
        reportMonth: "2026-06-01",
      });
      expect(readImpressions).toHaveBeenLastCalledWith(
        "proj-1",
        "2026-06-01",
        "2026-06-30",
        true,
        ORG,
      );

      await assemblePatientJourney({
        organizationId: ORG,
        locationId: LOCATION,
        reportMonth: "2026-05-01",
      });
      expect(readImpressions).toHaveBeenLastCalledWith(
        "proj-1",
        "2026-05-01",
        "2026-05-31",
        false,
        ORG,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("assemblePatientJourney — leak selection", () => {
  it("flags the single smallest non-null step as the biggest leak and names it in the headline", async () => {
    // Make visits → leads the worst step (5%), impressions → visits healthier.
    readImpressions.mockResolvedValue(stage(8000, true)); // funnel head
    readVisits.mockResolvedValue(stage(4000, true)); // impressions→visits = 50%
    readLeads.mockResolvedValue(stage(200, true)); // visits→leads = 5%  ← leak
    readPms.mockResolvedValue({
      patients: stage(100, true),
      revenue: { value: 1, available: true },
    });

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    const leakSteps = result.conversions.filter((c) => c.isLeak);
    expect(leakSteps).toHaveLength(1);
    expect(leakSteps[0]).toMatchObject({ fromKey: "visits", toKey: "leads" });
    expect(result.leakStageKey).toBe("leads");
    expect(result.headline.leakStageKey).toBe("leads");
    expect(result.headline.text).toMatch(/Website Visitors.*Website Leads/);
  });

  it("does not let PMS revenue or patient records create a production/patient stage", async () => {
    readPms.mockResolvedValue({
      patients: stage(100, true),
      revenue: { value: 80000, available: true },
    });

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(result.stages.find((s) => s.key === "patients")).toBeUndefined();
    expect(
      result.conversions.find((c) => c.toKey === "patients"),
    ).toBeUndefined();
    expect(result.leakStageKey).not.toBe("patients");
    expect(result.revenue).toEqual({ value: 80000, available: true });
  });
});

describe("assemblePatientJourney — org-type wording", () => {
  it("ends the health pipeline at website leads, not patients", async () => {
    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });
    const lastStage = result.stages[result.stages.length - 1];
    expect(lastStage?.key).toBe("leads");
    expect(lastStage?.label).toBe("Website Leads");
  });

  it("preserves generic org type without adding a clinical conversion stage", async () => {
    findOrgById.mockResolvedValue({ id: ORG, organization_type: "generic" });

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(result.location.orgType).toBe("generic");
    expect(result.stages.find((s) => s.key === "patients")).toBeUndefined();
    expect(result.stages.map((s) => s.label)).toEqual([
      "Google Visibility",
      "Website Visitors",
      "Website Leads",
    ]);
  });
});

describe("assemblePatientJourney — multi-location labelling", () => {
  it("flags shared website-traffic stages as whole-practice for a multi-location org", async () => {
    countLocations.mockResolvedValue({ count: 3 });

    const result = await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(result.location.isMultiLocation).toBe(true);
    const impressions = result.stages.find((s) => s.key === "impressions");
    const leads = result.stages.find((s) => s.key === "leads");
    expect(impressions?.shared).toBe(true);
    expect(impressions?.note).toMatch(/whole-practice/i);
    expect(leads?.note).toMatch(/whole-practice/i);
    // The shared note must not claim "website": the impressions gate folds in
    // whole-practice GBP Maps, and this note SHADOWS the source in the SPA
    // tooltip (`note?.trim() || source`), so "website total" would mislabel the
    // combined number. Honest for all three gates instead.
    expect(impressions?.note).toBe("Whole-practice total — all locations.");
    expect(impressions?.note).not.toMatch(/website/i);
  });
});

describe("assemblePatientJourney — tenant scope (§5.5/§11.7)", () => {
  it("rejects a location that belongs to a different organization", async () => {
    findLocationById.mockResolvedValue({
      id: LOCATION,
      name: "Main St",
      organization_id: 999,
    });

    await expect(
      assemblePatientJourney({
        organizationId: ORG,
        locationId: LOCATION,
        reportMonth: MONTH,
      }),
    ).rejects.toBeInstanceOf(PatientJourneyNotFoundError);
  });

  it("rejects a missing location (cannot leak another tenant's data via a bad id)", async () => {
    findLocationById.mockResolvedValue(undefined);

    await expect(
      assemblePatientJourney({
        organizationId: ORG,
        locationId: LOCATION,
        reportMonth: MONTH,
      }),
    ).rejects.toBeInstanceOf(PatientJourneyNotFoundError);
  });

  it("passes the server-supplied org/location into the per-location readers unchanged", async () => {
    await assemblePatientJourney({
      organizationId: ORG,
      locationId: LOCATION,
      reportMonth: MONTH,
    });

    expect(readPms).toHaveBeenCalledWith(ORG, LOCATION);
    expect(readRank).toHaveBeenCalledWith(ORG, LOCATION);
  });
});
