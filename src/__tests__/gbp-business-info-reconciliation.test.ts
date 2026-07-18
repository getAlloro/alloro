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
  markBusinessInfoDeploying: vi.fn(),
  markBusinessInfoDeployQueued: vi.fn(),
  markBusinessInfoProviderStateUnknown: vi.fn(),
  markBusinessInfoRevertQueued: vi.fn(),
  approveModel: vi.fn(),
  rejectIfPending: vi.fn(),
  claimRevert: vi.fn(),
  releaseRevertClaim: vi.fn(),
  claimAttempt: vi.fn(),
  markSucceeded: vi.fn(),
  markFailed: vi.fn(),
  eventCreate: vi.fn(),
  findProperty: vi.fn(),
  queueAdd: vi.fn(),
  queueGetJob: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  findProjectByOrg: vi.fn(),
  recordCompletenessFill: vi.fn(),
  trx: { __sentinelTrx: true } as unknown,
}));

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
    transaction: () => {
      throw new Error("Services must open transactions through models.");
    },
  },
}));
vi.mock("../workers/queues", () => ({
  getGbpAutomationQueue: () => ({ add: h.queueAdd, getJob: h.queueGetJob }),
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
    markBusinessInfoDeploying: h.markBusinessInfoDeploying,
    markBusinessInfoDeployQueued: h.markBusinessInfoDeployQueued,
    markBusinessInfoProviderStateUnknown: h.markBusinessInfoProviderStateUnknown,
    markBusinessInfoRevertQueued: h.markBusinessInfoRevertQueued,
    approve: h.approveModel,
    rejectBusinessInfoIfPending: h.rejectIfPending,
    claimBusinessInfoRevert: h.claimRevert,
    releaseBusinessInfoRevertClaim: h.releaseRevertClaim,
    transaction: async (fn: (trx: unknown) => Promise<unknown>) => fn(h.trx),
  },
}));
vi.mock("../models/GbpDeploymentAttemptModel", () => ({
  GbpDeploymentAttemptModel: {
    claimRunningAttempt: h.claimAttempt,
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
vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: { findByOrganizationId: h.findProjectByOrg },
}));
vi.mock("../services/MetricActionService", () => ({
  MetricActionService: { recordGbpCompletenessFill: h.recordCompletenessFill },
}));
vi.mock("../lib/logger", () => ({
  default: { error: h.loggerError, warn: h.loggerWarn, info: vi.fn(), debug: vi.fn() },
}));

import { GbpBusinessInfoDeploymentService } from "../controllers/gbp-automation/feature-services/GbpBusinessInfoDeploymentService";

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

function deployingWithSnapshot(overrides: Record<string, unknown> = {}) {
  return deployingItem({
    business_info_payload: {
      patch: { phoneNumbers: { primaryPhone: "+1 555 100 2000" } },
      updateMask: ["phoneNumbers"],
      previousValues: { phoneNumbers: { primaryPhone: "+1 555 000 0000" } },
    },
    ...overrides,
  });
}

function revertableItem(overrides: Record<string, unknown> = {}) {
  return deployingWithSnapshot({ status: "published", ...overrides });
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
  h.claimAttempt.mockResolvedValue({
    state: "claimed",
    attempt: { id: "att-1", status: "running" },
  });
  h.markPublished.mockResolvedValue(1);
  h.markFailedToDraft.mockResolvedValue(1);
  h.markBusinessInfoDeploying.mockResolvedValue(1);
  h.markBusinessInfoDeployQueued.mockResolvedValue(1);
  h.markBusinessInfoProviderStateUnknown.mockResolvedValue(1);
  h.markBusinessInfoRevertQueued.mockResolvedValue(1);
  h.approveModel.mockResolvedValue(1);
  h.updateWorkItem.mockResolvedValue(1);
  h.rejectIfPending.mockResolvedValue(1);
  h.claimRevert.mockResolvedValue("claimed");
  h.releaseRevertClaim.mockResolvedValue(1);
  h.queueAdd.mockResolvedValue({ id: "job-1" });
  h.queueGetJob.mockResolvedValue(undefined);
  h.findProjectByOrg.mockResolvedValue({ id: "proj-1" });
  h.recordCompletenessFill.mockResolvedValue({ id: "ma-1" });
});

