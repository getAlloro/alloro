import Anthropic from "@anthropic-ai/sdk";
import { MindMessageModel, IMindMessage } from "../../../models/MindMessageModel";
import { MindConversationModel } from "../../../models/MindConversationModel";
import logger from "../../../lib/logger";

const MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
const COMPACTION_THRESHOLD = parseInt(process.env.MINDS_COMPACTION_THRESHOLD || "50", 10);

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

export async function shouldCompact(conversationId: string): Promise<boolean> {
  const conv = await MindConversationModel.findById(conversationId);
  if (!conv) return false;
  return conv.message_count >= COMPACTION_THRESHOLD;
}

export async function compactConversation(
  conversationId: string,
  mindName: string
): Promise<string> {
  const messages = await MindMessageModel.listByConversation(conversationId, 200);
  if (messages.length === 0) return "";

  const transcript = messages
    .map((m: IMindMessage) => {
      if (m.role === "system") {
        // Check if it's a prior compaction message
        try {
          const parsed = JSON.parse(m.content);
          if (parsed.type === "compaction") {
            return `[PRIOR SUMMARY]: ${parsed.summary}`;
          }
        } catch {
          // Not JSON, treat as normal system message
        }
        return `[System]: ${m.content}`;
      }
      return `[${m.role === "user" ? "Human" : "Assistant"}]: ${m.content}`;
    })
    .join("\n\n");

  const client = getClient();

  logger.info(
    `[MINDS] Compacting conversation ${conversationId} (${messages.length} messages)`
  );

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are a conversation summarizer. Produce a concise summary of the conversation below.
Include:
- Key topics discussed
- Important decisions or conclusions reached
- Any unresolved questions or open threads
- The overall tone and direction of the conversation

Be thorough but concise. This summary will replace the original messages as context for future conversation.`,
    messages: [
      {
        role: "user",
        content: `Summarize this conversation between a human and ${mindName}:\n\n${transcript}`,
      },
    ],
  });

  const summary =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  // Delete all existing messages
  await MindMessageModel.deleteByConversation(conversationId);

  // Insert compaction message
  const compactionPayload = JSON.stringify({
    type: "compaction",
    summary,
    message_count: messages.length,
    compacted_at: new Date().toISOString(),
  });

  await MindMessageModel.addMessage(conversationId, "system", compactionPayload);

  // Reset conversation message_count to 1 (the compaction message)
  await MindConversationModel.resetMessageCount(conversationId, 1);

  logger.info(
    `[MINDS] Compaction complete for ${conversationId}: ${messages.length} messages → 1 summary`
  );

  return summary;
}
