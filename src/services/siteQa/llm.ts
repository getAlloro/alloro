import Anthropic from "@anthropic-ai/sdk";
import { prependSubstrate } from "../prompt/alloroSubstrate";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export const SITE_QA_LLM_MODEL = "claude-sonnet-4-20250514";

export interface LlmVerdict {
  passed: boolean;
  reasoning: string;
}

/**
 * Call Claude Sonnet with a single criterion and return pass/fail + reasoning.
 * Expects JSON response: {"passed": true|false, "reasoning": "..."}.
 * On any transport or parse failure, returns passed=true with a skip reason —
 * a failed LLM call must not block a publish (shadow only).
 */
export async function askLlmGate(
  criterion: string,
  pageCopy: string,
  orgName?: string
): Promise<LlmVerdict> {
  try {
    const prompt = `You are auditing a single website page for a local practice${
      orgName ? ` named ${orgName}` : ""
    }.

Criterion: ${criterion}

Page copy:
${pageCopy.slice(0, 8000)}

Answer with strict JSON only: {"passed": true|false, "reasoning": "one short sentence"}.
No preamble, no trailing commentary.`;

    const response = await getClient().messages.create({
      model: SITE_QA_LLM_MODEL,
      max_tokens: 300,
      system: prependSubstrate(
        "You are a terse QA reviewer. You answer with strict JSON. No preamble. No trailing commentary."
      ),
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { passed: true, reasoning: "LLM returned no JSON; gate skipped" };
    }
    const parsed = JSON.parse(match[0]);
    const passed = parsed.passed === true;
    const reasoning =
      typeof parsed.reasoning === "string" ? parsed.reasoning : "(no reasoning)";
    return { passed, reasoning };
  } catch (err: any) {
    return {
      passed: true,
      reasoning: `LLM gate skipped: ${err?.message ?? "unknown error"}`,
    };
  }
}
