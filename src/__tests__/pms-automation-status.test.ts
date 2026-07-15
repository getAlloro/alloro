import { describe, expect, it } from "vitest";

import {
  createInitialStatus,
  normalizeAutomationStatusDetail,
} from "../utils/pms/pmsAutomationStatus";

describe("PMS automation status", () => {
  it("creates new status without the retired task stage", () => {
    const status = createInitialStatus();

    expect(status.currentStep).toBe("file_upload");
    expect(status.steps).not.toHaveProperty("task_creation");
    expect(status.steps.complete.status).toBe("pending");
  });

  it("hides retired task fields from historical completed payloads", () => {
    const status = normalizeAutomationStatusDetail({
      status: "completed",
      currentStep: "complete",
      message: "Complete - 3 tasks created",
      progress: 100,
      startedAt: "2026-07-15T00:00:00.000Z",
      completedAt: "2026-07-15T00:05:00.000Z",
      steps: {
        file_upload: { status: "completed" },
        pms_parser: { status: "completed" },
        admin_approval: { status: "completed" },
        client_approval: { status: "completed" },
        monthly_agents: { status: "completed" },
        task_creation: { status: "completed" },
        complete: { status: "completed" },
      },
      summary: {
        tasksCreated: { user: 1, alloro: 2, total: 3 },
        agentResults: {
          summary: { success: true, resultId: 10 },
          referral_engine: { success: true, resultId: 11 },
        },
        duration: "300.0s",
      },
    });

    expect(status.currentStep).toBe("complete");
    expect(status.message).toBe("Automation complete");
    expect(status.steps).not.toHaveProperty("task_creation");
    expect(status.summary).toEqual({
      agentResults: {
        summary: { success: true, resultId: 10 },
        referral_engine: { success: true, resultId: 11 },
      },
      duration: "300.0s",
    });
  });

  it("maps an in-flight historical task stage back to insight finalization", () => {
    const status = normalizeAutomationStatusDetail({
      status: "processing",
      currentStep: "task_creation",
      message: "Creating tasks...",
      progress: 94,
      startedAt: "2026-07-15T00:00:00.000Z",
      steps: {
        file_upload: { status: "completed" },
        pms_parser: { status: "completed" },
        admin_approval: { status: "completed" },
        client_approval: { status: "completed" },
        monthly_agents: { status: "completed" },
        task_creation: { status: "processing" },
        complete: { status: "pending" },
      },
    });

    expect(status.currentStep).toBe("monthly_agents");
    expect(status.message).toBe("Finalizing insights...");
    expect(status.steps).not.toHaveProperty("task_creation");
  });
});
