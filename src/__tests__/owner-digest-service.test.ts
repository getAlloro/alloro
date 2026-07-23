/**
 * Owner Weekly Digest service — kill-switch, recipient scope, and the
 * "nothing honest to say → skip" rule.
 *
 * Mocks at the model / domain-service / send seam so the REAL OwnerDigestService
 * logic runs. §20.4 — all data synthetic; no real email is sent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockDb } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());
vi.mock("../controllers/patient-journey/feature-services/PatientJourneyService", () => ({
  assemblePatientJourney: vi.fn(),
}));

import { OwnerDigestService } from "../services/owner-digest/OwnerDigestService";
import { OrganizationModel } from "../models/OrganizationModel";
import { LocationModel } from "../models/LocationModel";
import { OrganizationUserModel } from "../models/OrganizationUserModel";
import { ProofReceiptService } from "../controllers/proof-receipt/feature-services/ProofReceiptService";
import { assemblePatientJourney } from "../controllers/patient-journey/feature-services/PatientJourneyService";
import * as emailService from "../emails/emailService";
import type { ProofReceipt } from "../controllers/proof-receipt/ProofReceiptTypes";
import type { PatientJourney } from "../controllers/patient-journey/feature-utils/types";

const ORG_ID = 39;
const NOW = new Date(Date.UTC(2026, 6, 21, 13, 0, 0)); // Jul 21 2026

function stubOrg(overrides: Record<string, unknown> = {}) {
  vi.spyOn(OrganizationModel, "findById").mockResolvedValue({
    id: ORG_ID,
    name: "One Endodontics",
    archived_at: null,
    ...overrides,
  } as Awaited<ReturnType<typeof OrganizationModel.findById>>);
}

function stubLocations(rows = [{ id: 100, is_primary: true }, { id: 200, is_primary: false }]) {
  vi.spyOn(LocationModel, "findByOrganizationId").mockResolvedValue(
    rows as Awaited<ReturnType<typeof LocationModel.findByOrganizationId>>
  );
}

function stubMembers(
  rows = [
    { user_id: 1, organization_id: ORG_ID, role: "admin", name: "Dr. Rivera", email: "owner@practice.test" },
    { user_id: 2, organization_id: ORG_ID, role: "viewer", name: "Front Desk", email: "desk@practice.test" },
  ]
) {
  vi.spyOn(OrganizationUserModel, "listByOrgWithUsers").mockResolvedValue(
    rows as Awaited<ReturnType<typeof OrganizationUserModel.listByOrgWithUsers>>
  );
}

function stubReceipt(total: number, localPosts = total, reviewReplies = 0): void {
  const receipt: ProofReceipt = {
    organizationId: ORG_ID,
    since: new Date(),
    until: new Date(),
    items:
      total > 0
        ? [{ type: "local_post", at: new Date(Date.UTC(2026, 6, 20)), workItemId: "w1", locationId: 100 }]
        : [],
    summary: { reviewReplies, localPosts, total },
    pagination: { page: 1, limit: 25, total, totalPages: 1 },
  };
  vi.spyOn(ProofReceiptService, "getReceipt").mockResolvedValue(receipt);
}

function stubFunnel(available: boolean): void {
  const journey = {
    location: { id: 100, name: "One Endodontics", organizationId: ORG_ID, orgType: "health", isMultiLocation: true },
    period: { label: "July 2026", startDate: "2026-07-01", endDate: "2026-07-31" },
    stages: [
      { key: "impressions", label: "Google Visibility", metaLabel: "How often you showed up on Google", value: available ? 1436 : null, available, source: "s", asOf: null, shared: true },
      { key: "visits", label: "Website Visitors", metaLabel: "Website visitors", value: available ? 275 : null, available, source: "s", asOf: null, shared: true },
      { key: "leads", label: "Website Leads", metaLabel: "Verified submissions", value: available ? 7 : null, available, source: "s", asOf: null, shared: true },
    ],
    conversions: [],
    leakStageKey: null,
    bookableCard: null,
    revenue: { value: null, available: false },
    context: { rank: { position: null, available: false, notInTop20: false }, reviews: { rating: null, count: null, newThisMonth: null, replyRatePct: null, available: false, card: null } },
    headline: { text: "", leakStageKey: null },
  } as unknown as PatientJourney;
  vi.mocked(assemblePatientJourney).mockResolvedValue(journey);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(assemblePatientJourney).mockReset();
  vi.spyOn(emailService, "sendEmail").mockResolvedValue({
    success: true,
    messageId: "test",
    timestamp: new Date().toISOString(),
  });
  delete process.env.OWNER_WEEKLY_DIGEST_ENABLED;
});

afterEach(() => {
  delete process.env.OWNER_WEEKLY_DIGEST_ENABLED;
});

describe("OwnerDigestService.runWeeklyDigest — kill-switch", () => {
  it("sends nothing and reports disabled when the flag is off", async () => {
    process.env.OWNER_WEEKLY_DIGEST_ENABLED = "false";
    const eligibleSpy = vi.spyOn(OrganizationModel, "findWeeklyDigestEligibleIds");

    const result = await OwnerDigestService.runWeeklyDigest(NOW);

    expect(result).toEqual({ enabled: false, eligible: 0, sent: 0, skipped: 0, failed: 0 });
    expect(eligibleSpy).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it("stays off for any non-'true' value (fails closed)", async () => {
    process.env.OWNER_WEEKLY_DIGEST_ENABLED = "1";
    const result = await OwnerDigestService.runWeeklyDigest(NOW);
    expect(result.enabled).toBe(false);
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it("sendForOrg is itself fail-closed — no send when the flag is off (defense in depth)", async () => {
    // Flag unset. A direct caller of sendForOrg must still not email an owner.
    stubOrg();
    stubLocations();
    stubMembers();
    stubReceipt(3);
    stubFunnel(true);

    const outcome = await OwnerDigestService.sendForOrg(ORG_ID, NOW);

    expect(outcome).toBe("skipped");
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it("runs the batch when the flag is exactly 'true'", async () => {
    process.env.OWNER_WEEKLY_DIGEST_ENABLED = "true";
    vi.spyOn(OrganizationModel, "findWeeklyDigestEligibleIds").mockResolvedValue([ORG_ID]);
    stubOrg();
    stubLocations();
    stubMembers();
    stubReceipt(3);
    stubFunnel(true);

    const result = await OwnerDigestService.runWeeklyDigest(NOW);

    expect(result.enabled).toBe(true);
    expect(result.eligible).toBe(1);
    expect(result.sent).toBe(1);
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("OwnerDigestService.composeForOrg — recipient scope + honesty", () => {
  it("resolves recipients to ADMIN members only", async () => {
    stubOrg();
    stubLocations();
    stubMembers();
    stubReceipt(3);
    stubFunnel(true);

    const composed = await OwnerDigestService.composeForOrg(ORG_ID, NOW);

    expect(composed).not.toBeNull();
    expect(composed?.recipients).toEqual(["owner@practice.test"]);
  });

  it("returns null (skip) when the org has no admin recipients", async () => {
    stubOrg();
    stubLocations();
    stubMembers([
      { user_id: 2, organization_id: ORG_ID, role: "viewer", name: "Front Desk", email: "desk@practice.test" },
    ]);
    stubReceipt(3);
    stubFunnel(true);

    const composed = await OwnerDigestService.composeForOrg(ORG_ID, NOW);
    expect(composed).toBeNull();
  });

  it("skips when there is no work AND no connected funnel gate (no hollow email)", async () => {
    stubOrg();
    stubLocations();
    stubMembers();
    stubReceipt(0);
    stubFunnel(false);

    const composed = await OwnerDigestService.composeForOrg(ORG_ID, NOW);
    expect(composed).toBeNull();
  });

  it("still sends when there is no work but a funnel gate is connected", async () => {
    stubOrg();
    stubLocations();
    stubMembers();
    stubReceipt(0);
    stubFunnel(true);

    const composed = await OwnerDigestService.composeForOrg(ORG_ID, NOW);
    expect(composed).not.toBeNull();
    expect(composed?.data.work.total).toBe(0);
  });

  it("carries the receipt's real counts through unchanged (no fabrication)", async () => {
    stubOrg();
    stubLocations();
    stubMembers();
    stubReceipt(3, 2, 1);
    stubFunnel(true);

    const composed = await OwnerDigestService.composeForOrg(ORG_ID, NOW);
    expect(composed?.data.work).toMatchObject({ total: 3, localPosts: 2, reviewReplies: 1, businessInfoUpdates: 0 });
    expect(composed?.data.funnel.gates.map((g) => g.value)).toEqual([1436, 275, 7]);
  });

  it("derives business-info updates as the honest remainder (total − posts − replies)", async () => {
    stubOrg();
    stubLocations();
    stubMembers();
    stubReceipt(5, 2, 1); // total 5, 2 posts, 1 reply → 2 business-info updates
    stubFunnel(true);

    const composed = await OwnerDigestService.composeForOrg(ORG_ID, NOW);
    expect(composed?.data.work.businessInfoUpdates).toBe(2);
  });

  it("degrades the funnel to unavailable gates when assembly throws, but still sends on work", async () => {
    stubOrg();
    stubLocations();
    stubMembers();
    stubReceipt(3);
    vi.mocked(assemblePatientJourney).mockRejectedValue(new Error("gsc down"));

    const composed = await OwnerDigestService.composeForOrg(ORG_ID, NOW);
    expect(composed).not.toBeNull();
    expect(composed?.data.funnel.gates.every((g) => g.available === false)).toBe(true);
  });

  it("returns null for an archived org", async () => {
    stubOrg({ archived_at: new Date() });
    stubLocations();
    stubMembers();

    const composed = await OwnerDigestService.composeForOrg(ORG_ID, NOW);
    expect(composed).toBeNull();
  });
});