describe("queue compensation audit failures", () => {
  it("logs a failed deploy compensation event and still returns the typed queue error", async () => {
    h.findScopedWorkItem.mockResolvedValue(deployingItem({ status: "approved" }));
    h.queueAdd.mockRejectedValue(new Error("queue backend unavailable"));
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

    expect(
      h.loggerError.mock.calls.find(
        (call) => call[0]?.eventType === "business_info_deploy_enqueue_failed"
      )
    ).toBeDefined();
  });

  it("logs a failed revert compensation event and still returns the typed queue error", async () => {
    h.findScopedWorkItem.mockResolvedValue(revertableItem());
    h.queueAdd.mockRejectedValue(new Error("queue backend unavailable"));
    h.eventCreate.mockRejectedValue(new Error("event insert failed"));

    await expect(
      GbpBusinessInfoDeploymentService.enqueueRevert({
        organizationId: 1,
        workItemId: "wi-1",
        userId: 5,
      })
    ).rejects.toMatchObject({ code: "REVERT_QUEUE_TRANSIENT_FAILURE" });

    expect(
      h.loggerError.mock.calls.find(
        (call) => call[0]?.eventType === "business_info_revert_enqueue_failed"
      )
    ).toBeDefined();
  });
});

describe("provider-success bookkeeping", () => {
  it("finalizes attempt, work item, and audit event in one transaction", async () => {
    h.findWorkItem.mockResolvedValue(deployingWithSnapshot());

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.markSucceeded).toHaveBeenCalledWith(
      "att-1",
      { name: "locations/222" },
      h.trx
    );
    expect(h.markPublished).toHaveBeenCalledWith(
      "wi-1",
      expect.objectContaining({ googleResponse: { name: "locations/222" } }),
      h.trx
    );
    const publishedEventCall = h.eventCreate.mock.calls.find(
      (call) => call[0]?.event_type === "business_info_published"
    );
    expect(publishedEventCall?.[1]).toBe(h.trx);
  });

  it("aborts finalization when the publish event fails and leaves a retry receipt", async () => {
    h.findWorkItem.mockResolvedValue(deployingWithSnapshot());
    h.eventCreate.mockRejectedValue(new Error("event insert failed"));

    await expect(
      GbpBusinessInfoDeploymentService.deployNow("wi-1", 5)
    ).rejects.toMatchObject({ code: "BUSINESS_INFO_FINALIZATION_RETRY_REQUIRED" });

    expect(h.markPublished).toHaveBeenCalledWith("wi-1", expect.anything(), h.trx);
    expect(h.updateWorkItem).not.toHaveBeenCalledWith(
      "wi-1",
      expect.objectContaining({ status: "published" })
    );
    expect(h.markSucceeded).toHaveBeenLastCalledWith(
      "att-1",
      { name: "locations/222" }
    );
  });

  it("logs failed revert audit and notification writes without re-patching Google", async () => {
    h.findWorkItem.mockResolvedValue(revertableItem());
    h.eventCreate.mockRejectedValue(new Error("event insert failed"));
    h.notificationCreate.mockRejectedValue(new Error("notify insert failed"));

    await expect(
      GbpBusinessInfoDeploymentService.revertNow("wi-1", 5)
    ).resolves.toBeDefined();

    expect(h.patchBusinessInfo).toHaveBeenCalledTimes(1);
    expect(
      h.loggerError.mock.calls.find(
        (call) => call[0]?.eventType === "business_info_reverted"
      )
    ).toBeDefined();
    expect(
      h.loggerError.mock.calls.find(
        (call) => call[0]?.kind === "gbp_business_info_reverted"
      )
    ).toBeDefined();
  });

  it("logs terminal deploy and notification failures", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    h.patchBusinessInfo.mockRejectedValue(new Error("google rejected the patch"));
    h.notificationCreate.mockRejectedValue(new Error("notify insert failed"));

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5, {
      isFinalAttempt: true,
    });

    expect(
      h.loggerError.mock.calls.find((call) =>
        String(call[1]).includes("deployment failed")
      )
    ).toBeDefined();
    expect(
      h.loggerError.mock.calls.find(
        (call) => call[0]?.kind === "gbp_business_info_deploy_failed"
      )
    ).toBeDefined();
  });

  it("logs and rethrows atomic local-finalization failure", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    h.markPublished.mockRejectedValue(new Error("local sync write failed"));

    await expect(
      GbpBusinessInfoDeploymentService.deployNow("wi-1", 5)
    ).rejects.toMatchObject({ code: "BUSINESS_INFO_FINALIZATION_RETRY_REQUIRED" });

    expect(
      h.loggerError.mock.calls.find((call) =>
        String(call[1]).includes("atomic local finalization failed")
      )
    ).toBeDefined();
    expect(h.updateWorkItem).not.toHaveBeenCalledWith(
      "wi-1",
      expect.objectContaining({ status: "published" })
    );
  });
});

