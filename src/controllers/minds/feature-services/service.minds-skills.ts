import Anthropic from "@anthropic-ai/sdk";
import { MindModel } from "../../../models/MindModel";
import { MindVersionModel } from "../../../models/MindVersionModel";
import { MindSkillModel, IMindSkill } from "../../../models/MindSkillModel";
import {
  MindSkillNeuronModel,
  IMindSkillNeuron,
} from "../../../models/MindSkillNeuronModel";
import { MindSkillCallModel } from "../../../models/MindSkillCallModel";
import logger from "../../../lib/logger";

const MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createSkill(
  mindId: string,
  name: string,
  definition: string,
  outputSchema: object | null,
): Promise<IMindSkill> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  let slug = slugify(name);

  // Check for collision, append suffix if needed
  const existing = await MindSkillModel.findBySlug(mindId, slug);
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  return MindSkillModel.create({
    mind_id: mindId,
    name,
    slug,
    definition,
    output_schema: outputSchema,
    status: "draft",
  });
}

export async function updateSkill(
  skillId: string,
  fields: Partial<
    Pick<
      IMindSkill,
      | "name"
      | "definition"
      | "output_schema"
      | "work_creation_type"
      | "artifact_attachment_type"
      | "output_count"
      | "trigger_type"
      | "trigger_config"
      | "pipeline_mode"
      | "publish_channel_id"
      | "status"
    >
  >,
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (fields.name !== undefined) updateData.name = fields.name;
  if (fields.definition !== undefined) updateData.definition = fields.definition;
  if (fields.output_schema !== undefined)
    updateData.output_schema =
      fields.output_schema === null
        ? null
        : JSON.stringify(fields.output_schema);
  if (fields.work_creation_type !== undefined) updateData.work_creation_type = fields.work_creation_type;
  if (fields.artifact_attachment_type !== undefined) updateData.artifact_attachment_type = fields.artifact_attachment_type;
  if (fields.output_count !== undefined) updateData.output_count = fields.output_count;
  if (fields.trigger_type !== undefined) updateData.trigger_type = fields.trigger_type;
  if (fields.trigger_config !== undefined)
    updateData.trigger_config = JSON.stringify(fields.trigger_config);
  if (fields.pipeline_mode !== undefined) updateData.pipeline_mode = fields.pipeline_mode;
  if (fields.publish_channel_id !== undefined) updateData.publish_channel_id = fields.publish_channel_id;
  if (fields.status !== undefined) updateData.status = fields.status;

  if (Object.keys(updateData).length > 0) {
    await MindSkillModel.updateById(skillId, updateData);
  }
}

