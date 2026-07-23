/**
 * Audit Leadgen Processor
 *
 * End-to-end BullMQ processor for the leadgen audit pipeline. Replaces the
 * prior n8n `WEB_SCRAPING_TOOL_AGENT_WEBHOOK` workflow.
 *
 * Stage progression (mirrors n8n `realtime_status`):
 *   0 = queued / processing start
 *   1 = screenshots uploaded to S3
 *   2 = website analysis (multimodal) complete
 *   3 = self GBP scrape complete
 *   4 = competitor GBP scrape complete
 *   5 = final GBP analysis complete -> status=completed
 *
 * Flow:
 *   1. Load audit row, mark processing.
 *   2. scrapeHomepage() -> screenshots + markup + telemetry.
 *   3. Fan out Promise.all([
 *        Branch A: upload screenshots to S3,
 *        Branch B: multimodal website analysis (Claude),
 *        Branch C: competitor string builder -> self GBP -> competitor GBPs,
 *      ])
 *   4. After all branches: final GBP analysis (Claude, text-only).
 *   5. On any error: status=failed + error_message, rethrow.
 *
 * Pattern reference: src/workers/processors/scrapeCompare.processor.ts
 */

import { Job } from "bullmq";
import sharp from "sharp";
import { AuditProcessModel } from "../../models/AuditProcessModel";
import { updateAuditFields } from "../../controllers/audit/audit-services/auditUpdateService";
import { recordAuditMilestone } from "../../controllers/leadgen-tracking/feature-services/service.audit-milestone-events";
import { drainNotificationsForAudit } from "../../controllers/leadgen-tracking/feature-services/service.email-notification-queue";
import { scrapeHomepage } from "../../controllers/scraper/feature-services/service.scraping-orchestrator";
import { uploadAuditScreenshot } from "../../controllers/audit/audit-services/service.audit-s3";
import {
  scrapeSelfGBP,
  scrapeCompetitorGBPs,
} from "../../controllers/audit/audit-services/service.audit-apify";
import { runAgent } from "../../agents/service.llm-runner";
import { loadPrompt } from "../../agents/service.prompt-loader";
import { runComposedAgent } from "../../agents/service.composed-agent-runner";
import { stripMarkupForLLM } from "../../controllers/audit/audit-utils/markupStripper";
import { settleWebsiteBranchNonFatal } from "../../controllers/audit/audit-utils/settleWebsiteBranchNonFatal";
import {
  condenseGbp,
  condenseCompetitors,
} from "../../controllers/audit/audit-utils/payloadCondensers";
import {
  aggregateGbpAnalysis,
  type PillarBundle,
  type ProfileIntegrityResult,
  type CompetitorAnalysisResult,
  type PillarOnlyResult,
} from "../../controllers/audit/audit-utils/gbpAnalysisAggregator";
import logger from "../../lib/logger";

// Claude's hard limit is 8000px per dimension. Their recommended sweet spot
// is ~1568px (1.15MP), but 1024px preserves all layout/hierarchy/CTA-prominence
// signals the website-analysis vision call needs while halving the JPEG size
// (~80kB → ~30-40kB) and the input-image token cost. Override with
// CLAUDE_MAX_DIMENSION env var if scoring drifts noticeably (don't go below
// 1024 — finer granularity yields diminishing returns and risks layout loss).
const CLAUDE_MAX_DIMENSION = parseInt(
  process.env.CLAUDE_MAX_DIMENSION || "1024",
  10
);

// Haiku is 3-5x faster than Sonnet for these prompts. Quality is lower but
// acceptable for a first pass. Override with AUDIT_LLM_MODEL env var if
// you need Sonnet-level reasoning (e.g. scoring drifts noticeably).
const AUDIT_MODEL = process.env.AUDIT_LLM_MODEL || "claude-haiku-4-5-20251001";

// Number of competitors to scrape via Apify. 5 keeps the cohort meaningful
// while cutting Apify wall-time vs the original 7. Override with env var.
const COMPETITOR_LIMIT = parseInt(
  process.env.AUDIT_COMPETITOR_LIMIT || "5",
  10
);

