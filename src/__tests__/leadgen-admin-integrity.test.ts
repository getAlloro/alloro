import { afterEach, describe, expect, it, vi } from "vitest";
import { aggregateFunnel } from "../controllers/admin-leadgen/feature-services/service.funnel-aggregator";
import {
  isReportSurfaceEvent,
  REPORT_SURFACE_EVENT_NAMES,
} from "../controllers/leadgen-tracking/feature-utils/util.event-ordering";
import {
  LeadgenSessionModel,
  STAGE_ORDER,
} from "../models/LeadgenSessionModel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("leadgen admin integrity semantics", () => {
  it("classifies the complete report-surface set used by historical evidence", () => {
    expect(REPORT_SURFACE_EVENT_NAMES).toEqual([
      "stage_viewed_5",
      "email_gate_shown",
      "email_submitted",
      "results_viewed",
      "report_engaged_1min",
    ]);
    for (const eventName of REPORT_SURFACE_EVENT_NAMES) {
      expect(isReportSurfaceEvent(eventName)).toBe(true);
    }
    expect(isReportSurfaceEvent("stage_viewed_4")).toBe(false);
  });

  it("counts only event-backed rows returned by the integrity-aware model", async () => {
    vi.spyOn(
      LeadgenSessionModel,
      "findSessionMaxOrdinalRows"
    ).mockResolvedValue([
      { max_ordinal: 0, abandoned: false, completed: false },
      {
        max_ordinal: STAGE_ORDER.results_viewed,
        abandoned: false,
        completed: true,
      },
      // An audit-less report row is collapsed to landing by the model.
      { max_ordinal: 0, abandoned: true, completed: false },
    ]);
    vi.spyOn(LeadgenSessionModel, "findFirstEventTimings").mockResolvedValue([]);

    const stages = await aggregateFunnel({});
    const byName = new Map(stages.map((stage) => [stage.name, stage]));

    expect(byName.get("landed")?.count).toBe(3);
    expect(byName.get("stage_viewed_5")?.count).toBe(1);
    expect(byName.get("results_viewed")?.count).toBe(1);
    expect(byName.get("report_engaged_1min")?.count).toBe(0);
    expect(byName.get("abandoned")?.count).toBe(1);
  });

  it("does not let email submission inflate results or engagement", async () => {
    vi.spyOn(
      LeadgenSessionModel,
      "findSessionMaxOrdinalRows"
    ).mockResolvedValue([
      {
        max_ordinal: STAGE_ORDER.email_submitted,
        abandoned: false,
        completed: false,
      },
    ]);
    vi.spyOn(LeadgenSessionModel, "findFirstEventTimings").mockResolvedValue([]);

    const stages = await aggregateFunnel({});
    const byName = new Map(stages.map((stage) => [stage.name, stage.count]));

    expect(byName.get("email_submitted")).toBe(1);
    expect(byName.get("results_viewed")).toBe(0);
    expect(byName.get("report_engaged_1min")).toBe(0);
  });

  it("does not include invalid report timing rows in averages", async () => {
    vi.spyOn(
      LeadgenSessionModel,
      "findSessionMaxOrdinalRows"
    ).mockResolvedValue([
      {
        max_ordinal: STAGE_ORDER.report_engaged_1min,
        abandoned: false,
        completed: true,
      },
    ]);
    vi.spyOn(LeadgenSessionModel, "findFirstEventTimings").mockResolvedValue([
      {
        session_id: "valid-session",
        event_name: "results_viewed",
        first_at: new Date("2026-07-15T00:00:00.000Z"),
      },
      {
        session_id: "valid-session",
        event_name: "report_engaged_1min",
        first_at: new Date("2026-07-15T00:01:00.000Z"),
      },
    ]);

    const stages = await aggregateFunnel({});
    const engaged = stages.find(
      (stage) => stage.name === "report_engaged_1min"
    );

    expect(engaged?.count).toBe(1);
    expect(engaged?.avg_ms_to_reach).toBe(60_000);
  });
});
