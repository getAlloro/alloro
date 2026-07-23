import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { AGENT_LATTICE_LOADOUT } from "../agents/lattice/loadout";

/**
 * Enforcement test for the FOURTH wiring step: the call site.
 *
 * A rubric can be mapped in AGENT_LATTICE_LOADOUT, shipped as a validated
 * fragment, and asserted in agent-prompt-composition.test.ts — and STILL never
 * reach the live agent, because the agent's production call site calls the base
 * `loadPrompt()` instead of `loadAgentPrompt()` / `runComposedAgent()`.
 *
 * That is a silent no-op: the composition test passes (it calls loadAgentPrompt
 * directly), so the suite is green while the running agent loads base-only.
 * This test closes that gap — a mapped agent whose call site still uses bare
 * loadPrompt() goes red, naming the file and line.
 */

const SRC_DIR = path.join(process.cwd(), "src");

/** The loader and the runner legitimately call loadPrompt() to build the base. */
const EXEMPT_FILES = new Set([
  path.join("src", "agents", "service.prompt-loader.ts"),
  path.join("src", "agents", "service.composed-agent-runner.ts"),
]);

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      collectTsFiles(full, acc);
    } else if (entry.name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

/** Find `loadPrompt("<agentPath>")` call sites that bypass lattice composition. */
function findBypassingCallSites(agentPath: string): string[] {
  const escaped = agentPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\bloadPrompt\\(\\s*["'\`]${escaped}["'\`]\\s*\\)`
  );

  const hits: string[] = [];
  for (const file of collectTsFiles(SRC_DIR)) {
    const relative = path.relative(process.cwd(), file);
    if (EXEMPT_FILES.has(relative)) continue;

    const lines = fs.readFileSync(file, "utf-8").split("\n");
    lines.forEach((line, index) => {
      if (pattern.test(line)) hits.push(`${relative}:${index + 1}`);
    });
  }
  return hits;
}

describe("lattice -> agent call-site wiring", () => {
  const mappedAgents = Object.keys(AGENT_LATTICE_LOADOUT);

  it("has at least one mapped agent to guard", () => {
    expect(mappedAgents.length).toBeGreaterThan(0);
  });

  it.each(mappedAgents)(
    "%s is not loaded through bare loadPrompt() anywhere in src/",
    (agentPath) => {
      const bypassing = findBypassingCallSites(agentPath);
      expect(
        bypassing,
        `"${agentPath}" has a lattice rubric mapped in AGENT_LATTICE_LOADOUT, but ` +
          `these call sites load it with bare loadPrompt(), so the rubric never ` +
          `reaches the running agent:\n  ${bypassing.join("\n  ")}\n` +
          `Fix: switch each to loadAgentPrompt() (or runComposedAgent()). ` +
          `See src/agents/lattice/README.md, step 4.`
      ).toEqual([]);
    }
  );
});
