import { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { MindModel } from "../../models/MindModel";
import { MindVersionModel } from "../../models/MindVersionModel";
import { MindSkillModel } from "../../models/MindSkillModel";
import { MindSkillNeuronModel } from "../../models/MindSkillNeuronModel";
import { MindSkillCallModel } from "../../models/MindSkillCallModel";
import { verifyPortalKey, generatePortalKey } from "./utils/portalKey";
import { shouldUseRag, retrieveForChat, buildRetrievedContext } from "./feature-services/service.minds-retrieval";
import logger from "../../lib/logger";

const MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

function validateInternalKey(req: Request): boolean {
  const key = req.headers["x-internal-key"] as string;
  return !!INTERNAL_API_KEY && !!key && key === INTERNAL_API_KEY;
}

// =====================================================================
// MIND PORTAL — POST /api/minds/:mindSlug/portal
// =====================================================================

export async function mindPortal(req: Request, res: Response): Promise<any> {
  const startTime = Date.now();
  const { mindSlug } = req.params;
  const { query } = req.body;

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "query is required" });
  }

  // Validate auth: x-internal-key (for n8n) or x-portal-key (for external consumers)
  const isInternal = validateInternalKey(req);

  const mind = await MindModel.findBySlug(mindSlug);
  if (!mind) return res.status(404).json({ error: "Mind not found" });

  if (!isInternal) {
    const portalKey = req.headers["x-portal-key"] as string;
    if (!portalKey) return res.status(401).json({ error: "x-portal-key or x-internal-key header is required" });
    if (!mind.portal_key_hash) return res.status(401).json({ error: "Portal not configured" });
    if (!verifyPortalKey(portalKey, mind.portal_key_hash)) {
      return res.status(401).json({ error: "Invalid portal key" });
    }
  }

  try {
    // Load brain
    let brainMarkdown = "";
    if (mind.published_version_id) {
      const version = await MindVersionModel.findById(mind.published_version_id);
      if (version) brainMarkdown = version.brain_markdown;
    }

    // Resolve brain context (RAG or full)
    let brainContext = brainMarkdown;
    if (brainMarkdown && shouldUseRag(brainMarkdown.length)) {
      try {
        const retrieval = await retrieveForChat(mind.id, query);
        brainContext = buildRetrievedContext(retrieval.chunks, retrieval.summary);
      } catch {
        brainContext = brainMarkdown;
      }
    }

    const systemPrompt = `You are ${mind.name}.

PERSONALITY:
${mind.personality_prompt}

KNOWLEDGE BASE:
${brainContext}

RULES:
- Answer the query using the knowledge base.
- If the knowledge base does not contain the answer, say so.
- Be concise and direct.
- Do not invent facts.`;

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: query }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    const responseText = textContent?.text || "";
    const tokensUsed =
      (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    const durationMs = Date.now() - startTime;

    return res.json({
      response: responseText,
      mind_version: mind.published_version_id ? "published" : "draft",
      tokens_used: tokensUsed,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[PORTAL] Mind portal error:");
    return res.status(500).json({ error: "Portal query failed" });
  }
}

// =====================================================================
// SKILL PORTAL — POST /api/skills/:skillSlug/portal
// =====================================================================

export async function skillPortal(req: Request, res: Response): Promise<any> {
  const startTime = Date.now();
  const { skillSlug } = req.params;
  const { query } = req.body;

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "query is required" });
  }

  // Validate auth: x-internal-key (for n8n) or x-portal-key (for external consumers)
  const isInternal = validateInternalKey(req);

  const skill = await MindSkillModel.findBySlugGlobal(skillSlug);
  if (!skill) return res.status(404).json({ error: "Skill not found" });

  if (!isInternal) {
    const portalKey = req.headers["x-portal-key"] as string;
    if (!portalKey) return res.status(401).json({ error: "x-portal-key or x-internal-key header is required" });
    if (!skill.portal_key_hash) return res.status(401).json({ error: "Portal not configured" });
    if (!verifyPortalKey(portalKey, skill.portal_key_hash)) {
      return res.status(401).json({ error: "Invalid portal key" });
    }
  }

  try {
    // Load skill neuron
    let neuronMarkdown = "";
    const neuron = await MindSkillNeuronModel.findOne({ skill_id: skill.id });
    if (neuron) neuronMarkdown = neuron.neuron_markdown;

    const systemPrompt = `You are a Skill Portal for the skill "${skill.name}".

SKILL DEFINITION:
${skill.definition}

${neuronMarkdown ? `SKILL BRAIN (NEURON):\n${neuronMarkdown}\n` : ""}
WORK TYPE: ${skill.work_creation_type || "text"}
OUTPUT COUNT: ${skill.output_count || 1}

INSTRUCTIONS:
- Answer questions about this skill: what it creates, for whom, its voice, its constraints.
- Be concise and direct.
- Stay within the skill's definition and knowledge.
- Do not invent facts not present in the neuron.`;

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: query }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    const responseText = textContent?.text || "";

    // Log call for analytics
    const durationMs = Date.now() - startTime;
    await MindSkillCallModel.log(
      skill.id,
      req.ip || "portal",
      { query, source: "portal" },
      { response: responseText.slice(0, 500) },
      "success",
      durationMs,
    );

    return res.json({
      response: responseText,
      context: {
        last_run: skill.last_run_at?.toISOString() || null,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[PORTAL] Skill portal error:");
    return res.status(500).json({ error: "Portal query failed" });
  }
}

// =====================================================================
// PORTAL KEY MANAGEMENT — Admin endpoints
// =====================================================================

// =====================================================================
// TEST MIND PORTAL — POST /admin/minds/:mindId/test-portal
// =====================================================================

export async function testMindPortal(req: Request, res: Response): Promise<any> {
  const { mindId } = req.params;
  const { query } = req.body;

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "query is required" });
  }

  const mind = await MindModel.findById(mindId);
  if (!mind) return res.status(404).json({ error: "Mind not found" });

  try {
    let brainMarkdown = "";
    if (mind.published_version_id) {
      const version = await MindVersionModel.findById(mind.published_version_id);
      if (version) brainMarkdown = version.brain_markdown;
    }

    let brainContext = brainMarkdown;
    if (brainMarkdown && shouldUseRag(brainMarkdown.length)) {
      try {
        const retrieval = await retrieveForChat(mind.id, query);
        brainContext = buildRetrievedContext(retrieval.chunks, retrieval.summary);
      } catch {
        brainContext = brainMarkdown;
      }
    }

    const systemPrompt = `You are ${mind.name}.

PERSONALITY:
${mind.personality_prompt}

KNOWLEDGE BASE:
${brainContext}

RULES:
- Answer the query using the knowledge base.
- If the knowledge base does not contain the answer, say so.
- Be concise and direct.
- Do not invent facts.`;

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: query }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    const responseText = textContent?.text || "";
    const tokensUsed =
      (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    return res.json({
      response: responseText,
      tokens_used: tokensUsed,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[PORTAL] Test mind portal error:");
    return res.status(500).json({ error: "Test portal query failed" });
  }
}

// =====================================================================
// TEST SKILL PORTAL — POST /admin/minds/:mindId/skills/:skillId/test-portal
// =====================================================================

export async function testSkillPortal(req: Request, res: Response): Promise<any> {
  const { mindId, skillId } = req.params;
  const { query } = req.body;

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "query is required" });
  }

  const skill = await MindSkillModel.findById(skillId);
  if (!skill || skill.mind_id !== mindId) {
    return res.status(404).json({ error: "Skill not found" });
  }

  try {
    let neuronMarkdown = "";
    const neuron = await MindSkillNeuronModel.findOne({ skill_id: skill.id });
    if (neuron) neuronMarkdown = neuron.neuron_markdown;

    const systemPrompt = `You are a Skill Portal for the skill "${skill.name}".

SKILL DEFINITION:
${skill.definition}

${neuronMarkdown ? `SKILL BRAIN (NEURON):\n${neuronMarkdown}\n` : ""}
WORK TYPE: ${skill.work_creation_type || "text"}
OUTPUT COUNT: ${skill.output_count || 1}

INSTRUCTIONS:
- Answer questions about this skill: what it creates, for whom, its voice, its constraints.
- Be concise and direct.
- Stay within the skill's definition and knowledge.
- Do not invent facts not present in the neuron.`;

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: query }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    const responseText = textContent?.text || "";

    return res.json({
      response: responseText,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[PORTAL] Test skill portal error:");
    return res.status(500).json({ error: "Test portal query failed" });
  }
}

// =====================================================================
// PORTAL KEY MANAGEMENT — Admin endpoints
// =====================================================================

export async function generateMindPortalKey(
  req: Request,
  res: Response
): Promise<any> {
  const { mindId } = req.params;

  const mind = await MindModel.findById(mindId);
  if (!mind) return res.status(404).json({ error: "Mind not found" });

  const { rawKey, hash } = generatePortalKey("mind");
  await MindModel.updatePortalKeyHash(mindId, hash);

  return res.json({ portal_key: rawKey });
}

export async function generateSkillPortalKey(
  req: Request,
  res: Response
): Promise<any> {
  const { mindId, skillId } = req.params;

  const skill = await MindSkillModel.findById(skillId);
  if (!skill || skill.mind_id !== mindId) {
    return res.status(404).json({ error: "Skill not found" });
  }

  const { rawKey, hash } = generatePortalKey("skill");
  await MindSkillModel.updateById(skillId, { portal_key_hash: hash });

  return res.json({ portal_key: rawKey });
}
