/**
 * Unit tests for GbpLocalPostScheduleService.processDueSettings.
 *
 * Proves the scheduled recurring-post lever is no longer a no-op: a due
 * location now GENERATES a held draft (owner-approval gate — never
 * auto-published) instead of always skipping. Also proves the cost cap: the
 * hourly scan advances next_post_generation_at every cycle (success, skip, or
 * failure) so a location is never regenerated every hour.
 *
 * The model and the draft service are mocked; no live DB, no LLM, no network.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../database/connection", () => ({ db: {} }));
vi.mock("../workers/queues", () => ({
  getGbpAutomationQueue: vi.fn(() => ({ add: vi.fn() })),
}));

const { listDueLocalPostGeneration, updateById, createFromBestReview } =
  vi.hoisted(() => ({
    listDueLocalPostGeneration: vi.fn<(...a: unknown[]) => Promise<unknown[]>>(),
    updateById: vi.fn<(id: string, patch: any) => Promise<number>>(),
    createFromBestReview: vi.fn<(params: any) => Promise<any>>(),
  }));

vi.mock("../models/GbpAutomationSettingsModel", () => ({
  GbpAutomationSettingsModel: {
    listDueLocalPostGeneration,
    updateById,
  },
}));

vi.mock(
  "../controllers/gbp-automation/feature-services/GbpLocalPostDraftService",
  () => ({
    GbpLocalPostDraftService: { createFromBestReview },
  })
);

import { GbpLocalPostScheduleService } from "../controllers/gbp-automation/feature-services/GbpLocalPostScheduleService";
import { GbpAutomationError } from "../controllers/gbp-automation/feature-utils/GbpAutomationError";

/** Minimal due-settings row carrying only what processDueSettings reads. */
function dueSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: "settings-1",
    organization_id: 10,
    location_id: 20,
    next_post_generation_at: new Date("2026-07-01T00:00:00.000Z"),
    default_featured_image_url: null,
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateById.mockResolvedValue(1);
});

describe("GbpLocalPostScheduleService.processDueSettings", () => {
  it("generates a held draft (text-only) for a due location and advances the window", async () => {
    listDueLocalPostGeneration.mockResolvedValue([dueSettings()]);
    createFromBestReview.mockResolvedValue({ id: "wi-1", status: "draft" });

    const result = await GbpLocalPostScheduleService.processDueSettings();

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    // Held draft generated via the review-seeded path, text-only (no default
    // image), namespaced idempotency window.
    expect(createFromBestReview).toHaveBeenCalledTimes(1);
    const args = createFromBestReview.mock.calls[0][0];
    expect(args.organizationId).toBe(10);
    expect(args.locationId).toBe(20);
    expect(args.userId).toBeNull();
    expect(args.featuredImageUrl).toBeNull();
    expect(String(args.generationWindow)).toMatch(/^scheduled:\d{4}-\d{2}-\d{2}$/);

    // Schedule advanced with success metadata.
    expect(updateById).toHaveBeenCalledTimes(1);
    const [id, patch] = updateById.mock.calls[0];
    expect(id).toBe("settings-1");
    expect(patch.next_post_generation_at).toBeInstanceOf(Date);
    expect(patch.metadata.lastLocalPostGeneratedAt).toBeTruthy();
    expect(patch.metadata.lastLocalPostWorkItemId).toBe("wi-1");
    expect(patch.metadata.lastLocalPostSkipReason).toBeNull();
  });

  it("honors an owner-set default featured image when present", async () => {
    listDueLocalPostGeneration.mockResolvedValue([
      dueSettings({ default_featured_image_url: "https://cdn.example.com/x.jpg" }),
    ]);
    createFromBestReview.mockResolvedValue({ id: "wi-2", status: "draft" });

    await GbpLocalPostScheduleService.processDueSettings();

    expect(createFromBestReview.mock.calls[0][0].featuredImageUrl).toBe(
      "https://cdn.example.com/x.jpg"
    );
  });

  it("treats 'no eligible review' as an honest skip, not a failure, and still advances", async () => {
    listDueLocalPostGeneration.mockResolvedValue([dueSettings()]);
    createFromBestReview.mockRejectedValue(
      new GbpAutomationError("GBP_POST_NO_CANDIDATE_REVIEW", "No eligible review.")
    );

    const result = await GbpLocalPostScheduleService.processDueSettings();

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(updateById).toHaveBeenCalledTimes(1);
    expect(updateById.mock.calls[0][1].metadata.lastLocalPostSkipReason).toBe(
      "GBP_POST_NO_CANDIDATE_REVIEW"
    );
  });

  it("treats an unfinished-GBP-setup location as a skip", async () => {
    listDueLocalPostGeneration.mockResolvedValue([dueSettings()]);
    createFromBestReview.mockRejectedValue(
      new GbpAutomationError("GBP_NOT_READY", "Select a GBP property.")
    );

    const result = await GbpLocalPostScheduleService.processDueSettings();

    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("counts a hard failure but STILL advances the window (cost cap on the hourly scan)", async () => {
    listDueLocalPostGeneration.mockResolvedValue([dueSettings()]);
    createFromBestReview.mockRejectedValue(new Error("LLM timeout"));

    const result = await GbpLocalPostScheduleService.processDueSettings();

    expect(result.created).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toContain("LLM timeout");
    // Advanced despite the failure, so the next hourly scan does not regenerate.
    expect(updateById).toHaveBeenCalledTimes(1);
    expect(updateById.mock.calls[0][1].metadata.lastLocalPostSkipReason).toBe(
      "generation_failed"
    );
  });

  it("skips a row with no location_id without generating or advancing", async () => {
    listDueLocalPostGeneration.mockResolvedValue([
      dueSettings({ location_id: null }),
    ]);

    const result = await GbpLocalPostScheduleService.processDueSettings();

    expect(result.skipped).toBe(1);
    expect(createFromBestReview).not.toHaveBeenCalled();
    expect(updateById).not.toHaveBeenCalled();
  });

  it("does not swallow a schedule-advance DB error — it is recorded", async () => {
    listDueLocalPostGeneration.mockResolvedValue([dueSettings()]);
    createFromBestReview.mockResolvedValue({ id: "wi-3", status: "draft" });
    updateById.mockRejectedValueOnce(new Error("db down"));

    const result = await GbpLocalPostScheduleService.processDueSettings();

    // Generation still counted; the advance failure is surfaced, not hidden.
    expect(result.created).toBe(1);
    expect(
      result.errors.some((e) => e.message.includes("Schedule advance failed"))
    ).toBe(true);
  });
});
