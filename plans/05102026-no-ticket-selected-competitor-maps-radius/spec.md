# Selected Competitor Maps and Radius Discovery

## Why
The rankings dashboard currently mixes two mental models: the user-selected comparison set drives Practice Health, while the Google Maps list shows raw Google results that may include competitors the user intentionally excluded. This creates confusion and makes competitor selection feel disconnected from the dashboard.

## What
Unify competitor selection with the rankings display by showing selected competitors' estimated Google Maps positions, while keeping the practice's own `Google Maps estimate` unchanged. Add a radius control to competitor selection so users can refresh automated suggestions within a chosen market radius, still manually add Google Maps profiles, then save and rerun to update Practice Health and the selected-competitor Maps snapshot.

## Product Model

**Keep:**
- The practice hero card remains `Google Maps estimate #X`.
- Practice Health remains Alloro's proprietary score against the saved comparison set.
- Users can manually add any Google Maps/GBP profile.

**Change:**
- Replace `Top 5 on Google Maps` with `Selected competitors in Google Maps`.
- The dashboard should only show competitors in the saved selected set.
- Do not renumber selected competitors. If selected competitors F, D, and C are #3, #4, and #6 in the sampled Maps snapshot, display `Est. #3`, `Est. #4`, and `Est. #6`.
- Selected competitors not found in the sampled top set should show `Not in top 20` or `Not measured yet`, depending on whether the snapshot completed.
- Radius controls automated discovery suggestions only. It is not a promise that Google Maps ranking itself is radius-bound.

**Recommended labels:**
- Dashboard list: `Selected competitors in Google Maps`
- Tooltip: `These are the competitors in your saved comparison set, shown with their position in the latest sampled Google Maps snapshot when available. Other Google results are hidden because they are not part of your selected comparison set.`
- Radius UI: `Suggestion radius`
- Radius helper: `Refresh automated suggestions within this radius. Your saved comparison set changes only when you save and rerun.`

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — renders the Maps result list and owns the labels users are reacting to.
- `frontend/src/components/dashboard/rankings/VisibilityTrendCard.tsx` — new rankings chart component; not the primary target, but part of the redesigned rankings surface.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` — current selector/reselection UI, selected list, map, add/remove/search flow.
- `frontend/src/api/practiceRanking.ts` — typed frontend API for competitor discovery, selection, finalize, and reselection.
- `src/controllers/practice-ranking/PracticeRankingController.ts` — controller for latest ranking, history, competitor discovery, add/remove, finalize, and reselect endpoints.
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — creates `search_position`, `search_results`, and then resolves selected competitors for Practice Health.
- `src/controllers/practice-ranking/feature-services/service.competitor-source-resolver.ts` — current decision point where finalized locations use curated competitors for Practice Health only.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — discovery, selector metadata, finalize/reselect flow, competitor snapshots.
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts` — Places Text Search discovery path; accepts `locationBias.radiusMeters`.
- `src/controllers/practice-ranking/feature-services/service.apify.ts` — Apify Maps snapshot path for practice `searchPosition` and ordered `searchResults`.
- `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts` — best place to expose derived selected-competitor Maps positions to the frontend.
- `src/models/LocationCompetitorModel.ts` — location competitor fields and selected-set revision.
- `src/models/LocationModel.ts` — location-level settings, likely home for persistent suggestion radius.
- `src/models/PracticeRankingModel.ts` — ranking row fields and JSON parsing.

**Patterns to follow:**
- Routes stay thin; controller validates and delegates to services/models.
- Use the existing ranking row `search_results` as the source of Maps estimated positions.
- Use `competitor_snapshot` as the selected set for the ranking row being displayed, not the current mutable active list.
- Keep selector API typed in `frontend/src/api/practiceRanking.ts`.
- Keep dashboard labels precise: sampled, estimate, selected comparison set.

