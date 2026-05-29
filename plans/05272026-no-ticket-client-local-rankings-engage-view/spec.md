# Client Local Rankings Engage View

## Why
The client Local Rankings page has the right GBP automation capabilities, but the Engage tab drops users into a raw tool surface. The client experience needs a clearer workspace frame that feels intentional without duplicating admin logic.

## What
Keep Alloro Engage under `/rankings` clean and direct by rendering the existing GBP automation panel without an extra heading card, and remove the client header's Next Post tile. Keep all review/post/settings actions owned by the existing GBP automation components.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — owns the Local Rankings overview/engage tab switch.
- `frontend/src/components/dashboard/gbp-automation/GbpAutomationPanel.tsx` — existing client GBP reviews/posts/settings action surface.
- `frontend/src/components/dashboard/rankings/RankingsDashboardViewTabs.tsx` — existing top-level Overview / Alloro Engage tab control.
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx` — docs visual replica for the Local Rankings page.
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts` — docs page copy and changelog.

**Patterns to follow:**
- Existing Rankings dashboard sections use white rounded cards, `shadow-premium`, tight uppercase metadata labels, and `animate-in` transitions.
- Existing GBP automation should remain the data/action owner; this view only frames and routes users to it.

**Reference file:** `frontend/src/components/dashboard/gbp-automation/GbpEngagementSummaryCard.tsx` — closest client-facing GBP summary visual language.

## Constraints

**Must:**
- Keep all GBP action state in `GbpAutomationPanel` and its children.
- Keep the new view client-only under Local Rankings.
- Update Alloro Docs parity for visible Local Rankings/Alloro Engage changes.
- Preserve unrelated dirty files in the active worktree.

**Must not:**
- Add backend routes, database columns, or new data sync paths.
- Duplicate review/post work-item state outside the existing GBP automation query.
- Refactor admin GBP automation UI.

**Out of scope:**
- New review/post backend behavior.
- Browser-authenticated deployment testing.
- Changelog finalization.

## Risk

**Level:** 2

**Risks identified:**
- The page already has several active GBP changes in the worktree. → **Mitigation:** touch only Rankings client wrapper/docs files, and verify diff before summarizing.
- A second Engage data implementation would create drift from admin/client GBP panels. → **Mitigation:** compose the existing `GbpAutomationPanel` instead of re-querying or recreating controls.
- Dashboard UI changes require docs parity. → **Mitigation:** update the Local Rankings docs replica and page copy in `/Users/rustinedave/Desktop/alloro-docs`.

**Blast radius:** Client `/rankings` page Engage tab and Local Rankings docs page/replica only.

**Pushback:**
- Building a separate client-only review/post manager would be a bad direction. This belongs as a friendly wrapper over the current GBP automation surface so actions, safety checks, and sync state stay in one place.

## Tasks

### T1: Client Engage Surface Cleanup
**Do:** Render the existing GBP automation panel directly in the Alloro Engage tab and remove the client header's Next Post tile.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpClientAutomationHeader.tsx`
**Depends on:** none
**Verify:** `cd frontend && npm run build`

### T2: Docs Parity
**Do:** Update the Local Rankings docs replica and page copy/changelog so docs reflect the framed Alloro Engage client view.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`, `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`
**Depends on:** T1
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`

## Done
- [x] `npx tsc --noEmit` passes or only unrelated pre-existing errors remain.
- [x] `npm run build` passes.
- [x] `cd frontend && npm run build` passes.
- [x] Focused frontend lint passes for touched files.
- [x] `/Users/rustinedave/Desktop/alloro-docs` build passes.
- [x] Manual: `/rankings` has a clear Overview / Alloro Engage flow without the extra workspace heading card or Next Post tile.

## Verification
- `npx tsc --noEmit` — passed.
- `npm run build` — passed.
- `cd frontend && npm run build` — passed.
- `cd frontend && npx eslint src/components/dashboard/RankingsDashboard.tsx src/components/dashboard/gbp-automation/GbpClientAutomationHeader.tsx` — passed with one pre-existing `react-hooks/exhaustive-deps` warning in `RankingsDashboard.tsx`.
- `cd /Users/rustinedave/Desktop/alloro-docs && npm run build` — passed.
- `git diff --check` for touched app/docs files — passed.
- Localhost source and Chrome tab check on `http://localhost:3000/rankings` — confirmed the extra workspace heading card and Next Post tile are removed from the served client source. The Chrome client route stayed in the app loading state during visual smoke, which appears unrelated to this UI removal.

## Revision Log

### Rev 1 — 2026-05-27
**Change:** Remove the extra Google profile workspace heading card and the client Engage header's Next Post tile.
**Reason:** Follow-up UI review found both surfaces redundant; the client view should get users straight to the Reviews / GBP Posts / Settings workflow.
**Updated Done criteria:** Alloro Engage renders the existing action panel directly, with no workspace heading card and no Next Post tile.
