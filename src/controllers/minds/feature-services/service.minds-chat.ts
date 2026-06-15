import Anthropic from "@anthropic-ai/sdk";
import { MindModel } from "../../../models/MindModel";
import { MindVersionModel } from "../../../models/MindVersionModel";
import { MindConversationModel, IMindConversation } from "../../../models/MindConversationModel";
import { MindMessageModel, IMindMessage } from "../../../models/MindMessageModel";
import { shouldCompact, compactConversation } from "./service.minds-compaction";
import { shouldUseRag, retrieveForChat, buildRetrievedContext } from "./service.minds-retrieval";
import { safeLogAiCostEvent } from "../../../services/ai-cost/service.ai-cost";
import logger from "../../../lib/logger";

const MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
const MAX_HISTORY_MESSAGES = 30;

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function buildSystemPrompt(
  mindName: string,
  personalityPrompt: string,
  brainContext: string
): string {
  return `You are ${mindName}.

PERSONALITY:
${personalityPrompt}

KNOWLEDGE BASE (MARKDOWN):
${brainContext}

RULES:
- Prefer the knowledge base. Quote/anchor to it where helpful.
- If the knowledge base does not contain the answer, say you are not sure and suggest what info is needed.
- Do not invent facts.`;
}

function generateTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  const truncated = cleaned.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 20 ? truncated.slice(0, lastSpace) + "..." : truncated + "...";
}

function buildApiMessages(
  history: IMindMessage[]
): Array<{ role: "user" | "assistant"; content: string }> {
  const apiMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const m of history) {
    if (m.role === "system") {
      // Parse compaction messages and inject as a user context message
      try {
        const parsed = JSON.parse(m.content);
        if (parsed.type === "compaction") {
          apiMessages.push({
            role: "user",
            content: `[Context from our earlier conversation]: ${parsed.summary}`,
          });
          apiMessages.push({
            role: "assistant",
            content: "Understood, I have the context from our earlier conversation. How can I help?",
          });
          continue;
        }
      } catch {
        // Not JSON — skip system messages
      }
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      apiMessages.push({ role: m.role, content: m.content });
    }
  }

  return apiMessages;
}

/**
 * Resolves brain context: uses RAG retrieval for large brains,
 * falls back to full brain for small brains or on error.
 */
async function resolveBrainContext(
  mindId: string,
  brainMarkdown: string,
  userMessage: string
): Promise<string> {
  if (!brainMarkdown) return "";

  if (!shouldUseRag(brainMarkdown.length)) {
    return brainMarkdown;
  }

  try {
    const retrieval = await retrieveForChat(mindId, userMessage);
    return buildRetrievedContext(retrieval.chunks, retrieval.summary);
  } catch (err) {
    logger.error({ err: err }, "[MINDS] RAG retrieval failed, falling back to full brain:");
    return brainMarkdown;
  }
}

/**
 * Shared setup for both chat and chatStream:
 * loads mind, brain, conversation, stores user message, runs compaction.
 */
async function prepareChatContext(
  mindId: string,
  message: string,
  conversationId?: string,
  adminId?: string
): Promise<{
  mind: any;
  brainMarkdown: string;
  convId: string;
  apiMessages: Array<{ role: "user" | "assistant"; content: string }>;
  systemPrompt: string;
}> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  // Load brain
  let brainMarkdown = "";
  if (mind.published_version_id) {
    const version = await MindVersionModel.findById(mind.published_version_id);
    if (version) brainMarkdown = version.brain_markdown;
  }

  // Get or create conversation
  let convId = conversationId;
  let isNewConversation = false;
  if (!convId) {
    const conv = await MindConversationModel.createConversation(mindId, adminId);
    convId = conv.id;
    isNewConversation = true;
  } else {
    const conv = await MindConversationModel.findById(convId);
    if (!conv || conv.mind_id !== mindId) throw new Error("Conversation not found");
  }

  // Store user message + increment count
  await MindMessageModel.addMessage(convId, "user", message);
  await MindConversationModel.incrementMessageCount(convId);

  // Auto-generate title on first message
  if (isNewConversation) {
    await MindConversationModel.updateTitle(convId, generateTitle(message));
  }

  // Check if compaction is needed before building context
  try {
    if (await shouldCompact(convId)) {
      await compactConversation(convId, mind.name);
    }
  } catch (err) {
    logger.error({ err: err }, "[MINDS] Compaction failed, skipping:");
  }

  // Load recent history
  const history = await MindMessageModel.getRecentMessages(convId, MAX_HISTORY_MESSAGES);
  const apiMessages = buildApiMessages(history);

  // Resolve brain context (RAG or full)
  const brainContext = await resolveBrainContext(mindId, brainMarkdown, message);

  const systemPrompt = buildSystemPrompt(mind.name, mind.personality_prompt, brainContext);

  logger.info(
    `[MINDS] Chat request for mind ${mind.name}, conversation ${convId}, ${apiMessages.length} messages, brain context: ${brainContext.length} chars (original: ${brainMarkdown.length} chars)`
  );

  return { mind, brainMarkdown, convId, apiMessages, systemPrompt };
}

