import { MindModel } from "../../../models/MindModel";
import { MindSkillModel } from "../../../models/MindSkillModel";
import { MindSkillNeuronModel } from "../../../models/MindSkillNeuronModel";
import { SkillUpgradeSessionModel, ISkillUpgradeSession } from "../../../models/SkillUpgradeSessionModel";
import { SkillUpgradeMessageModel } from "../../../models/SkillUpgradeMessageModel";
import { MindSyncProposalModel } from "../../../models/MindSyncProposalModel";
import { MindSyncRunModel } from "../../../models/MindSyncRunModel";
import { extractKnowledgeFromTranscript } from "./service.minds-extraction";
import { compareContent } from "./service.minds-comparison";
import { applyProposals } from "./service.minds-compiler";
import { generateGreeting, generateSessionTitle, generatePreviewMessages } from "./service.skill-upgrade-chat";
import logger from "../../../lib/logger";

const SKILL_UPGRADE_COMPARE_SYSTEM_PROMPT = `You are a skill neuron curator. An admin just taught a skill something new. Compare what was taught against the skill's current neuron (specialized system prompt) and produce proposals for updating it. The admin's input is authoritative.

CRITICAL: The content below comes from a deliberate upgrade session. The admin's preferences, rules, and directives are AUTHORITATIVE and MUST become proposals. If they conflict with existing neuron content, that is a CONFLICT proposal. If they are new, that is a NEW proposal. Do NOT dismiss them.

RULES:
- Output MUST be a raw JSON array of proposal objects. No markdown fences. No explanation text outside the JSON.
- Each proposal must have: type, summary, proposed_text, reason
- For UPDATE and CONFLICT proposals, target_excerpt is REQUIRED and must be an EXACT substring from the current neuron.
- Proposal types:
  - NEW: Brand new information not present in the neuron. Will be appended.
  - UPDATE: Existing information that needs refreshing. Requires target_excerpt (exact match from neuron) and proposed_text (replacement).
  - CONFLICT: Contradictory information found. Requires target_excerpt and proposed_text. The admin's version wins.
- Keep proposed_text concise and suitable for direct insertion into a system prompt.
- Generate at most 20 proposals.
- You MUST generate at least one proposal if the teaching content contains any preference, rule, fact, or directive.
- If the teaching content truly contains zero actionable knowledge, only then return an empty array: []

JSON FORMATTING:
- Properly escape all special characters in string values: double quotes (\"), newlines (\\n), backslashes (\\\\), tabs (\\t).
- Do NOT use actual line breaks inside JSON string values — use \\n instead.
- Verify your JSON is complete and well-formed before outputting.`;

/**
 * Create a new skill upgrade session and generate the greeting.
 */
export async function startSession(
  mindId: string,
  skillId: string,
  adminId?: string
): Promise<{ session: ISkillUpgradeSession; greeting: string }> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const skill = await MindSkillModel.findById(skillId);
  if (!skill) throw new Error("Skill not found");

  const session = await SkillUpgradeSessionModel.createSession(skillId, mindId, adminId);
  const greeting = await generateGreeting(mindId, skillId, session.id);

  return { session, greeting };
}

/**
 * Get full session details including messages.
 */
export async function getSessionDetails(sessionId: string) {
  const session = await SkillUpgradeSessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");

  const messages = await SkillUpgradeMessageModel.listBySession(sessionId);

  let proposals = null;
  if (
    session.sync_run_id &&
    ["proposals", "compiling", "completed"].includes(session.status)
  ) {
    proposals = await MindSyncProposalModel.listByRun(session.sync_run_id);
  }

  return { session, messages, proposals };
}

/**
 * Streaming version of triggerReading for skill upgrade.
 * Compares against neuron_markdown instead of brain.
 */
