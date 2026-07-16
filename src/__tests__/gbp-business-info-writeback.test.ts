/**
 * A6 — GBP write-back. Proves the owner-approved businessInformation PATCH runs
 * end-to-end WITHOUT a real Google account: the two Google touchpoints (the live-read
 * snapshot and the PATCH) are stubbed at the module seam, so NO real network request
 * can escape during build or the adversary pass. It proves the logic — the structural
 * approval gate, capture-before-write, revert, and the honesty gates — not the real
 * Google API or the SQL (mocked at the model seam; that stays Dave's runtime truth-gate).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  patchBusinessInfo: vi.fn(),
  getProfile: vi.fn(),
  getOAuth: vi.fn(),
  assertActive: vi.fn(),
  notificationCreate: vi.fn(),
  getReadiness: vi.fn(),
  findEffectiveSettings: vi.fn(),
  findWorkItem: vi.fn(),
  findScopedWorkItem: vi.fn(),
  updateWorkItem: vi.fn(),
  markPublished: vi.fn(),
  markFailedToDraft: vi.fn(),
  markDeploying: vi.fn(),
  approveModel: vi.fn(),
  rejectIfPending: vi.fn(),
  claimRevert: vi.fn(),
  releaseRevertClaim: vi.fn(),
  createAttempt: vi.fn(),
  markSucceeded: vi.fn(),
  markFailed: vi.fn(),
  eventCreate: vi.fn(),
  createWorkItem: vi.fn(),
  findProperty: vi.fn(),
  queueAdd: vi.fn(),
  loggerError: vi.fn(),
  /**
   * A sentinel transaction handle. The db mock hands this to the callback, so a
   * test can prove a write was made INSIDE the transaction by asserting the model
   * received this exact handle (§10.5).
   */
  trx: { __sentinelTrx: true } as unknown,
}));

