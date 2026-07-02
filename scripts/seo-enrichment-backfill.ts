/**
 * One-off SEO enrichment backfill — applies the T2-T5 enrichment (schema
 * @type sanitization, og_image from featured_image, real aggregateRating,
 * faq_candidates -> FAQPage) to existing published posts on the 3 sites
 * named in the plan. Deliberately narrower than a full SEO regeneration —
 * see the Pushback in the spec for why.
 *
 * Companion to:
 *   plans/07022026-seo-metatag-fixes/spec.html (T6)
 *
 * USAGE
 *   cd ~/Desktop/alloro
 *
 *   # Preview only — list post counts per project, no writes:
 *   npx tsx scripts/seo-enrichment-backfill.ts --dry-run
 *
 *   # Live — enrich every published post on all 3 target projects:
 *   npx tsx scripts/seo-enrichment-backfill.ts
 *
 * Run against prod by supplying prod DB_* env vars inline on the command
 * line (dotenv does not override already-set process.env values, so this
 * never touches the checked-in .env file):
 *   DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
 *     npx tsx scripts/seo-enrichment-backfill.ts --dry-run
 *
 * EXIT CODES
 *   0 — all posts enriched successfully (or dry-run completed)
 *   1 — one or more posts failed; see per-post error log
 */

import { closeConnection } from "../src/database/connection";
import { PostModel } from "../src/models/website-builder/PostModel";
import { enrichPostsForProject } from "../src/controllers/admin-websites/feature-services/service.seo-enrichment";

const TARGET_PROJECTS: Array<{ name: string; projectId: string }> = [
  { name: "One Endodontics", projectId: "0dcad678-2845-4c20-a298-e9c62aed9ebc" },
  { name: "Artful Orthodontics", projectId: "b64249d7-43fe-4148-8acd-ae7e47aaa3cd" },
  { name: "Garrison Orthodontics", projectId: "5972c0d7-bfbd-4a0b-952a-a08ba408eb81" },
];

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  let anyFailed = false;

  for (const target of TARGET_PROJECTS) {
    if (dryRun) {
      const posts = await PostModel.findByProjectFiltered(target.projectId, { status: "published" });
      console.log(
        `[seo-enrichment] (dry-run) ${target.name}: would process ${posts.length} published post(s)`
      );
      continue;
    }

    console.log(`[seo-enrichment] ${target.name}: starting enrichment...`);
    const summary = await enrichPostsForProject(target.projectId);
    console.log(`[seo-enrichment] ${target.name}: done —`, {
      total: summary.total,
      enriched: summary.enriched,
      unchanged: summary.unchanged,
      failed: summary.failed.length,
    });

    if (summary.failed.length > 0) {
      anyFailed = true;
      console.error(`[seo-enrichment] ${target.name}: failures —`, summary.failed);
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
    console.error("[seo-enrichment] unexpected error:", err);
    await closeConnection();
    process.exit(1);
  });
