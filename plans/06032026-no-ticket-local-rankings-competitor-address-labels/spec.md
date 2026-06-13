# Local Rankings Competitor Address Labels

## Why
Falls Church Local Rankings shows repeated competitor names like "Dominion Endodontics" without enough context, making distinct GBP/Maps locations look like duplicate rows. The ranking is not necessarily wrong; the identity label is incomplete.

## What
Show competitor addresses as the secondary identity line in the Local Rankings competitor comparison table, including rows inside the Practice Health comparison modal/table. Keep the current ranking order and scores unchanged. Category should remain a fallback only when no address is available.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` - owns the Local Rankings dashboard and renders the competitor comparison section.
- `frontend/src/components/dashboard/rankings/competitorComparison.ts` - builds comparison rows; currently supports `address` but raw competitor fallback does not carry it.
- `frontend/src/components/dashboard/rankings/CompetitorComparisonTable.tsx` - renders the Practice column and already truncates the secondary line with a title tooltip.
- `frontend/src/api/practiceRanking.ts` - frontend response types for selected competitor search results.
- `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts` - formats latest ranking responses and selected competitor search results.
- `src/controllers/practice-ranking/PracticeRankingController.ts` - enriches latest ranking snapshots from active `location_competitors`.
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` - persists future `raw_data.competitors`; currently drops `address`.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` - freezes selected competitor snapshots; current snapshot type does not include address even though `location_competitors` has it.

**Patterns to follow:**
- Treat addresses as display-only metadata. Do not change ranking sort, scoring, or competitor inclusion.
- Prefer existing `placeId`-keyed enrichment from `location_competitors` rather than rerunning discovery or scraping.
- Keep table truncation plus full-value tooltip behavior, matching the existing `CompetitorComparisonTable` pattern.

**Reference file:** `frontend/src/components/dashboard/rankings/CompetitorComparisonTable.tsx` - existing row structure and tooltip/truncation behavior.

## Constraints

**Must:**
- Show full-width truncated address under the practice name where available.
- Preserve the full address in the `title` tooltip for truncated text.
- Keep category as fallback only when address is missing.
- Include addresses for repeated names such as Dominion so distinct locations are distinguishable.
- Preserve all ranking values, order, sorting semantics, review counts, velocities, ratings, and scores.
- Support existing latest snapshots by enriching from active `location_competitors` where possible.
- Persist address in future snapshots/raw data so the UI does not depend on fragile fallback paths.

**Must not:**
- Do not de-dupe competitors by name.
- Do not hide repeated competitor names.
- Do not trigger ranking reruns.
- Do not mutate historical ranking math.
- Do not alter competitor search or selector logic.
- Do not touch unrelated dirty files beyond the planned scope.

**Out of scope:**
- Fixing bad/missing addresses at source if Google Places/SerpApi did not provide them.
- Reranking Falls Church.
- Changing the competitor cap, sort defaults, or comparison metrics.
- Redesigning the full modal/table layout.

## Risk

**Level:** 2 - low behavioral risk, but this touches shared ranking response/display code and the current worktree is already dirty.

**Risks identified:**
- `RankingsDashboard.tsx` is already modified in the working tree. -> **Mitigation:** read current file state before execution and keep edits tightly scoped to the comparison/address path.
- Existing rows may lack addresses in `competitor_snapshot` and `raw_data.competitors`. -> **Mitigation:** enrich latest response from `location_competitors` by `placeId`, and preserve category fallback when address is unavailable.
- Adding address to future `raw_data.competitors` could be mistaken as a scoring change. -> **Mitigation:** keep it as an extra display field only; no scoring inputs, sorting, or LLM prompt behavior changes unless already using that field.
- Snapshot shapes may contain either `placeId` or `place_id`. -> **Mitigation:** normalize both keys when enriching and building display rows.

**Blast radius:**
- Local Rankings dashboard competitor comparison table.
- Practice Health comparison modal/table if it uses the same `CompetitorComparisonTable`.
- Latest rankings API response shape.
- Future ranking run `raw_data.competitors` payload shape.

**Pushback:**
- De-duping Dominion by name would be wrong. These are real distinct locations, and hiding them would damage accuracy.
- A pure CSS/text tweak is not enough if the address is dropped before the table receives it. Future-us will see the same bug again on older or fallback paths.

## Tasks

### T1: Preserve Competitor Addresses In Ranking Data
**Do:** Add `address` to future persisted competitor entries in `raw_data.competitors` and competitor snapshots where the source competitor already has an address. Keep address display-only.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`
**Depends on:** none
**Verify:** Manual/read-only: inspect a newly formatted competitor row shape and confirm `address` is present when source data has it.

### T2: Enrich Latest Responses For Existing Snapshots
**Do:** Make latest-ranking response enrichment normalize `placeId` and `place_id`, enrich both `competitor_snapshot.competitors` and `raw_data.competitors` from active `location_competitors` by place id, and keep null when no address exists.
**Files:** `src/controllers/practice-ranking/PracticeRankingController.ts`, `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts`
**Depends on:** T1
**Verify:** Manual/API: latest Falls Church ranking response includes address for repeated Dominion rows when active competitors have addresses.

### T3: Render Address As The Comparison Identity Line
**Do:** Extend comparison row types to carry address from selected search results and raw competitor fallback. Ensure the Practice column shows address first, category only as fallback, with truncation and full-address tooltip intact.
**Files:** `frontend/src/components/dashboard/rankings/competitorComparison.ts`, `frontend/src/components/dashboard/rankings/CompetitorComparisonTable.tsx`, `frontend/src/api/practiceRanking.ts`, `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T2
**Verify:** Manual/UI: repeated Dominion rows in Falls Church show different address lines under the practice name.

### T4: Verification
**Do:** Run focused type/build checks and manually inspect `/rankings` or the equivalent pilot/admin Local Rankings view.
**Files:** no production file changes
**Depends on:** T1, T2, T3
**Verify:** `npx tsc --noEmit`; `cd frontend && npm run build`; manual screenshot check for Falls Church repeated Dominion rows.

## Done
- [ ] `npx tsc --noEmit` passes or only unrelated pre-existing errors remain.
- [ ] `cd frontend && npm run build` passes.
- [ ] Manual: Falls Church competitor comparison table shows address under repeated Dominion rows.
- [ ] Manual: full address appears in tooltip/title when the address is truncated.
- [ ] Manual: rows without address still show category fallback.
- [ ] No competitor rows are removed, merged, or reordered except by the existing selected sort.
- [ ] No ranking rerun or ranking math change is introduced.
