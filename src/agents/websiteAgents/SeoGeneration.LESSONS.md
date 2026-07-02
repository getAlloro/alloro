# SEO Generation — Hard-Learned Rules & Where They're Enforced

The source of truth for what correct SEO generation and delivery looks like on Alloro,
and — critically — **which layer guarantees each rule**. Born from the 2026-07-02 SEO
overhaul, where a "wrong Google sitelink" question uncovered systemic generator defects
across four live client sites. This file is documentation (it is NOT loaded into the LLM
prompt); the LLM-facing subset lives in the `SeoGeneration.*.md` section prompts.

## The one meta-lesson

**For any field that must be TRUE (not merely plausible), enforce it in CODE, not the prompt.**
The model will confidently emit believable-but-wrong values for machine facts — it invented
canonical paths that never existed, a schema.org type that doesn't exist, and would happily
invent a star rating. Prompts are guidance; code is a guarantee. Three enforcement layers:

- **PROMPT** — `SeoGeneration.*.md`, guidance the LLM usually follows. Non-deterministic.
- **CODE** — deterministic guardrails that repair/override the model regardless of output
  (`controllers/admin-websites/feature-utils/util.*.ts`, `feature-services/service.seo-*.ts`).
- **RENDERER** — the `website-renderer` repo emits the final tags/URLs at serve time — the
  last line of defense, and the only place that knows the true serving host + path.

---

## 1. Schema.org structured data

- **Never invent a schema.org `@type`.** "Endodontist" and "Orthodontist" are NOT real
  schema.org types — Google drops the entire block. Use `Dentist` (or `MedicalBusiness` /
  `MedicalClinic`) for any dental/ortho/endo practice; convey the specialty via `knowsAbout`,
  `description`, `medicalSpecialty`.
  _Prompt:_ `significant.md`. _Code:_ `util.schema-business-type.ts` (allowlist + fallback to
  `MedicalBusiness`, applied in `service.seo-enrichment.ts`).
- **`aggregateRating` must be REAL and never LLM-authored.** A hallucinated rating/review
  count is a false claim about a real business. Injected from actual synced review data
  (`website_builder.reviews`, primary location), only onto a business entity that has an
  `address`.
  _Code:_ `util.aggregate-rating-schema.ts` + `service.seo-enrichment.ts` (`fetchProjectAggregateRating`).
- **Ratings live on the business, never on an article.** `aggregateRating` on a
  `BlogPosting`/`Article` is invalid, spam-adjacent markup Google can penalize.
- **`FAQPage` is built from sourced `faq_candidates`, never fabricated.** The GEO section
  produces `faq_candidates` only from VERIFIED PRACTICE FACTS / real page content; code
  converts those into `FAQPage`. The LLM must not hand-author FAQ Q&A into `schema_json`.
  _Prompt:_ `geo-layer.md` (sourced-only) + `significant.md` (don't hand-author). _Code:_
  `util.faq-schema.ts`.

## 2. Canonical URL

- **Never let the LLM write the canonical.** It fabricated plausible-but-dead paths
  (`/falls-church/root-canal-therapy`, which never existed) on ~380 posts. The canonical is
  100% deterministic: a page's real `path`, or `/{post_type.slug}/{post.slug}` for a post.
  _Prompt:_ `critical.md` (stops asking). _Code:_ `util.canonical-path.ts` +
  `service.seo-generation.ts` override on every generation path (single-section, generate-all,
  bulk worker). _Renderer:_ self-derives at serve time regardless of stored value.
- **Canonical must be absolute, on the ONE canonical host.** Relative canonicals (`/services`)
  fail to consolidate www vs non-www. _Renderer:_ `resolveCanonical` always emits
  `https://{primaryPublicHost}{path}`.
- **Unify www vs non-www.** Both hosts serving 200 = duplicate content. Pick one host (www for
  the established sites, matching their existing index + submitted sitemap), 301 the other to
  it, and make canonical + og:url + sitemap + robots ALL use that one host.
  _Renderer:_ `primaryPublicHost` + the host-unification redirect in `routes/site.ts`.
  _Caveat learned:_ client domains are heterogeneously configured (some bare domains dead,
  some sites still on WordPress) — verify a host actually resolves before any blanket redirect.

## 3. Social / Open Graph

- **`og:image` must be a REAL image URL, not a text description.** The generator wrote a good
  `og_image_recommendation` but never resolved it, so every shared link had no preview. Source
  from a post's `featured_image` (posts) or an operator-chosen asset (pages).
  _Code:_ `service.seo-enrichment.ts`. _Prompt:_ `moderate.md` (recommendation is advisory only).
- **`og:url` mirrors the canonical** (same absolute host + path). _Renderer._

## 4. Titles & descriptions

- **50–60 chars, keyword + city/state, front-loaded.** Over 60 truncates in search results.
  _Prompt:_ `critical.md`. _Code:_ `util.title-length.ts` trims over-length titles by dropping
  trailing pipe-delimited segments (never mid-word; a single-segment over-length title is left
  intact rather than mangled).
- **Homepage title is never the bare brand.** "Artful Orthodontics" (19 chars) wasted the
  most-ranked page. Homepage = `[primary service/keyword] in [City, ST] | [Practice name]`.
  _Prompt:_ `critical.md`.
- **Every published page AND post needs a real title + description.** 108 posts had none, so
  Google auto-guessed. Generation must cover all published content, not a subset — audit for
  zero-`seo_data` rows and generate them.

## 5. No fabrication (the rule the above all trace back to)

Only state specifics (numbers, ratings, credentials, dates, counts) backed by VERIFIED
PRACTICE FACTS or an explicit `business_data` field; omit otherwise. Generic-but-true
(service, city, practice name) is always safe. _Prompt:_ base `SeoGeneration.md`. This is
exactly WHY canonical/rating/og_image moved to code — the model cannot be trusted to
self-police factual fields.

## 6. GEO auto-apply (it rewrites visible body content)

SEO "Generate All" also **rewrites the page/post's visible body content** (prepends an
opening paragraph) whenever the GEO section returns an `opening_content_recommendation`. This
is a real, easily-overlooked side effect:
- It must be explicit and opt-out-able (`apply_geo_content` flag; metadata-only callers pass
  `false`). _Code:_ `service.seo-generation.ts`.
