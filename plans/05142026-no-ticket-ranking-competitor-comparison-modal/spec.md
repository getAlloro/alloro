# Ranking Competitor Comparison Modal

## Why
The Practice Health card currently repeats a cohort rank sentence that feels less actionable than the actual factor comparison. Users need a clear way to inspect how their practice compares against selected competitors without adding more confusing headline numbers.

## What
Replace the Practice Health cohort sentence with a comparison CTA. The CTA opens a modal with sortable competitor factor rows, a plain-English leader summary, and the existing Ranking Factor Breakdown moved into that modal. The selected Google Maps list also includes and highlights the user's own practice.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — renders the Local Rankings dashboard, Practice Health card, selected Google Maps list, and factor breakdown.
- `frontend/src/components/dashboard/rankings/CompetitorComparisonModal.tsx` — new modal presentation component.
- `frontend/src/components/dashboard/rankings/CompetitorComparisonTable.tsx` — sortable comparison table presentation.
- `frontend/src/components/dashboard/rankings/competitorComparison.ts` — new deterministic comparison row helpers.

**Patterns to follow:**
- Modal animation pattern from `frontend/src/components/dashboard/focus/ProoflineModal.tsx`.
- Rankings card typography and spacing from `frontend/src/components/dashboard/RankingsDashboard.tsx`.

**Reference file:** `frontend/src/components/dashboard/focus/ProoflineModal.tsx` — closest modal structure.

## Constraints

**Must:**
- Use only existing ranking snapshot data.
- Keep comparison copy framed as a dashboard comparison, not an authoritative Google rank.
- Highlight the user's own practice in both the modal and selected Google Maps list.
- Keep the existing ranking factor breakdown data and tooltips intact.

**Must not:**
- Change ranking pipeline math.
- Add backend calls or new dependencies.
- Commit unrelated Rybbit integration changes or `.DS_Store`.

**Out of scope:**
- Backend snapshot schema changes.
- New rank calculations.
- Competitor selector changes.

## Risk

**Level:** 2

**Risks identified:**
- Duplicate competitor names can make naive joins misleading → **Mitigation:** match selected competitors to raw competitor data by unused normalized name first, then fall back to array position.
- Sorting language can imply precision beyond available data → **Mitigation:** use simple factor-specific copy and treat missing values as unavailable.

**Blast radius:** Rankings dashboard page only.

**Pushback:**
- This should remain a UI reshape. Recomputing Practice Health or Maps rank in the browser would drift from the backend source of truth.

## Tasks

### T1: Build comparison helpers
**Do:** Derive self + competitor comparison rows from the current ranking snapshot, provide sort configs, value formatting, leader summary copy, and Maps estimate labels.
**Files:** `frontend/src/components/dashboard/rankings/competitorComparison.ts`
**Depends on:** none
**Verify:** `npm run build` in `frontend`

### T2: Build comparison modal
**Do:** Add a modal with sort selector, leader summary, comparison table, highlighted self row, and embedded factor breakdown slot.
**Files:** `frontend/src/components/dashboard/rankings/CompetitorComparisonModal.tsx`, `frontend/src/components/dashboard/rankings/CompetitorComparisonTable.tsx`
**Depends on:** T1
**Verify:** targeted ESLint on touched frontend files

### T3: Wire dashboard interactions
**Do:** Replace the cohort sentence with the comparison CTA, move factor breakdown into the modal, and include/highlight the user's practice in the selected Google Maps list.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`
**Depends on:** T1, T2
**Verify:** `npm run build` in `frontend`

## Done
- [ ] `npm run build` passes in `frontend`
- [ ] Targeted ESLint passes on touched frontend files
- [ ] Manual: Practice Health card opens comparison modal
- [ ] Manual: Selected competitors list shows and highlights user's practice

## Revision Log

### Rev 1 — 2026-05-14
**Change:** Add richer modal animation, clickable sortable table columns that sync with the dropdown, tie-aware leader copy, a smaller Practice Health gauge number, a centered comparison CTA, and animated gauge arc load.
**Reason:** Pilot review showed the modal needed more interaction feedback and the gauge/CTA spacing looked visually heavy.
**Updated Done criteria:** Verify table header sorting, dropdown sync, tie copy, centered CTA, and animated gauge arc.

### Rev 2 — 2026-05-14
**Change:** Remove the legacy red trend pill from the Google Maps estimate hero card and tighten the query label alignment while keeping the rank and metric sizes unchanged.
**Reason:** The v1-style trend badge looked like an unrelated chart/trend element and made the hero card feel larger than needed.
**Updated Done criteria:** Verify the Google Maps estimate card no longer renders the rank trend pill and keeps the same rank, rating, and review typography sizes.
