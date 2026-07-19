import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * §3.2 proofs for `executeBatch` — a batch must NOT report success after its
 * pages failed to publish.
 *
 * Before this, the publish loop logged the `publishPage()` error and carried on:
 * the batch still landed on "completed" and every recommendation that wrote to
 * the unpublished draft still read "executed", so the stats claimed a change was
 * live while it sat on a draft nobody published. These lock the corrected
 * behavior: the failing paths are collected, the affected recommendations are
 * downgraded executed→failed with a reason, and the batch terminates "failed".
 */

// vi.mock factories are hoisted above these bindings, so the shared spies have
// to be created inside vi.hoisted() to exist by the time a factory runs.
const { publishPage, buildExecutionSummary, verifyBatchEdits } = vi.hoisted(() => ({
  publishPage: vi.fn(),
  buildExecutionSummary: vi.fn(async () => "SUMMARY"),
  verifyBatchEdits: vi.fn(async () => ({ verified: 0, downgraded: 0 })),
}));

vi.mock("../models/website-builder/AiCommandBatchModel", () => ({
  AiCommandBatchModel: {
    findRawById: vi.fn(async () => ({ id: "b1", status: "ready", project_id: "p" })),
    updateStatus: vi.fn(async () => 1),
    updateById: vi.fn(async () => 1),
  },
}));

vi.mock("../models/website-builder/AiCommandRecommendationModel", () => ({
  AiCommandRecommendationModel: {
    findApprovedByBatchId: vi.fn(async () => []),
    findByBatchId: vi.fn(async () => []),
    updateById: vi.fn(async () => 1),
  },
}));

vi.mock("../models/website-builder/PageModel", () => ({
  PageModel: { findRawById: vi.fn() },
}));
vi.mock("../models/website-builder/ProjectModel", () => ({ ProjectModel: {} }));
vi.mock("../models/website-builder/PostModel", () => ({ PostModel: {} }));

vi.mock("../controllers/admin-websites/feature-services/service.page-editor", () => ({
  publishPage,
}));
vi.mock("../controllers/admin-websites/feature-utils/util.ai-command-summary", () => ({
  buildExecutionSummary,
}));
vi.mock("../controllers/admin-websites/feature-utils/util.ai-command-verify", () => ({
  verifyBatchEdits,
}));
vi.mock("../controllers/admin-websites/feature-utils/util.section-normalizer", () => ({
  normalizeSections: vi.fn((s) => s),
}));
vi.mock("../utils/website-utils/aiCommandService", () => ({ editHtmlContent: vi.fn() }));
vi.mock("../utils/website-utils/agenticHtmlPipeline", () => ({ runAgenticPipeline: vi.fn() }));

// The schema handler stands in for any recommendation that writes to a pinned
// page draft — it records the draft the batch must publish, exactly as the real
// handler does via resolvePageDraftId.
vi.mock("../controllers/admin-websites/feature-services/service.ai-command-seo-schema-handler", () => ({
  executeUpdatePageSeoSchema: vi.fn(async (_rec: unknown, ctx: { pageDrafts: Map<string, string> }) => {
    ctx.pageDrafts.set("/x", "draft-1");
  }),
}));

vi.mock("../controllers/admin-websites/feature-services/service.ai-command-execute-handlers", () => ({
  executeCreateRedirect: vi.fn(),
  executeUpdateRedirect: vi.fn(),
  executeDeleteRedirect: vi.fn(),
  executeCreatePage: vi.fn(),
  executeCreatePost: vi.fn(),
  executeCreateMenu: vi.fn(),
  executeUpdateMenu: vi.fn(),
  executeUpdatePostMeta: vi.fn(),
  executeUpdatePagePath: vi.fn(),
}));

vi.mock("../controllers/admin-websites/feature-utils/util.ai-command-shared", () => ({
  refreshStats: vi.fn(async () => undefined),
  resolvePageDraftId: vi.fn(async () => "draft-1"),
  getExistingPaths: vi.fn(async () => []),
  getExistingPostSlugs: vi.fn(async () => []),
}));

