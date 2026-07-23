import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the model call; loadPrompt / loadAgentPrompt read the real agent files.
const runAgentMock = vi.fn();
vi.mock("../agents/service.llm-runner", () => ({
  runAgent: (...args: unknown[]) => runAgentMock(...args),
}));

import { runComposedAgent } from "../agents/service.composed-agent-runner";

const MAPPED = "auditAgents/gbp/TrustEngagement"; // has a lattice fragment (composed != base)
const UNMAPPED = "auditAgents/gbp/ProfileIntegrity"; // no fragment (composed == base)

describe("runComposedAgent — lattice safety net", () => {
  beforeEach(() => runAgentMock.mockReset());

  it("degrades to the base prompt when the composed prompt returns unparseable output", async () => {
    runAgentMock
      .mockResolvedValueOnce({ raw: "not json", parsed: null }) // composed attempt breaks JSON
      .mockResolvedValueOnce({ raw: "{}", parsed: { ok: true } }); // base attempt succeeds
    const onDegrade = vi.fn();

    const res = await runComposedAgent({
      agentPath: MAPPED,
      userMessage: "x",
      model: "test-model",
      onDegrade,
    });

    expect(res.parsed).toEqual({ ok: true });
    expect(runAgentMock).toHaveBeenCalledTimes(2);
    expect(onDegrade).toHaveBeenCalledOnce();
    // first attempt carried the injected rubric; the fallback used the base prompt only
    expect(runAgentMock.mock.calls[0][0].systemPrompt).toContain(
      "CIALDINI HONEST-INFLUENCE RUBRIC"
    );
    expect(runAgentMock.mock.calls[1][0].systemPrompt).not.toContain(
      "CIALDINI HONEST-INFLUENCE RUBRIC"
    );
  });

  it("does NOT retry for an unmapped agent (nothing was composed)", async () => {
    runAgentMock.mockResolvedValueOnce({ raw: "not json", parsed: null });

    const res = await runComposedAgent({
      agentPath: UNMAPPED,
      userMessage: "x",
      model: "test-model",
    });

    expect(res.parsed).toBeNull();
    expect(runAgentMock).toHaveBeenCalledTimes(1); // no fallback when composition was a no-op
  });

  it("does NOT retry when the composed prompt parses on the first try", async () => {
    runAgentMock.mockResolvedValueOnce({ raw: "{}", parsed: { ok: 1 } });

    const res = await runComposedAgent({
      agentPath: MAPPED,
      userMessage: "x",
      model: "test-model",
    });

    expect(res.parsed).toEqual({ ok: 1 });
    expect(runAgentMock).toHaveBeenCalledTimes(1);
  });
});
