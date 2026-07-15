import { beforeEach, describe, expect, it, vi } from "vitest";
import { METRIC_ACTION_TYPE } from "../config/metricActions";
import { MetricActionModel } from "../models/MetricActionModel";
import { MetricActionService } from "../services/MetricActionService";

vi.mock("../models/MetricActionModel", () => ({
  MetricActionModel: {
    upsertBySource: vi.fn(),
    findLatestActiveForMetric: vi.fn(),
  },
}));

const model = vi.mocked(MetricActionModel);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MetricActionService", () => {
  it("detects only metadata fields that actually changed", () => {
    expect(
      MetricActionService.detectSeoMetadataChange(
        { meta_title: "Same title", meta_description: "Old description" },
        { meta_title: "Same title", meta_description: "New description" }
      )
    ).toEqual({ titleChanged: false, descriptionChanged: true });
  });

  it("does not write an event when no metadata changed", async () => {
    await expect(
      MetricActionService.recordSeoBulkUpdate({
        organizationId: 10,
        locationId: null,
        projectId: "project-1",
        jobId: "job-1",
        entityType: "page",
        affectedCount: 0,
        titleChangeCount: 0,
        descriptionChangeCount: 0,
        failedCount: 0,
      })
    ).resolves.toBeNull();
    expect(model.upsertBySource).not.toHaveBeenCalled();
  });

  it("records structured SEO metadata counts with a 30-day window", async () => {
    const occurredAt = new Date("2026-07-15T12:00:00.000Z");
    model.upsertBySource.mockResolvedValue({ id: "event-1" } as never);

    await MetricActionService.recordSeoBulkUpdate({
      organizationId: 10,
      locationId: null,
      projectId: "project-1",
      jobId: "job-1",
      entityType: "page",
      affectedCount: 6,
      titleChangeCount: 4,
      descriptionChangeCount: 6,
      failedCount: 1,
      occurredAt,
    });

    expect(model.upsertBySource).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: METRIC_ACTION_TYPE.SEO_META_UPDATE,
        source_id: "job-1",
        affected_count: 6,
        occurred_at: occurredAt,
        active_until: new Date("2026-08-14T12:00:00.000Z"),
        metadata: {
          title_change_count: 4,
          description_change_count: 6,
          failed_count: 1,
        },
      })
    );
  });

  it("returns plain-English copy without claiming CTR improved", async () => {
    model.findLatestActiveForMetric.mockResolvedValue({
      id: "event-1",
      organization_id: 10,
      location_id: null,
      project_id: "project-1",
      action_type: "seo_meta_update",
      stage_key: "impressions",
      metric_key: "ctr",
      source_type: "seo_bulk_generation_job",
      source_id: "job-1",
      entity_type: "page",
      affected_count: 6,
      occurred_at: new Date("2026-07-15T12:00:00.000Z"),
      active_until: new Date("2026-08-14T12:00:00.000Z"),
      metadata: {
        title_change_count: 6,
        description_change_count: 6,
      },
      created_at: new Date("2026-07-15T12:00:00.000Z"),
      updated_at: new Date("2026-07-15T12:00:00.000Z"),
    });

    const result = await MetricActionService.findLatestForJourney({
      organizationId: 10,
      locationId: 20,
      projectId: "project-1",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      now: new Date("2026-07-20T00:00:00.000Z"),
    });

    expect(result).toEqual(
      expect.objectContaining({
        summary: "Updated Google search titles and descriptions on 6 pages.",
        measurementNote: "Watching Google click-through through August 14.",
      })
    );
    expect(JSON.stringify(result)).not.toMatch(/improv|increase|caused/i);
  });
});