- Its recovery snapshot must actually work — `posts.previous_content` is `text`, not `jsonb`
  (a jsonb column silently crashed every snapshot, and 0 were ever recorded).
  _Code/migration:_ `PostModel.updateContentWithSnapshot`, migration `20260702000000`.

## 7. Delivery — SEO isn't done until it's served right (`website-renderer` repo)

- **Real 404** for unknown paths, never the homepage-with-200 soft-404 (else dead URLs never
  leave Google's index and broken links are invisible in Search Console).
- **Every site serves `sitemap.xml` + `robots.txt`**, built from published pages + posts on
  the canonical host, and submitted to Search Console.
- **Archived sites stop rendering** (410 Gone) — no publicly-live duplicate ghost sites.
- **Old/migrated URLs get 301s** to preserve accumulated link equity; land redirects BEFORE
  flipping soft-404s to real 404s or the equity dies.
- The production Redis is a cluster — pattern cache-flush must use `SCAN` + per-key `DEL`
  (`KEYS` / multi-key `DEL` are disabled; the old flush silently no-op'd).

## 8. Tooling & data-write safety

- **`seo_data` writes are full-column REPLACE, not merge.** Always read-patch-write, or a
  backfill silently drops existing correct fields.
- **The AI SEO Audit "Canonical" check must verify the canonical PATH matches the page**, not
  merely that a tag exists — presence-only scoring rated the original broken canonical 8/8 and
  hid the bug. _Code:_ frontend `seoPanel.utils.ts` `assessCanonical` (present + same-host +
  path-match; partial credit for same-host consolidation; hard-fail cross-host).

---

## Quick enforcement index

| Rule | Prompt | Code | Renderer |
|---|:--:|:--:|:--:|
| Valid schema `@type` | ✅ significant | ✅ util.schema-business-type | |
| Real aggregateRating only | ✅ significant/base | ✅ util.aggregate-rating-schema | |
| FAQPage from sourced candidates | ✅ geo-layer/significant | ✅ util.faq-schema | |
| Canonical never LLM-authored | ✅ critical/base | ✅ util.canonical-path | ✅ resolveCanonical |
| Absolute canonical, one host, www/non-www unified | | | ✅ primaryPublicHost + redirect |
| og:image is a real asset | ✅ moderate/base | ✅ service.seo-enrichment | |
| Title 50–60, homepage not bare brand | ✅ critical | ✅ util.title-length | |
| No fabrication | ✅ base | | |
| GEO auto-apply opt-out + working snapshot | | ✅ service.seo-generation + migration | |
| Real 404 / sitemap / robots / archived-gating | | | ✅ website-renderer |
| Audit canonical correctness | | ✅ seoPanel.utils assessCanonical | |