// The ONLY two Google touchpoints — both stubbed so no real request can escape.
vi.mock("../controllers/gbp/gbp-services/gbp-write.service", () => ({
  patchGbpBusinessInformation: h.patchBusinessInfo,
}));
vi.mock("../controllers/gbp/gbp-services/location-handler.service", () => ({
  getLocationProfileForRanking: h.getProfile,
}));
vi.mock("../auth/oauth2Helper", () => ({
  getValidOAuth2ClientByConnection: h.getOAuth,
}));
vi.mock("../database/connection", () => ({
  db: {
    // createDraft/approve/reject/enqueueDeployment wrap their multi-table writes in
    // a transaction (§10.5). The callback gets the SENTINEL handle so a test can
    // assert each model call was made inside it. NOTE: the models are mocked, so
    // this proves the transaction is threaded through — real ROLLBACK semantics are
    // PostgreSQL's and are not exercised here (no live DB in this suite).
    transaction: async (fn: (trx: unknown) => Promise<unknown>) => fn(h.trx),
  },
}));
vi.mock("../workers/queues", () => ({
  getGbpAutomationQueue: () => ({ add: h.queueAdd }),
}));
vi.mock("../services/OrganizationLifecycleService", () => ({
  OrganizationLifecycleService: { assertActive: h.assertActive },
  OrganizationArchivedError: class OrganizationArchivedError extends Error {},
}));
vi.mock("../controllers/gbp-automation/feature-services/GbpNotificationService", () => ({
  GbpNotificationService: { create: h.notificationCreate },
}));
vi.mock("../controllers/gbp-automation/feature-services/GbpReadinessService", () => ({
  GbpReadinessService: { getLocationReadiness: h.getReadiness },
}));
vi.mock("../models/GbpAutomationSettingsModel", () => ({
  GbpAutomationSettingsModel: { findEffectiveForLocation: h.findEffectiveSettings },
}));
vi.mock("../models/GbpWorkItemModel", () => ({
  GbpWorkItemModel: {
    findById: h.findWorkItem,
    findByIdForScope: h.findScopedWorkItem,
    updateById: h.updateWorkItem,
    markPublished: h.markPublished,
    markFailedToDraft: h.markFailedToDraft,
    markDeploying: h.markDeploying,
    approve: h.approveModel,
    rejectBusinessInfoIfPending: h.rejectIfPending,
    claimBusinessInfoRevert: h.claimRevert,
    releaseBusinessInfoRevertClaim: h.releaseRevertClaim,
    create: h.createWorkItem,
  },
}));
vi.mock("../models/GbpDeploymentAttemptModel", () => ({
  GbpDeploymentAttemptModel: {
    createRunningNext: h.createAttempt,
    markSucceeded: h.markSucceeded,
    markFailed: h.markFailed,
  },
}));
vi.mock("../models/GbpWorkEventModel", () => ({
  GbpWorkEventModel: { create: h.eventCreate },
}));
vi.mock("../models/GooglePropertyModel", () => ({
  GooglePropertyModel: { findById: h.findProperty },
}));
vi.mock("../lib/logger", () => ({
  default: { error: h.loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GbpBusinessInfoDeploymentService } from "../controllers/gbp-automation/feature-services/GbpBusinessInfoDeploymentService";
import { GbpBusinessInfoDraftService } from "../controllers/gbp-automation/feature-services/GbpBusinessInfoDraftService";
import {
  extractMaskedFields,
  parseBusinessInfoDraftInput,
} from "../controllers/gbp-automation/feature-utils/gbpBusinessInfo";

const READY = {
  googleProperty: { id: 7 },
  checks: {
    hasGoogleConnection: true,
    hasRefreshToken: true,
    hasBusinessManageScope: true,
    hasAccountId: true,
    hasExternalId: true,
  },
};

function deployingItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "wi-1",
    organization_id: 1,
    location_id: 2,
    google_property_id: 7,
    content_type: "business_info",
    status: "deploying",
    draft_content: "Update phone number on Google",
    approved_content: "Update phone number on Google",
    business_info_payload: {
      patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
      updateMask: ["phoneNumbers"],
    },
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.notificationCreate.mockResolvedValue(1);
  h.eventCreate.mockResolvedValue({ id: "ev-1" });
  h.assertActive.mockResolvedValue(undefined);
  h.getReadiness.mockResolvedValue(READY);
  h.findEffectiveSettings.mockResolvedValue({ business_info_writeback_enabled: true });
  h.findProperty.mockResolvedValue({
    id: 7,
    account_id: "111",
    external_id: "222",
    google_connection_id: 9,
  });
  h.getOAuth.mockResolvedValue({});
  h.getProfile.mockResolvedValue({ phoneNumbers: { primaryPhone: "+1 555 000 0000" } });
  h.patchBusinessInfo.mockResolvedValue({ name: "locations/222" });
  h.createAttempt.mockResolvedValue({ id: "att-1" });
  h.markPublished.mockResolvedValue(1);
  h.markFailedToDraft.mockResolvedValue(1);
  h.markDeploying.mockResolvedValue(1);
  h.approveModel.mockResolvedValue(1);
  h.updateWorkItem.mockResolvedValue(1);
  h.rejectIfPending.mockResolvedValue(1);
  h.claimRevert.mockResolvedValue(1);
  h.releaseRevertClaim.mockResolvedValue(1);
  h.queueAdd.mockResolvedValue({ id: "job-1" });
  h.createWorkItem.mockResolvedValue({ id: "wi-1", status: "draft" });
});

describe("parseBusinessInfoDraftInput — boundary validation (§11.2)", () => {
  it("keeps only allowlisted fields, derives the mask from them, sanitizes the website", () => {
    const out = parseBusinessInfoDraftInput({
      fields: {
        websiteUri: "https://example.com/clinic",
        title: "Bright Smile Dental",
        evilField: "drop me",
      },
    });
    expect(out.updateMask.sort()).toEqual(["title", "websiteUri"]);
    expect(out.patch).toEqual({
      websiteUri: "https://example.com/clinic",
      title: "Bright Smile Dental",
    });
    expect(out.summary).toContain("Update");
  });

  it("drops a non-http website and throws when nothing valid remains", () => {
    expect(() => parseBusinessInfoDraftInput({ fields: { websiteUri: "javascript:alert(1)" } })).toThrow(
      /valid/i
    );
  });

  it("rejects an empty / missing fields object (no empty-mask write)", () => {
    expect(() => parseBusinessInfoDraftInput({})).toThrow(/profile fields/i);
    expect(() => parseBusinessInfoDraftInput({ fields: {} })).toThrow(/valid/i);
  });

  it("sanitizes the profile description", () => {
    const out = parseBusinessInfoDraftInput({
      fields: { profile: { description: "  Family dentistry  " } },
    });
    expect(out.patch.profile).toEqual({ description: "Family dentistry" });
  });
});

describe("extractMaskedFields — the rollback snapshot", () => {
  it("captures the current value for a present field and null for an absent one", () => {
    const snapshot = extractMaskedFields(
      { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
      ["phoneNumbers", "websiteUri"]
    );
    expect(snapshot).toEqual({
      phoneNumbers: { primaryPhone: "+1 555 000 0000" },
      websiteUri: null,
    });
  });
});

describe("deployNow — structural gate + capture-before-write", () => {
  it("refuses to write from any status other than 'deploying' (no write from a draft/approved item)", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem({ status: "approved" }));
    await expect(GbpBusinessInfoDeploymentService.deployNow("wi-1", 5)).rejects.toThrow(/not queued/i);
    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
    expect(h.createAttempt).not.toHaveBeenCalled();
  });

  it("captures the live snapshot BEFORE the patch, persists it, then publishes", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.getProfile).toHaveBeenCalledTimes(1);
    expect(h.patchBusinessInfo).toHaveBeenCalledTimes(1);
    // snapshot read strictly precedes the write
    expect(h.getProfile.mock.invocationCallOrder[0]).toBeLessThan(
      h.patchBusinessInfo.mock.invocationCallOrder[0]
    );
    // the snapshot is persisted (previousValues) before the write too
    const snapshotWrite = h.updateWorkItem.mock.calls.find(
      (c) => (c[1] as { business_info_payload?: { previousValues?: unknown } }).business_info_payload?.previousValues
    );
    expect(snapshotWrite).toBeTruthy();
    expect(h.updateWorkItem.mock.invocationCallOrder[0]).toBeLessThan(
      h.patchBusinessInfo.mock.invocationCallOrder[0]
    );
    // the write targets the v1 locations/{id} resource, with the mask
    expect(h.patchBusinessInfo).toHaveBeenCalledWith(
      expect.anything(),
      "locations/222",
      { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
      ["phoneNumbers"]
    );
    expect(h.markPublished).toHaveBeenCalledTimes(1);
    expect(h.notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "gbp_business_info_published" })
    );
  });

  it("aborts the write when the snapshot read fails (no rollback point = no write)", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    h.getProfile.mockResolvedValue(null);
    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
    expect(h.markPublished).not.toHaveBeenCalled();
    expect(h.markFailedToDraft).toHaveBeenCalledTimes(1);
  });

  it("on a 403 the snapshot is already saved and the item fails without publishing", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    const { GbpAutomationError } = await import(
      "../controllers/gbp-automation/feature-utils/GbpAutomationError"
    );
    h.patchBusinessInfo.mockRejectedValue(
      new GbpAutomationError("GBP_GOOGLE_PERMISSION_DENIED", "denied")
    );
    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    // snapshot was persisted before the failed write
    expect(
      h.updateWorkItem.mock.calls.some(
        (c) => (c[1] as { business_info_payload?: { previousValues?: unknown } }).business_info_payload?.previousValues
      )
    ).toBe(true);
    expect(h.markPublished).not.toHaveBeenCalled();
    expect(h.markFailedToDraft).toHaveBeenCalledTimes(1);
  });

  it("does not write to Google when the master switch is disabled", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    h.findEffectiveSettings.mockResolvedValue({ business_info_writeback_enabled: false });
    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
    expect(h.getProfile).not.toHaveBeenCalled();
    expect(h.markFailedToDraft).toHaveBeenCalledTimes(1);
  });

  it("does not write to Google when Google is not ready (missing scope)", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    h.getReadiness.mockResolvedValue({
      ...READY,
      checks: { ...READY.checks, hasBusinessManageScope: false },
    });
    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
    expect(h.markFailedToDraft).toHaveBeenCalledTimes(1);
  });
});

