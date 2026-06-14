import Anthropic from "@anthropic-ai/sdk";
import { MindModel } from "../../../models/MindModel";
import { MindSkillModel, IMindSkill } from "../../../models/MindSkillModel";
import { SkillWorkRunModel, ISkillWorkRun } from "../../../models/SkillWorkRunModel";
import { generateEmbedding } from "./service.minds-embedding";
import { PublishChannelModel } from "../../../models/PublishChannelModel";
import logger from "../../../lib/logger";

const SAFETY_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

const N8N_WORK_CREATION_WEBHOOK = process.env.N8N_WORK_CREATION_WEBHOOK;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL || "https://app.getalloro.com";

/**
 * Fire the n8n Work Creation webhook for a work run.
 * Called by the trigger worker (scheduled) or manual run endpoint.
 */
export async function fireWorkCreationWebhook(
  workRunId: string,
  skill: IMindSkill
): Promise<void> {
  if (!N8N_WORK_CREATION_WEBHOOK) {
    throw new Error("N8N_WORK_CREATION_WEBHOOK not configured");
  }

  const mind = await MindModel.findById(skill.mind_id);
  if (!mind) throw new Error(`Mind not found for skill ${skill.id}`);

  // Fetch lightweight works history metadata for n8n context
  const worksHistory = await SkillWorkRunModel.getWorksHistoryMetadata(skill.id, 50);

  const payload = {
    work_run_id: workRunId,
    mind_slug: mind.slug,
    skill_slug: skill.slug,
    skill_name: skill.name,
    skill_definition: skill.definition,
    output_count: skill.output_count || 1,
    work_creation_type: skill.work_creation_type,
    artifact_attachment_type: skill.artifact_attachment_type || null,
    pipeline_mode: skill.pipeline_mode,
    mind_portal_url: `${APP_BASE_URL}/api/minds/${mind.slug}/portal`,
    skill_portal_url: `${APP_BASE_URL}/api/skills/${skill.slug}/portal`,
    internal_key: INTERNAL_API_KEY,
    internal_update_url: `${APP_BASE_URL}/api/internal/skill-work-runs/${workRunId}`,
    works_history: worksHistory,
  };

  const response = await fetch(N8N_WORK_CREATION_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `n8n webhook returned ${response.status}: ${await response.text()}`
    );
  }

  logger.info(
    `[WORK-PIPELINE] Work creation webhook fired for run ${workRunId}`
  );
}

/**
 * Fire the n8n Work Publication webhook for an approved work run.
 */
