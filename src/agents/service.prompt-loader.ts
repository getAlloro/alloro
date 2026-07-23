/**
 * Prompt Loader Service
 *
 * Reads agent prompt markdown files from the src/agents/ directory.
 * Caches in memory after first read in production. In dev (NODE_ENV !==
 * "production") the cache is bypassed so prompt edits on disk take
 * effect on the next agent run without requiring a server restart.
 *
 * Resolution order:
 *   1. __dirname (works in dev with tsx — points to src/agents/)
 *   2. src/agents/ relative to project root (works in prod when running from dist/)
 */

import path from "path";
import fs from "fs";
import { AGENT_LATTICE_LOADOUT } from "./lattice/loadout";

const IS_PROD = process.env.NODE_ENV === "production";

const AGENTS_DIR = (() => {
  // Dev (tsx): __dirname = .../src/agents — .md files are here
  const devDir = path.resolve(__dirname);
  if (fs.existsSync(path.join(devDir, "monthlyAgents"))) return devDir;

  // Prod: __dirname = .../dist/agents — .md files live in src/agents/
  const srcDir = path.join(process.cwd(), "src", "agents");
  if (fs.existsSync(srcDir)) return srcDir;

  return devDir;
})();

const cache = new Map<string, string>();

/**
 * Load an agent prompt from a markdown file.
 *
 * @param agentPath - Path relative to src/agents/, without extension.
 *   Examples: "monthlyAgents/Summary", "websiteAgents/SeoAnalysis"
 * @returns The prompt text (full file contents)
 */
export function loadPrompt(agentPath: string): string {
  if (IS_PROD && cache.has(agentPath)) return cache.get(agentPath)!;

  const filePath = path.join(AGENTS_DIR, `${agentPath}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `[PromptLoader] Agent prompt not found: ${filePath}`
    );
  }

  const content = fs.readFileSync(filePath, "utf-8").trim();
  if (IS_PROD) cache.set(agentPath, content);
  return content;
}

/**
 * Header that introduces appended lattice fragments in a composed prompt.
 */
const LATTICE_HEADER =
  "GOVERNING RUBRICS (validated master frameworks; apply as hard constraints on your output):";

/**
 * Load an agent prompt AND compose any lattice fragment(s) mapped to it in
 * AGENT_LATTICE_LOADOUT. An agent with no mapping returns output identical to
 * loadPrompt(). A mapped-but-missing fragment throws (fail loud) via loadPrompt.
 *
 * This is the single wiring point that turns a validated master rubric from a
 * document nothing reads into an enforced part of a live agent's system prompt.
 * See src/agents/lattice/loadout.ts for the registry and the 3-step workflow.
 */
export function loadAgentPrompt(agentPath: string): string {
  const base = loadPrompt(agentPath);
  const latticeKeys = AGENT_LATTICE_LOADOUT[agentPath];
  if (!latticeKeys || latticeKeys.length === 0) return base;

  const fragments = latticeKeys.map((key) => loadPrompt(`lattice/${key}`));
  return [base, LATTICE_HEADER, ...fragments].join("\n\n");
}

/**
 * Clear the prompt cache. Useful during development or testing.
 */
export function clearPromptCache(): void {
  cache.clear();
}
