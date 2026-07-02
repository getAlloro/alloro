/**
 * One-off SEO generation for posts that currently have NO seo_data at all —
 * distinct from scripts/seo-enrichment-backfill.ts, which only patches
 * existing data and deliberately never re-runs generation. Originally the
 * 108 posts (92 One Endodontics + 16 Garrison), extended (spec Rev 2) to
 * Artful Orthodontics; already-covered sites re-run as idempotent no-ops.
 *
 * Uses the standard generateAllWithSharedContext wrapper with
 * `applyGeoContent: false` (metadata-only: the GEO body-content auto-apply
 * is explicitly skipped — owner decision, plans/07022026-seo-generator-root-
 * fixes) — the wrapper also derives the deterministic canonical for every
 * post, so this script no longer carries its own override. Existing seo_data
 * keys (e.g. an imported og_image) are preserved under the generated fields.
 * Each post is finished with enrichPostSeoData so schema type / og_image /
 * rating / FAQ / title-length get the same guardrails as everything else.
 *
 * Companion to:
 *   plans/07022026-seo-full-coverage/spec.html (T3, T6 (Rev 2))
 *   plans/07022026-seo-generator-root-fixes/spec.html (T2/T3 — shared helper + flag)
 *
 * USAGE
 *   cd ~/Desktop/alloro
 *
 *   # Preview only — list target post counts per project, no writes/LLM calls:
 *   npx tsx scripts/seo-generate-missing.ts --dry-run
 *
 *   # Live — generate + enrich every target post:
 *   npx tsx scripts/seo-generate-missing.ts
 *
 * Run against prod by supplying prod DB_* env vars inline (see
 * scripts/seo-enrichment-backfill.ts for the exact pattern).
 *
 * EXIT CODES
 *   0 — all posts processed successfully (or dry-run completed)
 *   1 — one or more posts failed; see per-post error log
 */

import { closeConnection } from "../src/database/connection";
import { PostModel } from "../src/models/website-builder/PostModel";
import { ProjectModel } from "../src/models/website-builder/ProjectModel";
import {
  fetchSharedContext,
  generateAllWithSharedContext,
} from "../src/controllers/admin-websites/feature-services/service.seo-generation";
import { enrichPostSeoData } from "../src/controllers/admin-websites/feature-services/service.seo-enrichment";

const TARGET_PROJECTS: Array<{ name: string; projectId: string }> = [
  { name: "One Endodontics", projectId: "0dcad678-2845-4c20-a298-e9c62aed9ebc" },
  { name: "Garrison Orthodontics", projectId: "5972c0d7-bfbd-4a0b-952a-a08ba408eb81" },
  { name: "Artful Orthodontics", projectId: "b64249d7-43fe-4148-8acd-ae7e47aaa3cd" },
];

interface ZeroDataPost {
  id: string;
  title: string;
  content: string;
  /** Whatever partial seo_data the post already carries (e.g. an imported og_image) — preserved under the generated fields. */
  existingSeoData: Record<string, unknown>;
}

function parseExistingSeoData(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

async function findZeroDataPosts(projectId: string): Promise<ZeroDataPost[]> {
  const posts = await PostModel.findByProjectFiltered(projectId, { status: "published" });
  return posts
    .filter((post: { seo_data: unknown }) => {
      const seo = parseExistingSeoData(post.seo_data);
      return !seo.meta_title;
    })
    .map((post: { id: string; title: string; content: string | null; seo_data: unknown }) => ({
      id: post.id,
      title: post.title,
      content: post.content || "",
      existingSeoData: parseExistingSeoData(post.seo_data),
    }));
}

async function generateAndEnrichPost(
  projectId: string,
  post: ZeroDataPost,
  sharedContext: Awaited<ReturnType<typeof fetchSharedContext>>
): Promise<string[]> {
  const results = await generateAllWithSharedContext(
    sharedContext,
    "post",
    { page_content: post.content, post_title: post.title },
    projectId,
    post.id,
    { applyGeoContent: false }
  );

  // Start from whatever the post already carries (imported og_image, prior
  // canonical fix, ...) so fresh generation fills the gaps without wiping
  // unrelated keys — generated fields win where both exist. The wrapper has
  // already overridden canonical_url with the deterministic serving path.
  const mergedSeoData: Record<string, unknown> = { ...post.existingSeoData };
  const mergedInsights: Record<string, string> = {};
  for (const r of results) {
    Object.assign(mergedSeoData, r.generated);
    if (r.insight) mergedInsights[r.section] = r.insight;
  }
  mergedSeoData.insights = mergedInsights;

  await PostModel.updateSeoDataByIdJsClock(post.id, JSON.stringify(mergedSeoData));

  const enrichment = await enrichPostSeoData(post.id, projectId);
  return enrichment.changed;
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  let anyFailed = false;

  for (const target of TARGET_PROJECTS) {
    const posts = await findZeroDataPosts(target.projectId);

    if (dryRun) {
      console.log(`[seo-generate-missing] (dry-run) ${target.name}: would generate ${posts.length} post(s)`);
      continue;
    }

    if (posts.length === 0) {
      console.log(`[seo-generate-missing] ${target.name}: nothing to do`);
      continue;
    }

    console.log(`[seo-generate-missing] ${target.name}: fetching shared context...`);
    const project = await ProjectModel.findOrganizationIdById(target.projectId);
    if (!project?.organization_id) {
      console.error(`[seo-generate-missing] ${target.name}: no organization linked, skipping`);
      anyFailed = true;
      continue;
    }
    const sharedContext = await fetchSharedContext(target.projectId);

    console.log(`[seo-generate-missing] ${target.name}: generating for ${posts.length} post(s)...`);
    let done = 0;
    const failures: Array<{ id: string; error: string }> = [];

    for (const post of posts) {
      try {
        const enrichmentChanges = await generateAndEnrichPost(target.projectId, post, sharedContext);
        done += 1;
        console.log(
          `[seo-generate-missing]   [${done}/${posts.length}] ✓ "${post.title}" — post-generation enrichment: ${enrichmentChanges.join(", ") || "none needed"}`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        failures.push({ id: post.id, error: message });
        console.error(`[seo-generate-missing]   ✗ "${post.title}" (${post.id}) failed: ${message}`);
      }
    }

    console.log(`[seo-generate-missing] ${target.name}: done — ${done}/${posts.length} succeeded, ${failures.length} failed`);
    if (failures.length > 0) {
      anyFailed = true;
      console.error(`[seo-generate-missing] ${target.name}: failures —`, failures);
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
    console.error("[seo-generate-missing] unexpected error:", err);
    await closeConnection();
    process.exit(1);
  });
