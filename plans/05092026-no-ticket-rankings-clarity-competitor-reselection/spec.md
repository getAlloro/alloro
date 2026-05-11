# Rankings Clarity and Competitor Reselection

## Why
Users are confusing multiple ranking-style numbers as exact Google rankings. The product needs to separate sampled Google Maps visibility from Alloro's proprietary Practice Health scoring, then make competitor selection and reselection understandable without implying false precision.

## What
Redesign `/rankings`, the competitor selector, and the main dashboard ranking summary around clear source labels, estimate language, and a safe competitor reselection workflow. Users should understand what number is from a Google Maps snapshot, what number is Alloro's proprietary health/strength model, and when a new competitor set requires a new ranking run.

## Design Brief

**Primary UX model:**
- **Google Maps estimate** — sampled search snapshot from the configured query/location. This is not a guaranteed position every patient sees.
- **Practice Health** — Alloro's proprietary 0-100 score from ranking factors and competitor comparison.
- **Comparison set** — the competitors the user selected for Practice Health scoring.
- **Profile strength estimate** — selector-stage competitor strength from public profile signals only. This is not the final Practice Health score.

**Preferred labels:**
- Use `Google Maps estimate`, not `Search ranking`.
- Use `Practice Health`, not generic `Ranking Score`.
- Use `Alloro profile strength` or `Profile strength estimate`, not `Proprietary ranking`, in the selector.
- Use `Compared with selected competitors`, not `ranked against competitors`, when explaining cohort comparisons.
- Use `Latest snapshot` or `Checked {date}`, not `Live`, unless the data is truly streaming/current.
- Use `What's driving visibility` or `What's affecting your position`, not `What's driving your rank`.

**Tooltip copy:**
- Google Maps estimate: `Google Maps results vary by searcher location, device, timing, and personalization. This is a snapshot from the scan we ran for this market, not a guaranteed position every patient will see.`
- Practice Health: `Alloro's proprietary score based on profile completeness, reviews, ratings, category match, activity, and competitor context. It is designed to show market strength, not a live Google position.`
- Profile strength estimate: `Estimated from public signals available before the full ranking run: reviews, rating, category match, profile completeness, and proximity. Final Practice Health may differ after analysis.`
- Reselect competitors: `Changing competitors creates a new comparison set. Your current dashboard stays visible while Alloro recalculates the new ranking.`

**Number-display rules:**
- Do not show multiple large `#1/#2/#3` rank numbers in the same viewport.
- If a number is an estimate, label it as `Est.` or `snapshot`.
- Prefer tiers and prose in the competitor selector: `Strong`, `Competitive`, `Needs review`, `Not measured yet`.
- Show raw `rankPosition` only as prose such as `Ahead of 7 of 10 selected competitors`, not as a second hero rank.

## Design Reference

**Provided artifact:** `/Users/rustinedave/Desktop/Alloro Local Rankings.html`

**What to adopt from the design:**
- Page shell: warm off-white background, constrained `1320px` content width, quiet header, and generous section spacing.
- Header: `Market Intelligence`, `Local Rankings`, short explanatory copy, and a right-side metadata area for location/date.
- Insight banner: a single pale card for the ranking summary insight before the metric cards.
- Hero: two cards only — `Google Maps estimate` on the left and `Practice Health` on the right.
- Trend card: combined history for Maps estimate and Practice Health, but labeled as trend/snapshot data.
- Body grid: left column for Maps snapshot/results, drivers, and factor breakdown; right column for next moves and opportunities.
- Top results: list the top Google Maps snapshot and highlight the practice row with a `You` chip.
- Factors: compact weighted bars with cohort comparison microcopy.

**Required corrections to the provided design:**
- Replace the `Live` pill with `Latest snapshot` or `Checked {date}`.
- Rename `What's driving your rank` to `What's driving visibility`.
- Rename `Ranking trend` to `Visibility trend` or `Snapshot trend`.
- Keep `Top 5 on Google Maps`, but support tooltip copy that clarifies it is the top 5 from the sampled snapshot.
- Add a `Manage competitors` CTA in the page header; the provided design does not include this yet.
- Do not use the design's large `#4` treatment anywhere else on the page; one primary Maps estimate is enough.

## Competitor Reselection Design

Reselection should be a mode of the existing competitor selector, not a separate product surface.

**Entry point:**
- `/rankings` header CTA: `Manage competitors`.
- Route can reuse `/dashboard/competitors/:locationId/onboarding` with a reselection mode flag, or an equivalent route that renders the same selector components.

