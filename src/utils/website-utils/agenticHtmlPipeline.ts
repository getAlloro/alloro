/**
 * Agentic HTML Pipeline
 *
 * Self-correcting loop for HTML generation and editing.
 * Generate/Edit -> UI Validate -> Link Validate -> Fix -> Revalidate -> Save
 * Max 2 retries per stage to prevent infinite loops.
 */

import { validateHtml, type ValidationIssue } from "./htmlValidator";
import { editHtmlContent } from "./aiCommandService";
import { AiCommandRecommendationModel } from "../../models/website-builder/AiCommandRecommendationModel";
import logger from "../../lib/logger";

const MAX_RETRIES = 2;

export interface PipelineContext {
  existingPaths: string[];
  existingPostSlugs: string[];
  recId?: string; // recommendation ID for status updates
}

export interface PipelineResult {
  html: string;
  iterations: number;
  uiFixAttempts: number;
  linkFixAttempts: number;
  finalIssues: ValidationIssue[];
}

/**
 * Run the agentic validation pipeline on generated/edited HTML.
 * Validates UI and links, auto-fixes issues, revalidates.
 */
export async function runAgenticPipeline(
  html: string,
  targetLabel: string,
  ctx: PipelineContext
): Promise<PipelineResult> {
  let currentHtml = html;
  let iterations = 0;
  let uiFixAttempts = 0;
  let linkFixAttempts = 0;

  for (let round = 0; round < MAX_RETRIES + 1; round++) {
    iterations++;
    const validation = validateHtml(currentHtml, ctx.existingPaths, ctx.existingPostSlugs);

    if (validation.valid) {
      logger.info(`[AgenticPipeline] ${targetLabel}: passed all checks (round ${round + 1})`);
      break;
    }

    const uiIssues = validation.issues.filter((i) => i.type === "ui");
    const linkIssues = validation.issues.filter((i) => i.type === "link");

    logger.info(
      `[AgenticPipeline] ${targetLabel} round ${round + 1}: ${uiIssues.length} UI issue(s), ${linkIssues.length} link issue(s)`
    );

    // Update recommendation status if we have an ID
    if (ctx.recId) {
      await updateRecStatus(ctx.recId,
        `Validating... round ${round + 1}: ${uiIssues.length} UI, ${linkIssues.length} link issue(s)`
      );
    }

    // If this is the last round, accept what we have
    if (round >= MAX_RETRIES) {
      logger.warn(
        `[AgenticPipeline] ${targetLabel}: max retries reached, saving with ${validation.issues.length} remaining issue(s)`
      );
      return {
        html: currentHtml,
        iterations,
        uiFixAttempts,
        linkFixAttempts,
        finalIssues: validation.issues,
      };
    }

    // Build fix instruction from all issues
    const fixInstructions = validation.issues
      .map((issue) => `- ${issue.description}: ${issue.fixInstruction}`)
      .join("\n");

    // Send back to LLM for fixing
    try {
      if (ctx.recId) {
        await updateRecStatus(ctx.recId,
          `Fixing ${validation.issues.length} issue(s)...`
        );
      }

      const fixResult = await editHtmlContent({
        instruction: `Fix these issues in the HTML:\n${fixInstructions}\n\nReturn the corrected HTML with all issues resolved.`,
        currentHtml: currentHtml,
        targetLabel: `${targetLabel} (fix round ${round + 1})`,
      });

      currentHtml = fixResult.editedHtml;
      uiFixAttempts += uiIssues.length > 0 ? 1 : 0;
      linkFixAttempts += linkIssues.length > 0 ? 1 : 0;
    } catch (err) {
      logger.error({ err: (err as Error).message }, `[AgenticPipeline] ${targetLabel}: fix attempt ${round + 1} failed:`);
      // Keep current HTML and continue
      break;
    }
  }

  const finalValidation = validateHtml(currentHtml, ctx.existingPaths, ctx.existingPostSlugs);

  return {
    html: currentHtml,
    iterations,
    uiFixAttempts,
    linkFixAttempts,
    finalIssues: finalValidation.issues,
  };
}

async function updateRecStatus(recId: string, message: string): Promise<void> {
  try {
    await AiCommandRecommendationModel.updateExecutionResult(
      recId,
      JSON.stringify({ in_progress: true, message }),
    );
  } catch {
    // Non-fatal
  }
}
