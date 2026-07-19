import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const {
  findById,
  updateById,
  acquireExecutionLock,
  hasActiveRun,
  createRun,
  completeRun,
  failRun,
  releaseExecutionLock,
  getAgentHandler,
  handler,
  errorLog,
  infoLog,
} = vi.hoisted(() => ({
  findById: vi.fn(),
  updateById: vi.fn(),
  acquireExecutionLock: vi.fn(),
  hasActiveRun: vi.fn(),
  createRun: vi.fn(),
  completeRun: vi.fn(),
  failRun: vi.fn(),
  releaseExecutionLock: vi.fn(),
  getAgentHandler: vi.fn(),
  handler: vi.fn(),
  errorLog: vi.fn(),
  infoLog: vi.fn(),
}));

vi.mock("../models/ScheduleModel", () => ({
  ScheduleModel: {
    findById: (...args: unknown[]) => findById(...args),
    updateById: (...args: unknown[]) => updateById(...args),
  },
  ScheduleRunModel: {
    acquireExecutionLock: (...args: unknown[]) => acquireExecutionLock(...args),
    hasActiveRun: (...args: unknown[]) => hasActiveRun(...args),
    createRun: (...args: unknown[]) => createRun(...args),
    completeRun: (...args: unknown[]) => completeRun(...args),
    failRun: (...args: unknown[]) => failRun(...args),
  },
}));

vi.mock("../services/agentRegistry", () => ({
  getAgentHandler: (...args: unknown[]) => getAgentHandler(...args),
  getRegisteredAgents: vi.fn(),
  createAgentRunContext: (logicalRunAt: Date) => ({
    logicalRunAt: logicalRunAt.toISOString(),
    logicalRunDate: logicalRunAt.toISOString().slice(0, 10),
  }),
}));

vi.mock("../lib/logger", () => ({
  default: {
    error: errorLog,
    info: infoLog,
    warn: vi.fn(),
  },
}));

import { triggerRun } from "../controllers/admin-schedules/AdminSchedulesController";

const SCHEDULE = {
  id: 7,
  agent_key: "nap_consistency",
  display_name: "NAP Consistency",
};

function makeResponse(): Response & {
  statusCode: number;
  body: unknown;
} {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response as unknown as Response & {
    statusCode: number;
    body: unknown;
  };
}

function makeRequest(): Request {
  return { params: { id: "7" } } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  findById.mockResolvedValue({ ...SCHEDULE });
  acquireExecutionLock.mockResolvedValue({
    release: releaseExecutionLock,
  });
  hasActiveRun.mockResolvedValue(false);
  createRun.mockResolvedValue({ id: 99 });
  handler.mockResolvedValue({ summary: { ok: true } });
  getAgentHandler.mockReturnValue({
    displayName: "NAP Consistency",
    handler,
  });
});

describe("manual schedule execution lock", () => {
  it("prevents two manual triggers from passing separate active-run checks", async () => {
    let finishFirst: (() => void) | undefined;
    const firstCanFinish = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    handler.mockImplementationOnce(async () => {
      await firstCanFinish;
      return { summary: { ok: true } };
    });
    acquireExecutionLock
      .mockResolvedValueOnce({ release: releaseExecutionLock })
      .mockResolvedValueOnce(undefined);

    const firstResponse = makeResponse();
    await triggerRun(makeRequest(), firstResponse);
    expect(firstResponse.statusCode).toBe(200);

    const secondResponse = makeResponse();
    await triggerRun(makeRequest(), secondResponse);
    expect(secondResponse.statusCode).toBe(409);
    expect(createRun).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();

    finishFirst?.();
    await vi.waitFor(() => expect(releaseExecutionLock).toHaveBeenCalledOnce());
  });

  it("uses the shared lock seam, so a scheduled owner blocks a manual run", async () => {
    acquireExecutionLock.mockResolvedValueOnce(undefined);

    const response = makeResponse();
    await triggerRun(makeRequest(), response);

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      success: false,
      error: "Schedule is already running",
    });
    expect(hasActiveRun).not.toHaveBeenCalled();
    expect(createRun).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
