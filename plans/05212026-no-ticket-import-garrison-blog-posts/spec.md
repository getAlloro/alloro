# Import Garrison Blog Posts

## Why
Garrison Orthodontics has source blog content on `garrisonorthodontics.com` that needs to live in the production Alloro posts system for project `swift-medical-6022`.

## What
Import the real orthodontic blog posts from the source WordPress site into production `website_builder.posts` under the existing `Articles` post type, with referenced images mirrored into Alloro S3 and `website_builder.media`.

## Context

**Relevant files:**
- `scripts/import-garrison-blogs-production.ts` — one-off guarded import/rollback script.
- `scripts/import-artful-blogs-production.ts` — closest prior import shape.
- `src/database/migrations/20260305000001_create_posts_system.ts` — posts, post type, taxonomy, and post block schema.
- `src/database/migrations/20260214000000_create_media_table.ts` — media table schema used by the admin media library.
- `src/database/migrations/20260418000003_add_source_url_to_posts.ts` — `source_url` dedupe contract.
- `src/utils/core/s3.ts` — S3 upload/delete helper.
- `src/controllers/admin-media/feature-utils/util.media-processor.ts` — image processing pattern to mirror.

**Patterns to follow:**
- Use `source_url` for idempotent imported-post detection.
- Use existing media table shape and S3 upload helpers.
- Keep production verification separate from script creation.

**Reference file:** `scripts/import-artful-blogs-production.ts` — closest existing one-off DB/media import.

## Constraints

**Must:**
- Use production DB from `.env`.
- Guard exact target project `5972c0d7-bfbd-4a0b-952a-a08ba408eb81` / `swift-medical-6022`.
- Guard exact post type `articles`.
- Import only the 33 real orthodontic blog posts from the source WP API.
- Exclude source legal/site/spam posts: `privacy-policy`, `terms-of-use`, `web-accessibility`, `before-afters`, `advanced-technology`, `new-patients`, and `reloader-activator-download`.
- Mirror featured and in-content images to Alloro S3 and create media rows.
- Rewrite article image URLs to S3 URLs.
- Rewrite old internal source-domain blog links to Alloro article URLs and known page links to current Alloro paths.
- Preserve source publish dates in `published_at`.
- Update the live `/articles` shortcode ordering to `order='desc' order_by='published_at'`.

**Must not:**
- Import legal/site-info/spam posts as articles.
- Print secrets or full `.env`.
- Touch unrelated frontend/docs work currently in the dirty tree.
- Add schema migrations.

**Out of scope:**
- Redirect rules from the old source domain.
- Copying non-blog pages.
- Reworking article grid or single article template design.

## Risk

**Level:** 3

**Risks identified:**
- Production content mutation could create bad public article pages. → **Mitigation:** dry-run first, strict count guard, transaction-wrapped DB writes, source-url dedupe.
- Source WordPress includes non-blog and spam-looking posts. → **Mitigation:** explicit denylist plus expected count guard of 33 imported posts.
- S3 upload can partially succeed before DB failure. → **Mitigation:** deterministic import prefix and rollback mode that deletes matching DB rows and S3 objects.
- Renderer caches may hide changes briefly. → **Mitigation:** invalidate project-specific renderer keys and verify with public renderer/API after import.

**Blast radius:** Garrison production website `/articles`, `/articles/{slug}`, Garrison media library, renderer post/API caches for the Garrison project.

**Pushback:**
- Importing all 40 WP posts would be wrong. The source includes legal pages, site-info pages, and an obvious spam/malware-style post. The import must be filtered to the 33 real blog articles.

## Tasks

### T1: Import Script
**Do:** Add guarded dry-run/execute/rollback script for source discovery, image mirroring, media row creation, post insertion, link rewriting, excluded source slugs, and article page shortcode ordering.
**Files:** `scripts/import-garrison-blogs-production.ts`
**Depends on:** none
**Verify:** `npx tsx scripts/import-garrison-blogs-production.ts --dry-run`

### T2: Production Import
**Do:** Run dry-run, then execute import against production DB/S3.
**Files:** production DB and S3 only
**Depends on:** T1
**Verify:** script summary shows 33 posts and no failed images/posts.

### T3: Runtime Verification
**Do:** Verify DB counts, source URL dedupe, S3 media rows, public `/articles`, public article detail, and paginated API.
**Files:** none
**Depends on:** T2
**Verify:** SQL counts and public HTTP checks.

## Done
- [x] `npx tsx scripts/import-garrison-blogs-production.ts --dry-run` passes.
- [x] Import creates or updates exactly 33 Garrison blog article posts.
- [x] Imported article posts have `source_url`, `status='published'`, and S3 `featured_image` URLs.
- [x] Imported blog media exists in `website_builder.media`.
- [x] `/articles` renders imported posts from the Alloro renderer.
- [x] A sample `/articles/{slug}` page renders with S3-hosted images.
- [x] Paginated posts API returns Garrison articles.
- [x] `npx tsc --noEmit --pretty false` passes or only pre-existing errors remain.
- [x] No unrelated working-tree files are modified by this task.
