/**
 * AI Command — execution phase (orchestrator)
 *
 * Executes the approved recommendations of a batch in deterministic phase
 * order: HTML edits (layout / page section / post) are applied here; structural
 * changes are dispatched to the per-type handlers in
 * `service.ai-command-execute-handlers`. Page drafts created during the run are
 * auto-published at the end.
 *
 * Extracted from `service.ai-command.ts` as part of a behavior-preserving
 * decomposition; logic, signatures, transaction/draft semantics, and return
 * shapes are unchanged. Shared helpers live in
 * `feature-utils/util.ai-command-shared` and the post-run summary in
 * `feature-utils/util.ai-command-summary`.
 */

import { AiCommandBatchModel } from "../../../models/website-builder/AiCommandBatchModel";
import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { PostModel } from "../../../models/website-builder/PostModel";
import { normalizeSections } from "../feature-utils/util.section-normalizer";
import { editHtmlContent } from "../../../utils/website-utils/aiCommandService";
import { publishPage } from "./service.page-editor";
import { runAgenticPipeline } from "../../../utils/website-utils/agenticHtmlPipeline";
import logger from "../../../lib/logger";
import {
  type ExecutionContext,
  refreshStats,
  resolvePageDraftId,
  getExistingPaths,
  getExistingPostSlugs,
} from "../feature-utils/util.ai-command-shared";
import { buildExecutionSummary } from "../feature-utils/util.ai-command-summary";
import { verifyBatchEdits } from "../feature-utils/util.ai-command-verify";
import {
  executeCreateRedirect,
  executeUpdateRedirect,
  executeDeleteRedirect,
  executeCreatePage,
  executeCreatePost,
  executeCreateMenu,
  executeUpdateMenu,
  executeUpdatePostMeta,
  executeUpdatePagePath,
} from "./service.ai-command-execute-handlers";

function createExecutionContext(opts?: { projectId?: string; batchId?: string }): ExecutionContext {
  return {
    createdPages: new Map(),
    createdPosts: new Map(),
    createdMenus: new Map(),
    createdRedirects: new Map(),
    pageDrafts: new Map(),
    projectId: opts?.projectId,
    batchId: opts?.batchId,
  };
}

// Execution phases — deterministic ordering so dependencies resolve correctly
const EXECUTION_PHASE_ORDER: Record<string, number> = {
  create_post: 1,        // Posts first (services, doctors, etc.)
  create_page: 2,        // Pages second (may reference posts)
  create_menu: 3,        // Menus third (need to know what pages/posts exist)
  update_menu: 4,        // Menu item changes
  create_redirect: 5,    // Redirects fourth (targets should exist)
  update_redirect: 6,    // Redirect updates
  delete_redirect: 7,    // Redirect deletes
  update_post_meta: 8,   // Post metadata updates
  update_page_path: 9,   // Page path updates
  page_section: 10,      // HTML edits last
  layout: 10,
  post: 10,
};

// ---------------------------------------------------------------------------
// Execute batch (Phase C)
// ---------------------------------------------------------------------------

