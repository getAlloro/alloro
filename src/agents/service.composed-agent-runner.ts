import { runAgent, type LlmRunnerResult } from "./service.llm-runner";
import { loadPrompt, loadAgentPrompt } from "./service.prompt-loader";

export interface ComposedAgentOptions {
  /** Agent path relative to src/agents/ (same key loadPrompt uses). */
  agentPath: string;
  userMessage: string;
  model?: string;
  /** Called when the composed (lattice) prompt was unparseable and we fell back to base. */
  onDegrade?: (agentPath: string) => void;
}

/**
 * Run an agent with its composed (lattice-injected) prompt, with a safety net:
 * an injected rubric must only ever help or no-op — never break the agent.
 *
 * If lattice composition changed the prompt AND the model returned unparseable
 * output (after runAgent's own internal retry), degrade to the base prompt and
 * retry once. So the worst case of any fragment on any agent is "no better than
 * baseline," never a broken pillar. This is the safety foundation that lets the
 * injection mechanism scale to more agents without each one being a new risk.
 *
 * See src/agents/lattice/loadout.ts (registry) and service.prompt-loader.ts
 * (loadAgentPrompt).
 */
export async function runComposedAgent(
  opts: ComposedAgentOptions
): Promise<LlmRunnerResult> {
  const basePrompt = loadPrompt(opts.agentPath);
  const composedPrompt = loadAgentPrompt(opts.agentPath);

  const res = await runAgent({
    systemPrompt: composedPrompt,
    userMessage: opts.userMessage,
    model: opts.model,
  });

  // Nothing was composed, or it parsed fine -> return as-is.
  if (res.parsed || composedPrompt === basePrompt) {
    return res;
  }

  // A lattice fragment is present and broke parsing -> degrade to the base prompt.
  opts.onDegrade?.(opts.agentPath);
  return runAgent({
    systemPrompt: basePrompt,
    userMessage: opts.userMessage,
    model: opts.model,
  });
}
