import { describe, expect, it } from "vitest";
import {
  loadPrompt,
  loadAgentPrompt,
} from "../agents/service.prompt-loader";

/**
 * Enforcement test for lattice -> agent prompt composition.
 *
 * This is the check that makes the wiring a SYSTEM instead of a document:
 * if the AGENT_LATTICE_LOADOUT mapping for TrustEngagement is removed, the first
 * test goes red. Mutation-proven during execution: row removed -> suite failed;
 * row restored -> suite green.
 */
describe("lattice -> agent prompt composition", () => {
  it("composes the mapped Cialdini rubric into the TrustEngagement prompt", () => {
    const composed = loadAgentPrompt("auditAgents/gbp/TrustEngagement");
    // base prompt is present
    expect(composed).toContain("Headless GBP Pillar Scorer");
    // the mapped lattice fragment is present
    expect(composed).toContain("CIALDINI HONEST-INFLUENCE RUBRIC");
    // composition strictly extends the base
    expect(composed.length).toBeGreaterThan(
      loadPrompt("auditAgents/gbp/TrustEngagement").length
    );
  });

  it("leaves an unmapped agent's prompt byte-identical to loadPrompt()", () => {
    const agentPath = "auditAgents/gbp/ProfileIntegrity";
    expect(loadAgentPrompt(agentPath)).toBe(loadPrompt(agentPath));
  });

  it("fails loud when a fragment file is missing", () => {
    expect(() => loadPrompt("lattice/this-fragment-does-not-exist")).toThrow(
      /Agent prompt not found/
    );
  });
});