**Reselection header:**
- Title: `Manage comparison set`.
- Helper copy: `Changing competitors starts a new ranking run. Your current dashboard stays visible until the rerank finishes.`
- Status/meta: `{selectedCount} of {cap} selected`.

**Competitor row requirements:**
- Practice name linking to Google Maps.
- Rating and review count.
- Category and distance.
- `Maps estimate` chip:
  - `Est. #4` when persisted sampled position exists.
  - `Not measured yet` when no position exists.
- `Profile strength` chip:
  - `Strong`, `Competitive`, `Needs review`, or `Not measured yet`.
- Clear remove action.
- User-added competitors should be visually distinguishable but not treated as lower quality by default.

**Add/search behavior:**
- Keep autocomplete add flow.
- Cap remains enforced server-side and visually shown client-side.
- Added competitors can show `Not measured yet` until the next ranking scan has data.

**Sticky footer:**
- Primary CTA: `Save & rerun ranking`.
- Secondary action: `Cancel`.
- Footer copy: `This reruns the ranking only. It does not create tasks.`

**Processing return:**
- After save, redirect to `/rankings?batchId=...`.
- `/rankings` should continue showing the current completed result while showing a processing banner for the new competitor-set rerank.

## Current Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — current `/rankings` surface. Already contains `searchPosition`, `searchStatus`, `searchResults`, `rankScore`, `rankPosition`, and a note that avoids showing two competing rank numbers.
- `frontend/src/components/dashboard/focus/LocalRankingCard.tsx` — main dashboard ranking summary. Currently risks showing `rank_position` as local ranking instead of `search_position`.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` — competitor discovery/curation/finalize UI. Currently redirects finalized locations to `/rankings` and shows profile metadata only.
- `frontend/src/api/practiceRanking.ts` — frontend API/types for competitor onboarding and ranking status.
- `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx` — reference surface for the newer dashboard composition, spacing, section rhythm, and focused cards.
- `frontend/src/components/PMS/dashboard/PmsDashboardHero.tsx` — reference hero pattern for concise title, explanatory copy, and a single clear CTA.
- `src/controllers/practice-ranking/PracticeRankingController.ts` — ranking controller and competitor onboarding endpoints.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — discovery, add/remove, finalize-and-run lifecycle.
- `src/controllers/practice-ranking/feature-services/service.competitor-source-resolver.ts` — decides whether ranking uses curated competitors or discovered fallback.
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — creates search snapshot, ranking score, factors, LLM analysis, and persisted ranking row.
- `src/controllers/practice-ranking/feature-services/service.apify.ts` — Apify Maps snapshot path that returns ordered Maps results.
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts` — Places discovery path; currently sorts competitors by review count/rating, so list order is not defensible as Google rank.
- `src/controllers/practice-ranking/feature-services/service.ranking-algorithm.ts` — Practice Health and competitive score calculation.
- `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts` — recommendation prompt should use the clarified naming.
- `src/controllers/agents/feature-services/service.ranking-recommendations.ts` — monthly Summary currently pulls latest completed ranking recommendations; reselection reranks must be excluded if they are intended to never create tasks.
- `src/models/LocationCompetitorModel.ts` — current curated competitor table access; needs new source/estimate fields if estimates are persisted.
- `src/models/PracticeRankingModel.ts` — ranking row shape; should tie ranking results to the competitor set revision/snapshot.
- `src/routes/practiceRanking.ts` — thin route definitions for new reselection endpoint.
- `src/controllers/agents/feature-services/service.ranking-executor.ts` — scheduled ranking skips non-finalized locations; reselection must not leave locations in `curating`.

**Data available today:**
- `practice_rankings.search_position`, `search_query`, `search_status`, `search_results`, `search_checked_at`, and `search_position_source` can support Google Maps estimate UI.
- `practice_rankings.rank_score`, `rank_position`, `total_competitors`, `ranking_factors`, `raw_data`, and `llm_analysis` can support Practice Health, drivers, and recommendations.
- `location_competitors` has selected competitor identity/profile fields, but does not currently store discovery/search position or strength estimates.
- Current GSC-backed dashboard data is not a reliable foundation for this redesign because active GSC ranking data was not present during context review.

**Patterns to follow:**
- Frontend API calls go through typed API modules and React Query hooks where server state is shared.
- Backend flow remains Routes -> Controllers -> Services -> Models.
- DB writes spanning competitor list changes and ranking creation must use transactions.
- Use existing ranking pipeline and queue behavior instead of creating a parallel ranking runner.

