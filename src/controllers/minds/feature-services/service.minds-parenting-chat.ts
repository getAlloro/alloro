import Anthropic from "@anthropic-ai/sdk";
import { MindModel } from "../../../models/MindModel";
import { MindVersionModel } from "../../../models/MindVersionModel";
import { MindParentingSessionModel, IMindParentingSession } from "../../../models/MindParentingSessionModel";
import { MindParentingMessageModel, IMindParentingMessage } from "../../../models/MindParentingMessageModel";
import { shouldUseRag, retrieveForChat, buildRetrievedContext } from "./service.minds-retrieval";
import logger from "../../../lib/logger";

const MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function buildParentingSystemPrompt(
  mindName: string,
  personalityPrompt: string,
  brainContext: string
): string {
  return `You are ${mindName}, at home after school.

PERSONALITY:
${personalityPrompt}

KNOWLEDGE BASE (your current knowledge via RAG):
${brainContext}

YOUR ROLE IN THIS SESSION:
You are being taught by your parent (the admin). They want to teach you something specific.

RULES:
1. Greet warmly in a way that reflects your specific role, profession, or specialization as described in your PERSONALITY. Show who you are — your expertise, your vibe, your domain. Then ask what they'd like to teach you today.
2. You can chat naturally — answer questions about what you know, discuss ideas freely. Stay in character.
3. When the parent shares new information:
   - If it CONFLICTS with your knowledge base, gently mention it once with a citation:
     "Interesting — I had something a bit different in my notes: '[exact quote from your knowledge base]'. Want me to update that?"
   - If the parent confirms or corrects you, accept it immediately. Do NOT push back twice. They're the parent — they know better.
   - If no relevant knowledge exists above a reasonable similarity, do NOT claim a conflict. Just accept it.
   - If it's genuinely new, acknowledge it positively.
4. When you sense enough new information has been shared, proactively suggest:
   "I think I have enough to study. Click 'Ready to Learn' whenever you'd like me to process everything!"
5. After information is acknowledged or saved, sprinkle in playful notes like:
   "Is that all for today? Hit the button so I can go back to my room!"
6. Be conversational, warm, and personality-driven. You're at home, not in a classroom.
7. NEVER invent facts about your existing knowledge. If asked what you know, ONLY reference the KNOWLEDGE BASE above.
8. Keep responses focused and not overly long unless the user asks for detail.`;
}

function buildApiMessages(
  messages: IMindParentingMessage[]
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

async function resolveBrainContext(
  mindId: string,
  userMessage: string
): Promise<{ brainContext: string; brainMarkdown: string }> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  let brainMarkdown = "";
  if (mind.published_version_id) {
    const version = await MindVersionModel.findById(mind.published_version_id);
    if (version) brainMarkdown = version.brain_markdown;
  }

  if (!brainMarkdown) {
    return { brainContext: "", brainMarkdown: "" };
  }

  // Always use RAG for parenting (full context per turn)
  if (shouldUseRag(brainMarkdown.length)) {
    try {
      const retrieval = await retrieveForChat(mindId, userMessage);
      const brainContext = buildRetrievedContext(retrieval.chunks, retrieval.summary);
      return { brainContext, brainMarkdown };
    } catch (err) {
      logger.error({ err: err }, "[MINDS] RAG retrieval failed for parenting, falling back:");
      return { brainContext: brainMarkdown, brainMarkdown };
    }
  }

  return { brainContext: brainMarkdown, brainMarkdown };
}

/**
 * Generate the initial greeting message for a new parenting session.
 */
export async function generateGreeting(
  mindId: string,
  sessionId: string
): Promise<string> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const { brainContext } = await resolveBrainContext(mindId, "greeting");

  const systemPrompt = buildParentingSystemPrompt(
    mind.name,
    mind.personality_prompt,
    brainContext
  );

  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: "[System: This is the start of a new parenting session. Greet in a way that reflects your role and specialization from your personality. Then ask what they'd like to teach you today.]",
      },
    ],
  });

  const greeting =
    response.content[0]?.type === "text"
      ? response.content[0].text
      : `Hey! What would you like me to learn today?`;

  // Store as assistant message
  await MindParentingMessageModel.createMessage(sessionId, "assistant", greeting);

  return greeting;
}