describe("revertNow — the rollback uses the captured snapshot", () => {
  it("patches the previous values back to Google and records the revert", async () => {
    h.findWorkItem.mockResolvedValue(
      deployingItem({
        status: "published",
        business_info_payload: {
          patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
          updateMask: ["phoneNumbers"],
          previousValues: { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
        },
      })
    );
    await GbpBusinessInfoDeploymentService.revertNow("wi-1", 5);

    expect(h.patchBusinessInfo).toHaveBeenCalledWith(
      expect.anything(),
      "locations/222",
      { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
      ["phoneNumbers"]
    );
    expect(h.notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "gbp_business_info_reverted" })
    );
  });

  it("refuses to revert when there is no snapshot (never patches)", async () => {
    h.findWorkItem.mockResolvedValue(
      deployingItem({
        status: "published",
        business_info_payload: { patch: {}, updateMask: ["phoneNumbers"] },
      })
    );
    await expect(GbpBusinessInfoDeploymentService.revertNow("wi-1", 5)).rejects.toThrow(/snapshot/i);
    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
  });

  it("is idempotent — a second revert run does not patch again", async () => {
    h.findWorkItem.mockResolvedValue(
      deployingItem({
        status: "published",
        metadata: { reverted: true },
        business_info_payload: {
          patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
          updateMask: ["phoneNumbers"],
          previousValues: { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
        },
      })
    );
    await GbpBusinessInfoDeploymentService.revertNow("wi-1", 5);
    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
  });
});

describe("capture-ONCE — a retry never re-reads and clobbers the snapshot (Finding 1)", () => {
  it("reuses the persisted snapshot on attempt 2 and never re-reads Google", async () => {
    // Attempt 2: the item already carries previousValues captured on attempt 1.
    h.findWorkItem.mockResolvedValue(
      deployingItem({
        business_info_payload: {
          patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
          updateMask: ["phoneNumbers"],
          previousValues: { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
        },
      })
    );
    // If capture-once were broken, this would return the ALREADY-CHANGED value.
    h.getProfile.mockResolvedValue({ phoneNumbers: { primaryPhone: "+1 555 100 2000" } });

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.getProfile).not.toHaveBeenCalled();
    // the snapshot is NOT rewritten with the changed value
    const clobber = h.updateWorkItem.mock.calls.find(
      (c) =>
        (c[1] as { business_info_payload?: { previousValues?: { phoneNumbers?: { primaryPhone?: string } } } })
          .business_info_payload?.previousValues?.phoneNumbers?.primaryPhone === "+1 555 100 2000"
    );
    expect(clobber).toBeUndefined();
    expect(h.patchBusinessInfo).toHaveBeenCalledTimes(1);
  });
});

describe("mergePatchOverSnapshot — a partial edit preserves sibling subfields (Finding 6)", () => {
  it("keeps additionalPhones when the owner only changes primaryPhone", async () => {
    h.findWorkItem.mockResolvedValue(
      deployingItem({
        business_info_payload: {
          patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
          updateMask: ["phoneNumbers"],
        },
      })
    );
    // Google currently has BOTH a primary and an additional phone.
    h.getProfile.mockResolvedValue({
      phoneNumbers: { primaryPhone: "+1 555 000 0000", additionalPhones: ["+1 555 111 1111"] },
    });

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.patchBusinessInfo).toHaveBeenCalledWith(
      expect.anything(),
      "locations/222",
      { phoneNumbers: { primaryPhone: "+1 555 100 2000", additionalPhones: ["+1 555 111 1111"] } },
      ["phoneNumbers"]
    );
  });
});