export async function fireWorkPublicationWebhook(
  workRunId: string,
  skill: IMindSkill,
  workRun: ISkillWorkRun,
  webhookUrl: string,
): Promise<void> {
  const payload = {
    work_run_id: workRunId,
    artifact_url: workRun.artifact_url,
    artifact_content: workRun.artifact_content,
    artifact_type: workRun.artifact_type,
    artifact_attachment_type: workRun.artifact_attachment_type || null,
    artifact_attachment_url: workRun.artifact_attachment_url || null,
    title: workRun.title,
    description: workRun.description,
    skill_name: skill.name,
    internal_update_url: `${APP_BASE_URL}/api/internal/skill-work-runs/${workRunId}`,
    internal_key: INTERNAL_API_KEY,
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Publication webhook to ${webhookUrl} returned ${response.status}: ${await response.text()}`
    );
  }

  logger.info(
    `[WORK-PIPELINE] Publication webhook fired for run ${workRunId} → ${webhookUrl}`
  );
}

/**
 * Content safety check — lightweight LLM call to evaluate artifact content.
 * Returns { safe: true } or { safe: false, reason: string }.
 */
export async function contentSafetyCheck(
  workRun: ISkillWorkRun,
  skill: IMindSkill,
): Promise<{ safe: boolean; reason?: string }> {
  const content = workRun.artifact_content || workRun.title || "";
  if (!content.trim()) {
    return { safe: true }; // Nothing to check (image/video URL only)
  }

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: SAFETY_MODEL,
      max_tokens: 256,
      system: `You are a content safety reviewer. Evaluate the following content for:
1. Harmful, offensive, or inappropriate content
2. Brand safety violations
3. Obvious factual errors or misleading claims
4. Format compliance (should match type: ${skill.work_creation_type || "text"})

Respond with ONLY valid JSON: { "safe": true } or { "safe": false, "reason": "brief explanation" }
No markdown, no backticks.`,
      messages: [
        {
          role: "user",
          content: `Content to review:\n\nTitle: ${workRun.title || "N/A"}\n\nContent:\n${content.slice(0, 3000)}`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(raw);
    return { safe: !!parsed.safe, reason: parsed.reason };
  } catch (err) {
    logger.error({ err: err }, "[SAFETY] Content safety check failed:");
    // If safety check fails, route to manual review for safety
    return { safe: false, reason: "Safety check service error — routing to manual review" };
  }
}

/**
 * Evaluate whether a work run landing in awaiting_review should be auto-approved.
 * Called from the internal status update endpoint.
 *
 * Guardrails:
 * 1. Skill must be in auto_pipeline mode
 * 2. Skill must have 5+ prior approved/published works
 * 3. Content safety check must pass
 * 4. First run of a newly activated skill always requires manual review
 */
export async function evaluateAutoPipeline(
  workRunId: string,
): Promise<void> {
  const workRun = await SkillWorkRunModel.findById(workRunId);
  if (!workRun || workRun.status !== "awaiting_review") return;

  const skill = await MindSkillModel.findById(workRun.skill_id);
  if (!skill || skill.pipeline_mode !== "auto_pipeline") return;

  // Guardrail: Must have 5+ approved works
  const approvedCount = await SkillWorkRunModel.countBySkillAndStatus(
    skill.id,
    "approved",
  );
  const publishedCount = await SkillWorkRunModel.countBySkillAndStatus(
    skill.id,
    "published",
  );
  const totalApproved = approvedCount + publishedCount;

  if (totalApproved < 5) {
    logger.info(
      `[AUTO-PIPELINE] Skill ${skill.id} has only ${totalApproved} approved works (min 5). Keeping in manual review.`,
    );
    return;
  }

  // Guardrail: Content safety check
  const safety = await contentSafetyCheck(workRun, skill);
  if (!safety.safe) {
    logger.info(
      `[AUTO-PIPELINE] Safety check failed for run ${workRunId}: ${safety.reason}. Routing to manual review.`,
    );
    return;
  }

  // Auto-approve
  logger.info(
    `[AUTO-PIPELINE] Auto-approving work run ${workRunId} for skill ${skill.name}`,
  );

  await SkillWorkRunModel.updateStatus(workRunId, "approved", {
    approved_at: new Date(),
  });

  // Generate embedding for dedup (async, non-blocking)
  const embedText = [workRun.title, workRun.description].filter(Boolean).join(" — ");
  if (embedText.trim()) {
    generateEmbedding(embedText)
      .then((emb) => SkillWorkRunModel.setEmbedding(workRunId, emb))
      .catch((err) => logger.error({ err: err }, "[AUTO-PIPELINE] Embedding generation failed:"));
  }

  // If pipeline includes publication, fire publish channel webhook
  if (skill.publish_channel_id) {
    const channel = await PublishChannelModel.findById(skill.publish_channel_id);
    if (channel && channel.status === "active") {
      try {
        const updatedRun = await SkillWorkRunModel.findById(workRunId);
        if (updatedRun) {
          await SkillWorkRunModel.updateStatus(workRunId, "publishing");
          await fireWorkPublicationWebhook(workRunId, skill, updatedRun, channel.webhook_url);
        }
      } catch (err) {
        logger.error({ err: err }, `[AUTO-PIPELINE] Publication webhook failed for run ${workRunId}:`);
        await SkillWorkRunModel.updateStatus(workRunId, "failed", {
          error: `Auto-publication failed: ${(err as Error).message}`,
        });
      }
    }
  }
}
