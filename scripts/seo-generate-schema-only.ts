/**
 * One-off schema_json-only generation for Garrison Orthodontics posts that
 * have a title/description but zero schema_json — 33 posts, distinct from
 * scripts/seo-generate-missing.ts's 108 fully-blank posts. Only the
 * "significant" section is generated (schema_json); everything else on
 * these posts already exists and must not be touched. Read-patch-write,
 * same discipline as service.seo-enrichment.ts.
 *
 * Uses runGenerateSection (util.seo-section-runner.ts) directly, not the
 * service.seo-generation.ts wrapper — no auto-apply risk either way since
 * "significant" never triggers GEO auto-apply (that's geo_layer-only), but
 * staying consistent with seo-generate-missing.ts's approach.
 *
 * Companion to:
 *   plans/07022026-seo-full-coverage/spec.html (T4)
 *
 * USAGE
 *   cd ~/Desktop/alloro
 *   npx tsx scripts/seo-generate-schema-only.ts --dry-run
 *   npx tsx scripts/seo-generate-schema-only.ts
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
  fetchPracticeFactsBlock,
} from "../src/controllers/admin-websites/feature-services/service.seo-generation";
import { runGenerateSection } from "../src/controllers/admin-websites/feature-utils/util.seo-section-runner";
import { enrichPostSeoData } from "../src/controllers/admin-websites/feature-services/service.seo-enrichment";

const PROJECT_ID = "5972c0d7-bfbd-4a0b-952a-a08ba408eb81";
const PROJECT_NAME = "Garrison Orthodontics";

interface SchemaOnlyPost {
  id: string;
  title: string;
  content: string;
  seoData: Record<string, unknown>;
}

function parseSeoData(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

async function findSchemaOnlyTargets(): Promise<SchemaOnlyPost[]> {
  const posts = await PostModel.findByProjectFiltered(PROJECT_ID, { status: "published" });
  return posts
    .map((post: { id: string; title: string; content: string | null; seo_data: unknown }) => ({
      id: post.id,
      title: post.title,
      content: post.content || "",
      seoData: parseSeoData(post.seo_data),
    }))
    .filter(
      (post) =>
        typeof post.seoData.meta_title === "string" &&
        post.seoData.meta_title.length > 0 &&
        !Array.isArray(post.seoData.schema_json)
    );
}

async function generateSchemaAndEnrich(
  post: SchemaOnlyPost,
  sharedContext: Awaited<ReturnType<typeof fetchSharedContext>>
): Promise<string[]> {
  const practiceFactsBlock = await fetchPracticeFactsBlock(post.id, "post");

  const { generated } = await runGenerateSection(
    "significant",
    "post",
    sharedContext.businessData,
    sharedContext.creatorContext,
    sharedContext.validatorContext,
    { page_content: post.content, post_title: post.title, existing_seo_data: post.seoData },
    PROJECT_ID,
    post.id,
    practiceFactsBlock
  );

  const merged: Record<string, unknown> = { ...post.seoData };
  if (Array.isArray(generated.schema_json)) {
    merged.schema_json = generated.schema_json;
  }

  await PostModel.updateSeoDataByIdJsClock(post.id, JSON.stringify(merged));

  const enrichment = await enrichPostSeoData(post.id, PROJECT_ID);
  return enrichment.changed;
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  const posts = await findSchemaOnlyTargets();

  if (dryRun) {
    console.log(`[seo-generate-schema-only] (dry-run) ${PROJECT_NAME}: would process ${posts.length} post(s)`);
    return 0;
  }

  const project = await ProjectModel.findOrganizationIdById(PROJECT_ID);
  if (!project?.organization_id) {
    console.error(`[seo-generate-schema-only] ${PROJECT_NAME}: no organization linked`);
    return 1;
  }

  console.log(`[seo-generate-schema-only] ${PROJECT_NAME}: fetching shared context...`);
  const sharedContext = await fetchSharedContext(PROJECT_ID);

  console.log(`[seo-generate-schema-only] ${PROJECT_NAME}: generating schema_json for ${posts.length} post(s)...`);
  let done = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const post of posts) {
    try {
      const enrichmentChanges = await generateSchemaAndEnrich(post, sharedContext);
      done += 1;
      console.log(
        `[seo-generate-schema-only]   [${done}/${posts.length}] ✓ "${post.title}" — enrichment: ${enrichmentChanges.join(", ") || "none needed"}`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      failures.push({ id: post.id, error: message });
      console.error(`[seo-generate-schema-only]   ✗ "${post.title}" (${post.id}) failed: ${message}`);
    }
  }

  console.log(`[seo-generate-schema-only] ${PROJECT_NAME}: done — ${done}/${posts.length} succeeded, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`[seo-generate-schema-only] failures —`, failures);
    return 1;
  }
  return 0;
}

main()
  .then(async (code) => {
    await closeConnection();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("[seo-generate-schema-only] unexpected error:", err);
    await closeConnection();
    process.exit(1);
  });
