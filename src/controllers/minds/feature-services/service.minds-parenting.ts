import { MindModel } from "../../../models/MindModel";
import { MindVersionModel } from "../../../models/MindVersionModel";
import { MindParentingSessionModel, IMindParentingSession } from "../../../models/MindParentingSessionModel";
import { MindParentingMessageModel } from "../../../models/MindParentingMessageModel";
import { MindSyncProposalModel } from "../../../models/MindSyncProposalModel";
import { MindSyncRunModel } from "../../../models/MindSyncRunModel";
import { MindSyncStepModel } from "../../../models/MindSyncStepModel";
import { extractKnowledgeFromTranscript } from "./service.minds-extraction";
import { compareContent } from "./service.minds-comparison";
import { generateGreeting, generateSessionTitle, generatePreviewMessages } from "./service.minds-parenting-chat";
import { getMindsQueue } from "../../../workers/queues";
import logger from "../../../lib/logger";

const COMPILE_PUBLISH_STEPS = [
  "INIT",
  "LOAD_CURRENT_VERSION",
  "APPLY_APPROVED_PROPOSALS",
  "VALIDATE_BRAIN_SIZE",
  "CREATE_NEW_VERSION",
  "PUBLISH_VERSION",
  "GENERATE_EMBEDDINGS",
  "FINALIZE_PROPOSALS",
  "COMPLETE",
];

/**
 * Create a new parenting session and generate the greeting.
 */
export async function startSession(
  mindId: string,
  adminId?: string
): Promise<{ session: IMindParentingSession; greeting: string }> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const session = await MindParentingSessionModel.createSession(mindId, adminId);
  const greeting = await generateGreeting(mindId, session.id);

  return { session, greeting };
}

/**
 * Get full session details including messages.
 */
export async function getSessionDetails(sessionId: string) {
  const session = await MindParentingSessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");

  const messages = await MindParentingMessageModel.listBySession(sessionId);

  // If there's a sync run, get its details
  let syncRun = null;
  let syncSteps = null;
  if (session.sync_run_id) {
    syncRun = await MindSyncRunModel.findById(session.sync_run_id);
    if (syncRun) {
      syncSteps = await MindSyncStepModel.listByRun(syncRun.id);
    }
  }

  // Get proposals if in proposals/compiling/completed state
  let proposals = null;
  if (
    session.sync_run_id &&
    ["proposals", "compiling", "completed"].includes(session.status)
  ) {
    proposals = await MindSyncProposalModel.listByRun(session.sync_run_id);
  }

  return { session, messages, syncRun, syncSteps, proposals };
}

/**
 * Trigger reading: extract knowledge from transcript, run comparison, store proposals.
 */
export async function triggerReading(
  mindId: string,
  sessionId: string
): Promise<{ proposalCount: number; runId: string }> {
  const session = await MindParentingSessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "chatting") {
    throw new Error("Session must be in chatting state to trigger reading");
  }

  // Transition to reading
  await MindParentingSessionModel.updateStatus(sessionId, "reading");

  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  // Load current brain
  let currentBrain = "";
  if (mind.published_version_id) {
    const version = await MindVersionModel.findById(mind.published_version_id);
    if (version) currentBrain = version.brain_markdown;
  }

  // Get all messages for extraction
  const messages = await MindParentingMessageModel.listBySession(sessionId);

  // Step 1: Extract knowledge from transcript
  const extractedKnowledge = await extractKnowledgeFromTranscript(
    messages.map((m) => ({ role: m.role, content: m.content })),
    session.knowledge_buffer,
    { source: "parenting" }
  );

  if (extractedKnowledge === "EMPTY" || !extractedKnowledge.trim()) {
    // Nothing new — auto-complete
    await MindParentingSessionModel.updateStatus(sessionId, "completed");
    await MindParentingSessionModel.setResult(sessionId, "no_changes");

    // Add system message
    await MindParentingMessageModel.createMessage(
      sessionId,
      "assistant",
      "I went through everything we discussed, and it looks like I already know all of this! Nothing new to add. Session complete — back to my room! 🎮"
    );

    return { proposalCount: 0, runId: "" };
  }

  // Step 2: Run comparison against existing brain
  const proposals = await compareContent(mindId, currentBrain, extractedKnowledge, { source: "parenting" });

  if (proposals.length === 0) {
    await MindParentingSessionModel.updateStatus(sessionId, "completed");
    await MindParentingSessionModel.setResult(sessionId, "no_changes");

    await MindParentingMessageModel.createMessage(
      sessionId,
      "assistant",
      "I studied everything you shared, but my brain already has all of this covered. No updates needed! Session complete. ✌️"
    );

    return { proposalCount: 0, runId: "" };
  }

  // Step 3: Create a scrape_compare sync run to store proposals
  const run = await MindSyncRunModel.createRun(mindId, "scrape_compare");
  await MindSyncRunModel.markRunning(run.id);

  // Store proposals linked to this run
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

  // Link sync run to session and transition to proposals
  await MindParentingSessionModel.setSyncRunId(sessionId, run.id);
  await MindParentingSessionModel.updateStatus(sessionId, "proposals");

  // Add system message with the results
  await MindParentingMessageModel.createMessage(
    sessionId,
    "assistant",
    `I've finished reading! Found ${proposals.length} thing${proposals.length === 1 ? "" : "s"} to review. Take a look at what I picked up — approve or reject each one, then hit Submit.`
  );

  return { proposalCount: proposals.length, runId: run.id };
}

