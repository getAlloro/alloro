import { Job } from "bullmq";
import { MindSyncRunModel } from "../../models/MindSyncRunModel";
import { MindSyncStepModel, IMindSyncStep } from "../../models/MindSyncStepModel";
import { MindModel } from "../../models/MindModel";
import { MindVersionModel } from "../../models/MindVersionModel";
import { MindDiscoveryBatchModel } from "../../models/MindDiscoveryBatchModel";
import { MindDiscoveredPostModel } from "../../models/MindDiscoveredPostModel";
import { MindScrapedPostModel } from "../../models/MindScrapedPostModel";
import { MindSyncProposalModel } from "../../models/MindSyncProposalModel";
import { scrapeUrl } from "../../controllers/minds/feature-services/service.minds-scraper";
import { compareContent } from "../../controllers/minds/feature-services/service.minds-comparison";
import logger from "../../lib/logger";

const MAX_POSTS_PER_SCRAPE_RUN = parseInt(
  process.env.MINDS_MAX_POSTS_PER_SCRAPE_RUN || "10",
  10
);

interface ScrapeCompareJobData {
  mindId: string;
  runId: string;
}

async function getStep(
  runId: string,
  stepName: string
): Promise<IMindSyncStep> {
  const steps = await MindSyncStepModel.listByRun(runId);
  const step = steps.find((s) => s.step_name === stepName);
  if (!step) throw new Error(`Step ${stepName} not found`);
  return step;
}

async function runStep(
  runId: string,
  stepName: string,
  fn: (step: IMindSyncStep) => Promise<void>
): Promise<void> {
  const step = await getStep(runId, stepName);
  await MindSyncStepModel.markRunning(step.id);
  await MindSyncStepModel.appendLog(step.id, `Starting ${stepName}`);

  try {
    await fn(step);
    await MindSyncStepModel.markCompleted(step.id);
    await MindSyncStepModel.appendLog(step.id, `Completed ${stepName}`);
  } catch (err: any) {
    await MindSyncStepModel.markFailed(step.id, err.message);
    await MindSyncStepModel.appendLog(step.id, `Failed: ${err.message}`);
    throw err;
  }
}

