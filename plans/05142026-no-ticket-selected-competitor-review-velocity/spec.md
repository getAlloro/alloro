# Selected Competitor Review Velocity

## Why
Competitor review velocity currently shows `+0 in 30d` after curated metadata reuse, even when no competitor review dates were measured. That is misleading and undermines the rankings dashboard.

## What
Measure review velocity only for the selected competitor set by running Apify detail scraping for those competitors when needed. Cache the measured velocity briefly, persist source metadata, and make the comparison modal show unknown velocity honestly instead of fake zeroes.

## Context

**Relevant files:**
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — ranking orchestration, curated competitor reuse, raw ranking payload persistence.
- `src/controllers/practice-ranking/feature-services/service.apify.ts` — existing Apify detail scraper that can count recent reviews.
- `frontend/src/components/dashboard/rankings/competitorComparison.ts` — builds modal rows and leadership copy from ranking raw data.
- `frontend/src/components/dashboard/rankings/CompetitorComparisonTable.tsx` — renders comparison table cells.

**Patterns to follow:**
- Existing ranking retry boundary around `getCompetitorDetails()`.
- Existing `raw_data.pipeline_timings` shape for named step telemetry.
- Existing comparison modal row derivation from `rawData.competitors`.

## Constraints

**Must:**
- Use Apify only for selected competitors, not broad discovery.
- Cache measured selected-competitor velocity for a short window to avoid repeated scrapes.
- Mark velocity source/status so UI can distinguish measured zero from not measured.
- Keep current Practice Health scoring methodology unchanged unless explicitly planned later.

**Must not:**
- Show `+0 in 30d` for unmeasured competitor velocity.
- Add a new vendor or dependency.
- Touch unrelated Rybbit/admin integration work currently dirty in the tree.

**Out of scope:**
- Historical Places snapshot velocity computation.
- Database schema changes.
- Reworking ranking algorithm weights.

## Risk

**Level:** 2

**Risks identified:**
- Extra Apify detail scrape can add 25-45s to selected-competitor ranking runs. → **Mitigation:** selected-only scrape with cache reuse.
- Feeding newly scraped velocity into Practice Health could silently change scores. → **Mitigation:** persist as comparison metadata first; do not change ranking score inputs.
- Apify failure could reintroduce fake zeroes. → **Mitigation:** store `unknown`/`not_measured` source and render as unavailable.

**Blast radius:**
- Rankings pipeline run duration for curated competitor locations.
- Latest ranking response payload shape under `raw_data.competitors`.
- Practice Health comparison modal only.

## Tasks

### T1: Backend selected velocity enrichment
**Do:** Add selected-only velocity enrichment after competitor details are resolved. Reuse recent measured velocity from prior ranking rows when fresh; scrape missing selected competitors with Apify; merge `reviewsLast30d`, `reviewsLast90d`, `reviewVelocitySource`, and measured timestamp into persisted competitor raw data without altering score calculation.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`
**Depends on:** none
**Verify:** Run TypeScript check and inspect latest-ranking payload shape.

### T2: Frontend honest velocity display
**Do:** Extend comparison row types with velocity source/status and render unmeasured competitor velocity as `Not measured` instead of `+0 / 30d`. Keep measured zero as `+0 / 30d`.
**Files:** `frontend/src/components/dashboard/rankings/competitorComparison.ts`, `frontend/src/components/dashboard/rankings/CompetitorComparisonTable.tsx`
**Depends on:** T1
**Verify:** Targeted ESLint/build.

## Done
- [x] Ranking raw data distinguishes measured vs unmeasured competitor velocity.
- [x] Selected competitor comparison no longer displays fake `+0 / 30d`.
- [x] Existing Practice Health score calculation remains unchanged.
- [x] `npm run build` in `frontend` passes.
- [x] Targeted TypeScript/ESLint checks pass or only pre-existing issues are noted.