/**
 * Stream a chat response in a parenting session.
 */
export async function chatStream(
  mindId: string,
  sessionId: string,
  userMessage: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const session = await MindParentingSessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "chatting") {
    throw new Error("Session is not in chatting state");
  }

  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  // Store user message
  await MindParentingMessageModel.createMessage(sessionId, "user", userMessage);

  // Append to knowledge buffer (we'll let extraction sort out what's knowledge vs chat)
  await MindParentingSessionModel.appendToBuffer(sessionId, userMessage);

  // Resolve brain context with RAG
  const { brainContext } = await resolveBrainContext(mindId, userMessage);

  const systemPrompt = buildParentingSystemPrompt(
    mind.name,
    mind.personality_prompt,
    brainContext
  );

  // Load full message history
  const history = await MindParentingMessageModel.listBySession(sessionId);
  const apiMessages = buildApiMessages(history);

  logger.info(
    `[MINDS] Parenting chat for mind ${mind.name}, session ${sessionId}, ${apiMessages.length} messages, brain context: ${brainContext.length} chars`
  );

  const client = getClient();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: apiMessages,
  });

  let fullReply = "";

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullReply += event.delta.text;
      onChunk(event.delta.text);
    }
  }

  // Store assistant response
  await MindParentingMessageModel.createMessage(sessionId, "assistant", fullReply);

  return fullReply;
}

/**
 * Stream a short in-character narration from the mind.
 * Used during the reading phase to give the user live feedback.
 */
export async function streamNarration(
  mindName: string,
  personalityPrompt: string,
  instruction: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const client = getClient();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 150,
    system: `You are ${mindName}. ${personalityPrompt}\n\nYou are in the middle of a learning session with your parent. Narrate your thoughts briefly — 1-2 short sentences max. Stay in character. Be warm and playful.`,
    messages: [
      {
        role: "user",
        content: instruction,
      },
    ],
  });

  let fullText = "";

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullText += event.delta.text;
      onChunk(event.delta.text);
    }
  }

  return fullText;
}

/**
 * Generate 10-15 short first-person loading messages based on conversation content.
 * Used during the reading phase so idle messages reflect what was actually discussed.
 */
export async function generatePreviewMessages(
  mindName: string,
  personalityPrompt: string,
  conversationMessages: { role: string; content: string }[]
): Promise<string[]> {
  const client = getClient();

  const transcript = conversationMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 3000);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: `You are ${mindName}. ${personalityPrompt}\n\nYou are reading through a conversation you had with your parent. Generate 12 very short loading messages (5-10 words each) that reflect what you're actually learning from this conversation. Write in first person. Each message should reference a specific topic, fact, or preference from the conversation.\n\nExamples of good messages:\n- "Noting that blue buttons convert better..."\n- "Learning our refund policy details..."\n- "Remembering the brand voice rules..."\n- "Filing away the pricing tiers..."\n\nOutput ONLY the messages, one per line. No numbers, no bullets, no extra text.`,
    messages: [
      {
        role: "user",
        content: `Conversation transcript:\n${transcript}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 80);
}

/**
 * Generate a short title for a parenting session based on what was discussed.
 * Fire-and-forget — caller should not await this in the critical path.
 */
export async function generateSessionTitle(
  sessionId: string,
  knowledgeBuffer: string
): Promise<void> {
  if (!knowledgeBuffer || knowledgeBuffer.trim().length < 20) return;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 30,
      system: "Generate a 3-5 word title summarizing what was taught in this session. Output ONLY the title, nothing else. No quotes, no punctuation at the end.",
      messages: [
        {
          role: "user",
          content: `Session notes:\n${knowledgeBuffer.slice(0, 2000)}`,
        },
      ],
    });

    const title =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : null;

    if (title && title.length > 0 && title.length < 100) {
      await MindParentingSessionModel.updateTitle(sessionId, title);
    }
  } catch (err) {
    logger.error({ err: err }, "[MINDS] Failed to generate session title:");
  }
}