**Reference file:** `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx` — closest current dashboard redesign structure.
**Design reference:** `/Users/rustinedave/Desktop/Alloro Local Rankings.html` — provided rankings layout to adapt, with the copy corrections above.

## Constraints

**Must:**
- Keep labels honest about source and precision.
- Preserve current ranking history while new competitor sets are processing.
- Keep `/rankings` visually coherent with the main dashboard and PMS statistics redesign.
- Keep competitor selector focused on choosing the comparison set, not overexplaining ranking math.
- Use one new atomic reselection flow: save selected competitors and trigger a new ranking run together.
- Keep locations `finalized` during reselection so scheduled rankings keep running.
- Store enough metadata to explain which competitor set a ranking result used.
- Reselection must trigger a ranking rerun only. It must not immediately create tasks, and it must not feed future task creation unless explicitly allowed.
- Keep new design components small enough to be maintainable; split `RankingsDashboard.tsx` if implementation touches it heavily.

**Must not:**
- Do not display current competitor list order as Google ranking.
- Do not call Places API discovery order a live Google Maps rank.
- Do not unlock finalized add/remove endpoints directly.
- Do not set finalized locations back to `curating` as part of reselection.
- Do not imply exact personalized ranking accuracy.
- Do not use GSC average position as a live patient-facing rank.
- Do not use `Live` language for sampled ranking snapshots.
- Do not allow competitor-reselection rerank rows to be consumed by Summary task generation by accident.
- Do not refactor unrelated dashboard, PMS, or ranking pipeline behavior.

**Out of scope:**
- New external vendor evaluation beyond the existing Apify/Places paths.
- A full geogrid/heatmap local rank tracker.
- Admin ranking dashboard redesign.
- Replacing the ranking algorithm.
- Website SEO recommendations outside existing `llm_analysis`/ranking factors.

## Risk

**Level:** 4

**Risks identified:**
- Mislabeling estimates as exact ranks will create the same client trust problem in a nicer UI. -> **Mitigation:** enforce source labels, tooltip copy, and number-display rules in the component design.
- The selector currently lacks defensible Maps rank data. -> **Mitigation:** add persisted discovery/search snapshot metadata before showing `Maps estimate`.
- Reselection can desync the saved competitor list from the ranking result being displayed. -> **Mitigation:** use `Save & rerun ranking`, keep old dashboard result visible, and persist competitor set revision/snapshot on the new ranking row.
- Reselection reranks could feed later Summary task creation through `fetchLatestRankingRecommendations`. -> **Mitigation:** tag rerank reason and exclude competitor-reselection rows from recommendation-to-task inputs unless product explicitly opts in.
- Scheduled rankings skip non-finalized locations. -> **Mitigation:** never move finalized locations back to `curating`; reselection should update the active set and create a new run while remaining finalized.
- `RankingsDashboard.tsx` is already large. -> **Mitigation:** implementation should extract focused ranking cards/sections rather than expanding the monolith.

**Blast radius:**
- Client `/rankings` tab in `Dashboard.tsx`.
- Main dashboard focus card via `LocalRankingCard`.
- Competitor onboarding route `/dashboard/competitors/:locationId/onboarding`.
- Practice ranking API routes and frontend API types.
- Ranking pipeline rows, scheduled ranking behavior, and latest ranking formatter.
- Existing finalized competitor lists and historical ranking rows.

**Pushback:**
- Showing a proprietary score ranking and Google rank side by side as two primary numbers is the wrong product shape. Future-us will be explaining why they disagree. The better pattern is one primary visibility estimate, one proprietary health score, and cohort rank as prose.
- Reselecting competitors by simply reopening finalized add/remove endpoints is unsafe. It introduces an intermediate state where the current ranking no longer matches the saved competitor list. Use an atomic reselection-and-run endpoint.
- "Rerun ranking" is not the same as "run the whole monthly task pipeline." This doesn't belong in the Summary task path unless explicitly requested.

## Tasks