describe("deployNow claim states and reconciliation", () => {
  it("lets a BullMQ retry take over the prior invocation's lease immediately", async () => {
    h.findWorkItem.mockResolvedValue(deployingWithSnapshot());
    h.claimAttempt.mockResolvedValue({
      state: "concurrent_attempt_running",
      attempt: { id: "att-live", status: "running" },
    });

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5, {
      isRetryAttempt: true,
    });

    expect(h.claimAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ work_item_id: "wi-1" }),
      { leaseMs: 0 }
    );
  });

  it("backs off from a live concurrent attempt without writing or finalizing", async () => {
    h.findWorkItem.mockResolvedValue(deployingWithSnapshot());
    h.claimAttempt.mockResolvedValue({
      state: "concurrent_attempt_running",
      attempt: { id: "att-live", status: "running" },
    });

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
    expect(h.markPublished).not.toHaveBeenCalled();
  });

  it("reconciles a provider success after local finalization fails without re-sending", async () => {
    h.findWorkItem.mockResolvedValue(deployingWithSnapshot());
    h.claimAttempt
      .mockResolvedValueOnce({
        state: "claimed",
        attempt: { id: "att-1", status: "running" },
      })
      .mockResolvedValueOnce({
        state: "already_succeeded",
        attempt: {
          id: "att-1",
          status: "succeeded",
          response_payload: { name: "locations/222" },
        },
      });
    h.markPublished.mockRejectedValueOnce(new Error("local finalization failed"));

    await expect(
      GbpBusinessInfoDeploymentService.deployNow("wi-1", 5)
    ).rejects.toThrow();
    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.patchBusinessInfo).toHaveBeenCalledTimes(1);
    expect(h.markPublished).toHaveBeenCalledTimes(2);
  });

  it("records already_succeeded even after the write-back switch is disabled", async () => {
    h.findWorkItem.mockResolvedValue(deployingWithSnapshot());
    h.findEffectiveSettings.mockResolvedValue({ business_info_writeback_enabled: false });
    h.claimAttempt.mockResolvedValue({
      state: "already_succeeded",
      attempt: {
        id: "att-1",
        status: "succeeded",
        response_payload: { name: "locations/222" },
      },
    });

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.markPublished).toHaveBeenCalledTimes(1);
    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
  });

  it("does not re-send when an abandoned attempt is already live", async () => {
    h.findWorkItem.mockResolvedValue(deployingWithSnapshot());
    h.claimAttempt.mockResolvedValue({
      state: "stale_attempt_running",
      attempt: { id: "att-2", status: "running" },
    });
    h.getProfile.mockResolvedValue({
      phoneNumbers: { primaryPhone: "+1 555 100 2000" },
    });

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
    expect(h.markSucceeded).toHaveBeenCalledWith("att-2", expect.anything(), h.trx);
  });

  it("writes when the abandoned attempt did not reach Google", async () => {
    h.findWorkItem.mockResolvedValue(deployingWithSnapshot());
    h.claimAttempt.mockResolvedValue({
      state: "stale_attempt_running",
      attempt: { id: "att-2", status: "running" },
    });

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.patchBusinessInfo).toHaveBeenCalledTimes(1);
  });

  it("does not write blind when the reconciliation read fails", async () => {
    h.findWorkItem.mockResolvedValue(deployingWithSnapshot());
    h.claimAttempt.mockResolvedValue({
      state: "stale_attempt_running",
      attempt: { id: "att-2", status: "running" },
    });
    h.getProfile.mockResolvedValue(null);

    await expect(
      GbpBusinessInfoDeploymentService.deployNow("wi-1", 5, {
        isFinalAttempt: true,
      })
    ).rejects.toMatchObject({ code: "RECONCILE_READ_FAILED" });

    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
    expect(h.markFailed).toHaveBeenCalledWith(
      "att-2",
      "RECONCILE_READ_FAILED",
      expect.any(String),
      null,
      h.trx
    );
    expect(h.markBusinessInfoProviderStateUnknown).toHaveBeenCalledWith(
      "wi-1",
      "att-2",
      h.trx
    );
    expect(h.markFailedToDraft).not.toHaveBeenCalled();
  });

  it("keeps reconciling on later invocations while provider state remains unknown", async () => {
    h.findWorkItem
      .mockResolvedValueOnce(deployingWithSnapshot())
      .mockResolvedValueOnce(
        deployingWithSnapshot({ metadata: { providerStateUnknown: true } })
      );
    h.claimAttempt
      .mockResolvedValueOnce({
        state: "stale_attempt_running",
        attempt: { id: "att-2", status: "running" },
      })
      .mockResolvedValueOnce({
        state: "claimed",
        attempt: { id: "att-3", status: "running" },
      });
    h.getProfile.mockResolvedValue(null);

    await expect(
      GbpBusinessInfoDeploymentService.deployNow("wi-1", 5, {
        isFinalAttempt: true,
      })
    ).rejects.toMatchObject({ code: "RECONCILE_READ_FAILED" });
    await expect(
      GbpBusinessInfoDeploymentService.deployNow("wi-1", 5, {
        isFinalAttempt: true,
      })
    ).rejects.toMatchObject({ code: "RECONCILE_READ_FAILED" });

    expect(h.getProfile).toHaveBeenCalledTimes(2);
    expect(h.patchBusinessInfo).not.toHaveBeenCalled();
    expect(h.markBusinessInfoProviderStateUnknown).toHaveBeenNthCalledWith(
      2,
      "wi-1",
      "att-3",
      h.trx
    );
  });

  it("captures the first snapshot and writes without an unnecessary reconcile read", async () => {
    h.findWorkItem.mockResolvedValue(deployingItem());
    h.claimAttempt.mockResolvedValue({
      state: "stale_attempt_running",
      attempt: { id: "att-2", status: "running" },
    });

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.getProfile).toHaveBeenCalledTimes(1);
    expect(h.patchBusinessInfo).toHaveBeenCalledTimes(1);
  });

  it("tolerates a concurrent finalizer only when the item is already published", async () => {
    h.findWorkItem
      .mockResolvedValueOnce(deployingWithSnapshot())
      .mockResolvedValue(deployingWithSnapshot({ status: "published" }));
    h.claimAttempt.mockResolvedValue({
      state: "already_succeeded",
      attempt: {
        id: "att-1",
        status: "succeeded",
        response_payload: { name: "locations/222" },
      },
    });
    h.markPublished.mockResolvedValue(0);

    await expect(
      GbpBusinessInfoDeploymentService.deployNow("wi-1", 5)
    ).resolves.toBeDefined();
  });
});

