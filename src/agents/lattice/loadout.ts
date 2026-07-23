/**
 * Agent -> Lattice Loadout Registry
 *
 * The single place that declares which validated master rubric(s) wire into
 * which agent's system prompt. `loadAgentPrompt()` (service.prompt-loader.ts)
 * composes base prompt + mapped fragment(s) at load time; the composition test
 * (src/__tests__/agent-prompt-composition.test.ts) goes red if a mapping is
 * removed. That failing-on-removal is what makes a rubric an *enforced* part of
 * a live agent instead of a document nothing reads.
 *
 * WHERE THIS FITS (so a future session finds it in one hop, not twenty-five):
 *   - Library of masters (source of truth): held outside this repository. Ask the
 *     owner for it rather than grepping, and do not cite it as a repo path. It is
 *     a read-only reference and is never loaded at runtime.
 *   - Shipped loadout (this dir): validated fragments distilled from the library.
 *   - Discoverability pointers: AGENTS.md ("Agent Knowledge Injection") + this dir's README.md.
 *
 * TO MAKE A MASTER LIVE — the repeatable workflow, four steps:
 *   1. Add a validated, canon-conformant fragment: src/agents/lattice/{key}.md
 *      (distilled from the library; no retired vocabulary, no guarantees per
 *      Value #6, no ad/campaign framing).
 *   2. Add one row below:  "{agentPath}": ["{key}"].
 *   3. Add one assertion to src/__tests__/agent-prompt-composition.test.ts.
 *   4. Switch that agent's production call site from loadPrompt() to
 *      loadAgentPrompt() (or runComposedAgent()). WITHOUT THIS STEP THE RUBRIC
 *      IS A NO-OP: steps 1-3 all pass while the live agent still loads base-only.
 *      src/__tests__/lattice-callsite-wiring.test.ts goes red if you skip it.
 *
 * Queued follow-ups (each = the four steps above):
 *   - Schwartz (5 Stages of Awareness)       -> websiteAgents/SeoGeneration
 *   - Sheridan (They Ask, You Answer / Big 5) -> auditAgents/WebsiteAnalysis
 *
 * Keys are agent paths relative to src/agents/ (the same keys loadPrompt uses).
 * Fragment keys resolve to src/agents/lattice/{key}.md via loadPrompt("lattice/{key}").
 */
export const AGENT_LATTICE_LOADOUT: Record<string, readonly string[]> = {
  "auditAgents/gbp/TrustEngagement": ["cialdini-honest-influence"],
};
