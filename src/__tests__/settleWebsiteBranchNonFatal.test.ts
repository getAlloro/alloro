import { describe, it, expect, vi } from "vitest";
import { settleWebsiteBranchNonFatal } from "../controllers/audit/audit-utils/settleWebsiteBranchNonFatal";

/**
 * Locks the decoupling invariant: a failing website-analysis branch must never
 * propagate (which would abort the GBP analysis downstream) — it logs and runs
 * the degrade instead. A succeeding or absent branch is a no-op.
 */
describe("settleWebsiteBranchNonFatal", () => {
  it("does nothing when the branch is null", async () => {
    const onFailure = vi.fn().mockResolvedValue(undefined);
    const logError = vi.fn();
    await settleWebsiteBranchNonFatal(null, { onFailure, logError });
    expect(onFailure).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("does not degrade when the branch resolves", async () => {
    const onFailure = vi.fn().mockResolvedValue(undefined);
    const logError = vi.fn();
    await settleWebsiteBranchNonFatal(Promise.resolve(), { onFailure, logError });
    expect(onFailure).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("swallows a rejection, logs it, and runs the degrade", async () => {
    const onFailure = vi.fn().mockResolvedValue(undefined);
    const logError = vi.fn();
    await expect(
      settleWebsiteBranchNonFatal(
        Promise.reject(new Error("unparseable output")),
        { onFailure, logError }
      )
    ).resolves.toBeUndefined();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toContain("unparseable output");
  });

  it("handles a non-Error rejection value", async () => {
    const onFailure = vi.fn().mockResolvedValue(undefined);
    const logError = vi.fn();
    await settleWebsiteBranchNonFatal(Promise.reject("boom"), {
      onFailure,
      logError,
    });
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toContain("boom");
  });
});