import { AiCommandBatchModel } from "../models/website-builder/AiCommandBatchModel";
import { AiCommandRecommendationModel } from "../models/website-builder/AiCommandRecommendationModel";
import { PageModel } from "../models/website-builder/PageModel";
import { executeBatch } from "../controllers/admin-websites/feature-services/service.ai-command-execute";

const SCHEMA_REC = {
  id: "rec-1",
  target_type: "page_seo_schema",
  target_id: "page-1",
  target_label: "/x > structured data",
  sort_order: 0,
  execution_result: JSON.stringify({ success: true, schema_written: true }),
};

/** "draft-1" is the pinned draft; "page-1" is the live page the rec targets. */
function wirePageReads(): void {
  vi.mocked(PageModel.findRawById).mockImplementation((async (id: string) => {
    if (id === "draft-1") return { id: "draft-1", project_id: "p", path: "/x", status: "draft" };
    if (id === "page-1") return { id: "page-1", project_id: "p", path: "/x" };
    return undefined;
  }) as never);
}

describe("executeBatch — a failed publish must not complete the batch (§3.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildExecutionSummary.mockResolvedValue("SUMMARY");
    verifyBatchEdits.mockResolvedValue({ verified: 0, downgraded: 0 });
    vi.mocked(AiCommandBatchModel.findRawById).mockResolvedValue({
      id: "b1",
      status: "ready",
      project_id: "p",
    } as never);
    vi.mocked(AiCommandRecommendationModel.findApprovedByBatchId).mockResolvedValue([
      SCHEMA_REC,
    ] as never);
    vi.mocked(AiCommandRecommendationModel.findByBatchId).mockResolvedValue([SCHEMA_REC] as never);
    wirePageReads();
  });

  it("marks the batch FAILED and fails the recommendation when publishPage returns an error", async () => {
    publishPage.mockResolvedValue({
      page: null,
      error: { status: 404, code: "NOT_FOUND", message: "Page not found" },
    });

    await executeBatch("b1");

    const [, batchPatch] = vi.mocked(AiCommandBatchModel.updateById).mock.calls[0];
    expect(batchPatch.status).toBe("failed");
    expect(batchPatch.summary).toContain("Publish failed");
    expect(batchPatch.summary).toContain("/x");

    const [recId, recPatch] = vi.mocked(AiCommandRecommendationModel.updateById).mock.calls[0];
    expect(recId).toBe("rec-1");
    expect(recPatch.status).toBe("failed");
    const stored = JSON.parse(recPatch.execution_result as string);
    expect(stored.success).toBe(false);
    expect(stored.published).toBe(false);
    expect(stored.error).toContain("failed to publish");
  });

  it("marks the batch FAILED when publishPage throws rather than returning", async () => {
    publishPage.mockRejectedValue(new Error("connection lost"));

    await executeBatch("b1");

    const [, batchPatch] = vi.mocked(AiCommandBatchModel.updateById).mock.calls[0];
    expect(batchPatch.status).toBe("failed");
    expect(batchPatch.summary).toContain("connection lost");
    expect(
      vi.mocked(AiCommandRecommendationModel.updateById).mock.calls.some(
        ([, patch]) => patch.status === "failed"
      )
    ).toBe(true);
  });

  it("still completes the batch when every page publishes", async () => {
    publishPage.mockResolvedValue({ page: { id: "pub-1" } });

    await executeBatch("b1");

    const [, batchPatch] = vi.mocked(AiCommandBatchModel.updateById).mock.calls[0];
    expect(batchPatch.status).toBe("completed");
    expect(batchPatch.summary).toBe("SUMMARY");
    // No recommendation is downgraded on the happy path.
    expect(vi.mocked(AiCommandRecommendationModel.updateById)).not.toHaveBeenCalled();
  });
});
