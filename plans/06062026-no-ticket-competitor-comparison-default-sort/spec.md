# Competitor Comparison Default Sort — Review Count → Maps Position

## Why

The competitor comparison modal opens sorted by **review count** (`DEFAULT_SORT = "reviewCount"`). For engaged specialist clients whose comparison set is *already* specialty-filtered (May 10 `specialty-aware-competitor-filter`) and maps-sourced (May 14 `serpapi-maps-rank-source`), defaulting to review count surfaces whoever has the most reviews on top — which reads as "systematically wrong for engaged clients" (May 21 transcript: the comparison felt off even though selection is curated). The selection is already correct; the **default ordering** is the last piece making the comparison feel relevant. Maps position is the honest default: it shows the client and their curated competitors in the order Google actually ranks them for the client's specialty query.

**Explicitly NOT in this spec:** the "what does 67% mean" score-legibility concern that arrived with this intake. Investigation found the April-28 cohort-rank explanation line was *deliberately removed* (code comment: a "(curated-cohort) rank confused users"), and the deeper issue is that the shipped Practice Health score has **no referral component** while canon says a specialist's score should weight GP referral velocity 35%. That is a product/architecture decision ("Track B"), routed to Corey/CW, not an engineering change here.

## What

Change the comparison modal's default sort from `reviewCount` to `mapsPosition`. Done = opening the competitor comparison modal initially orders rows by sampled Google Maps position (best/lowest first, client placed by its real position, unmeasured rows last), while all existing user-selectable sort columns (Reviews, Velocity, Rating, Health) continue to work unchanged.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/rankings/CompetitorComparisonModal.tsx` — line 21 `const DEFAULT_SORT: ComparisonSortKey = "reviewCount";` and line 29 `useState<ComparisonSortKey>(DEFAULT_SORT)`. Single change point.
- `frontend/src/components/dashboard/rankings/competitorComparison.ts` — `sortComparisonRows` already handles `mapsPosition` (`higherIsBetter: false`, nulls sorted last, `isYou` tiebreak). No change needed; read-only reference for behavior.
- `frontend/src/components/dashboard/rankings/CompetitorComparisonTable.tsx` — renders columns (Maps first already). No change.

**Patterns to follow:**
- `ComparisonSortKey` union + `COMPARISON_SORT_OPTIONS` config already define `mapsPosition` with correct direction and formatting (`formatComparisonValue` → `#N`). Reuse as-is.

**Reference file:** `frontend/src/components/dashboard/rankings/competitorComparison.ts` — `sortComparisonRows` / `COMPARISON_SORT_OPTIONS` confirm `mapsPosition` is a first-class, already-tested sort key.

## Constraints

**Must:**
- Change only the default sort constant (and any directly-coupled default label if surfaced).
- Preserve the user's ability to re-sort by every existing column.
- Keep `mapsPosition` direction as `higherIsBetter: false` (lower position = better = top), per existing config.

**Must not:**
- Touch competitor selection/discovery logic (already shipped, May 10).
- Touch the Practice Health score / `rank_score` model (Track B).
- Touch backend, the ranking pipeline, or `sortRowsForMapsList` (separate maps-list helper).
- Add or change a migration (frontend-only).

**Out of scope:**
- Score legibility / "what does 67% mean" (Track B — Corey/CW).
- Competitor relevance/selection (already shipped).
- Maps-position data accuracy (in-flight: `serpapi-maps-rank-source`).

## Risk

**Level:** 2

**Risks identified:**
- Some competitor/client rows may have `mapsPosition = null` (not measured) → **Mitigation:** `sortComparisonRows` already pushes nulls to the end and preserves a stable `isYou`/name tiebreak; selected competitors are maps-sourced so positions are generally populated. No new code path.
- Sets where few rows have measured positions could open looking sparse at the top → **Mitigation:** acceptable and honest; user can re-sort to any column in one click; this is the intended default for a maps-curated set.

**Blast radius:**
- One constant in one modal's initial sort state. Customer-visible default view of the competitor comparison modal on `/rankings`. No data, no API, no other surface.

**Pushback:**
- It is effectively a one-line change, but it is a customer-visible default, so it correctly runs the full gate.

## Tasks

### T1: Change default comparison sort to maps position
**Do:** Set `DEFAULT_SORT` in `CompetitorComparisonModal.tsx` from `"reviewCount"` to `"mapsPosition"`. Confirm no other code assumes `reviewCount` is the initial key.
**Files:** `frontend/src/components/dashboard/rankings/CompetitorComparisonModal.tsx`
**Depends on:** none
**Verify:** `cd frontend && npm run build` (type-check) + Manual: open `/rankings` → open the competitor comparison modal → confirm it opens sorted by Maps (Est. #N, lowest first), and that clicking Reviews/Velocity/Rating/Health re-sorts correctly.

## Done
- [ ] `npx tsc --noEmit`
- [ ] `cd frontend && npm run build`
- [ ] Manual: `/rankings` → competitor comparison modal opens in Maps order; all other sort columns still work; client row positioned by its real maps position.

## Docs Parity
- Dashboard UI behavior change (default view of the competitor comparison modal). Check `/Users/rustinedave/Desktop/alloro-docs` for any competitor-comparison-modal screenshots/copy that state or show a review-count default; update if present. If none reference the default order, state so in the testing handoff.

## Data-Accuracy Precondition (SerpApi source)

Defaulting to maps position is only an *improvement* if the maps positions are accurate. Nulls-last handles **missing** data; it does not handle **wrong** data. Verified on `main`:

- Pipeline imports `getSearchPositionViaSerpApiMaps` and sets `searchPositionSource = "serpapi_maps"` at Step 0 (`service.ranking-pipeline.ts:18, 926/934`).
- `service.serpapi-maps.ts` exists; migration `20260514000001_allow_serpapi_search_position_source.ts` present.

So the code on `main` sources positions from SerpApi, not the old (materially-wrong) Apify maps. **Hard validation gate for Dave (prod-data state, not verifiable from the repo):** confirm the SerpApi source migration is applied in prod **and** that recent rankings are persisting `search_position_source = "serpapi_maps"` for active clients. If a client's latest ranking still carries `apify_maps` positions, the new default would order on stale/wrong data for that client until their next ranking refresh.

## Revision Log

- **2026-06-06 (execution):** Confirmed SerpApi maps source is wired on `main` (above). Implemented T1 (`DEFAULT_SORT: "reviewCount" → "mapsPosition"`). Added the Data-Accuracy Precondition section as a Dave-validation gate per cross-terminal review. Scope unchanged; the "67%" legibility concern remains folded into Track B (out of scope here).
