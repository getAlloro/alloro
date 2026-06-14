import { Job } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import { MindSkillModel } from "../../models/MindSkillModel";
import { SkillWorkRunModel, ISkillWorkRun } from "../../models/SkillWorkRunModel";
import { SkillWorkDigestModel } from "../../models/SkillWorkDigestModel";
import logger from "../../lib/logger";

const MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

const RECENT_LIMIT = 30;
const BATCH_SIZE = 30;

/**
 * Process works digest — compresses older approved works into summaries.
 *
 * 1. Find all active skills
 * 2. For each skill, find undigested approved works beyond the recent 30
 * 3. Batch into groups of 30
 * 4. Summarize each batch via Claude
 * 5. Store digest, mark work runs as digested
 */
export async function processWorksDigest(job: Job): Promise<void> {
  logger.info("[WORKS-DIGEST] Starting works digest processing...");

  const skills = await MindSkillModel.findMany({ status: "active" });
  let totalDigests = 0;

  for (const skill of skills) {
    try {
      const undigested = await SkillWorkRunModel.approvedBeyondRecent(
        skill.id,
        RECENT_LIMIT
      );

      if (undigested.length === 0) continue;

      logger.info(
        `[WORKS-DIGEST] Skill "${skill.name}" has ${undigested.length} undigested works`
      );

      // Batch into groups of BATCH_SIZE
      for (let i = 0; i < undigested.length; i += BATCH_SIZE) {
        const batch = undigested.slice(i, i + BATCH_SIZE);
        await digestBatch(skill.id, batch);
        totalDigests++;
      }
    } catch (err) {
      logger.error({ err: err }, `[WORKS-DIGEST] Failed to digest works for skill ${skill.id}:`);
    }
  }

  logger.info(
    `[WORKS-DIGEST] Complete. Created ${totalDigests} digest(s).`
  );
}

async function digestBatch(
  skillId: string,
  works: ISkillWorkRun[]
): Promise<void> {
  if (works.length === 0) return;

  const worksText = works
    .map(
      (w) =>
        `- "${w.title || "Untitled"}" (${w.artifact_type || "unknown"}, ${w.approved_at?.toISOString().split("T")[0] || "unknown"}): ${w.description || "No description"}`
    )
    .join("\n");

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 512,
    system:
      "You are a summarizer. Produce a concise 200-300 word paragraph summarizing the topics and themes covered by the following list of creative works. Focus on what subjects were covered, what formats were used, and any patterns in the content. Do not list individual works. Write as a single dense paragraph.",
    messages: [
      {
        role: "user",
        content: `Summarize these ${works.length} approved works:\n\n${worksText}`,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  const summary = textContent?.text || "";

  if (!summary.trim()) {
    logger.warn("[WORKS-DIGEST] Empty summary from LLM, skipping batch");
    return;
  }

  // Determine date range
  const dates = works
    .map((w) => w.approved_at)
    .filter(Boolean)
    .sort() as Date[];
  const coversFrom = dates[0] || new Date();
  const coversTo = dates[dates.length - 1] || new Date();

  // Create digest
  const digest = await SkillWorkDigestModel.create({
    skill_id: skillId,
    summary,
    covers_from: coversFrom,
    covers_to: coversTo,
    work_count: works.length,
  });

  // Mark works as digested
  const ids = works.map((w) => w.id);
  await SkillWorkRunModel.markDigested(ids, digest.id);

  logger.info(
    `[WORKS-DIGEST] Created digest ${digest.id} covering ${works.length} works for skill ${skillId}`
  );
}
