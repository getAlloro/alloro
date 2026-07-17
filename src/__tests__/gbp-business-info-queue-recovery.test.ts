import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  add: vi.fn(),
  getJob: vi.fn(),
}));

vi.mock("../workers/queues", () => ({
  getGbpAutomationQueue: () => ({
    add: h.add,
    getJob: h.getJob,
  }),
}));

import { GbpBusinessInfoQueueService } from "../controllers/gbp-automation/feature-services/GbpBusinessInfoQueueService";
import type { IGbpWorkItem } from "../models/GbpWorkItemModel";

const ITEM = {
  id: "wi-1",
  retry_count: 2,
} as IGbpWorkItem;

const ACTOR = {
  userId: 5,
  actorEmail: "owner@practice.test",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.add.mockResolvedValue({ id: "job-1" });
  h.getJob.mockResolvedValue(undefined);
});

describe("GbpBusinessInfoQueueService", () => {
  it("adds a deployment job only when the deterministic ID does not exist", async () => {
    await GbpBusinessInfoQueueService.ensureDeploymentScheduled(ITEM, ACTOR);

    expect(h.add).toHaveBeenCalledWith(
      "deploy-business-info",
      expect.objectContaining({ workItemId: "wi-1", userId: 5 }),
      expect.objectContaining({ jobId: "gbp-business-info-wi-1-2" })
    );
  });

  it("retries a retained failed deployment instead of duplicate-adding it", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    h.getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("failed"),
      retry,
    });

    await GbpBusinessInfoQueueService.ensureDeploymentScheduled(ITEM, ACTOR);

    expect(retry).toHaveBeenCalledWith("failed");
    expect(h.add).not.toHaveBeenCalled();
  });

  it("retries a retained failed revert instead of duplicate-adding it", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    h.getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("failed"),
      retry,
    });

    await GbpBusinessInfoQueueService.ensureRevertScheduled(ITEM, ACTOR);

    expect(retry).toHaveBeenCalledWith("failed");
    expect(h.add).not.toHaveBeenCalled();
  });

  it.each(["active", "waiting", "delayed"])(
    "treats a %s deployment as already scheduled",
    async (state) => {
      const retry = vi.fn();
      h.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue(state),
        retry,
      });

      await GbpBusinessInfoQueueService.ensureDeploymentScheduled(ITEM, ACTOR);

      expect(retry).not.toHaveBeenCalled();
      expect(h.add).not.toHaveBeenCalled();
    }
  );

  it("retries a completed job so local reconciliation can finish", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    h.getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("completed"),
      retry,
    });

    await GbpBusinessInfoQueueService.ensureDeploymentScheduled(ITEM, ACTOR);

    expect(retry).toHaveBeenCalledWith("completed");
    expect(h.add).not.toHaveBeenCalled();
  });

  it("fails closed for an unknown retained-job state", async () => {
    h.getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("unknown"),
      retry: vi.fn(),
    });

    await expect(
      GbpBusinessInfoQueueService.ensureDeploymentScheduled(ITEM, ACTOR)
    ).rejects.toThrow(/current state is unknown/i);
    expect(h.add).not.toHaveBeenCalled();
  });
});