async function resizeForClaude(
  base64: string
): Promise<{ base64: string; sizeKB: number }> {
  const buffer = Buffer.from(base64, "base64");
  const resized = await sharp(buffer)
    .resize(CLAUDE_MAX_DIMENSION, CLAUDE_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  return {
    base64: resized.toString("base64"),
    sizeKB: Math.round(resized.length / 1024),
  };
}

export interface AuditLeadgenJobData {
  auditId: string;
  domain: string;
  practiceSearchString: string;
}

export async function processAuditLeadgen(
  job: Job<AuditLeadgenJobData>
): Promise<void> {
  const { auditId, domain, practiceSearchString } = job.data;
  const tag = `[Audit:${auditId.slice(0, 8)}]`;
  const log = (msg: string) => logger.info(`${tag} ${msg}`);
  const logErr = (msg: string) => logger.error(`${tag} ${msg}`);
  const stageTimer = () => {
    const start = Date.now();
    return () => Date.now() - start;
  };
  const totalStart = Date.now();

  let stage = "init";
  const timings: Record<string, number> = {};
  // `hasWebsite` may flip from true→false inside Branch A if the scrape is
  // blocked (Cloudflare etc). We then re-use the existing no-website path
  // for the GBP-only analysis instead of failing the whole audit.
  //
  // `websiteBlocked` distinguishes "user provided a website but bot-protection
  // prevented analysis" (true) from "user didn't provide a website at all" or
  // "scrape failed for some non-block reason" (false). This drives both the
  // GBP prompt context (don't recommend "site is down") and the frontend
  // "Your website blocks Alloro scanners" placeholder.
  let hasWebsite = !!(domain && domain.trim());
  let websiteBlocked = false;

  try {
    stage = "load-row";
    log(
      `▶ start domain=${domain || "(no website)"} practice="${practiceSearchString}"`
    );
    const row = await AuditProcessModel.findById(auditId);
    if (!row) {
      throw new Error(`Audit row ${auditId} not found`);
    }

    await updateAuditFields(auditId, {
      status: "processing",
      realtime_status: 0,
    });
    log(`  row loaded → status=processing realtime_status=0`);
    await recordAuditMilestone(auditId, "audit_started");

    let strippedHtml = "";

    if (!hasWebsite) {
      log(`  no website provided — skipping scrape, Branch A, Branch B`);
      // Mark website-side steps null so frontend renders empty/skipped cards
      // and the realtime_status still advances past the website checkpoints.
      await updateAuditFields(auditId, {
        step_screenshots: null,
        step_website_analysis: null,
        realtime_status: 2,
      });
      // No-website path still reaches the Website Scan stage on the UI
      // (renders an empty/skipped card). Record the milestone so the
      // funnel reflects it.
      await recordAuditMilestone(auditId, "stage_viewed_1");
    }

    // Holder for branch B promise (assigned inside Branch A closure).
    const branchAResult: { bPromise: Promise<void> | null } = {
      bPromise: null,
    };

    // Branch A: upload screenshot (skipped if no website).
    const branchA = hasWebsite
      ? (async () => {
          const scrapeTimer = stageTimer();
          stage = "scrape-homepage";
          const outcome = await scrapeHomepage(domain);
          if (outcome.result === null) {
            // Both default + stealth (if enabled) exhausted. `outcome.blocked`
            // distinguishes bot-protection from generic failure (timeout, DNS).
            // Degrade into the existing no-website path so Branch C still
            // produces a useful GBP-only report instead of failing the
            // whole audit. The `website_blocked` flag (T4) is what tells
            // the frontend + GBP prompts the difference between "no website"
            // and "site is bot-protected".
            timings["scrapeHomepage"] = scrapeTimer();
            log(
              `⚠ scrapeHomepage failed (${timings["scrapeHomepage"]}ms, blocked=${outcome.blocked}) — ` +
                `degrading to no-website path; GBP/competitor analysis continues`
            );
            hasWebsite = false;
            websiteBlocked = outcome.blocked;
            await updateAuditFields(auditId, {
              step_screenshots: null,
              step_website_analysis: null,
              realtime_status: 2,
              website_blocked: outcome.blocked,
            });
            await recordAuditMilestone(auditId, "stage_viewed_1");
            return null;
          }
          timings["scrapeHomepage"] = scrapeTimer();
          const scrape = outcome.result;
          const { desktopScreenshot, homepageMarkup, metrics, brokenLinks } =
            scrape;
          const markupKB = Math.round(homepageMarkup.length / 1024);
          log(
            `✓ scrapeHomepage (${timings["scrapeHomepage"]}ms) — markup=${markupKB}kB ` +
              `desktop=${desktopScreenshot.sizeKB}kB brokenLinks=${brokenLinks.length} ` +
              `isSecure=${metrics.isSecure} loadTime=${metrics.loadTime}ms`
          );

          // Strip markup ONCE here so Branch B (and GBPAnalysis afterward) reuse it.
          stage = "strip-markup";
          const stripTimer = stageTimer();
          const stripped = stripMarkupForLLM(homepageMarkup);
          strippedHtml = stripped.html;
          timings["stripMarkup"] = stripTimer();
          log(
            `✓ stripMarkup (${timings["stripMarkup"]}ms) — ${stripped.originalSizeKB}kB → ${stripped.strippedSizeKB}kB (-${stripped.reductionPct}%)`
          );

          await job.updateProgress(10);

          // S3 upload
          const aTimer = stageTimer();
          log(`▶ [A] uploading desktop screenshot to S3`);
          const desktopUrl = await uploadAuditScreenshot(
            auditId,
            "desktop",
            desktopScreenshot.base64
          );
          await updateAuditFields(auditId, {
            step_screenshots: { desktop_url: desktopUrl, mobile_url: null },
            realtime_status: 1,
          });
          timings["[A] S3 upload"] = aTimer();
          log(
            `✓ [A] screenshot uploaded (${timings["[A] S3 upload"]}ms) → realtime_status=1`
          );
          await recordAuditMilestone(auditId, "stage_viewed_1");

          // Branch B kicked off here (after scrape, with the same data) so
          // it can read desktopScreenshot/homepageMarkup/metrics from this
          // closure. Returns a promise that the outer Promise.all will await.
          const bPromise = (async () => {
            const t = stageTimer();
            log(
              `▶ [B] WebsiteAnalysis agent — resizing desktop image for Claude ` +
                `(desktop=${desktopScreenshot.sizeKB}kB markup=${markupKB}kB)`
            );
            const desktopResized = await resizeForClaude(
              desktopScreenshot.base64
            );
            log(
              `  [B] image resized for Claude: desktop=${desktopResized.sizeKB}kB`
            );
            const systemPrompt = loadPrompt("auditAgents/WebsiteAnalysis");
            const telemetry = {
              isSecure: metrics.isSecure,
              loadTime: metrics.loadTime,
              brokenLinks,
            };
            const userMessage = [
              "HTML Markup (semantically stripped — scripts/styles/SVG bodies/data URLs removed):",
              stripped.html,
              "",
              "Telemetry:",
              JSON.stringify(telemetry),
            ].join("\n");

            const result = await runAgent({
              systemPrompt,
              userMessage,
              model: AUDIT_MODEL,
              images: [
                { mediaType: "image/jpeg", base64: desktopResized.base64 },
              ],
            });

            if (!result.parsed) {
              throw new Error(
                `Website analysis produced unparseable output (first 200ch: ${result.raw.slice(
                  0,
                  200
                )})`
              );
            }

            await updateAuditFields(auditId, {
              step_website_analysis: result.parsed,
              realtime_status: 2,
            });
            timings["[B] WebsiteAnalysis LLM"] = t();
            log(
              `✓ [B] WebsiteAnalysis complete (${timings["[B] WebsiteAnalysis LLM"]}ms) tokens=${result.inputTokens}/${result.outputTokens} → realtime_status=2`
            );
          })();

          // Don't await bPromise here — let it run in parallel with C.
          // Capture the promise on a higher scope so the final Promise.all picks it up.
          branchAResult.bPromise = bPromise;
          return { desktopUrl };
        })()
      : Promise.resolve(null);

    // Branch C: competitor string builder -> self GBP -> competitor GBPs.
    const branchC = (async () => {
      const t1 = stageTimer();
      log(`▶ [C1] CompetitorStringBuilder agent`);
      const csbPrompt = loadPrompt("auditAgents/CompetitorStringBuilder");
      const csbUserMessage = [
        `practice_search_string: ${practiceSearchString}`,
        `gbp_address: (unknown — GBP not yet scraped; infer from practice_search_string)`,
      ].join("\n");

      const csbResult = await runAgent({
        systemPrompt: csbPrompt,
        userMessage: csbUserMessage,
        model: AUDIT_MODEL,
      });

      if (!csbResult.parsed) {
        throw new Error(
          `CompetitorStringBuilder unparseable (first 200ch: ${csbResult.raw.slice(
            0,
            200
          )})`
        );
      }

      const {
        competitor_string: competitorString,
        self_compact_string: selfCompactString,
      } = csbResult.parsed as {
        competitor_string?: string;
        self_compact_string?: string;
      };

      if (!competitorString || !selfCompactString) {
        throw new Error(
          "CompetitorStringBuilder output missing competitor_string or self_compact_string"
        );
      }
      timings["[C1] CompetitorStringBuilder LLM"] = t1();
      log(
        `✓ [C1] CompetitorStringBuilder (${timings["[C1] CompetitorStringBuilder LLM"]}ms) competitor="${competitorString}" self="${selfCompactString}" tokens=${csbResult.inputTokens}/${csbResult.outputTokens}`
      );

      // C2 + C3 run in parallel — both only depend on CSB output strings.
      log(
        `▶ [C2+C3] scrapeSelfGBP + scrapeCompetitorGBPs (parallel)`
      );
      const c2Timer = stageTimer();
      const c3Timer = stageTimer();
      const [gbpMinimized, competitorsArr] = await Promise.all([
        (async () => {
          const gbp = await scrapeSelfGBP(selfCompactString);
          timings["[C2] self GBP scrape"] = c2Timer();
          await updateAuditFields(auditId, {
            step_self_gbp: gbp,
            realtime_status: 3,
          });
          await recordAuditMilestone(auditId, "stage_viewed_2");
          log(
            `✓ [C2] self GBP scraped (${timings["[C2] self GBP scrape"]}ms) title="${
              (gbp as Record<string, unknown>).title
            }"`
          );
          return gbp;
        })(),
        (async () => {
          const comps = await scrapeCompetitorGBPs(
            competitorString,
            COMPETITOR_LIMIT
          );
          timings["[C3] competitor GBP scrape"] = c3Timer();
          // Intentionally DO NOT bump realtime_status here. Places API
          // competitor fetch is near-instant; if we wrote rt=4 from C3 the
          // frontend would skip the analyzing_gbp stage entirely. C2 owns
          // rt=3, and rt=4 is set after both C2 and C3 settle.
          await updateAuditFields(auditId, {
            step_competitors: { competitors: comps },
          });
          log(
            `✓ [C3] ${comps.length} competitor(s) scraped (${timings["[C3] competitor GBP scrape"]}ms)`
          );
          return comps;
        })(),
      ]);

      await updateAuditFields(auditId, { realtime_status: 4 });
      await recordAuditMilestone(auditId, "stage_viewed_4");

      return { gbpMinimized, competitorsArr };
    })();

    stage = "fan-out";
    const [, branchCResult] = await Promise.all([branchA, branchC]);

    // Website analysis (Branch B) is independent of the GBP analysis below,
    // which consumes only Branch C's self-GBP + competitor data. A slow or
    // unparseable website analysis must NOT abort the GBP side — otherwise a
    // heavy/slow site throws here and the whole audit fails with no GBP
    // analysis at all. Settle it non-fatally: on failure, null the website
    // card (the frontend greys it out, identical to the no-website path) and
    // continue to the GBP analysis.
    await settleWebsiteBranchNonFatal(branchAResult.bPromise, {
      onFailure: () =>
        updateAuditFields(auditId, { step_website_analysis: null }),
      logError: logErr,
    });

    await job.updateProgress(80);

    stage = "gbp-analysis";
    const tGbp = stageTimer();
    log(`▶ GBPAnalysis (5 pillar agents in parallel + code aggregator)`);
    const condensedClient = condenseGbp(branchCResult.gbpMinimized);
    const condensedCompetitors = condenseCompetitors(branchCResult.competitorsArr);

    // Each pillar gets ONLY the data it needs. Tighter prompts, smaller
    // outputs, run in parallel.
    //
    // Three site_markup states:
    //   1. hasWebsite=true  → real stripped HTML
    //   2. websiteBlocked   → marker tells the agent the site IS live but
    //                         blocks automated scans. Suppresses the
    //                         "recommend migration" path entirely.
    //   3. neither          → user provided no website at all.
    const siteMarkupBlock = websiteBlocked
      ? "site_markup: (BLOCKED — bot protection — the website is live and accessible to humans, but blocks automated scanners (Cloudflare etc.). Do NOT recommend migration, do NOT flag the site as down/outdated/missing/broken. Treat NAP cross-check as unverifiable: set sync_audit.nap_match=null. Skip ALL website-related recommendations; focus on GBP-only optimizations.)"
      : hasWebsite
        ? "site_markup (semantically stripped):"
        : "site_markup: (no website provided — score Profile Integrity from GBP fields only; treat NAP cross-check as unverifiable, set sync_audit.nap_match=null)";

    const piMsg = [
      "client_gbp:",
      JSON.stringify({
        title: condensedClient.title,
        address: condensedClient.address,
        phone: condensedClient.phone,
        website: condensedClient.website,
      }),
      "",
      siteMarkupBlock,
      hasWebsite && !websiteBlocked ? strippedHtml : "",
    ].join("\n");

    const teMsg = [
      "client_gbp:",
      JSON.stringify({
        averageStarRating: condensedClient.averageStarRating,
        reviewsCount: condensedClient.reviewsCount,
        reviewsDistribution: condensedClient.reviewsDistribution,
        reviewsLast30d: condensedClient.reviewsLast30d,
        reviewsLast90d: condensedClient.reviewsLast90d,
      }),
      "",
      "competitors:",
      JSON.stringify(
        condensedCompetitors.map((c) => ({
          title: c.title,
          averageStarRating: c.averageStarRating,
          reviewsCount: c.reviewsCount,
          reviewsLast30d: c.reviewsLast30d,
          reviewsLast90d: c.reviewsLast90d,
        }))
      ),
    ].join("\n");

    const vaMsg = [
      "client_gbp:",
      JSON.stringify({
        imagesCount: condensedClient.imagesCount,
        imageCategories: condensedClient.imageCategories,
      }),
      "",
      "competitors:",
      JSON.stringify(
        condensedCompetitors.map((c) => ({
          title: c.title,
          imagesCount: c.imagesCount,
          imageCategories: c.imageCategories,
        }))
      ),
    ].join("\n");

    const scMsg = [
      "client_gbp:",
      JSON.stringify({
        title: condensedClient.title,
        categoryName: condensedClient.categoryName,
        categories: condensedClient.categories,
        address: condensedClient.address,
        hasWebsite: condensedClient.hasWebsite,
        hasPhone: condensedClient.hasPhone,
        hasHours: condensedClient.hasHours,
        openingHoursSummary: condensedClient.openingHoursSummary,
      }),
    ].join("\n");

    const caMsg = [
      "client_gbp:",
      JSON.stringify(condensedClient),
      "",
      "competitors:",
      JSON.stringify(condensedCompetitors),
    ].join("\n");

    const callPillar = async <T>(
      promptPath: string,
      userMessage: string,
      label: string
    ): Promise<T> => {
      // runComposedAgent injects any lattice rubric mapped to this pillar and,
      // if the composed prompt breaks JSON parsing, degrades to the base prompt.
      // So an injected rubric can only ever help or no-op, never break a pillar.
      const res = await runComposedAgent({
        agentPath: promptPath,
        userMessage,
        model: AUDIT_MODEL,
        onDegrade: () =>
          logger.warn(
            `[audit-leadgen] ${label}: composed (lattice) prompt unparseable — degraded to base prompt`
          ),
      });
      if (!res.parsed) {
        throw new Error(
          `${label} unparseable (first 200ch: ${res.raw.slice(0, 200)})`
        );
      }
      return res.parsed as T;
    };

    const [
      profileIntegrity,
      trustEngagement,
      visualAuthority,
      searchConversion,
      competitorAnalysis,
    ] = await Promise.all([
      callPillar<ProfileIntegrityResult>(
        "auditAgents/gbp/ProfileIntegrity",
        piMsg,
        "ProfileIntegrity"
      ),
      callPillar<PillarOnlyResult>(
        "auditAgents/gbp/TrustEngagement",
        teMsg,
        "TrustEngagement"
      ),
      callPillar<PillarOnlyResult>(
        "auditAgents/gbp/VisualAuthority",
        vaMsg,
        "VisualAuthority"
      ),
      callPillar<PillarOnlyResult>(
        "auditAgents/gbp/SearchConversion",
        scMsg,
        "SearchConversion"
      ),
      callPillar<CompetitorAnalysisResult>(
        "auditAgents/gbp/CompetitorAnalysis",
        caMsg,
        "CompetitorAnalysis"
      ),
    ]);

    const bundle: PillarBundle = {
      profileIntegrity,
      trustEngagement,
      visualAuthority,
      searchConversion,
      competitorAnalysis,
    };
    const gbpAnalysis = aggregateGbpAnalysis(bundle);

    await updateAuditFields(auditId, {
      step_gbp_analysis: gbpAnalysis,
      realtime_status: 5,
      status: "completed",
    });
    // Audit fully complete — report is ready. Record both stage_viewed_5
    // stage_viewed_5 (Report Viewed) = pipeline finished and UI will
    // render the report. This is the objective "data is ready" signal
    // so it stays server-authoritative.
    //
    // results_viewed (More Results Viewed) used to ALSO fire here, but
    // that conflated "pipeline done" with "user actually viewed the
    // unblurred report". The client now owns results_viewed — it fires
    // only after the paywall email is submitted, giving the funnel an
    // honest engagement signal.
    await recordAuditMilestone(auditId, "stage_viewed_5");

    // FAB email-notify queue: send report to anyone who tapped "Email me
    // when ready" while waiting. Fire-and-forget — never block job exit.
    await drainNotificationsForAudit(auditId);

    await job.updateProgress(100);
    timings["GBPAnalysis (5 pillars + agg)"] = tGbp();
    log(
      `✓ GBPAnalysis complete (${timings["GBPAnalysis (5 pillars + agg)"]}ms) — score=${gbpAnalysis.gbp_readiness_score} grade=${gbpAnalysis.gbp_grade} → realtime_status=5 status=completed`
    );
    const totalMs = Date.now() - totalStart;
    log(`🎉 COMPLETED in ${totalMs}ms`);

    // Ranked breakdown — slowest first.
    const ranked = Object.entries(timings).sort((a, b) => b[1] - a[1]);
    log(`⏱  Time breakdown (total ${totalMs}ms, parallel branches overlap):`);
    for (const [name, ms] of ranked) {
      const pct = ((ms / totalMs) * 100).toFixed(1);
      log(`   ${ms.toString().padStart(6, " ")}ms (${pct.padStart(5, " ")}%) ${name}`);
    }
  } catch (err: any) {
    const message = err?.message || String(err);
    logErr(`✗ FAILED at stage="${stage}" after ${Date.now() - totalStart}ms: ${message}`);
    if (err?.stack) {
      logErr(`Stack:\n${err.stack}`);
    }
    try {
      await updateAuditFields(auditId, {
        status: "failed",
        error_message: `[${stage}] ${message}`,
      });
    } catch (updateErr: any) {
      logErr(`Also failed to mark audit as failed: ${updateErr?.message}`);
    }
    // Drain the FAB email-notify queue even on failure — users who asked
    // to be emailed still get the report link (the report viewer surfaces
    // the failure state). Cleaner failure-specific email is a follow-up.
    try {
      await drainNotificationsForAudit(auditId);
    } catch (drainErr: any) {
      logErr(`Notification drain after failure errored: ${drainErr?.message}`);
    }
    throw err;
  }
}