**Reference file:** `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts` — closest existing formatter for computed dashboard response fields.
**Reference file:** `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — closest existing service for discovery/finalize/reselect lifecycle.
**Reference file:** `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` — existing selector UI to extend, not replace.

## Constraints

**Must:**
- Preserve the practice's own `searchPosition` and hero card.
- Keep actual estimated positions from the Maps snapshot; never renumber selected competitors after filtering.
- Use the ranking row's `competitor_snapshot` so historical dashboards reflect the competitor set used by that run.
- Keep unselected Google results hidden from the selected-competitor dashboard list.
- Add radius as a discovery/suggestion control, not as an exact ranking accuracy control.
- Keep manually added Google profiles supported.
- Ensure selected set changes only apply after explicit save/rerun.
- Store enough radius metadata to explain how suggestions were generated.
- Keep competitor-reselection reruns as rerank-only; do not create tasks.

**Must not:**
- Do not call the filtered selected list `Top 5 on Google Maps`.
- Do not mutate a finalized selected set just because the user changed radius.
- Do not imply radius controls personalized Google Maps ranking.
- Do not derive selected competitor Maps positions from the visual list order.
- Do not replace Practice Health criteria with raw Maps position. Practice Health still uses scoring factors.
- Do not remove manual add/search.
- Do not refactor unrelated ranking/task/PMS/dashboard code.

**Out of scope:**
- Geogrid heatmaps.
- True per-competitor rank scraping beyond matching selected place IDs against the same sampled Maps snapshot.
- A full vendor replacement for Apify or Places.
- Bulk competitor import.
- Admin dashboard parity.

## Risk

**Level:** 4

**Risks identified:**
- Filtering raw Google results by selected competitors can be misread as a true top ranking list. → **Mitigation:** rename the card to `Selected competitors in Google Maps`, keep original estimated positions, and show explicit `not in top 20` states.
- Radius is easy to misunderstand as "Google ranking within radius." → **Mitigation:** label it `Suggestion radius`; tooltip says it only refreshes automated suggestions.
- Current pipeline intentionally separates search results from curated competitors. Changing this silently would break assumptions. → **Mitigation:** do not change `search_position`; derive a new selected-competitor projection from `search_results + competitor_snapshot`.
- Finalized competitor sets could be mutated accidentally by radius refresh. → **Mitigation:** radius refresh in reselection mode returns candidates only; active selected set changes only on `Save & rerun ranking`.
- Historical rows may lack `competitor_snapshot` or selected radius metadata. → **Mitigation:** selected-competitor list falls back gracefully to raw legacy list or empty selected projection with explanatory copy.
- More Places searches can increase API spend. → **Mitigation:** debounce/manual refresh, radius presets, optional freshness window, and no search on every slider tick.

**Blast radius:**
- Client `/rankings` dashboard Maps list and LLM context.
- Competitor selector first-time and reselection modes.
- Practice ranking latest response contract.
- Location competitor discovery service.
- Scheduled/manual ranking pipeline metadata.
- Location and ranking model types.

**Pushback:**
- Calling this "unified Google ranking" would be sloppy. We are not making Google ranking exact; we are making the dashboard honor the user's chosen comparison set while preserving sampled Maps positions.
- A radius slider that auto-replaces selected competitors would be dangerous. Future-us would get support tickets from users who accidentally changed their comparison set. Use refreshable suggestions plus explicit save.
- If we want selected competitor positions to be accurate beyond the top 20 snapshot, that is a larger rank-tracking product. This spec only matches selected competitors against the same sampled snapshot we already collect.

## Tasks

### T1: Radius Metadata Migration
**Do:** Add persistent radius metadata for suggestion discovery and ranking snapshots:
- `locations.competitor_discovery_radius_meters` integer nullable/default `40234`.
- `location_competitors.discovery_radius_meters` integer nullable.
- `practice_rankings.competitor_discovery_radius_meters` integer nullable.
Backfill existing rows to `40234` where appropriate. Keep `practice_rankings.search_radius_meters` unchanged because that describes the ranking/search snapshot, not selector suggestions.
**Files:** `src/database/migrations/*`, `src/models/LocationModel.ts`, `src/models/LocationCompetitorModel.ts`, `src/models/PracticeRankingModel.ts`
**Depends on:** none
**Verify:** migration up/down; model types compile; existing rows readable.

### T2: Selected Competitor Maps Projection
**Do:** Derive a new response field from each ranking row:
- Input: `practice_rankings.search_results` plus `practice_rankings.competitor_snapshot`.
- Output: `selectedCompetitorSearchResults`.
- For each selected competitor, preserve its actual snapshot `position` when its `placeId` appears in `search_results`.
- If absent and `search_status='ok'` or `not_in_top_20`, return `position: null`, `status: 'not_in_top_20'`.
- If snapshot failed, return `status: 'not_measured'`.
- Sort measured competitors by actual Maps position, then unmeasured competitors alphabetically or by selected-set order.
**Files:** `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts`, `src/models/PracticeRankingModel.ts`, `frontend/src/api/practiceRanking.ts`
**Depends on:** none
**Verify:** formatter cases for measured selected competitors, hidden unselected competitors, selected-but-absent competitors, legacy rows without snapshots.

### T3: Ranking Pipeline Radius Awareness
**Do:** Use the location's saved `competitor_discovery_radius_meters` when running Places competitor discovery and persist that radius onto the ranking row. Keep Apify Maps `searchPosition` behavior unchanged unless the existing Apify wrapper explicitly supports a safe location/radius parameter. Add selected competitor position context to the LLM payload separately from raw top 5.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`, `src/controllers/practice-ranking/feature-services/service.competitor-source-resolver.ts`
**Depends on:** T1, T2
**Verify:** ranking rows store suggestion radius; Practice Health uses selected competitors; practice `searchPosition` still comes from the same snapshot logic.

### T4: Radius Discovery API
**Do:** Extend competitor discovery with radius input while preserving finalized-set safety:
- Existing `POST /locations/:locationId/competitors/discover` accepts `{ radiusMeters }` for first-time/non-finalized discovery.
- Add or extend an endpoint for reselection candidate refresh that returns suggested competitors for a radius without mutating the finalized selected set.
- Persist `locations.competitor_discovery_radius_meters` when the user applies/saves the radius.
- Store `discovery_radius_meters` on discovered competitor rows/candidates.
- Enforce sane presets/range server-side, e.g. 5, 10, 15, 25 miles or bounded meters.
**Files:** `src/routes/practiceRanking.ts`, `src/controllers/practice-ranking/PracticeRankingController.ts`, `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`, `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts`, `src/models/LocationCompetitorModel.ts`, `src/models/LocationModel.ts`
**Depends on:** T1
**Verify:** non-finalized discovery writes selected suggestions; finalized reselection candidate refresh does not mutate active competitors; invalid radius rejected.

### T5: Competitor Selector Radius UI
**Do:** Add a radius control to the selector/reselection screen:
- Presets or segmented control: `5 mi`, `10 mi`, `15 mi`, `25 mi`.
- CTA: `Refresh suggestions`.
- Copy: `Your saved comparison set changes only when you save and rerun.`
- Suggestions returned by radius refresh can be added to the selected list.
- Manual Google Maps search/add remains available.
- In reselection mode, selected list and suggestions should be visually separate enough that users know refresh does not overwrite their current list.
**Files:** `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`, `frontend/src/api/practiceRanking.ts`
**Depends on:** T4
**Verify:** radius refresh, add suggested competitor, manual add, remove, save/rerun, cap enforcement, mobile layout.

### T6: Rankings Dashboard Selected Competitor List
**Do:** Replace the raw Maps top-list card behavior:
- If `selectedCompetitorSearchResults` exists, render `Selected competitors in Google Maps`.
- Hide unselected Google results.
- Preserve actual positions (`Est. #3`, `Est. #6`) and do not renumber.
- Show `Not in top 20` or `Not measured yet` for selected competitors without a measured position.
- Keep optional raw snapshot out of the primary UI; if needed later, add as an explicit secondary disclosure.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`, possible extracted ranking section under `frontend/src/components/dashboard/rankings/`
**Depends on:** T2
**Verify:** selected-only list, legacy fallback, empty selected projection, measured/unmeasured rows, tooltip copy.

### T7: Rerun Contract and Summary Guardrail
**Do:** Ensure `Save & rerun ranking` persists the selected set, selected radius, competitor snapshot, and rerun metadata. Preserve current guardrail that competitor-reselection reruns do not create immediate tasks or feed Summary task generation unless explicitly opted in.
**Files:** `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`, `src/controllers/agents/feature-services/service.ranking-recommendations.ts`, `src/controllers/agents/feature-services/service.ranking-executor.ts`
**Depends on:** T1, T4
**Verify:** rerun row has selected set revision, snapshot, radius, and `include_in_summary_recommendations=false` for reselection.

### T8: Verification and Visual QA
**Do:** Verify code and UX:
- Typecheck backend.
- Frontend build.
- Targeted lint for touched frontend files.
- Manual UI QA for `/rankings`, competitor selector first-time mode, competitor reselection mode, radius refresh, save/rerun processing banner.
**Files:** touched implementation files
**Depends on:** T1-T7
**Verify:** `npx tsc --noEmit`, `npm run build` in frontend, targeted ESLint, browser smoke with authenticated session.

## Dependency Plan

Sequential core:
- T1 → T2/T4 → T3/T5/T6/T7 → T8

Parallelizable:
- T2 selected projection and T4 radius API can be built in parallel after T1.
- T5 selector UI and T6 dashboard UI can be built in parallel after their response contracts are stable.

For execution, this is large enough to split by ownership if sub-agents are explicitly requested:
- Backend worker: T1, T3, T4, T7.
- Dashboard UI worker: T2 frontend contract + T6.
- Selector UI worker: T5.

## Done
- [ ] Migration scaffold is replaced with reversible implementation.
- [ ] Radius metadata is stored on locations, discovered competitors, and ranking snapshots.
- [ ] Radius refresh can return suggestions without mutating finalized selected sets.
- [ ] Manual Google Maps profile add remains available.
- [ ] Dashboard primary practice `Google Maps estimate` remains unchanged.
- [ ] Dashboard selected competitor list hides unselected Google results.
- [ ] Selected competitors keep actual estimated Maps positions and are not renumbered.
- [ ] Selected-but-absent competitors show `Not in top 20` or `Not measured yet`.
- [ ] Practice Health criteria use the saved selected comparison set.
- [ ] `Save & rerun ranking` updates selected competitors and radius only on explicit save.
- [ ] Competitor-reselection reruns remain rerank-only and do not create tasks.
- [ ] `npx tsc --noEmit` passes.
- [ ] Frontend build passes.
- [ ] Targeted lint passes for touched frontend/backend files.
- [ ] Manual QA covers `/rankings` and competitor selector radius/reselection flows.

## Revision Log

### Rev 1 — 2026-05-10
**Change:** Add a `50 mi` suggestion-radius preset, render an animated translucent radius circle centered on the practice location in the selector map, and require confirmation before refreshing suggestions clears the current draft list.
**Reason:** The selector needs to communicate the geographic scope visually and avoid accidental loss of the user's draft comparison set.
**Updated Done criteria:** Radius presets include 50 mi; selecting a radius only updates the visual map circle; refresh confirmation displays `refreshing suggestions will clear the current list, proceed?`; confirmed refresh replaces the draft list with up to 10 best competitors inside the selected radius; 50 mi discovery samples multiple points across the selected circle instead of relying on one city-bound local query.

### Rev 2 — 2026-05-10
**Change:** Add a `100 mi` suggestion-radius preset.
**Reason:** Some markets need a wider comparison area than 50 miles.
**Updated Done criteria:** Radius presets include 100 mi in the selector UI and backend validation; 100 mi refresh uses the existing wide-radius multi-sample discovery path.

### Rev 3 — 2026-05-10
**Change:** Resolve manually added Google Maps competitors through a measured backend preview before adding them to the reselection draft list, and pan the selector map to the selected competitor pin when a row is clicked.
**Reason:** The autocomplete-only placeholder row has no profile details or coordinates, so manually added competitors show as unmeasured and cannot appear on the map.
**Updated Done criteria:** Manual add blocks on Places profile resolution; the added row includes rating/reviews/category/contact/coordinates when available; manually added rows render map pins; clicking a list row scrolls the map into view and pans to that pin; removing a row removes its pin from the map.

### Rev 4 — 2026-05-14
**Change:** Make 25 mi the recommended default radius in the selector/reselector UI, add a visible recommended badge/tooltip, and preserve local Google Places result order while filtering automated suggestions to the selected radius.
**Reason:** The default selector should favor competitors that appear in the local Maps query (for example, `endodontist in Falls Church, VA`) so the selected comparison set better matches the numbered Maps list. Wider 50/100 mi searches can remain broader exploratory modes where more competitors may be outside the top local snapshot.
**Updated Done criteria:** Verify the 25 mi control shows a recommended badge/tooltip, reselection opens on 25 mi, default discovery still resolves to 25 mi, and local-radius suggestions are ordered by sampled Maps position rather than profile strength.