export async function triggerReadingStream(
  mindId: string,
  skillId: string,
  sessionId: string,
  onEvent: (event: { type: string; [key: string]: any }) => void
): Promise<void> {
  const session = await SkillUpgradeSessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "chatting") {
    throw new Error("Session must be in chatting state to trigger reading");
  }

  await SkillUpgradeSessionModel.updateStatus(sessionId, "reading");

  // Track sync run ID for rollback if needed
  let createdRunId: string | null = null;

  try {
    const mind = await MindModel.findById(mindId);
    if (!mind) throw new Error("Mind not found");

    const skill = await MindSkillModel.findById(skillId);
    if (!skill) throw new Error("Skill not found");

    // Fail-safe: clean up any orphaned active runs for this mind before creating a new one
    const orphanedRun = await MindSyncRunModel.findActiveByMind(mindId);
    if (orphanedRun) {
      logger.info(`[MINDS] Cleaning up orphaned sync run ${orphanedRun.id} (status: ${orphanedRun.status}) for mind ${mindId}`);
      await MindSyncRunModel.markFailed(orphanedRun.id, "Cleaned up: orphaned by previous failed reading");
    }

    const neuron = await MindSkillNeuronModel.findBySkill(skillId);
    const currentNeuron = neuron?.neuron_markdown || "";

    const messages = await SkillUpgradeMessageModel.listBySession(sessionId);

    // Generate preview messages
    const conversationMsgs = messages.map((m) => ({ role: m.role, content: m.content }));
    try {
      const previewMsgs = await generatePreviewMessages(
        mind.name,
        skill.name,
        conversationMsgs
      );
      onEvent({ type: "preview_messages", messages: previewMsgs });
    } catch {} // non-critical

    onEvent({ type: "phase", phase: "extracting" });

    // Extract knowledge from transcript
    const extractedKnowledge = await extractKnowledgeFromTranscript(
      messages.map((m) => ({ role: m.role, content: m.content })),
      session.knowledge_buffer,
      { source: "parenting" }
    );

    if (extractedKnowledge === "EMPTY" || !extractedKnowledge.trim()) {
      await SkillUpgradeSessionModel.updateStatus(sessionId, "completed");
      await SkillUpgradeSessionModel.setResult(sessionId, "no_changes");
      await SkillUpgradeMessageModel.createMessage(
        sessionId,
        "assistant",
        "I went through everything we discussed, and my neuron already covers all of this! Nothing new to update. Session complete."
      );

      if (session.knowledge_buffer) {
        generateSessionTitle(sessionId, session.knowledge_buffer).catch(() => {});
      }

      onEvent({ type: "complete", proposalCount: 0, runId: "" });
      return;
    }

    onEvent({ type: "phase", phase: "comparing" });

    // Compare against neuron (not brain) using skill-specific prompt
    const neuronDisplay = currentNeuron.trim()
      ? currentNeuron
      : "(EMPTY — the skill has no neuron yet. ALL content should be proposed as NEW entries.)";

    const proposals = await compareContentForNeuron(mindId, neuronDisplay, extractedKnowledge);

    if (proposals.length === 0) {
      await SkillUpgradeSessionModel.updateStatus(sessionId, "completed");
      await SkillUpgradeSessionModel.setResult(sessionId, "no_changes");
      await SkillUpgradeMessageModel.createMessage(
        sessionId,
        "assistant",
        "I studied everything you shared, but my neuron already covers it all. No updates needed! Session complete."
      );

      if (session.knowledge_buffer) {
        generateSessionTitle(sessionId, session.knowledge_buffer).catch(() => {});
      }

      onEvent({ type: "complete", proposalCount: 0, runId: "" });
      return;
    }

    // Store proposals
    const run = await MindSyncRunModel.createRun(mindId, "scrape_compare");
    createdRunId = run.id;
    await MindSyncRunModel.markRunning(run.id);

    for (const p of proposals) {
      await MindSyncProposalModel.create({
        sync_run_id: run.id,
        mind_id: mindId,
        type: p.type,
        summary: p.summary,
        target_excerpt: p.target_excerpt || null,
        proposed_text: p.proposed_text,
        reason: p.reason,
        status: "pending",
      });
    }

    await MindSyncRunModel.markCompleted(run.id);
    await SkillUpgradeSessionModel.setSyncRunId(sessionId, run.id);
    await SkillUpgradeSessionModel.updateStatus(sessionId, "proposals");

    await SkillUpgradeMessageModel.createMessage(
      sessionId,
      "assistant",
      `I've finished reading! Found ${proposals.length} thing${proposals.length === 1 ? "" : "s"} to review. Take a look at what I picked up — approve or reject each one, then hit Submit.`
    );

    onEvent({ type: "complete", proposalCount: proposals.length, runId: run.id });
  } catch (err: any) {
    logger.error({ err: err.message }, `[MINDS] Skill upgrade reading failed for session ${sessionId}, rolling back to chatting:`);

    // Roll back session to chatting so user can retry
    await SkillUpgradeSessionModel.updateStatus(sessionId, "chatting").catch(() => {});

    // Mark any orphaned sync run as failed
    if (createdRunId) {
      await MindSyncRunModel.markFailed(createdRunId, `Reading failed: ${err.message}`).catch(() => {});
    }

    // Add system message so user sees what happened
    await SkillUpgradeMessageModel.createMessage(
      sessionId,
      "assistant",
      "Something went wrong while I was reading. Let's try that again — hit the button when you're ready."
    ).catch(() => {});

    // Send error event and re-throw for the controller's catch block
    onEvent({ type: "error", error: err.message || "Reading failed" });
    throw err;
  }
}