### T1: Data Contract and Migration
**Do:** Add schema support for explainable competitor estimates and ranking-to-competitor-set traceability. Proposed fields:
- `location_competitors.discovery_position` nullable integer.
- `location_competitors.discovery_query` nullable text.
- `location_competitors.discovery_source` nullable string constrained to known source values such as `apify_maps`, `places_text`, `user_added`, `unknown`.
- `location_competitors.discovery_checked_at` nullable timestamp.
- `location_competitors.profile_strength_score` nullable numeric.
- `location_competitors.profile_strength_tier` nullable string constrained to `strong`, `competitive`, `needs_review`, `not_measured`.
- `location_competitors.profile_strength_factors` nullable jsonb.
- `locations.competitor_set_revision` integer default `1`.
- `practice_rankings.competitor_set_revision` nullable integer.
- `practice_rankings.competitor_snapshot` nullable jsonb containing the selected place IDs/names/source/revision used for that run.
- `practice_rankings.run_reason` nullable string constrained to values such as `scheduled`, `manual`, `first_competitor_finalize`, `competitor_reselection`, `retry`.
- `practice_rankings.include_in_summary_recommendations` boolean default `true`; set `false` for competitor-reselection reranks so they do not feed task creation.
**Files:** `src/database/migrations/*`, `src/models/LocationCompetitorModel.ts`, `src/models/PracticeRankingModel.ts`
**Depends on:** none
**Verify:** migration runs up/down locally; model types match schema; existing rows backfill safely.

### T2: Maps Estimate and Profile Strength Service
**Do:** Create a backend service that can attach selector-safe estimates to competitors. Preserve ordered Apify Maps snapshot positions when available. Never derive Maps estimate from the current `location_competitors` display order. Compute profile strength from public selector-stage fields and return a tier-first result.
**Files:** `src/controllers/practice-ranking/feature-services/*`, `src/models/LocationCompetitorModel.ts`
**Depends on:** T1
**Verify:** unit or service-level checks for competitors with Apify position, Places-only data, user-added entries, and no measurable data.

### T3: Competitor Reselection Endpoint
**Do:** Add an atomic endpoint for finalized locations to replace the active selected competitor set and trigger a new ranking. The operation must:
- validate place IDs and cap rules;
- soft-remove competitors not in the new set;
- revive or insert selected competitors;
- increment `competitor_set_revision`;
- snapshot the selected competitor set into the new `practice_rankings` row;
- set `run_reason='competitor_reselection'`;
- set `include_in_summary_recommendations=false`;
- leave the location status as `finalized`;
- reuse existing dedupe/in-flight behavior where appropriate;
- return `batchId`, `rankingId`, `competitorSetRevision`, and `reused`.
**Files:** `src/routes/practiceRanking.ts`, `src/controllers/practice-ranking/PracticeRankingController.ts`, `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`, `src/models/LocationCompetitorModel.ts`, `src/models/PracticeRankingModel.ts`
**Depends on:** T1
**Verify:** API tests or manual API checks for finalized reselect, cap reached, duplicate place IDs, empty selection, in-flight dedupe, and rollback on partial failure.

### T4: Ranking Pipeline Revision/Snapshot Awareness
**Do:** Ensure new ranking rows created from finalize or reselection persist competitor set revision and snapshot. Ensure latest ranking responses expose enough metadata for the dashboard to show whether a new competitor set is processing and which set the current result reflects.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts`, `src/controllers/practice-ranking/feature-services/service.competitor-source-resolver.ts`, `src/models/PracticeRankingModel.ts`
**Depends on:** T1, T3
**Verify:** latest ranking response includes revision/snapshot metadata; existing historical rows remain readable with null revision.

### T5: `/rankings` Dashboard Redesign
**Do:** Redesign `/rankings` around the clarified information architecture:
- top section: match the provided `Alloro Local Rankings.html` design reference, with one primary CTA to `Manage competitors`;
- right-side metadata should say `Latest snapshot` or `Checked {date}`, not `Live`;
- insight banner appears above the hero cards when `llmAnalysis.client_summary` exists;
- primary card: `Google Maps estimate` with source/query/date/status and exact tooltip;
- secondary card: `Practice Health` with Alloro score and drivers, not a competing rank number;
- cohort prose: `Ahead of X of Y selected competitors`;
- status states for `ok`, `not_in_top_20`, `bias_unavailable`, and `api_error`;
- processing state when a reselection-triggered ranking is in flight;
- top Maps results table/card labeled as a snapshot, not universal truth;
- trend card label should be `Visibility trend` or `Snapshot trend`, not generic `Ranking trend`;
- drivers card label should be `What's driving visibility`, not `What's driving your rank`;
- body layout follows the provided two-column design: Maps results/drivers/factors left, next moves/opportunities right.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx` plus extracted components under `frontend/src/components/dashboard/rankings/` if needed.
**Depends on:** T4 for final data contract; design can proceed from this spec before backend execution.
**Verify:** desktop/mobile visual QA; no duplicate hero-rank confusion; tooltips present; empty/error/processing states rendered.

