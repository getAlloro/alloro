# Ranking Refresh Actions

## Why
Falls Church needs a direct rerun path from the rankings dashboard, and the comparison-set page should make returning to rankings obvious.

## What
Update the rankings UI so the snapshot card shows only the date, exposes a `Refresh Rankings` action before `Manage competitors`, and make the comparison-set eyebrow a back link.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — renders the rankings page snapshot controls.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` — renders manage comparison set and save/rerun action.
- `frontend/src/api/practiceRanking.ts` — already exposes `reselectAndRun()`.

**Patterns to follow:**
- Reuse the existing `Save & rerun ranking` endpoint instead of adding a parallel backend action.

## Constraints

**Must:**
- Use the current selected competitor place IDs.
- Show the existing in-flight ranking banner after refresh starts.
- Keep `Manage competitors` as a separate path.

**Must not:**
- Create tasks from this rerun.
- Add a new backend route unless the existing endpoint cannot support the flow.
- Change competitor selection state from the dashboard.

## Risk

**Level:** 2

**Risks identified:**
- The button triggers a real ranking run -> **Mitigation:** reuse `reselect-and-run`, which is already rerank-only and in-flight deduped.
- Missing place IDs would cause an invalid rerun -> **Mitigation:** disable the button when no selected competitor IDs are available.

**Blast radius:** rankings dashboard, comparison-set page only.

## Tasks

### T1: Dashboard Refresh Action
**Do:** Add `Refresh Rankings`, remove location name from latest snapshot, and route success into the batch banner.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** none
**Verify:** `npm run build`

### T2: Comparison Back Link
**Do:** Replace `Comparison set` eyebrow in reselect mode with a back-to-rankings arrow link.
**Files:** `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`
**Depends on:** none
**Verify:** `npx eslint src/components/dashboard/RankingsDashboard.tsx src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`

## Done
- [x] `npm run build` passes in `frontend`
- [x] Touched-file lint passes or only pre-existing global lint failures remain
- [x] Dashboard refresh button uses current competitor set
- [x] Comparison page has a clear back link to rankings