/**
 * Compare content against neuron using the skill-specific system prompt.
 */
async function compareContentForNeuron(
  mindId: string,
  currentNeuron: string,
  extractedKnowledge: string
) {
  // Reuse compareContent but with skill-specific framing
  // We pass source as "parenting" to get the authoritative treatment
  return compareContent(mindId, currentNeuron, extractedKnowledge, { source: "parenting" });
}

/**
 * Start compilation — synchronous, no BullMQ.
 * Applies approved proposals to the neuron directly.
 */
export async function startCompile(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<{ success: boolean }> {
  const session = await SkillUpgradeSessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "proposals") {
    throw new Error("Session must be in proposals state to compile");
  }

  if (!session.sync_run_id) {
    throw new Error("No sync run linked to session");
  }

  // Check for approved proposals
  const proposals = await MindSyncProposalModel.listByRun(session.sync_run_id);
  const approved = proposals.filter((p) => p.status === "approved");

  if (approved.length === 0) {
    // All rejected — auto-complete
    await SkillUpgradeSessionModel.updateStatus(sessionId, "completed");
    await SkillUpgradeSessionModel.setResult(sessionId, "all_rejected");
    await SkillUpgradeMessageModel.createMessage(
      sessionId,
      "assistant",
      "You rejected everything. No changes to the neuron. Session complete!"
    );
    return { success: true };
  }

  await SkillUpgradeSessionModel.updateStatus(sessionId, "compiling");

  // Load current neuron
  const neuron = await MindSkillNeuronModel.findBySkill(skillId);
  if (!neuron) {
    throw new Error("Skill has no neuron to upgrade");
  }

  // Apply proposals to neuron_markdown
  const { newBrain: newNeuronMarkdown, appliedCount, warnings } = applyProposals(
    neuron.neuron_markdown,
    approved
  );

  logger.info(
    `[MINDS] Skill upgrade compile: ${appliedCount} applied, ${warnings.length} warnings for skill ${skillId}`
  );

  // Upsert neuron — keep same version_id since we're amending, not regenerating
  await MindSkillNeuronModel.upsert(
    skillId,
    neuron.mind_version_id,
    newNeuronMarkdown
  );

  // Finalize proposals
  await MindSyncProposalModel.finalizeApproved(mindId);

  // Complete session
  await SkillUpgradeSessionModel.updateStatus(sessionId, "completed");
  await SkillUpgradeSessionModel.setResult(sessionId, "learned");
  await SkillUpgradeMessageModel.createMessage(
    sessionId,
    "assistant",
    "Neuron upgraded! My specialized knowledge just got an update. Session complete!"
  );

  // Fire-and-forget title generation
  if (session.knowledge_buffer) {
    generateSessionTitle(sessionId, session.knowledge_buffer).catch(() => {});
  }

  return { success: true };
}

/**
 * Complete a session.
 */
export async function completeSession(
  sessionId: string
): Promise<void> {
  await SkillUpgradeSessionModel.updateStatus(sessionId, "completed");
  await SkillUpgradeSessionModel.setResult(sessionId, "learned");
}

/**
 * Abandon a session.
 */
export async function abandonSession(
  sessionId: string
): Promise<void> {
  await SkillUpgradeSessionModel.updateStatus(sessionId, "abandoned");
}

/**
 * List all sessions for a skill.
 */
export async function listSessions(skillId: string) {
  return SkillUpgradeSessionModel.listBySkill(skillId);
}
