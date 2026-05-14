# SerpApi Maps Rank Source

## Why

The current Google Maps estimate is sourced from Apify Maps and has shown materially wrong positions for real client-facing cases, especially One Endodontics Fredericksburg. We need the Maps estimate to sample from a tighter Google Maps-like coordinate search so the dashboard is more defensible.

## What

Replace the ranking pipeline's `search_position` source from Apify Maps to SerpApi Google Maps search, centered on the client's saved GBP coordinates at `15z`. Persist `serpapi_maps` as the source, keep the selected-competitor Google Maps list aligned to the same ordered result set, and leave other Apify-backed workflows untouched.

## Context

**Relevant files:**
- `src/controllers/practice-ranking/feature-services/service.apify.ts` — current `getSearchPositionViaApifyMaps` implementation and return shape to mirror.
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — Step 0 currently calls Apify for `search_position` and writes `search_results`.
- `src/controllers/practice-ranking/feature-services/service.ranking-resilience.ts` — existing retry helper to reuse for SerpApi calls.
- `src/database/migrations/20260428000005_add_search_position_source.ts` — existing source constraint; must be expanded for `serpapi_maps`.
- `src/models/PracticeRankingModel.ts` — `SearchPositionSource` type.
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — frontend source union/comments/demo data for latest-ranking payload.

**Patterns to follow:**
- Domain-specific external source wrapper under `src/controllers/practice-ranking/feature-services/`.
- Return a non-throwing `{ status, position, orderedResults, retryAttempts }` shape so the pipeline can degrade without aborting the whole ranking run.
- Use existing retry behavior via `runWithRetry` and `isRetryableExternalError`.

**Reference file:** `src/controllers/practice-ranking/feature-services/service.apify.ts` — closest analog for ranking source wrappers, error handling shape, ordered result normalization, and pipeline integration.

**Provider reference:** SerpApi Google Maps API documents `engine=google_maps`, `type=search`, `q`, `ll`, and `local_results.position` / `place_id`.

## Constraints

**Must:**
- Use the dynamic `searchQuery` already built by the pipeline: `{specialty} in {marketLocation}`.
- Use `ll=@{clientVantage.lat},{clientVantage.lng},15z` when coordinates exist.
- Match client identity by Google `place_id`, not title/name text.
- Persist `search_position_source = "serpapi_maps"` when SerpApi returns ordered results.
- Keep `search_results` aligned with the exact SerpApi ordered `local_results` array.
- Keep Apify available for competitor detail / review velocity, website builder GBP scrape, admin review fetch, and leadgen audit.
- Add DB migration support for the new source string.
- Avoid logging the SerpApi key.

**Must not:**
- Do not replace review velocity scraping in this pass.
- Do not change Practice Health scoring weights.
- Do not redesign the dashboard UI.
- Do not silently fall back to Apify for the Maps estimate.
- Do not add a new npm dependency; use existing `axios` or native `fetch`.

**Out of scope:**
- DataForSEO review velocity replacement.
- SerpApi cost dashboarding.
- Multi-point geo-grid rank tracking.
- Backfilling historical `search_position_source` rows.

## Risk

**Level:** 3 — new external ranking source plus DB constraint migration affects the client-facing headline Maps estimate.

**Risks identified:**
- **Schema write failure:** current DB check constraint only allows `apify_maps` and `places_text`. → **Mitigation:** create a Knex migration that drops/recreates the constraint with `serpapi_maps`.
- **Bad fallback reintroduces bad ranks:** using Apify as fallback could bring back the same inaccurate positions. → **Mitigation:** SerpApi failure falls back only to `places_text` when available, otherwise `api_error`.
- **Zoom sensitivity:** SerpApi output changed between `14z` and `15z` during the Fredericksburg test. → **Mitigation:** centralize the zoom as `SERPAPI_MAPS_ZOOM = "15z"` with comments and persist source details in timing/status metadata.
- **Provider rate-limit or missing key:** `SERPAPI_API_KEY` may be absent in some environments. → **Mitigation:** return `api_error` without throwing; pipeline keeps running and uses Places fallback if possible.
- **Trend comparability:** switching from Apify to SerpApi changes the source of historical rank deltas. → **Mitigation:** source union allows `serpapi_maps`; frontend/source-aware trend logic should suppress or avoid misleading comparisons across source changes if existing helper already does so for source cutovers.
- **Over-broad Apify removal:** Apify still powers data SerpApi should not replace yet. → **Mitigation:** only touch `search_position` and `search_results` path.

