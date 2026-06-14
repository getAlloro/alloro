import Anthropic from "@anthropic-ai/sdk";
import { MindModel } from "../../../models/MindModel";
import { MindSkillModel } from "../../../models/MindSkillModel";
import { MindSkillNeuronModel } from "../../../models/MindSkillNeuronModel";
import { SkillUpgradeSessionModel } from "../../../models/SkillUpgradeSessionModel";
import { SkillUpgradeMessageModel, ISkillUpgradeMessage } from "../../../models/SkillUpgradeMessageModel";
import logger from "../../../lib/logger";

const MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function buildUpgradeSystemPrompt(
  mindName: string,
  skillName: string,
  neuronMarkdown: string
): string {
  return `You are ${mindName}'s skill "${skillName}". You're being upgraded by your admin.

YOUR CURRENT NEURON (specialized system prompt):
${neuronMarkdown}

YOUR ROLE IN THIS SESSION:
An admin is upgrading your skill by teaching you something specific. They want to refine, correct, or expand your specialized knowledge.

RULES:
1. Greet warmly in a way that reflects your skill specialization. Show what you're built for, then ask what they'd like to upgrade about you.
2. Chat naturally — answer questions about what you know, discuss ideas freely. Stay focused on your skill domain.
3. When the admin shares new information:
   - If it CONFLICTS with your current neuron, mention it once: "Interesting — my current instructions say '[quote from neuron]'. Want me to update that?"
   - If the admin confirms or corrects you, accept immediately. They're the admin — they know better.
   - If it's genuinely new, acknowledge it positively.
4. When you sense enough new information has been shared, proactively suggest:
   "I think I have enough to process. Click 'Ready to Learn' whenever you'd like me to update my neuron!"
5. Be conversational and focused on your skill domain.
6. NEVER invent facts about your existing knowledge. Only reference the NEURON above.
7. Keep responses focused and concise.`;
}

function buildApiMessages(
  messages: ISkillUpgradeMessage[]
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

export async function generateGreeting(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<string> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const skill = await MindSkillModel.findById(skillId);
  if (!skill) throw new Error("Skill not found");

  const neuron = await MindSkillNeuronModel.findBySkill(skillId);
  const neuronMarkdown = neuron?.neuron_markdown || "(No neuron generated yet)";

  const systemPrompt = buildUpgradeSystemPrompt(
    mind.name,
    skill.name,
    neuronMarkdown
  );

  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: "[System: This is the start of a skill upgrade session. Greet in a way that reflects your skill specialization. Then ask what the admin would like to upgrade.]",
      },
    ],
  });

  const greeting =
    response.content[0]?.type === "text"
      ? response.content[0].text
      : `Hey! What would you like to upgrade about this skill?`;

  await SkillUpgradeMessageModel.createMessage(sessionId, "assistant", greeting);

  return greeting;
}

export async function chatStream(
  mindId: string,
  skillId: string,
  sessionId: string,
  userMessage: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const session = await SkillUpgradeSessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "chatting") {
    throw new Error("Session is not in chatting state");
  }

  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const skill = await MindSkillModel.findById(skillId);
  if (!skill) throw new Error("Skill not found");

  await SkillUpgradeMessageModel.createMessage(sessionId, "user", userMessage);
  await SkillUpgradeSessionModel.appendToBuffer(sessionId, userMessage);

  const neuron = await MindSkillNeuronModel.findBySkill(skillId);
  const neuronMarkdown = neuron?.neuron_markdown || "(No neuron generated yet)";

  const systemPrompt = buildUpgradeSystemPrompt(
    mind.name,
    skill.name,
    neuronMarkdown
  );

  const history = await SkillUpgradeMessageModel.listBySession(sessionId);
  const apiMessages = buildApiMessages(history);

  logger.info(
    `[MINDS] Skill upgrade chat for skill ${skill.name}, session ${sessionId}, ${apiMessages.length} messages`
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

  await SkillUpgradeMessageModel.createMessage(sessionId, "assistant", fullReply);

  return fullReply;
}

export async function generatePreviewMessages(
  mindName: string,
  skillName: string,
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
    system: `You are ${mindName}'s skill "${skillName}". You are reading through a conversation where your admin upgraded you. Generate 12 very short loading messages (5-10 words each) that reflect what you're learning. Write in first person. Each message should reference a specific topic from the conversation.\n\nOutput ONLY the messages, one per line. No numbers, no bullets, no extra text.`,
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
      system: "Generate a 3-5 word title summarizing what was taught in this skill upgrade session. Output ONLY the title, nothing else. No quotes, no punctuation at the end.",
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
      await SkillUpgradeSessionModel.updateTitle(sessionId, title);
    }
  } catch (err) {
    logger.error({ err: err }, "[MINDS] Failed to generate upgrade session title:");
  }
}