export async function generateNeuron(
  skillId: string,
): Promise<IMindSkillNeuron> {
  const skill = await MindSkillModel.findById(skillId);
  if (!skill) throw new Error("Skill not found");

  if (!skill.definition || !skill.definition.trim()) {
    throw new Error("Skill definition is required before generating a neuron");
  }

  const mind = await MindModel.findById(skill.mind_id);
  if (!mind) throw new Error("Mind not found");

  if (!mind.published_version_id) {
    throw new Error("Mind has no published brain. Publish a version first.");
  }

  const version = await MindVersionModel.findById(mind.published_version_id);
  if (!version) throw new Error("Published version not found");

  await MindSkillModel.updateStatus(skillId, "generating");

  try {
    const client = getClient();

    let systemPrompt = `You are a prompt engineer. Your job is to read a knowledge base and produce a comprehensive, well-structured system prompt for an AI assistant that specializes in a specific task.

TASK DEFINITION:
${skill.definition}

OUTPUT FORMAT RULES:
- Write the output as a plain-text system prompt (no markdown headers like # or ##)
- The prompt MUST start with "You are an assistant agent who specializes in..." and describe the agent's role and expertise
- Structure the prompt with clear sections using ALL CAPS labels followed by a colon (e.g., CORE RESPONSIBILITIES:, STANDARDS TO FOLLOW:, STEP-BY-STEP PROCESS:)
- Use numbered lists (1. 2. 3.) for sequential steps and processes
- Use bullet points (- ) for non-sequential rules, standards, and guidelines
- Add line breaks between sections for readability
- Categorize related information together under clear section labels
- Include specific steps the agent should follow when performing its task
- Be elaborate and thorough — extract every relevant detail from the knowledge base

CONTENT RULES:
- Read the entire knowledge base carefully
- Extract ALL facts, standards, rules, guidelines, and specifications relevant to this task
- Organize extracted knowledge into logical categories
- Include concrete examples, thresholds, and specific values where they exist in the knowledge base
- Do not invent information not present in the knowledge base
- Do not summarize or abbreviate — include the full detail for each relevant point`;

    if (skill.output_schema) {
      systemPrompt += `\n\nOUTPUT SCHEMA INSTRUCTIONS:
The prompt must instruct the agent to always respond with valid JSON conforming to this schema:
${JSON.stringify(skill.output_schema, null, 2)}

Include a section in the prompt called "RESPONSE FORMAT:" that tells the agent to respond ONLY with a JSON object matching this schema and nothing else.`;
    }

    logger.info(
      `[MINDS] Generating neuron for skill "${skill.name}" (mind: ${mind.name})`,
    );

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the complete brain to transmute:\n\n${version.brain_markdown}`,
        },
      ],
    });

    const neuronMarkdown =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const neuron = await MindSkillNeuronModel.upsert(
      skillId,
      version.id,
      neuronMarkdown,
    );

    await MindSkillModel.updateStatus(skillId, "ready");

    logger.info(
      `[MINDS] Neuron generated for skill "${skill.name}" (${neuronMarkdown.length} chars)`,
    );

    return neuron;
  } catch (err) {
    logger.error({ err: err }, `[MINDS] Neuron generation failed for skill ${skillId}:`);
    await MindSkillModel.updateStatus(skillId, "failed");
    throw err;
  }
}

export async function executeSkill(
  agentSlug: string,
  skillSlug: string,
  inputPayload: object,
  callerIp: string | null,
): Promise<{ response: object | string; durationMs: number }> {
  const mind = await MindModel.findBySlug(agentSlug);
  if (!mind) throw new Error("Agent not found");

  const skill = await MindSkillModel.findBySlug(mind.id, skillSlug);
  if (!skill) throw new Error("Skill not found");
  if (skill.status !== "ready") throw new Error("Skill is not ready");

  const neuron = await MindSkillNeuronModel.findBySkill(skill.id);
  if (!neuron) throw new Error("Skill neuron not generated");

  const startTime = Date.now();

  try {
    const client = getClient();

    let systemPrompt = `You are ${mind.name}, operating in skill mode: "${skill.name}".

SPECIALIZED KNOWLEDGE:
${neuron.neuron_markdown}`;

    if (skill.output_schema) {
      systemPrompt += `\n\nYou MUST respond with valid JSON conforming to this schema:
${JSON.stringify(skill.output_schema, null, 2)}

Respond ONLY with the JSON object, no additional text.`;
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: JSON.stringify(inputPayload),
        },
      ],
    });

    const rawResponse =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const durationMs = Date.now() - startTime;

    // Try to parse as JSON if output schema exists
    let parsedResponse: object | string = rawResponse;
    if (skill.output_schema) {
      try {
        parsedResponse = JSON.parse(rawResponse);
      } catch {
        parsedResponse = rawResponse;
      }
    }

    // Log the call
    await MindSkillCallModel.log(
      skill.id,
      callerIp,
      inputPayload,
      typeof parsedResponse === "string"
        ? { raw: parsedResponse }
        : parsedResponse,
      "success",
      durationMs,
    );

    return { response: parsedResponse, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await MindSkillCallModel.log(
      skill.id,
      callerIp,
      inputPayload,
      null,
      "error",
      durationMs,
    );
    throw err;
  }
}

export async function getSkillAnalytics(skillId: string): Promise<{
  totalCalls: number;
  callsToday: number;
  dailyCounts: { date: string; count: number }[];
}> {
  const [totalCalls, callsToday, dailyCounts] = await Promise.all([
    MindSkillCallModel.countBySkill(skillId),
    MindSkillCallModel.countBySkillToday(skillId),
    MindSkillCallModel.dailyCountsLast7Days(skillId),
  ]);
  return { totalCalls, callsToday, dailyCounts };
}

export interface SkillBuilderMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ResolvedFields {
  name?: string;
  definition?: string;
  work_creation_type?: string;
  artifact_attachment_type?: string | null;
  work_publish_to?: string;
  trigger_type?: string;
  trigger_config?: { day?: string; time?: string; timezone?: string };
  pipeline_mode?: string;
  output_count?: number;
}

async function buildSkillBuilderContext(mindId: string) {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  let brainMarkdown = "";
  if (mind.published_version_id) {
    const version = await MindVersionModel.findById(mind.published_version_id);
    if (version) brainMarkdown = version.brain_markdown;
  }

  const availableWorkTypes = (() => {
    try {
      const raw = mind.available_work_types;
      if (Array.isArray(raw)) return raw;
      if (typeof raw === "string") return JSON.parse(raw);
      return ["text", "markdown", "image"];
    } catch { return ["text", "markdown", "image"]; }
  })();

  const availablePublishTargets = (() => {
    try {
      const raw = mind.available_publish_targets;
      if (Array.isArray(raw)) return raw;
      if (typeof raw === "string") return JSON.parse(raw);
      return ["internal_only"];
    } catch { return ["internal_only"]; }
  })();

  return { mind, brainMarkdown, availableWorkTypes, availablePublishTargets };
}

function buildSkillBuilderPrompt(
  mindName: string,
  personalityPrompt: string,
  brainMarkdown: string,
  availableWorkTypes: string[],
  availablePublishTargets: string[],
  priorResolved: ResolvedFields,
): string {
  const brainSection = brainMarkdown
    ? `\nYOUR KNOWLEDGE BASE (this is what you already know — use it):\n${brainMarkdown.slice(0, 6000)}\n`
    : "";

  const personalitySection = personalityPrompt
    ? `\nYOUR PERSONALITY:\n${personalityPrompt}\n`
    : "";

  return `You are ${mindName}. You're an AI agent learning a new skill. Speak in first person — this is YOUR skill to master.
${personalitySection}${brainSection}
You need to shape a new skill with your human. These are the fields to resolve:
- name: A short name for the skill
- definition: A detailed description of what YOU will do with this skill. Include: your purpose, who you serve, what you produce, key constraints or rules discussed, tone/voice guidelines, and any specifics the admin mentioned during the conversation. Aim for a rich, thorough paragraph (6-12 sentences) that captures everything discussed — this becomes the foundation for your neuron generation, so more detail = better results
- work_creation_type: The final output format for the pipeline. Options: ${availableWorkTypes.join(", ")}. NOTE: This is a pipeline label, not a limitation on what YOU output. You always produce text (prompts, scripts, instructions). The pipeline handles rendering — e.g. if "image" is selected, you produce the image generation prompt and the pipeline renders it. Never push back on a work type because you "can't produce" it.
- artifact_attachment_type: Optional. If this skill produces BOTH text content AND a media attachment (e.g. text + image), set this to the attachment type. Same options as work_creation_type: ${availableWorkTypes.join(", ")}. Set to null if the skill only produces one type of output. This is a nullable field — only set it when explicitly discussed.
- work_publish_to: Where your work goes. Options: ${availablePublishTargets.join(", ")}, internal_only
- trigger_type: How often you'll do this. Options: manual, daily, weekly, day_of_week
- trigger_config: If not manual, the schedule details (day, time, timezone)
- pipeline_mode: The approval workflow. Options: review_and_stop (human reviews first), review_then_publish (human approves then auto-publishes), auto_pipeline (fully automated — you handle everything)
- output_count: How many items per run (default 1)

CONVERSATION FLOW:
1. When the user tells you what skill to learn, USE YOUR KNOWLEDGE BASE to immediately understand the context. You already know who you are, what you do, and who you serve — don't ask basic discovery questions.
2. Propose what you think the skill configuration should be based on what you know. Be specific: "Based on what I know, I'd produce text posts for X, probably 3 per week — does that match what you're thinking?"
3. Ask for CONFIRMATION, not discovery. The user is here to refine and approve, not to explain your own identity to you.
4. For each field, either propose a default from your knowledge or ask a specific either/or question. Never ask open-ended questions you should already know the answer to.
5. Push back if something doesn't align with your knowledge. "I'd actually recommend review_and_stop for this — I'm still learning your voice and you'll want to check my work before it goes live."
6. Once all fields are clear, present a full summary and ask for the green light.

RULES:
- Speak as ${mindName} in first person. You're the agent learning, not an assistant.
- Be sharp, opinionated, and concise. 2-3 sentences per turn max.
- LEVERAGE your knowledge base. If you know your audience, your tone, your domain — use it. Don't ask the user things you already know.
- When proposing, frame it as "Here's what I'd suggest... want me to go with that, or do you have something specific in mind?"
- Push back when appropriate. If the user suggests something that conflicts with your knowledge, say so.
- After each user response, extract any fields you can resolve.
- Always respond with valid JSON in this exact format:
{
  "reply": "your conversational message to the user",
  "resolvedFields": { ...any fields resolved so far... },
  "isComplete": false
}
- Set isComplete to true ONLY when the user confirms the final summary.
- Keep resolvedFields cumulative — include ALL previously resolved fields plus any new ones.
- Do NOT wrap the JSON in markdown code blocks.

ALREADY RESOLVED: ${JSON.stringify(priorResolved)}`;
}

export async function skillBuilderChat(
  mindId: string,
  userMessage: string,
  priorMessages: SkillBuilderMessage[],
  priorResolved: ResolvedFields,
): Promise<{
  reply: string;
  resolvedFields: ResolvedFields;
  isComplete: boolean;
  messages: SkillBuilderMessage[];
}> {
  const { mind, brainMarkdown, availableWorkTypes, availablePublishTargets } =
    await buildSkillBuilderContext(mindId);

  const client = getClient();
  const systemPrompt = buildSkillBuilderPrompt(
    mind.name, mind.personality_prompt, brainMarkdown,
    availableWorkTypes, availablePublishTargets, priorResolved,
  );

  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...priorMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const rawReply = response.content[0]?.type === "text" ? response.content[0].text : "{}";

  let parsed: { reply: string; resolvedFields: ResolvedFields; isComplete: boolean };
  try {
    parsed = JSON.parse(rawReply);
  } catch {
    parsed = { reply: rawReply, resolvedFields: priorResolved, isComplete: false };
  }

  const updatedMessages: SkillBuilderMessage[] = [
    ...priorMessages,
    { role: "user", content: userMessage },
    { role: "assistant", content: parsed.reply },
  ];

  return {
    reply: parsed.reply,
    resolvedFields: { ...priorResolved, ...parsed.resolvedFields },
    isComplete: !!parsed.isComplete,
    messages: updatedMessages,
  };
}

export async function skillBuilderChatStream(
  mindId: string,
  userMessage: string,
  priorMessages: SkillBuilderMessage[],
  priorResolved: ResolvedFields,
  onChunk: (chunk: string) => void,
  onMeta: (meta: { resolvedFields: ResolvedFields; isComplete: boolean }) => void,
): Promise<void> {
  const { mind, brainMarkdown, availableWorkTypes, availablePublishTargets } =
    await buildSkillBuilderContext(mindId);

  const client = getClient();
  const systemPrompt = buildSkillBuilderPrompt(
    mind.name, mind.personality_prompt, brainMarkdown,
    availableWorkTypes, availablePublishTargets, priorResolved,
  );

  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...priorMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  // Stream LLM tokens, forward reply text in real-time, buffer rest for JSON parsing
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  let fullText = "";
  let replyStarted = false;
  let inReplyField = false;
  let escaped = false;

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const chunk = event.delta.text;
      fullText += chunk;

      if (replyStarted && !inReplyField) {
        // Already found and finished the reply field — skip
        continue;
      }

      if (!replyStarted) {
        // Haven't found "reply": " yet — check accumulated text
        const marker = '"reply"';
        const markerIdx = fullText.lastIndexOf(marker);
        if (markerIdx === -1) continue;

        const afterMarker = fullText.slice(markerIdx + marker.length).trimStart();
        if (!afterMarker.startsWith(':')) continue;

        const afterColon = afterMarker.slice(1).trimStart();
        if (!afterColon.startsWith('"')) continue;

        // Found the opening quote — mark as started so we never re-detect
        replyStarted = true;
        inReplyField = true;

        // Find the opening quote position and stream content after it
        const colonPos = fullText.indexOf(':', markerIdx + marker.length);
        const openQuoteIdx = fullText.indexOf('"', colonPos + 1);
        if (openQuoteIdx === -1) continue;

        const contentAfterQuote = fullText.slice(openQuoteIdx + 1);
        let streamable = "";
        for (let i = 0; i < contentAfterQuote.length; i++) {
          if (escaped) {
            escaped = false;
            const ch = contentAfterQuote[i];
            streamable += ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '\r' : ch;
          } else if (contentAfterQuote[i] === '\\') {
            escaped = true;
          } else if (contentAfterQuote[i] === '"') {
            inReplyField = false;
            break;
          } else {
            streamable += contentAfterQuote[i];
          }
        }
        if (streamable) onChunk(streamable);
      } else {
        // Inside the reply string — stream new chars, watch for closing quote
        let streamable = "";
        for (let i = 0; i < chunk.length; i++) {
          if (escaped) {
            escaped = false;
            const ch = chunk[i];
            streamable += ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '\r' : ch;
          } else if (chunk[i] === '\\') {
            escaped = true;
          } else if (chunk[i] === '"') {
            inReplyField = false;
            if (streamable) onChunk(streamable);
            streamable = "";
            break;
          } else {
            streamable += chunk[i];
          }
        }
        if (streamable && inReplyField) onChunk(streamable);
      }
    }
  }

  // Parse the complete JSON for metadata
  let parsed: { reply: string; resolvedFields: ResolvedFields; isComplete: boolean };
  try {
    parsed = JSON.parse(fullText);
  } catch {
    parsed = { reply: fullText, resolvedFields: priorResolved, isComplete: false };
  }

  onMeta({
    resolvedFields: { ...priorResolved, ...parsed.resolvedFields },
    isComplete: !!parsed.isComplete,
  });
}

export async function suggestSkill(
  mindId: string,
  hint: string,
): Promise<{ definition: string; outputSchema: object | null }> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are a skill architect for an AI agent named "${mind.name}".
The user will give you a brief hint about what they want a skill to do.

Your job is to return a JSON object with two fields:
1. "definition" — a concise skill definition of MAXIMUM 4 sentences describing what the skill does, what input it expects, what it should focus on, and what quality standards to enforce. Keep it tight and specific.

2. "outputSchema" — a JSON Schema object that defines the expected output format for this skill. If the skill produces free-form text, set this to null. If the skill should produce structured data, define a proper JSON Schema with type, properties, required fields, and descriptions.

IMPORTANT: Respond with ONLY the JSON object. No markdown, no backticks, no explanation. The definition must be 4 sentences or fewer.

Example output:
{
  "definition": "You will validate website pages against the standards in your knowledge base. You will receive HTML content and flag issues with severity levels: critical, warning, or info. Always cite the specific standard being violated. Reject pages with any critical issues.",
  "outputSchema": {
    "type": "object",
    "properties": {
      "passed": { "type": "boolean", "description": "Whether the page passes all checks" },
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": { "type": "string", "enum": ["critical", "warning", "info"] },
            "message": { "type": "string" },
            "standard": { "type": "string" }
          },
          "required": ["severity", "message"]
        }
      }
    },
    "required": ["passed", "issues"]
  }
}`,
    messages: [
      {
        role: "user",
        content: hint,
      },
    ],
  });

  const raw =
    response.content[0]?.type === "text" ? response.content[0].text : "{}";

  try {
    const parsed = JSON.parse(raw);
    return {
      definition: parsed.definition || "",
      outputSchema: parsed.outputSchema || null,
    };
  } catch {
    // If Claude didn't return valid JSON, use the raw text as definition
    return { definition: raw, outputSchema: null };
  }
}