**Blast radius:**
- Ranking pipeline Step 0 persisted `search_position`, `search_results`, `search_status`, `search_position_source`.
- Rankings dashboard Google Maps estimate card.
- Rankings dashboard selected competitors in Google Maps list.
- Latest-ranking response consumers that read `searchPositionSource`.
- Admin ranking debug page display of source/search params, if any.

**Pushback:**
- Exact `#n` is still not a perfect truth. Even SerpApi can vary by zoom, session, Google experiment, and map viewport. The product should continue labeling this as an estimate. Future-us will hate this if we present SerpApi as "accurate rank" instead of "sampled Maps estimate."

## Tasks

### T1: Add SerpApi Maps rank wrapper
**Do:** Add `service.serpapi-maps.ts` with a `getSearchPositionViaSerpApiMaps(searchQuery, clientPlaceId, origin)` function. It should call SerpApi with `engine=google_maps`, `type=search`, `q`, `ll=@lat,lng,15z`, `hl=en`, `gl=us`; normalize `local_results` into the existing ordered result shape; return `ok`, `not_in_top_20`, or `api_error`; and use existing retry helpers.
**Files:** `src/controllers/practice-ranking/feature-services/service.serpapi-maps.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Wire SerpApi into ranking Step 0
**Do:** Replace `getSearchPositionViaApifyMaps` in Step 0 with the new SerpApi wrapper when `clientPlaceId` and `clientVantage` exist. Persist `serpapi_maps` on success/not-in-top-set. Preserve the Places fallback for SerpApi API errors. Update logs/timing detail from `apify_attempts` to `serpapi_attempts`.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`
**Depends on:** T1
**Verify:** local SerpApi smoke test for One Endodontics Fredericksburg returns position `#1` with `15z`; `npx tsc --noEmit`

### T3: Expand persisted source support
**Do:** Add a Knex migration to allow `serpapi_maps` in `practice_rankings_search_position_source_check`. Update backend and frontend source unions/comments/demo data as needed.
**Files:** `src/database/migrations/{timestamp}_allow_serpapi_search_position_source.ts`, `src/models/PracticeRankingModel.ts`, `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** none
**Verify:** migration compiles; `npx tsc --noEmit`; `cd frontend && npm run build`

### T4: Keep UI copy honest
**Do:** Ensure the dashboard still says estimate/sample where relevant. Do not add new raw rank claims. If source text/tooltips mention Apify specifically, change them to source-neutral "sampled Google Maps result".
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T2, T3
**Verify:** manual dashboard check: Maps estimate card and selected competitor list render with SerpApi ordered results and no Apify-specific wording.

## Done

- [x] `npx tsc --noEmit` passes or only unrelated pre-existing errors are documented.
- [x] `cd frontend && npm run build` passes.
- [x] `git diff --check` passes.
- [x] Manual: One Endodontics Fredericksburg SerpApi lookup uses `ll=@38.2238985,-77.5053993,15z` and returns the practice at `#1`.
- [x] Migration exists to allow `search_position_source = "serpapi_maps"` before the next ranking write.
- [x] Manual: Apify remains untouched for competitor detail/review velocity and website/review workflows.

## Verification Notes

- `npx eslint src/components/dashboard/RankingsDashboard.tsx` passes with one pre-existing `react-hooks/exhaustive-deps` warning on `fetchLatestRankings`.
- The live DB migration/rerank was not executed during local verification because the local environment may point at shared data.

## Post-Deploy Verification

- [ ] Apply `src/database/migrations/20260514000001_allow_serpapi_search_position_source.ts`.
- [ ] Run a fresh ranking snapshot.
- [ ] Confirm the new row persists `search_position_source = "serpapi_maps"`.
