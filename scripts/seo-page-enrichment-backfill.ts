/**
 * One-off SEO enrichment backfill for PAGES — applies the same schema
 * @type sanitization, real aggregateRating injection, faq_candidates ->
 * FAQPage conversion, and title-length trim already applied to posts
 * (plans/07022026-seo-metatag-fixes) to the 57 published pages across all
 * 4 sites. No og_image step — pages have no featured_image column; the
 * page-level og_image gap was closed as a one-time direct data fix instead.
 *
 * Companion to:
 *   plans/07022026-seo-full-coverage/spec.html (T1)
 *
 * USAGE
 *   cd ~/Desktop/alloro
 *
 *   # Preview only — list page counts per project, no writes:
 *   npx tsx scripts/seo-page-enrichment-backfill.ts --dry-run
 *
 *   # Live — enrich every published page on all 4 target projects:
 *   npx tsx scripts/seo-page-enrichment-backfill.ts
 *
 * Run against prod by supplying prod DB_* env vars inline on the command
 * line (see scripts/seo-enrichment-backfill.ts for the exact pattern).
 *
 * EXIT CODES
 *   0 — all pages enriched successfully (or dry-run completed)
 *   1 — one or more pages failed; see per-page error log
 */

import { closeConnection } from "../src/database/connection";
import { PageModel } from "../src/models/website-builder/PageModel";
import { enrichPagesForProject } from "../src/controllers/admin-websites/feature-services/service.seo-enrichment";

const TARGET_PROJECTS: Array<{ name: string; projectId: string }> = [
  { name: "One Endodontics", projectId: "0dcad678-2845-4c20-a298-e9c62aed9ebc" },
  { name: "Artful Orthodontics", projectId: "b64249d7-43fe-4148-8acd-ae7e47aaa3cd" },
  { name: "Garrison Orthodontics", projectId: "5972c0d7-bfbd-4a0b-952a-a08ba408eb81" },
  { name: "getalloro.com", projectId: "acc7cbfc-a3fd-4476-abbc-aace3a566fc5" },
];

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  let anyFailed = false;

  for (const target of TARGET_PROJECTS) {
    if (dryRun) {
      const pages = await PageModel.findPublishedByProjectId(target.projectId);
      console.log(
        `[seo-page-enrichment] (dry-run) ${target.name}: would process ${pages.length} published page(s)`
      );
      continue;
    }

    console.log(`[seo-page-enrichment] ${target.name}: starting enrichment...`);
    const summary = await enrichPagesForProject(target.projectId);
    console.log(`[seo-page-enrichment] ${target.name}: done —`, {
      total: summary.total,
      enriched: summary.enriched,
      unchanged: summary.unchanged,
      failed: summary.failed.length,
    });

    if (summary.failed.length > 0) {
      anyFailed = true;
      console.error(`[seo-page-enrichment] ${target.name}: failures —`, summary.failed);
    }
  }

  return anyFailed ? 1 : 0;
}

main()
  .then(async (code) => {
    await closeConnection();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("[seo-page-enrichment] unexpected error:", err);
    await closeConnection();
    process.exit(1);
  });