/**
 * Streaming version of triggerReading.
 * Sends SSE events: narration chunks, phase transitions, and completion.
 */
export async function triggerReadingStream(
  mindId: string,
  sessionId: string,
  onEvent: (event: { type: string; [key: string]: any }) => void
): Promise<void> {
  const session = await MindParentingSessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "chatting") {
    throw new Error("Session must be in chatting state to trigger reading");
  }

  await MindParentingSessionModel.updateStatus(sessionId, "reading");

  // Track sync run ID for rollback if needed
  let createdRunId: string | null = null;

  try {
    const mind = await MindModel.findById(mindId);
    if (!mind) throw new Error("Mind not found");

    // Fail-safe: clean up any orphaned active runs for this mind before creating a new one
    const orphanedRun = await MindSyncRunModel.findActiveByMind(mindId);
    if (orphanedRun) {
      logger.info(`[MINDS] Cleaning up orphaned sync run ${orphanedRun.id} (status: ${orphanedRun.status}) for mind ${mindId}`);
      await MindSyncRunModel.markFailed(orphanedRun.id, "Cleaned up: orphaned by previous failed reading");
    }

    // Load current brain
    let currentBrain = "";
    if (mind.published_version_id) {
      const version = await MindVersionModel.findById(mind.published_version_id);
      if (version) currentBrain = version.brain_markdown;
    }

    const messages = await MindParentingMessageModel.listBySession(sessionId);

    // --- Generate conversation-derived preview messages ---
    const conversationMsgs = messages.map((m) => ({ role: m.role, content: m.content }));
    try {
      const previewMsgs = await generatePreviewMessages(
        mind.name,
        mind.personality_prompt,
        conversationMsgs
      );
      onEvent({ type: "preview_messages", messages: previewMsgs });
    } catch {} // non-critical, fallback idle messages exist on frontend

    onEvent({ type: "phase", phase: "extracting" });

    // --- Extraction ---
    const extractedKnowledge = await extractKnowledgeFromTranscript(
      messages.map((m) => ({ role: m.role, content: m.content })),
      session.knowledge_buffer,
      { source: "parenting" }
    );

    if (extractedKnowledge === "EMPTY" || !extractedKnowledge.trim()) {
      await MindParentingSessionModel.updateStatus(sessionId, "completed");
      await MindParentingSessionModel.setResult(sessionId, "no_changes");
      await MindParentingMessageModel.createMessage(
        sessionId,
        "assistant",
        "I went through everything we discussed, and it looks like I already know all of this! Nothing new to add. Session complete — back to my room! 🎮"
      );

      if (session.knowledge_buffer) {
        generateSessionTitle(sessionId, session.knowledge_buffer).catch(() => {});
      }

      onEvent({ type: "complete", proposalCount: 0, runId: "" });
      return;
    }

    onEvent({ type: "phase", phase: "comparing" });

    // --- Comparison ---
    const proposals = await compareContent(mindId, currentBrain, extractedKnowledge, { source: "parenting" });

    if (proposals.length === 0) {
      await MindParentingSessionModel.updateStatus(sessionId, "completed");
      await MindParentingSessionModel.setResult(sessionId, "no_changes");
      await MindParentingMessageModel.createMessage(
        sessionId,
        "assistant",
        "I studied everything you shared, but my brain already has all of this covered. No updates needed! Session complete. ✌️"
      );

      if (session.knowledge_buffer) {
        generateSessionTitle(sessionId, session.knowledge_buffer).catch(() => {});
      }

      onEvent({ type: "complete", proposalCount: 0, runId: "" });
      return;
    }

    // --- Store proposals ---
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
    await MindParentingSessionModel.setSyncRunId(sessionId, run.id);
    await MindParentingSessionModel.updateStatus(sessionId, "proposals");

    await MindParentingMessageModel.createMessage(
      sessionId,
      "assistant",
      `I've finished reading! Found ${proposals.length} thing${proposals.length === 1 ? "" : "s"} to review. Take a look at what I picked up — approve or reject each one, then hit Submit.`
    );

    onEvent({ type: "complete", proposalCount: proposals.length, runId: run.id });
  } catch (err: any) {
    logger.error({ err: err.message }, `[MINDS] Reading failed for session ${sessionId}, rolling back to chatting:`);

    // Roll back session to chatting so user can retry
    await MindParentingSessionModel.updateStatus(sessionId, "chatting").catch(() => {});

    // Mark any orphaned sync run as failed
    if (createdRunId) {
      await MindSyncRunModel.markFailed(createdRunId, `Reading failed: ${err.message}`).catch(() => {});
    }

    // Add system message so user sees what happened
    await MindParentingMessageModel.createMessage(
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
 * Start compilation after proposals are approved.
 */
export async function startCompile(
  mindId: string,
  sessionId: string
): Promise<{ runId: string }> {
  const session = await MindParentingSessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "proposals") {
    throw new Error("Session must be in proposals state to compile");
  }

  // Check for approved proposals
  const approvedCount = await MindSyncProposalModel.countApprovedByMind(mindId);
  if (approvedCount === 0) {
    // All rejected — auto-complete
    await MindParentingSessionModel.updateStatus(sessionId, "completed");
    await MindParentingSessionModel.setResult(sessionId, "all_rejected");

    await MindParentingMessageModel.createMessage(
      sessionId,
      "assistant",
      "Alright, you rejected everything. No hard feelings — I'll forget we ever had this conversation. Just kidding, I can't forget that easily. Session complete! 😄"
    );

    return { runId: "" };
  }

  // Check for active runs (compile lock)
  const hasActive = await MindSyncRunModel.hasActiveRun(mindId);
  if (hasActive) {
    throw new Error(
      "Another sync run is already in progress for this mind. Wait for it to finish (check the Agent University tab)."
    );
  }

  // Create compile_publish run
  const run = await MindSyncRunModel.createRun(mindId, "compile_publish");
  await MindSyncStepModel.createSteps(run.id, COMPILE_PUBLISH_STEPS);

  // Enqueue BullMQ job
  const queue = getMindsQueue("compile-publish");
  await queue.add("compile-publish", { mindId, runId: run.id }, { jobId: run.id });

  // Update session
  await MindParentingSessionModel.setSyncRunId(sessionId, run.id);
  await MindParentingSessionModel.updateStatus(sessionId, "compiling");

  return { runId: run.id };
}

/**
 * Complete a session after compile finishes.
 */
export async function completeSession(
  sessionId: string
): Promise<void> {
  const session = await MindParentingSessionModel.findById(sessionId);

  await MindParentingSessionModel.updateStatus(sessionId, "completed");
  await MindParentingSessionModel.setResult(sessionId, "learned");

  await MindParentingMessageModel.createMessage(
    sessionId,
    "assistant",
    "All done! My brain just got an upgrade. Thanks for the lesson — I'll put it to good use. Now if you'll excuse me, I have some neurons to reorganize. Session complete! 🧠✨"
  );

  // Fire-and-forget title generation
  if (session?.knowledge_buffer) {
    generateSessionTitle(sessionId, session.knowledge_buffer).catch(() => {});
  }
}

/**
 * Abandon a session.
 */
export async function abandonSession(
  sessionId: string
): Promise<void> {
  await MindParentingSessionModel.updateStatus(sessionId, "abandoned");
}

/**
 * List all sessions for a mind.
 */
export async function listSessions(mindId: string) {
  return MindParentingSessionModel.listByMind(mindId);
}