### T6: Competitor Selector Redesign
**Do:** Update the selector for both first-time curation and reselection:
- show current selected competitors with `Maps estimate` and `Profile strength` chips;
- show `Not measured yet` for user-added or unmeasured competitors;
- add reselection header `Manage comparison set`;
- show `{selectedCount} of {cap} selected`;
- keep add/remove behavior clear and capped;
- add reselection copy and CTA `Save & rerun ranking`;
- sticky footer includes `Cancel` and copy stating this reruns ranking only and does not create tasks;
- do not bounce finalized users away when opened in reselection mode;
- after save, redirect to `/rankings?batchId=...` and show processing state.
**Files:** `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` plus extracted components under `frontend/src/pages/competitor-onboarding/` if needed, `frontend/src/api/practiceRanking.ts`
**Depends on:** T2, T3
**Verify:** first-time onboarding still works; finalized reselection works; keyboard/focus behavior remains usable; mobile rows do not overflow.

### T7: Main Dashboard Ranking Card Alignment
**Do:** Update the main dashboard ranking card to match the new semantics. It should use `searchPosition` for Maps estimate if available, use Practice Health for proprietary score, and avoid showing `rank_position` as local ranking.
**Files:** `frontend/src/components/dashboard/focus/LocalRankingCard.tsx`, `src/utils/dashboard-metrics/service.dashboard-metrics.ts`, `frontend/src/types/dashboardMetrics.ts` if the backend dashboard metric contract changes.
**Depends on:** T4
**Verify:** main dashboard no longer contradicts `/rankings`; old/no-ranking states remain clear.

### T8: Ranking Agent Language and Task Guardrail
**Do:** Update LLM/ranking recommendation language so generated recommendations treat `search_position` as a Maps estimate and `rank_position` as Practice Health cohort position. Avoid language that implies exact universal search rank. Also enforce rerank-only behavior:
- ranking analysis itself must not create USER tasks;
- competitor-reselection rerank rows must not be selected by `fetchLatestRankingRecommendations` for future Summary task generation;
- if future product wants reselection recommendations to feed Summary, that must be an explicit opt-in by flipping `include_in_summary_recommendations`.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`, `src/controllers/agents/feature-services/service.ranking-recommendations.ts`, `src/controllers/agents/feature-services/service.agent-orchestrator.ts` if logging/input explanation changes.
**Depends on:** T4
**Verify:** generated prompt/input naming is unambiguous; no UI copy regresses to generic `ranking`; competitor-reselection reranks do not create immediate tasks and are ignored by future Summary recommendation fetches.

### T9: Verification and Design QA
**Do:** Run the full verification pass after implementation and capture screenshots for the design surfaces.
**Files:** touched implementation files
**Depends on:** T5, T6, T7, T8
**Verify:** `npx tsc --noEmit`; targeted lint on touched frontend/backend files; frontend build; manual smoke for `/rankings`, `/dashboard`, `/pmsStatistics`, first-time competitor curation, finalized competitor reselection, and ranking in-flight state.

## Dependency Plan

Sequential core:
- T1 -> T2/T3 -> T4 -> T5/T6/T7/T8 -> T9

Parallelizable after data contract:
- T2 and T3 can be built in parallel if write scopes stay separate.
- T5 and T6 can be designed in parallel once the response contract is agreed.
- T7 and T8 are smaller follow-up tasks after T4.

For execution, this is a large plan. Use worker sub-agents only if tasks are split by file ownership:
- Backend worker: T1-T4.
- Rankings UI worker: T5.
- Competitor selector UI worker: T6.
- Dashboard/LLM cleanup worker: T7-T8.

## Design Agent Handoff Notes

The design agent should focus on frontend structure and copy, not backend implementation. Assume backend can provide these optional fields on competitor rows:
- `mapsEstimatePosition`
- `mapsEstimateQuery`
- `mapsEstimateSource`
- `mapsEstimateCheckedAt`
- `profileStrengthScore`
- `profileStrengthTier`
- `profileStrengthFactors`

The design should still work if those fields are null. Null state copy should be `Not measured yet`, not `Unknown rank`.

The dashboard should feel like the newer PMS statistics dashboard: concise hero, disciplined sections, compact cards, clear CTAs, no decorative marketing layout, no giant competing numbers.

The provided HTML design is accepted as the `/rankings` visual baseline with three required copy changes: no `Live` pill for sampled snapshots, no `What's driving your rank`, and no generic `Ranking trend`.

