/**
 * One-off SEO generation for posts that currently have NO seo_data at all —
 * distinct from scripts/seo-enrichment-backfill.ts, which only patches
 * existing data and deliberately never re-runs generation. These 108 posts
 * (92 One Endodontics + 16 Garrison Orthodontics) have nothing to protect,
 * so real tiered LLM generation is safe here in a way it wasn't for the
 * already-populated posts in the prior plan.
 *
 * Calls runAllSeoSectionsTiered directly (the section runner, not the
 * service.seo-generation.ts wrapper functions) so this stays scoped to SEO
 * metadata only. The wrapper's generateAllWithSharedContext also triggers
 * "GEO auto-apply" — a separate feature that rewrites the post's visible
 * body content — which is explicitly out of scope here (owner decision,
 * plans/07022026-seo-full-coverage). Practice facts are fetched the same
 * way the wrapper does internally (fetchPracticeFactsBlock, exported for
 * this reuse) so generation quality is unaffected by bypassing the wrapper.
 * Immediately runs enrichPostSeoData (unmodified, from the prior plan) on
 * top so the fresh schema type / og_image / rating / FAQ / title-length all
 * get the same guardrails as everything else.
 *
 * Companion to:
 *   plans/07022026-seo-full-coverage/spec.html (T3)
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
import { PostTypeModel } from "../src/models/website-builder/PostTypeModel";
import { ProjectModel } from "../src/models/website-builder/ProjectModel";
import {
  fetchSharedContext,
  fetchPracticeFactsBlock,
} from "../src/controllers/admin-websites/feature-services/service.seo-generation";
import { runAllSeoSectionsTiered } from "../src/controllers/admin-websites/feature-utils/util.seo-section-runner";
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
  slug: string;
  postTypeId: string;
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
    .map((post: { id: string; title: string; content: string | null; slug: string; post_type_id: string; seo_data: unknown }) => ({
      id: post.id,
      title: post.title,
      content: post.content || "",
      slug: post.slug,
      postTypeId: post.post_type_id,
      existingSeoData: parseExistingSeoData(post.seo_data),
    }));
}

/**
 * The "critical" generation section fabricates a plausible-looking
 * canonical_url instead of deriving it from the actual serving path (the
 * same disease already found and corrected for existing posts this
 * session). Canonical is 100% deterministic for a post — /{type-slug}/
 * {post-slug} — so it is never trusted from the LLM here; always
 * overridden with the real value after generation.
 */
async function correctCanonicalUrl(
  seoData: Record<string, unknown>,
  post: ZeroDataPost
): Promise<void> {
  const postType = await PostTypeModel.findRawById(post.postTypeId);
  if (!postType?.slug) return;
  seoData.canonical_url = `/${postType.slug}/${post.slug}`;
}

async function generateAndEnrichPost(
  projectId: string,
  post: ZeroDataPost,
  sharedContext: Awaited<ReturnType<typeof fetchSharedContext>>
): Promise<string[]> {
  const practiceFactsBlock = await fetchPracticeFactsBlock(post.id, "post");

  const results = await runAllSeoSectionsTiered(
    "post",
    sharedContext.businessData,
    sharedContext.creatorContext,
    sharedContext.validatorContext,
    { page_content: post.content, post_title: post.title },
    projectId,
    post.id,
    practiceFactsBlock
  );

  // Start from whatever the post already carries (imported og_image, prior
  // canonical fix, ...) so fresh generation fills the gaps without wiping
  // unrelated keys — generated fields win where both exist.
  const mergedSeoData: Record<string, unknown> = { ...post.existingSeoData };
  const mergedInsights: Record<string, string> = {};
  for (const r of results) {
    Object.assign(mergedSeoData, r.generated);
    if (r.insight) mergedInsights[r.section] = r.insight;
  }
  mergedSeoData.insights = mergedInsights;

  await correctCanonicalUrl(mergedSeoData, post);

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