export async function processScrapeCompare(job: Job<ScrapeCompareJobData>): Promise<void> {
  const { mindId, runId } = job.data;
  logger.info(`[MINDS-WORKER] Starting scrape_compare run ${runId} for mind ${mindId}`);

  await MindSyncRunModel.markRunning(runId);

  try {
    // Step 1: INIT
    await runStep(runId, "INIT", async (step) => {
      await MindSyncStepModel.appendLog(step.id, `Mind ID: ${mindId}, Run ID: ${runId}`);
    });

    // Step 2: FETCH_APPROVED_POSTS
    let approvedPosts: any[] = [];
    await runStep(runId, "FETCH_APPROVED_POSTS", async (step) => {
      const batch = await MindDiscoveryBatchModel.findOpenByMind(mindId);
      if (!batch) throw new Error("No open discovery batch found");

      approvedPosts = await MindDiscoveredPostModel.listApprovedByBatch(
        batch.id,
        MAX_POSTS_PER_SCRAPE_RUN
      );

      if (approvedPosts.length === 0) {
        throw new Error("No approved posts to process");
      }

      await MindSyncStepModel.appendLog(
        step.id,
        `Found ${approvedPosts.length} approved posts to scrape`
      );
    });

    // Step 3: EXTRACT_CONTENT
    const scrapedResults: Array<{ post: any; scraped: any }> = [];
    await runStep(runId, "EXTRACT_CONTENT", async (step) => {
      for (const post of approvedPosts) {
        try {
          await MindSyncStepModel.appendLog(step.id, `Scraping: ${post.url}`);
          const scraped = await scrapeUrl(post.url);

          await MindScrapedPostModel.upsertByUrl({
            mind_id: mindId,
            source_id: post.source_id,
            url: post.url,
            title: scraped.title || post.title,
            raw_html_hash: scraped.htmlHash,
            markdown_content: scraped.markdown,
            sync_run_id: runId,
          });

          await MindDiscoveredPostModel.markProcessed(post.id, runId);

          scrapedResults.push({ post, scraped });
          await MindSyncStepModel.appendLog(
            step.id,
            `Scraped ${post.url}: ${scraped.markdown.length} chars`
          );
        } catch (err: any) {
          await MindSyncStepModel.appendLog(
            step.id,
            `Failed to scrape ${post.url}: ${err.message}`
          );
          // Continue with other posts — don't fail the whole run for one URL
        }
      }

      if (scrapedResults.length === 0) {
        throw new Error("All URLs failed to scrape");
      }

      await MindSyncStepModel.appendLog(
        step.id,
        `Successfully scraped ${scrapedResults.length} of ${approvedPosts.length} posts`
      );
    });

    // Step 4: COMPILE_MARKDOWN
    let compiledMarkdown = "";
    await runStep(runId, "COMPILE_MARKDOWN", async (step) => {
      const sections = scrapedResults.map(({ post, scraped }) => {
        return `## ${scraped.title || post.title || "Untitled"}\n**Source:** ${post.url}\n\n${scraped.markdown}`;
      });

      compiledMarkdown = sections.join("\n\n---\n\n");

      await MindSyncStepModel.appendLog(
        step.id,
        `Compiled ${scrapedResults.length} posts into ${compiledMarkdown.length} chars`
      );
    });

    // Step 5: LOAD_CURRENT_VERSION
    let currentBrain = "";
    await runStep(runId, "LOAD_CURRENT_VERSION", async (step) => {
      const mind = await MindModel.findById(mindId);
      if (!mind) throw new Error("Mind not found");

      if (mind.published_version_id) {
        const version = await MindVersionModel.findById(mind.published_version_id);
        if (version) {
          currentBrain = version.brain_markdown;
          await MindSyncStepModel.appendLog(
            step.id,
            `Loaded version ${version.version_number}: ${currentBrain.length} chars`
          );
        }
      }

      if (!currentBrain) {
        currentBrain = "# Knowledge Base\n\n## Core Concepts\n\n## Recently Added Insights\n";
        await MindSyncStepModel.appendLog(step.id, "No published version — using empty scaffold");
      }
    });

    // Step 6: RUN_LLM_COMPARISON
    let proposals: any[] = [];
    await runStep(runId, "RUN_LLM_COMPARISON", async (step) => {
      await MindSyncStepModel.appendLog(step.id, "Calling LLM for comparison...");
      proposals = await compareContent(mindId, currentBrain, compiledMarkdown);
      await MindSyncStepModel.appendLog(
        step.id,
        `LLM returned ${proposals.length} proposals`
      );
    });

    // Step 7: VALIDATE_PROPOSALS (validation is done inside compareContent via Zod)
    await runStep(runId, "VALIDATE_PROPOSALS", async (step) => {
      await MindSyncStepModel.appendLog(
        step.id,
        `Validated ${proposals.length} proposals: ${proposals.filter((p: any) => p.type === "NEW").length} NEW, ${proposals.filter((p: any) => p.type === "UPDATE").length} UPDATE, ${proposals.filter((p: any) => p.type === "CONFLICT").length} CONFLICT`
      );
    });

    // Step 8: STORE_PROPOSALS
    await runStep(runId, "STORE_PROPOSALS", async (step) => {
      if (proposals.length > 0) {
        await MindSyncProposalModel.bulkInsert(
          proposals.map((p: any) => ({
            sync_run_id: runId,
            mind_id: mindId,
            type: p.type,
            summary: p.summary,
            target_excerpt: p.target_excerpt,
            proposed_text: p.proposed_text,
            reason: p.reason,
          }))
        );
      }
      await MindSyncStepModel.appendLog(
        step.id,
        `Stored ${proposals.length} proposals`
      );
    });

    // Step 9: COMPLETE
    await runStep(runId, "COMPLETE", async (step) => {
      await MindSyncStepModel.appendLog(step.id, "Scrape & Compare run completed successfully");
    });

    await MindSyncRunModel.markCompleted(runId);
    logger.info(`[MINDS-WORKER] Scrape_compare run ${runId} completed`);
  } catch (err: any) {
    logger.error({ err: err }, `[MINDS-WORKER] Scrape_compare run ${runId} failed:`);
    await MindSyncRunModel.markFailed(runId, err.message);
  }
}