export async function executeBatch(batchId: string): Promise<void> {
  const batch = await AiCommandBatchModel.findRawById(batchId);
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  if (batch.status !== "ready") {
    throw new Error(`Batch ${batchId} status is "${batch.status}", expected "ready"`);
  }

  await AiCommandBatchModel.updateStatus(batchId, "executing");

  const approved = await AiCommandRecommendationModel.findApprovedByBatchId(batchId);

  // Sort by execution phase — posts first, then pages, menus, redirects, edits last
  const sorted = [...approved].sort((a, b) => {
    const phaseA = EXECUTION_PHASE_ORDER[a.target_type] ?? 99;
    const phaseB = EXECUTION_PHASE_ORDER[b.target_type] ?? 99;
    if (phaseA !== phaseB) return phaseA - phaseB;
    return a.sort_order - b.sort_order;
  });

  logger.info(
    `[AiCommand] Executing batch ${batchId}: ${sorted.length} approved recommendations (phase-ordered)`
  );

  const ctx = createExecutionContext({ projectId: batch.project_id, batchId });
  let executedCount = 0;
  let failedCount = 0;

  for (const rec of sorted) {
    try {
      await executeRecommendation(rec, ctx);
      executedCount++;
    } catch (err) {
      logger.error({ err: (err as Error).message }, `[AiCommand] Recommendation ${rec.id} failed:`);
      await AiCommandRecommendationModel.updateById(rec.id, {
        status: "failed",
        execution_result: JSON.stringify({
          success: false,
          error: (err as Error).message,
        }),
      });
      failedCount++;
    }

    await refreshStats(batchId);
  }

  // Publish all page drafts that were created during this batch (one version per page)
  for (const [path, draftId] of ctx.pageDrafts) {
    const draftPage = await PageModel.findRawById(draftId);
    if (!draftPage || draftPage.status !== "draft") continue;
    const publishResult = await publishPage(draftPage.project_id, draftId);
    if (publishResult.error) {
      logger.warn(`[AiCommand] Auto-publish failed for page ${path} (${draftId}): ${publishResult.error.message}`);
    } else {
      logger.info(`[AiCommand] ✓ Auto-published page ${path} (${draftId})`);
    }
  }

  // Verify each executed HTML edit actually reached the published content. The
  // execution status was set on "the LLM returned HTML", not "the change landed"
  // — an edit lost to section drift or a concurrent overwrite is downgraded to
  // "failed" here so the batch stats tell the truth. Built into the summary
  // below (which reads post-downgrade rows).
  const verifyResult = await verifyBatchEdits(batchId);
  if (verifyResult.downgraded > 0) {
    logger.warn(
      `[AiCommand] Verify downgraded ${verifyResult.downgraded} recommendation(s) whose edit did not reach published content (batch ${batchId})`
    );
  }

  const executionSummary = await buildExecutionSummary(batchId);

  await AiCommandBatchModel.updateById(batchId, {
    status: "completed",
    summary: executionSummary,
  });

  await refreshStats(batchId);

  logger.info(
    `[AiCommand] ✓ Batch ${batchId} execution complete: ${executedCount} executed, ${failedCount} failed`
  );
}

async function executeRecommendation(rec: any, ctx: ExecutionContext): Promise<void> {
  // Structural recommendations
  if (rec.target_type === "create_redirect") return executeCreateRedirect(rec);
  if (rec.target_type === "update_redirect") return executeUpdateRedirect(rec);
  if (rec.target_type === "delete_redirect") return executeDeleteRedirect(rec);
  if (rec.target_type === "create_page") return executeCreatePage(rec, ctx);
  if (rec.target_type === "create_post") return executeCreatePost(rec, ctx);
  if (rec.target_type === "create_menu") return executeCreateMenu(rec, ctx);
  if (rec.target_type === "update_menu") return executeUpdateMenu(rec, ctx);
  if (rec.target_type === "update_post_meta") return executeUpdatePostMeta(rec);
  if (rec.target_type === "update_page_path") return executeUpdatePagePath(rec);

  // Always use the latest HTML from DB — previous recommendations in this
  // batch may have already modified the same target. For page sections this
  // reads from the batch's pinned draft (same row the write targets).
  const currentHtml = await getCurrentHtml(rec, ctx);

  if (!currentHtml) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({
        success: false,
        error: "Target content no longer exists.",
      }),
    });
    return;
  }

  // Build final instruction with user-provided context
  const recMeta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  let finalInstruction = rec.instruction;

  // Append user-provided additional notes/context
  if (recMeta?.reference_content && !recMeta?.flag_type) {
    finalInstruction += `\n\nAdditional context from user:\n${recMeta.reference_content}`;
  }

  // For broken link fixes, use the user-provided replacement URL
  if (recMeta?.flag_type === "fix_broken_link" && recMeta?.broken_href && recMeta?.reference_url) {
    finalInstruction = `Change href="${recMeta.broken_href}" to href="${recMeta.reference_url}". Update all occurrences of this broken link.`;
  } else if (recMeta?.flag_type === "fix_broken_link" && recMeta?.broken_href && recMeta?.suggested_href && recMeta.suggested_href !== "NEEDS_INPUT") {
    finalInstruction = `Change href="${recMeta.broken_href}" to href="${recMeta.suggested_href}". Update all occurrences of this broken link.`;
  }

  // LLM edit — always use current HTML, not the snapshot from analysis
  const result = await editHtmlContent({
    instruction: finalInstruction,
    currentHtml,
    targetLabel: rec.target_label,
    costContext: ctx.projectId
      ? {
          projectId: ctx.projectId,
          eventType: "ai-command",
          metadata: {
            batch_id: ctx.batchId || null,
            recommendation_id: rec.id,
            target_type: rec.target_type,
          },
        }
      : undefined,
  });

  // Run agentic validation pipeline — auto-fix UI and link issues
  const existingPaths = await getExistingPaths(rec.target_id.length === 36 ? rec.target_id : "");
  const existingPostSlugsRaw = rec.target_id.length === 36 ? await getExistingPostSlugs(rec.target_id) : [];
  const pipelineResult = await runAgenticPipeline(
    result.editedHtml,
    rec.target_label,
    {
      existingPaths,
      existingPostSlugs: existingPostSlugsRaw.map((p: any) => `${p.post_type_slug}/${p.slug}`),
      recId: rec.id,
    }
  );

  // Save the validated HTML
  await saveEditedHtml(rec, pipelineResult.html, ctx);

  // Mark as executed
  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({
      success: true,
      iterations: pipelineResult.iterations,
      ui_fixes: pipelineResult.uiFixAttempts,
      link_fixes: pipelineResult.linkFixAttempts,
      remaining_issues: pipelineResult.finalIssues.length,
      edited_html: result.editedHtml,
      tokens: {
        input: result.inputTokens,
        output: result.outputTokens,
      },
    }),
  });

  logger.info(`[AiCommand] ✓ Executed: ${rec.target_label}`);
}

