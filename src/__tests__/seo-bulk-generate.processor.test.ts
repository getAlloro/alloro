/**
 * Synthetic unit coverage for the bulk SEO metric-action producer.
 * All persistence, queue state, generation, and logging seams are mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

vi.mock("../models/website-builder/SeoGenerationJobModel", () => ({
  SeoGenerationJobModel: {
    markProcessing: vi.fn(),
    seedItemStatuses: vi.fn(),
    updateItemStatus: vi.fn(),
    incrementCompleted: vi.fn(),
    incrementFailed: vi.fn(),
    findById: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
  },
}));

vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {
    findById: vi.fn(),
    findOrganizationIdById: vi.fn(),
  },
}));

vi.mock("../models/website-builder/PageModel", () => ({
  PageModel: {
    findByProjectIdForSeo: vi.fn(),
    findSeoDataByProjectId: vi.fn(),
    updateSeoDataById: vi.fn(),
    propagateSeoDataToSiblings: vi.fn(),
  },
}));

vi.mock("../models/website-builder/PostModel", () => ({
  PostModel: {
    findByProjectAndTypeForSeo: vi.fn(),
    findSeoDataByProjectId: vi.fn(),
    updateSeoDataByIdJsClock: vi.fn(),
  },
}));

vi.mock("../services/MetricActionService", () => ({
  MetricActionService: {
    detectSeoMetadataChange: vi.fn((previous: unknown, next: unknown) => {
      const previousData = previous as Record<string, unknown> | null;
      const nextData = next as Record<string, unknown>;
      return {
        titleChanged: previousData?.meta_title !== nextData.meta_title,
        descriptionChanged:
          previousData?.meta_description !== nextData.meta_description,
      };
    }),
    recordSeoBulkUpdate: vi.fn(),
  },
}));

vi.mock(
  "../controllers/admin-websites/feature-services/service.seo-generation",
  () => ({
    fetchSharedContext: vi.fn(),
    generateAllWithSharedContext: vi.fn(),
  })
);

vi.mock("../lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import * as seoGenerationService from "../controllers/admin-websites/feature-services/service.seo-generation";
import logger from "../lib/logger";
import { PageModel } from "../models/website-builder/PageModel";
import { PostModel } from "../models/website-builder/PostModel";
import { ProjectModel } from "../models/website-builder/ProjectModel";
import {
  SeoGenerationJobModel,
  type ISeoGenerationJob,
} from "../models/website-builder/SeoGenerationJobModel";
import { MetricActionService } from "../services/MetricActionService";
import {
  processSeoBulkGenerate,
  type SeoBulkGenerateData,
} from "../workers/processors/seoBulkGenerate.processor";

const ORGANIZATION_ID = 42;
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const JOB_RECORD_ID = "22222222-2222-2222-2222-222222222222";
const FIRST_PAGE_ID = "33333333-3333-3333-3333-333333333333";
const SECOND_PAGE_ID = "44444444-4444-4444-4444-444444444444";

function pageRow(id: string, path: string, seoData: Record<string, unknown>) {
  return {
    id,
    path,
    status: "published",
    version: 1,
    sections: [{ content: `<h1>${path}</h1>` }],
    seo_data: seoData,
  };
}

function finalJob(completedCount: number, failedCount: number): ISeoGenerationJob {
  return {
    id: JOB_RECORD_ID,
    project_id: PROJECT_ID,
    entity_type: "page",
    post_type_id: null,
    status: "processing",
    total_count: completedCount + failedCount,
    completed_count: completedCount,
    failed_count: failedCount,
    failed_items: null,
    item_statuses: [],
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T00:05:00.000Z",
  };
}

function pageJob(): Job<SeoBulkGenerateData> {
  return {
    id: "synthetic-bullmq-job",
    data: {
      jobRecordId: JOB_RECORD_ID,
      projectId: PROJECT_ID,
      entityType: "page",
    },
  } as unknown as Job<SeoBulkGenerateData>;
}

function generatedSeo(title: string, description: string) {
  return [
    {
      section: "essentials",
      generated: {
        meta_title: title,
        meta_description: description,
      },
      insight: "",
    },
  ];
}

describe("processSeoBulkGenerate metric action recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ProjectModel.findById).mockResolvedValue(undefined);
    vi.mocked(ProjectModel.findOrganizationIdById).mockResolvedValue({
      organization_id: ORGANIZATION_ID,
    });
    vi.mocked(PageModel.findByProjectIdForSeo).mockResolvedValue([
      pageRow(FIRST_PAGE_ID, "/services/cleaning", {
        meta_title: "Old cleaning title",
        meta_description: "Old cleaning description",
      }),
    ]);
    vi.mocked(PageModel.findSeoDataByProjectId).mockResolvedValue([]);
    vi.mocked(PageModel.updateSeoDataById).mockResolvedValue(1);
    vi.mocked(PageModel.propagateSeoDataToSiblings).mockResolvedValue(0);
    vi.mocked(PostModel.findSeoDataByProjectId).mockResolvedValue([]);
    vi.mocked(seoGenerationService.fetchSharedContext).mockResolvedValue({
      businessData: {},
      creatorContext: "synthetic creator context",
      validatorContext: "synthetic validator context",
      gscTopQueries: [],
    });
    vi.mocked(seoGenerationService.generateAllWithSharedContext).mockResolvedValue(
      generatedSeo("New cleaning title", "New cleaning description")
    );
    vi.mocked(SeoGenerationJobModel.findById).mockResolvedValue(finalJob(1, 0));
    vi.mocked(MetricActionService.recordSeoBulkUpdate).mockResolvedValue(null);
  });

  it("records one aggregated action after a completed job changes metadata", async () => {
    await processSeoBulkGenerate(pageJob());

    expect(MetricActionService.detectSeoMetadataChange).toHaveBeenCalledWith(
      {
        meta_title: "Old cleaning title",
        meta_description: "Old cleaning description",
      },
      expect.objectContaining({
        meta_title: "New cleaning title",
        meta_description: "New cleaning description",
      })
    );
    expect(MetricActionService.recordSeoBulkUpdate).toHaveBeenCalledTimes(1);
    expect(MetricActionService.recordSeoBulkUpdate).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      locationId: null,
      projectId: PROJECT_ID,
      jobId: JOB_RECORD_ID,
      entityType: "page",
      affectedCount: 1,
      titleChangeCount: 1,
      descriptionChangeCount: 1,
      failedCount: 0,
    });
    expect(
      vi.mocked(MetricActionService.recordSeoBulkUpdate).mock.invocationCallOrder[0]
    ).toBeGreaterThan(
      vi.mocked(SeoGenerationJobModel.markCompleted).mock.invocationCallOrder[0]
    );
  });

  it("does not record an action when persisted metadata is unchanged", async () => {
    vi.mocked(seoGenerationService.generateAllWithSharedContext).mockResolvedValue(
      generatedSeo("Old cleaning title", "Old cleaning description")
    );

    await processSeoBulkGenerate(pageJob());

    expect(PageModel.updateSeoDataById).toHaveBeenCalledTimes(1);
    expect(MetricActionService.recordSeoBulkUpdate).not.toHaveBeenCalled();
    expect(ProjectModel.findOrganizationIdById).not.toHaveBeenCalled();
  });

  it("records only successful changed entities for a partial job", async () => {
    vi.mocked(PageModel.findByProjectIdForSeo).mockResolvedValue([
      pageRow(FIRST_PAGE_ID, "/services/cleaning", {
        meta_title: "Old cleaning title",
        meta_description: "Old cleaning description",
      }),
      pageRow(SECOND_PAGE_ID, "/services/implants", {
        meta_title: "Old implant title",
        meta_description: "Old implant description",
      }),
    ]);
    vi.mocked(PageModel.updateSeoDataById)
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error("synthetic write failure"));
    vi.mocked(SeoGenerationJobModel.findById).mockResolvedValue(finalJob(1, 1));

    await processSeoBulkGenerate(pageJob());

    expect(SeoGenerationJobModel.markCompleted).toHaveBeenCalledWith(JOB_RECORD_ID);
    expect(MetricActionService.recordSeoBulkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        affectedCount: 1,
        titleChangeCount: 1,
        descriptionChangeCount: 1,
        failedCount: 1,
      })
    );
  });

  it("retries a failed action write without rerunning SEO persistence", async () => {
    vi.mocked(MetricActionService.recordSeoBulkUpdate)
      .mockRejectedValueOnce(new Error("synthetic transient action failure"))
      .mockResolvedValueOnce(null);

    await expect(processSeoBulkGenerate(pageJob())).resolves.toBeUndefined();

    expect(MetricActionService.recordSeoBulkUpdate).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(MetricActionService.recordSeoBulkUpdate).mock.calls.map(
        ([input]) => input.jobId
      )
    ).toEqual([JOB_RECORD_ID, JOB_RECORD_ID]);
    expect(ProjectModel.findOrganizationIdById).toHaveBeenCalledTimes(1);
    expect(PageModel.updateSeoDataById).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        seoJobId: JOB_RECORD_ID,
        projectId: PROJECT_ID,
        attempt: 1,
        maxAttempts: 3,
      }),
      expect.stringContaining("retrying")
    );
  });

  it("isolates an exhausted action write from the completed SEO job", async () => {
    const actionError = new Error("synthetic persistent action failure");
    vi.mocked(MetricActionService.recordSeoBulkUpdate).mockRejectedValue(actionError);

    await expect(processSeoBulkGenerate(pageJob())).resolves.toBeUndefined();

    expect(MetricActionService.recordSeoBulkUpdate).toHaveBeenCalledTimes(3);
    expect(SeoGenerationJobModel.markCompleted).toHaveBeenCalledWith(JOB_RECORD_ID);
    expect(SeoGenerationJobModel.markFailed).not.toHaveBeenCalled();
    expect(PageModel.updateSeoDataById).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: actionError,
        seoJobId: JOB_RECORD_ID,
        projectId: PROJECT_ID,
        attempt: 3,
        maxAttempts: 3,
      }),
      expect.stringContaining("bounded retries")
    );
  });
});
