# Import Artful Blog Posts

## Why
Artful Orthodontics has source blog content on `artful3.hamiltonwise.com` that needs to live in the production Alloro website so `/articles` and `/articles/{slug}` render from the real Alloro posts system.

## What
Import the 74 posts linked from the source WordPress `/blog/` page into production `website_builder.posts` under the existing Artful `Articles` post type, with all referenced blog images mirrored into Alloro S3 and `website_builder.media`.

## Context

**Relevant files:**
- `scripts/import-artful-blogs-production.ts` — one-off guarded import/rollback script.
- `src/database/migrations/20260305000001_create_posts_system.ts` — posts, post type, taxonomy, and post block schema.
- `src/database/migrations/20260214000000_create_media_table.ts` — media table schema used by the admin media library.
- `src/database/migrations/20260418000003_add_source_url_to_posts.ts` — `source_url` dedupe contract.
- `src/utils/core/s3.ts` — S3 upload/delete helper.
- `src/controllers/admin-media/feature-utils/util.media-processor.ts` — image processing pattern to mirror.

**Patterns to follow:**
- Use `source_url` for idempotent imported-post detection.
- Use the existing media table shape and S3 upload helpers.
- Keep production verification separate from code/script creation.

**Reference file:** `scripts/debug-warmup/backfill-coastal-media.ts` — closest existing one-off DB/media backfill script.

## Constraints

**Must:**
- Use production DB from `.env`.
- Guard the exact target project `b64249d7-43fe-4148-8acd-ae7e47aaa3cd`.
- Guard the exact post type `articles`.
- Import only the 74 posts linked via “Read More” on `https://artful3.hamiltonwise.com/blog/`.
- Mirror featured and in-content images to Alloro S3 and create media rows.
- Rewrite article image URLs to S3 URLs.
- Rewrite old internal source-domain blog links to Alloro article/service/page URLs where known.
- Preserve source publish dates in `published_at`.
- Update the live `/articles` shortcode ordering to `order='desc' order_by='published_at'`.

**Must not:**
- Import legal/site-info pages as articles.
- Print secrets or full `.env`.
- Touch unrelated frontend/docs work currently in the dirty tree.
- Add schema migrations.

**Out of scope:**
- Redirect rules from the old source domain.
- Copying non-blog pages.
- Reworking the article grid or single article template design.

## Risk

**Level:** 3

**Risks identified:**
- Production content mutation could create bad public article pages. → **Mitigation:** dry-run first, strict count guard, transaction-wrapped DB writes, source-url dedupe.
- S3 upload can partially succeed before DB failure. → **Mitigation:** deterministic import prefix and rollback mode that deletes matching DB rows and S3 objects.
- Source WordPress includes non-blog posts. → **Mitigation:** import from `/blog/` “Read More” links only, not from all WP API posts.
- Renderer caches may hide changes briefly. → **Mitigation:** update cache-relevant DB rows and verify with `?nocache=1`/public API after import.

**Blast radius:** Artful production website `/articles`, `/articles/{slug}`, Artful media library, renderer post/API caches for the Artful project.

**Pushback:**
- Direct production content imports are easy to make messy. The bounded script is acceptable here because the target article post type is empty and the import is source-url keyed.

## Tasks

### T1: Import Script
**Do:** Add guarded dry-run/execute/rollback script for source discovery, image mirroring, media row creation, post insertion, link rewriting, and article page shortcode ordering.
**Files:** `scripts/import-artful-blogs-production.ts`
**Depends on:** none
**Verify:** `npx tsx scripts/import-artful-blogs-production.ts --dry-run`

### T2: Production Import
**Do:** Run dry-run, then execute import against production DB/S3.
**Files:** production DB and S3 only
**Depends on:** T1
**Verify:** script summary shows 74 created/skipped and no failed images/posts.

### T3: Runtime Verification
**Do:** Verify DB counts, source URL dedupe, S3 media rows, public `/articles`, public article detail, and paginated API.
**Files:** none
**Depends on:** T2
**Verify:** SQL counts and public HTTP checks.

## Done
- [x] `npx tsx scripts/import-artful-blogs-production.ts --dry-run` passes.
- [x] Import creates or skips exactly 74 Artful blog article posts.
- [x] Imported article posts have `source_url`, `status='published'`, and S3 `featured_image` URLs.
- [x] Imported blog media exists in `website_builder.media`.
- [x] `/articles` renders imported posts from the Alloro renderer.
- [x] A sample `/articles/{slug}` page renders with S3-hosted images.
- [x] Paginated posts API returns Artful articles.
- [x] `npx tsc --noEmit --pretty false` passes.
- [x] No unrelated working-tree files are modified by this task.