// =====================================================================
// NON-STREAMING CHAT (kept for backwards compatibility)
// =====================================================================

export async function chat(
  mindId: string,
  message: string,
  conversationId?: string,
  adminId?: string
): Promise<{
  conversationId: string;
  reply: string;
}> {
  const { convId, apiMessages, systemPrompt } = await prepareChatContext(
    mindId,
    message,
    conversationId,
    adminId
  );

  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: apiMessages,
  });

  const reply =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  // Cost capture — minds-chat is mind-scoped (no project), so projectId stays null.
  await safeLogAiCostEvent({
    projectId: null,
    eventType: "minds-chat",
    vendor: "anthropic",
    model: response.model,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    metadata: {
      mind_id: mindId,
      conversation_id: convId,
      stream: false,
    },
  });

  // Store assistant response + increment count
  await MindMessageModel.addMessage(convId, "assistant", reply);
  await MindConversationModel.incrementMessageCount(convId);

  return { conversationId: convId, reply };
}

// =====================================================================
// STREAMING CHAT (SSE)
// =====================================================================

export async function chatStream(
  mindId: string,
  message: string,
  onChunk: (chunk: string) => void,
  onConversationId: (convId: string) => void,
  conversationId?: string,
  adminId?: string
): Promise<{ conversationId: string }> {
  const { convId, apiMessages, systemPrompt } = await prepareChatContext(
    mindId,
    message,
    conversationId,
    adminId
  );

  // Send conversationId immediately so the frontend can track it
  onConversationId(convId);

  const client = getClient();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: apiMessages,
  });

  let fullReply = "";
  let usageInputTokens = 0;
  let usageOutputTokens = 0;
  let resolvedModel: string = MODEL;

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullReply += event.delta.text;
      onChunk(event.delta.text);
    } else if (event.type === "message_start" && (event as any).message) {
      const msg = (event as any).message;
      if (msg?.usage?.input_tokens) usageInputTokens = msg.usage.input_tokens;
      if (msg?.model) resolvedModel = msg.model;
    } else if (event.type === "message_delta" && (event as any).usage) {
      const usage = (event as any).usage;
      if (typeof usage.output_tokens === "number") {
        usageOutputTokens = usage.output_tokens;
      }
    }
  }

  // Cost capture — best-effort (stream usage may be partial on SDK errors).
  await safeLogAiCostEvent({
    projectId: null,
    eventType: "minds-chat",
    vendor: "anthropic",
    model: resolvedModel,
    usage: {
      input_tokens: usageInputTokens,
      output_tokens: usageOutputTokens,
    },
    metadata: {
      mind_id: mindId,
      conversation_id: convId,
      stream: true,
    },
  });

  // Persist complete assistant message AFTER stream ends
  await MindMessageModel.addMessage(convId, "assistant", fullReply);
  await MindConversationModel.incrementMessageCount(convId);

  return { conversationId: convId };
}

// =====================================================================
// EXISTING EXPORTS (unchanged)
// =====================================================================

export async function getConversationMessages(
  mindId: string,
  conversationId: string
): Promise<IMindMessage[]> {
  const conv = await MindConversationModel.findById(conversationId);
  if (!conv || conv.mind_id !== mindId) throw new Error("Conversation not found");

  return MindMessageModel.listByConversation(conversationId);
}

export async function listConversations(
  mindId: string
): Promise<IMindConversation[]> {
  return MindConversationModel.listByMind(mindId);
}

export async function renameConversation(
  mindId: string,
  conversationId: string,
  title: string
): Promise<void> {
  const conv = await MindConversationModel.findById(conversationId);
  if (!conv || conv.mind_id !== mindId) throw new Error("Conversation not found");

  await MindConversationModel.updateTitle(conversationId, title);
}

export async function deleteConversation(
  mindId: string,
  conversationId: string
): Promise<boolean> {
  const conv = await MindConversationModel.findById(conversationId);
  if (!conv || conv.mind_id !== mindId) throw new Error("Conversation not found");

  // Messages cascade-delete via FK
  const deleted = await MindConversationModel.deleteById(conversationId);
  return deleted > 0;
}