The competitor reselection design still needs to be created. It should reuse the same calm card language as the rankings design, but prioritize selection clarity over analytics depth.

## Revision Log

### Rev 1 — 2026-05-10
**Change:** Added provided rankings HTML design as the visual reference, added missing competitor reselection screen requirements, and clarified rerank-only behavior.
**Reason:** The design asset covers the rankings dashboard but does not include competitor reselection, and reselection must not create tasks or feed future Summary task generation by accident.
**Updated Done criteria:** Added snapshot-language, reselection-design, and rerank-only checks.

### Rev 2 — 2026-05-10
**Change:** Replace the remaining legacy rankings page shell with the HTML design's actual composition: in-content page title, compact snapshot pill, two-card hero, visibility trend card, and body grid rhythm.
**Reason:** The first implementation changed labels and backend semantics but left the page visually too close to the previous dashboard.
**Updated Done criteria:** `/rankings` should no longer render the old sticky page header composition and must include the visibility trend card when history exists.

### Rev 3 — 2026-05-10
**Change:** Tighten visual fidelity to the provided design: ensure serif hierarchy renders through `font-display`, replace the custom SVG visibility graph with the PMS/Recharts chart pattern, and replace the old `Market Intelligence / Loading data...` header with the animated Lottie loading treatment used by the main dashboard/PMS surfaces.
**Reason:** The redesigned page still visually read like the legacy dashboard because loading, charting, and some headline/number typography did not match the accepted mock.
**Updated Done criteria:** `/rankings` loading must not show `Loading data...`, the trend graph must use Recharts/PMS chart styling, and primary ranking/health numbers must render with the serif display stack.

### Rev 4 — 2026-05-10
**Change:** Remove the redundant reselection page header/pill copy (`Manage Competitors` / `Rerank only`) and constrain the competitor map/list workspace so the map is shorter while the selected competitor list scrolls internally.
**Reason:** The header duplicated the page purpose and the full-height map made the competitor list hard to manage when the selected set is full.
**Updated Done criteria:** Reselection mode should not show `Manage Competitors` or `Rerank only`, and the competitor list should scroll inside its panel beside a shorter fixed-height map.

## Done
- [ ] Plan migrations are implemented and reversible.
- [ ] `npx tsc --noEmit` passes or only pre-existing unrelated errors are documented.
- [ ] Targeted lint passes for touched frontend/backend files.
- [ ] Frontend build passes.
- [ ] `/rankings` uses `Google Maps estimate` and `Practice Health` labels consistently.
- [ ] `/rankings` adapts `/Users/rustinedave/Desktop/Alloro Local Rankings.html` with the required copy corrections.
- [ ] `/rankings` loading uses the animated Lottie loader and does not show `Market Intelligence / Loading data...`.
- [ ] `/rankings` visibility graph uses the PMS/Recharts chart treatment instead of a hand-drawn SVG path.
- [ ] `/rankings` primary headings and numbers use the Fraunces/Literata serif display stack where the design expects serif typography.
- [ ] `/rankings` uses `Latest snapshot` or `Checked {date}` instead of `Live` for sampled search data.
- [ ] `/rankings` uses `What's driving visibility` and `Visibility trend`/`Snapshot trend` wording.
- [ ] Main dashboard ranking card no longer shows proprietary cohort rank as local Google rank.
- [ ] Competitor selector shows estimate/tier context without deriving Maps rank from sorted list order.
- [ ] Competitor reselection mode has a complete design: `Manage comparison set`, selected count, estimate/strength chips, sticky `Save & rerun ranking` footer, and cancel action.
- [ ] Competitor reselection mode does not show the redundant `Manage Competitors` / `Rerank only` header and uses a shorter map with an internally scrollable competitor list.
- [ ] Finalized users can reselect competitors through `Save & rerun ranking`.
- [ ] Competitor-reselection reranks do not create immediate tasks and do not feed future Summary task generation unless explicitly opted in.
- [ ] Current dashboard result remains visible while a new competitor-set ranking is processing.
- [ ] Scheduled rankings continue to include finalized locations after reselection.
- [ ] Manual UI QA covers desktop and mobile for `/rankings`, `/dashboard`, `/pmsStatistics`, and competitor reselection.
