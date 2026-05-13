# Selected Competitor Address Labels

## Why
The selected competitors list shows repeated practice names with only the specialty label underneath. That makes duplicate brands such as multiple Dominion Endodontics rows hard to distinguish.

## What
Replace the specialty/category sublabel in the selected competitors Google Maps card with the competitor address. Address text must truncate within the available row width and expose the full address via tooltip/title.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — renders the selected competitors Google Maps card.
- `frontend/src/api/practiceRanking.ts` — typed ranking response contract.
- `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts` — builds selected competitor projection from ranking snapshots.
- `src/controllers/practice-ranking/PracticeRankingController.ts` — latest rankings endpoint can enrich old snapshots from active competitor rows.

**Patterns to follow:**
- Keep the frontend as a presentational change. No client-side API calls from the component.
- Keep address enrichment in the backend response path so existing completed snapshots can render addresses without rerunning ranking.

## Constraints

**Must:**
- Show address instead of primary type/category in the selected competitor list.
- Truncate address with ellipsis inside the row.
- Provide full address in a tooltip/title.
- Preserve current rank/distance/rating/review display.

**Must not:**
- Do not mutate existing `practice_rankings` rows.
- Do not change ranking calculations or competitor sorting.
- Do not redesign other rankings cards.

**Out of scope:**
- New custom tooltip component.
- Backfilling historical ranking snapshots.
- Competitor selector map/list changes.

## Risk

**Level:** 2

**Risks identified:**
- Existing completed rows may not have address in `competitor_snapshot`. -> **Mitigation:** enrich latest response from active `location_competitors` by place ID.
- Address enrichment could drift if a historical snapshot differs from the current active set. -> **Mitigation:** only use this for display metadata; ranking order/metrics still come from the snapshot.

**Blast radius:**
- Client rankings dashboard selected competitor list.
- Latest rankings API response shape.

## Tasks

### T1: Address Contract
**Do:** Add address to selected competitor search result formatting and frontend type.
**Files:** `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts`, `frontend/src/api/practiceRanking.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Latest Row Enrichment
**Do:** Enrich selected competitor snapshots with active competitor addresses when serving latest rankings.
**Files:** `src/controllers/practice-ranking/PracticeRankingController.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Dashboard Label Swap
**Do:** Replace the primary type sublabel with truncated address text and a full-address tooltip.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

## Done
- [x] Selected competitor rows show address, not category.
- [x] Long addresses truncate with ellipsis and expose the full address via tooltip/title.
- [x] Current latest rankings can show addresses without rerunning ranking.
- [x] `npx tsc --noEmit` passes.