describe("completeness-fill owner surface (seam 11)", () => {
  function completenessFillItem(overrides: Record<string, unknown> = {}) {
    return deployingItem({
      draft_content: "Add your website to your Google Business Profile",
      approved_content: "Add your website to your Google Business Profile",
      business_info_payload: {
        patch: { websiteUri: "https://example.com" },
        updateMask: ["websiteUri"],
        origin: "completeness_autofill",
      },
      ...overrides,
    });
  }

  it("surfaces a completeness auto-fill to the owner once it publishes, with plain labels", async () => {
    h.findWorkItem.mockResolvedValue(completenessFillItem());

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.findProjectByOrg).toHaveBeenCalledWith(1);
    expect(h.recordCompletenessFill).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 1,
        locationId: 2,
        projectId: "proj-1",
        workItemId: "wi-1",
        filledFields: ["website"],
      })
    );
  });

  it("does not surface a manual owner edit as an Alloro fill", async () => {
    // deployingItem() carries no origin marker — a manual business-info edit.
    h.findWorkItem.mockResolvedValue(deployingWithSnapshot());

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.recordCompletenessFill).not.toHaveBeenCalled();
  });

  it("skips the record when the org has no project — nothing to surface it against", async () => {
    h.findWorkItem.mockResolvedValue(completenessFillItem());
    h.findProjectByOrg.mockResolvedValue(null);

    await GbpBusinessInfoDeploymentService.deployNow("wi-1", 5);

    expect(h.recordCompletenessFill).not.toHaveBeenCalled();
  });

  it("still publishes when the owner-surface record fails, and logs it", async () => {
    h.findWorkItem.mockResolvedValue(completenessFillItem());
    h.recordCompletenessFill.mockRejectedValue(new Error("metric write failed"));

    await expect(
      GbpBusinessInfoDeploymentService.deployNow("wi-1", 5)
    ).resolves.toBeDefined();

    expect(h.markPublished).toHaveBeenCalledWith("wi-1", expect.anything(), h.trx);
    expect(
      h.loggerError.mock.calls.find((call) =>
        String(call[1]).includes("completeness-fill owner-surface record failed")
      )
    ).toBeDefined();
  });
});

describe("revert claim states", () => {
  it("distinguishes in-progress from already-reverted and enqueues neither", async () => {
    const params = {
      organizationId: 1,
      workItemId: "wi-1",
      userId: 5,
      accessibleLocationIds: [2],
    };
    h.findScopedWorkItem.mockResolvedValue(revertableItem());
    h.claimRevert.mockResolvedValueOnce("revert_in_progress");
    const inProgress = await GbpBusinessInfoDeploymentService.enqueueRevert(
      params
    ).catch((error) => error);

    h.claimRevert.mockResolvedValueOnce("already_reverted");
    const alreadyDone = await GbpBusinessInfoDeploymentService.enqueueRevert(
      params
    ).catch((error) => error);

    expect(inProgress.code).toBe("REVERT_IN_PROGRESS");
    expect(alreadyDone.code).toBe("ALREADY_REVERTED");
    expect(h.queueAdd).not.toHaveBeenCalled();
  });
});