describe("reject — guarded so it can't strand a published item's rollback (Finding 4)", () => {
  const rejectParams = { organizationId: 1, workItemId: "wi-1", userId: 5 };

  it("rejects a still-pending profile update", async () => {
    h.findScopedWorkItem.mockResolvedValue(deployingItem({ status: "draft" }));
    h.rejectIfPending.mockResolvedValue(1);
    h.findWorkItem.mockResolvedValue(deployingItem({ status: "rejected" }));
    await GbpBusinessInfoDeploymentService.reject(rejectParams);
    expect(h.rejectIfPending).toHaveBeenCalled();
  });

  it("refuses to reject a published item (would strand the rollback)", async () => {
    h.findScopedWorkItem.mockResolvedValue(deployingItem({ status: "published" }));
    h.rejectIfPending.mockResolvedValue(0); // the model guard blocks the transition
    await expect(GbpBusinessInfoDeploymentService.reject(rejectParams)).rejects.toThrow(/revert it instead/i);
  });
});

describe("enqueueRevert — single-flight (Finding 5 / Sonnet #2)", () => {
  const revertParams = { organizationId: 1, workItemId: "wi-1", userId: 5 };
  const publishedWithSnapshot = () =>
    deployingItem({
      status: "published",
      business_info_payload: {
        patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
        updateMask: ["phoneNumbers"],
        previousValues: { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
      },
    });

  it("enqueues exactly one revert job when it wins the atomic claim", async () => {
    h.findScopedWorkItem.mockResolvedValue(publishedWithSnapshot());
    h.findWorkItem.mockResolvedValue(publishedWithSnapshot());
    h.claimRevert.mockResolvedValue(1);
    await GbpBusinessInfoDeploymentService.enqueueRevert(revertParams);
    expect(h.queueAdd).toHaveBeenCalledTimes(1);
  });

  it("refuses (no job) when another revert already holds the claim", async () => {
    h.findScopedWorkItem.mockResolvedValue(publishedWithSnapshot());
    h.claimRevert.mockResolvedValue(0);
    await expect(GbpBusinessInfoDeploymentService.enqueueRevert(revertParams)).rejects.toThrow(
      /in progress|already/i
    );
    expect(h.queueAdd).not.toHaveBeenCalled();
  });
});

describe("enqueue compensation — a queue failure never strands the item (review finding 3)", () => {
  const params = { organizationId: 1, workItemId: "wi-1", userId: 5 };

  it("returns a deploy-marked item to the retryable failed-draft state when queue.add fails", async () => {
    h.findScopedWorkItem.mockResolvedValue(deployingItem({ status: "approved" }));
    h.queueAdd.mockRejectedValue(new Error("queue backend unavailable"));

    await expect(GbpBusinessInfoDeploymentService.enqueueDeployment(params)).rejects.toThrow(
      /could not be queued/i
    );

    // The compensating write is the exact state retryDeployment gates on:
    // status back to draft with a last_error_code set.
    expect(h.markFailedToDraft).toHaveBeenCalledWith(
      "wi-1",
      "DEPLOY_ENQUEUE_FAILED",
      expect.any(String)
    );
  });

  it("the compensated item is retryable end-to-end (retry approves and re-enqueues)", async () => {
    const compensated = deployingItem({
      status: "draft",
      last_error_code: "DEPLOY_ENQUEUE_FAILED",
    });
    h.findScopedWorkItem
      .mockResolvedValueOnce(compensated) // retryDeployment gate
      .mockResolvedValueOnce(compensated) // approve()'s scoped read
      .mockResolvedValueOnce(deployingItem({ status: "approved" })); // enqueueDeployment's read
    h.findWorkItem.mockResolvedValue(deployingItem({ status: "deploying" }));

    await GbpBusinessInfoDeploymentService.retryDeployment(params);

    expect(h.queueAdd).toHaveBeenCalledTimes(1);
  });

  it("releases the single-flight revert claim when the revert queue.add fails", async () => {
    h.findScopedWorkItem.mockResolvedValue(
      deployingItem({
        status: "published",
        business_info_payload: {
          patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
          updateMask: ["phoneNumbers"],
          previousValues: { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
        },
      })
    );
    h.claimRevert.mockResolvedValue(1);
    h.queueAdd.mockRejectedValue(new Error("queue backend unavailable"));

    await expect(GbpBusinessInfoDeploymentService.enqueueRevert(params)).rejects.toThrow(
      /could not be queued/i
    );

    // The claim is released, so a later revert attempt can win it again.
    expect(h.releaseRevertClaim).toHaveBeenCalledWith("wi-1");
  });

  it("a released claim allows a later revert to enqueue (no permanent lockout)", async () => {
    const published = deployingItem({
      status: "published",
      business_info_payload: {
        patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
        updateMask: ["phoneNumbers"],
        previousValues: { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
      },
    });
    h.findScopedWorkItem.mockResolvedValue(published);
    h.findWorkItem.mockResolvedValue(published);

    // First attempt: enqueue fails, claim is released.
    h.claimRevert.mockResolvedValueOnce(1);
    h.queueAdd.mockRejectedValueOnce(new Error("queue backend unavailable"));
    await expect(GbpBusinessInfoDeploymentService.enqueueRevert(params)).rejects.toThrow();

    // Second attempt: the claim is winnable again and the job enqueues.
    h.claimRevert.mockResolvedValueOnce(1);
    await GbpBusinessInfoDeploymentService.enqueueRevert(params);
    expect(h.queueAdd).toHaveBeenCalledTimes(2);
  });
});

/**
 * §10.5 — a work item and its audit event are two tables and one fact. These
 * assert the transaction is THREADED (both writes get the same handle), which is
 * what the code controls. Real rollback-on-failure is PostgreSQL's behavior and
 * is not exercised here — this suite has no live DB (see the db mock's note).
 */
describe("§10.5 — multi-table writes run inside one transaction", () => {
  const draftParams = {
    organizationId: 1,
    locationId: 2,
    userId: 5,
    actorEmail: "owner@practice.test",
    patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
    updateMask: ["phoneNumbers" as const],
    summary: "Update phone number on Google",
  };

  it("createDraft writes the work item AND its event inside the same transaction", async () => {
    await GbpBusinessInfoDraftService.createDraft(draftParams);

    expect(h.createWorkItem).toHaveBeenCalledTimes(1);
    expect(h.eventCreate).toHaveBeenCalledTimes(1);
    // Both writes carry the sentinel trx → both are inside the transaction.
    expect(h.createWorkItem.mock.calls[0][1]).toBe(h.trx);
    expect(h.eventCreate.mock.calls[0][1]).toBe(h.trx);
  });

  it("createDraft surfaces a failed event write (so the transaction rolls back, not a half-write)", async () => {
    h.eventCreate.mockRejectedValueOnce(new Error("event insert failed"));

    await expect(GbpBusinessInfoDraftService.createDraft(draftParams)).rejects.toThrow(
      "event insert failed"
    );
  });

  it("reject flips the status AND writes its event inside the same transaction", async () => {
    h.findScopedWorkItem.mockResolvedValue(deployingItem({ status: "draft" }));
    h.findWorkItem.mockResolvedValue(deployingItem({ status: "rejected" }));

    await GbpBusinessInfoDeploymentService.reject({
      organizationId: 1,
      workItemId: "wi-1",
      userId: 5,
      reason: "wrong number",
    });

    expect(h.rejectIfPending).toHaveBeenCalledTimes(1);
    expect(h.eventCreate).toHaveBeenCalledTimes(1);
    // rejectBusinessInfoIfPending(id, userId, reason, trx) — 4th arg.
    expect(h.rejectIfPending.mock.calls[0][3]).toBe(h.trx);
    expect(h.eventCreate.mock.calls[0][1]).toBe(h.trx);
  });

  it("a lost reject race writes no event (the guard throws inside the transaction)", async () => {
    h.findScopedWorkItem.mockResolvedValue(deployingItem({ status: "draft" }));
    h.rejectIfPending.mockResolvedValue(0);

    await expect(
      GbpBusinessInfoDeploymentService.reject({
        organizationId: 1,
        workItemId: "wi-1",
        userId: 5,
      })
    ).rejects.toMatchObject({ code: "REJECT_NOT_AVAILABLE" });

    expect(h.eventCreate).not.toHaveBeenCalled();
  });
});

/**
 * §3.2 — never swallow an error. The compensation audit event is best-effort (the
 * caller must still see the typed queue error), but a failure to record it is
 * logged with the identifiers an operator needs, never dropped on the floor.
 */
describe("§3.2 — a failed compensation event is logged, never swallowed", () => {
  it("logs the deploy compensation event failure with workItemId + event type, and still throws the queue error", async () => {
    h.findScopedWorkItem.mockResolvedValue(deployingItem({ status: "approved" }));
    h.queueAdd.mockRejectedValue(new Error("queue backend unavailable"));
    // The in-transaction "deployment_queued" event must land first; only the
    // COMPENSATION event (written after the queue failure) is made to fail.
    h.eventCreate
      .mockResolvedValueOnce({ id: "ev-1" })
      .mockRejectedValue(new Error("event insert failed"));

    await expect(
      GbpBusinessInfoDeploymentService.enqueueDeployment({
        organizationId: 1,
        workItemId: "wi-1",
        userId: 5,
      })
    ).rejects.toMatchObject({ code: "DEPLOY_QUEUE_TRANSIENT_FAILURE" });

    const logged = h.loggerError.mock.calls.find(
      (call) =>
        (call[0] as { eventType?: string })?.eventType ===
        "business_info_deploy_enqueue_failed"
    );
    expect(logged).toBeDefined();
    expect(logged?.[0]).toMatchObject({ workItemId: "wi-1" });
    expect((logged?.[0] as { err?: Error })?.err).toBeInstanceOf(Error);
  });

  it("logs the revert compensation event failure with workItemId + event type, and still throws the queue error", async () => {
    h.findScopedWorkItem.mockResolvedValue(
      deployingItem({
        status: "published",
        business_info_payload: {
          patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
          updateMask: ["phoneNumbers"],
          previousValues: { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
        },
      })
    );
    h.queueAdd.mockRejectedValue(new Error("queue backend unavailable"));
    h.eventCreate.mockRejectedValue(new Error("event insert failed"));

    await expect(
      GbpBusinessInfoDeploymentService.enqueueRevert({
        organizationId: 1,
        workItemId: "wi-1",
        userId: 5,
      })
    ).rejects.toMatchObject({ code: "REVERT_QUEUE_TRANSIENT_FAILURE" });

    const logged = h.loggerError.mock.calls.find(
      (call) =>
        (call[0] as { eventType?: string })?.eventType ===
        "business_info_revert_enqueue_failed"
    );
    expect(logged).toBeDefined();
    expect(logged?.[0]).toMatchObject({ workItemId: "wi-1" });
    expect((logged?.[0] as { err?: Error })?.err).toBeInstanceOf(Error);
  });
});

/** A published item carrying the rollback snapshot — the only revertable shape. */
function revertableItem(overrides: Record<string, unknown> = {}) {
  return deployingItem({
    status: "published",
    business_info_payload: {
      patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
      updateMask: ["phoneNumbers"],
      previousValues: { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
    },
    ...overrides,
  });
}

/**
 * §3.2 — the REST of the swallow class in this service. The compensation swallows
 * were sealed in the prior round; these cover every remaining path that catches and
 * returns instead of re-throwing: the post-revert bookkeeping writes, the
 * deploy-failure notification, and both branches of the deployNow catch.
 *
 * The bookkeeping writes stay best-effort ON PURPOSE — the revert already landed on
 * Google and the claim is released, so throwing would only trigger a re-PATCH — but
 * best-effort must never mean silent.
 */
describe("§3.2 — revert + deploy-failure bookkeeping is logged, never swallowed", () => {
  it("logs a failed revert event write with workItemId + event type, and still completes the revert", async () => {
    h.findWorkItem.mockResolvedValue(revertableItem());
    h.eventCreate.mockRejectedValue(new Error("event insert failed"));

    await expect(GbpBusinessInfoDeploymentService.revertNow("wi-1", 5)).resolves.toBeDefined();

    const logged = h.loggerError.mock.calls.find(
      (call) => (call[0] as { eventType?: string })?.eventType === "business_info_reverted"
    );
    expect(logged).toBeDefined();
    expect(logged?.[0]).toMatchObject({ workItemId: "wi-1" });
    expect((logged?.[0] as { err?: Error })?.err).toBeInstanceOf(Error);
    // The Google PATCH must not be re-issued because bookkeeping failed.
    expect(h.patchBusinessInfo).toHaveBeenCalledTimes(1);
  });

  it("logs a failed revert notification with workItemId + kind, and still completes the revert", async () => {
    h.findWorkItem.mockResolvedValue(revertableItem());
    h.notificationCreate.mockRejectedValue(new Error("notify insert failed"));

    await expect(GbpBusinessInfoDeploymentService.revertNow("wi-1", 5)).resolves.toBeDefined();

    const logged = h.loggerError.mock.calls.find(
      (call) => (call[0] as { kind?: string })?.kind === "gbp_business_info_reverted"
    );
    expect(logged).toBeDefined();
    expect(logged?.[0]).toMatchObject({ workItemId: "wi-1" });
    expect((logged?.[0] as { err?: Error })?.err).toBeInstanceOf(Error);
  });

  it("logs a failed deploy-failure notification with workItemId + kind", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    h.patchBusinessInfo.mockRejectedValue(new Error("google rejected the patch"));
    h.notificationCreate.mockRejectedValue(new Error("notify insert failed"));

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5, { isFinalAttempt: true });

    const logged = h.loggerError.mock.calls.find(
      (call) => (call[0] as { kind?: string })?.kind === "gbp_business_info_deploy_failed"
    );
    expect(logged).toBeDefined();
    expect(logged?.[0]).toMatchObject({ workItemId: "wi-1" });
    expect((logged?.[0] as { err?: Error })?.err).toBeInstanceOf(Error);
  });

  it("logs the underlying error when a deployment fails terminally and returns to draft", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    h.patchBusinessInfo.mockRejectedValue(new Error("google rejected the patch"));

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5, { isFinalAttempt: true });

    const logged = h.loggerError.mock.calls.find((call) =>
      String(call[1]).includes("deployment failed")
    );
    expect(logged).toBeDefined();
    expect(logged?.[0]).toMatchObject({ workItemId: "wi-1", attemptId: "att-1" });
    expect((logged?.[0] as { err?: Error })?.err).toBeInstanceOf(Error);
  });

  it("logs the divergence when Google accepted the patch but local sync failed", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    // The PATCH lands, then the local write fails — our record and the customer's
    // real profile now disagree. This is the one state an operator MUST see.
    h.markPublished.mockRejectedValue(new Error("local sync write failed"));

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5, { isFinalAttempt: true });

    const logged = h.loggerError.mock.calls.find((call) => String(call[1]).includes("diverged"));
    expect(logged).toBeDefined();
    expect(logged?.[0]).toMatchObject({ workItemId: "wi-1", attemptId: "att-1" });
    expect((logged?.[0] as { err?: Error })?.err).toBeInstanceOf(Error);
  });
});
