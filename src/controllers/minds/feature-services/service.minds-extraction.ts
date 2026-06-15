import Anthropic from "@anthropic-ai/sdk";
import logger from "../../../lib/logger";

const MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a knowledge extraction specialist. Your job is to read a conversation transcript between a human (parent/admin) and an AI agent, and extract ONLY the factual knowledge the human intended to teach.

RULES:
- Output clean, structured markdown suitable for a knowledge base.
- Use headings (##) to organize by topic.
- Strip out: greetings, questions, meta-discussion, chit-chat, instructions to the AI.
- Preserve: facts, processes, policies, preferences, data, rules, insights.
- If the human provided structured data (JSON, CSV, tables), convert it to natural language knowledge statements.
- If no teachable knowledge is found, output exactly: EMPTY
- Keep the language professional and concise.
- Do NOT add information that wasn't explicitly stated by the human.`;

const PARENTING_EXTRACTION_PROMPT = `You are a knowledge extraction specialist. Your job is to read a teaching session transcript where a human (the "parent") is deliberately teaching an AI agent new knowledge.

CRITICAL: In this context, the human's directives, preferences, rules, and instructions ARE the knowledge to extract. They are teaching the agent what to know, believe, recommend, or do. Do NOT discard them.

RULES:
- Output clean, structured markdown suitable for a knowledge base.
- Use headings (##) to organize by topic.
- Extract ALL preferences, rules, policies, opinions, facts, processes, and directives the human stated.
- Examples of extractable knowledge: "Always recommend blue buttons", "Never suggest X", "The policy is Y", "Our approach to Z is..."
- Strip out ONLY: greetings, filler words, and the agent's own responses (unless the agent confirmed a fact the human corrected).
- If the human corrected or overrode the agent's pushback, the human's final position is the knowledge to extract.
- If no teachable knowledge is found, output exactly: EMPTY
- Keep the language professional and concise.
- Do NOT add information that wasn't explicitly stated by the human.`;

export async function extractKnowledgeFromTranscript(
  messages: Array<{ role: string; content: string }>,
  knowledgeBuffer: string,
  options?: { source?: "parenting" | "web_scrape" }
): Promise<string> {
  const client = getClient();

  // Build transcript from messages
  const transcript = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `[${m.role === "user" ? "Human" : "Agent"}]: ${m.content}`)
    .join("\n\n");

  // Combine transcript with knowledge buffer
  const combined = knowledgeBuffer
    ? `CONVERSATION TRANSCRIPT:\n${transcript}\n\nACCUMULATED KNOWLEDGE NOTES:\n${knowledgeBuffer}`
    : `CONVERSATION TRANSCRIPT:\n${transcript}`;

  logger.info(
    `[MINDS] Extracting knowledge from transcript: ${combined.length} chars`
  );

  const systemPrompt =
    options?.source === "parenting"
      ? PARENTING_EXTRACTION_PROMPT
      : EXTRACTION_SYSTEM_PROMPT;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Extract teachable knowledge from this conversation:\n\n${combined}`,
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "EMPTY";

  logger.info(
    `[MINDS] Extraction result: ${text.length} chars, empty: ${text.trim() === "EMPTY"}`
  );

  return text.trim();
}