async function getCurrentHtml(rec: any, ctx: ExecutionContext): Promise<string> {
  const meta =
    typeof rec.target_meta === "string"
      ? JSON.parse(rec.target_meta)
      : rec.target_meta;

  if (rec.target_type === "layout") {
    const project = await ProjectModel.findRawById(rec.target_id);
    if (!project) throw new Error(`Project ${rec.target_id} not found`);
    return project[meta.layout_field] || "";
  }

  if (rec.target_type === "page_section") {
    const origPage = await PageModel.findRawById(rec.target_id);
    if (!origPage) throw new Error(`Page ${rec.target_id} not found`);

    // Read from the batch's pinned draft — the same row saveEditedHtml writes —
    // so edits from earlier recommendations on this page are visible here.
    const draftId = await resolvePageDraftId(origPage, ctx);
    const page = await PageModel.findRawById(draftId);
    if (!page) {
      throw new Error(`Draft ${draftId} disappeared for path ${origPage.path}`);
    }

    const rawSections = typeof page.sections === "string"
      ? JSON.parse(page.sections)
      : page.sections;
    const sections = normalizeSections(rawSections);
    const section = sections[meta.section_index];
    if (!section) throw new Error(`Section ${meta.section_index} not found`);

    return typeof section === "string"
      ? section
      : section.content || section.html || "";
  }

  if (rec.target_type === "post") {
    const post = await PostModel.findRawById(rec.target_id);
    if (!post) throw new Error(`Post ${rec.target_id} not found`);
    return post.content || "";
  }

  throw new Error(`Unknown target type: ${rec.target_type}`);
}

async function saveEditedHtml(rec: any, editedHtml: string, ctx: ExecutionContext): Promise<void> {
  const meta =
    typeof rec.target_meta === "string"
      ? JSON.parse(rec.target_meta)
      : rec.target_meta;

  if (rec.target_type === "layout") {
    await ProjectModel.updateLayoutField(
      rec.target_id,
      meta.layout_field,
      editedHtml
    );
    return;
  }

  if (rec.target_type === "page_section") {
    const origPage = await PageModel.findRawById(rec.target_id);
    if (!origPage) throw new Error(`Page ${rec.target_id} not found`);

    // Write to the batch's pinned draft — the same row getCurrentHtml read —
    // so edits to this page stack instead of each overwriting the last.
    const draftId = await resolvePageDraftId(origPage, ctx);
    const page = await PageModel.findRawById(draftId);
    if (!page) {
      throw new Error(`Draft ${draftId} disappeared for path ${origPage.path}`);
    }

    const rawSections = typeof page.sections === "string"
      ? JSON.parse(page.sections)
      : page.sections;
    const sections = normalizeSections(rawSections);
    const section = sections[meta.section_index];

    if (typeof section === "string") {
      sections[meta.section_index] = editedHtml;
    } else {
      sections[meta.section_index] = {
        ...section,
        content: editedHtml,
      };
    }

    await PageModel.updateSectionsById(page.id, JSON.stringify(sections));

    // Don't publish here — batch will publish all pinned drafts at the end
    return;
  }

  if (rec.target_type === "post") {
    await PostModel.updateContentById(rec.target_id, editedHtml);
    return;
  }

  throw new Error(`Unknown target type: ${rec.target_type}`);
}
