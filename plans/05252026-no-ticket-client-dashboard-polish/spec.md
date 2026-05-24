# Client Dashboard Polish

## Why
The client main dashboard is showing raw Proofline highlight tags, an overly loud modal header, a static submissions sparkline, and too much ranking-card detail. This update tightens the visible dashboard without changing core ranking or submission semantics.

## What
Update the Focus dashboard cards so Proofline `<hl>` text renders as thin orange serif text, the Proofline modal hides the duplicated orange trajectory header, submissions use an interactive monthly chart with concise month-over-month copy, and Local Visibility shows only rank, Practice Health, and the ranking executive summary.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/focus/HighlightedText.tsx` — renders dashboard narrative highlights.
- `frontend/src/components/dashboard/focus/ProoflineModal.tsx` — full Proofline explanation modal.
- `frontend/src/components/dashboard/focus/WebsiteCard.tsx` — client form-submissions card.
- `frontend/src/components/dashboard/focus/LocalRankingCard.tsx` — client Local Visibility card.
- `frontend/src/api/formSubmissionsTimeseries.ts` — typed submissions chart response.
- `src/controllers/user-website/UserWebsiteController.ts` — submissions stats and timeseries API.

**Patterns to follow:**
- Ranking-page insight selection: `RankingsDashboard.tsx` uses `llmAnalysis.one_line_summary || client_summary`.
- Interactive chart precedent: `GscPerformanceDashboard.tsx` uses Recharts `ResponsiveContainer`, axes, and tooltip.

**Reference file:** `frontend/src/components/dashboard/RankingsDashboard.tsx` — read-only reference only; it already has unrelated dirty work and must not be edited for this scope.

## Constraints

**Must:**
- Keep this to the client dashboard surface and small API response additions.
- Only stage/commit files changed for this plan.
- Preserve unrelated dirty files from the other agent.
- Keep dashboard docs parity in mind, but do not touch `/Users/rustinedave/Desktop/alloro-docs` unless finalization/docs work is explicitly required.

**Must not:**
- Add a database migration for blocked submission tracking.
- Edit `frontend/src/components/dashboard/RankingsDashboard.tsx`.
- Refactor unrelated focus-dashboard card structure.

**Out of scope:**
- Persisting rejected/blocked form-submission attempts.
- Redesigning the rankings page.
- Changelog finalization.

## Risk

**Level:** 2

**Risks identified:**
- Requested "blocked" count is not a persisted metric today. Real blocked-attempt tracking would require a schema/runtime change and is beyond a minor dashboard polish. → **Mitigation:** expose current dashboard copy as total, spam/flagged, and a zero blocked placeholder only because no blocked rows are currently recorded; do not add a migration.
- Updating the submissions endpoint response could affect other consumers. → **Mitigation:** add fields backward-compatibly and keep existing `verified`, `unread`, and `flagged` fields unchanged.
- The repo has unrelated dirty work, including a modified rankings dashboard. → **Mitigation:** verify status before staging and stage only files listed in this spec.

**Blast radius:** Focus dashboard render path, submissions stats/timeseries API response, and TypeScript types for those response fields.

**Pushback:**
- Showing a true "blocked" count cannot be done honestly without storing blocked attempts. Future-us will hate a fake metric if users start asking why it does not match reality. The clean follow-up is a separate protection telemetry plan with persistence and reporting.

## Tasks

### T1: Proofline Highlight And Modal Cleanup
**Do:** Parse `<hl>...</hl>` and `<hghlt>...</hghlt>` safely in `HighlightedText`, render highlights as thin orange serif text, and remove the duplicated orange trajectory line from the modal header.
**Files:** `frontend/src/components/dashboard/focus/HighlightedText.tsx`, `frontend/src/components/dashboard/focus/ProoflineModal.tsx`, `frontend/src/index.css`
**Depends on:** none
**Verify:** `cd frontend && npm run build`

### T2: Submissions Card Chart And Copy
**Do:** Add total/blocked-compatible timeseries fields, replace the static sparkline with an interactive monthly Recharts chart, change headline to submissions this month, show total/spam/blocked summary, and label trend as compared to last month.
**Files:** `src/controllers/user-website/UserWebsiteController.ts`, `frontend/src/api/formSubmissionsTimeseries.ts`, `frontend/src/components/dashboard/focus/WebsiteCard.tsx`, `frontend/src/components/dashboard/focus/SubmissionsTrendChart.tsx`
**Depends on:** none
**Verify:** `cd frontend && npm run build`

### T3: Local Visibility Summary
**Do:** Remove factor bars and category/location detail from the Local Visibility card, keep Local Visibility, Maps estimate, Practice Health, and add the ranking executive summary from `one_line_summary`/`client_summary`.
**Files:** `frontend/src/components/dashboard/focus/LocalRankingCard.tsx`
**Depends on:** none
**Verify:** `cd frontend && npm run build`

## Done
- [x] `cd frontend && npm run build` passes.
- [x] `npx tsc --noEmit` passes.
- [x] Client dashboard card copy matches requested concise wording.
- [x] Only plan files and this plan's dashboard/API files are selected for commit and push.

## Verification
- `cd frontend && npm run build` — passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed.
- `cd frontend && npm run lint` — blocked by pre-existing repo-wide lint errors outside this plan.
- `cd frontend && npx eslint src/api/formSubmissionsTimeseries.ts src/components/dashboard/focus/HighlightedText.tsx src/components/dashboard/focus/LocalRankingCard.tsx src/components/dashboard/focus/ProoflineModal.tsx src/components/dashboard/focus/WebsiteCard.tsx src/components/dashboard/focus/SubmissionsTrendChart.tsx` — passed.
- Browser smoke check redirected `/dashboard` to `/signin`, so local visual QA was auth-blocked.

## Revision Log

### Rev 1 — 2026-05-25
**Change:** Add the same dynamic interactive chart treatment to the PMS card in green, tighten submissions protection/trend copy, and align compact Practice Health with the dashboard ranking score.
**Reason:** Follow-up screenshot review found the PMS sparkline still static, submissions copy too long, and a visible Practice Health mismatch between the score line and executive summary.
**Updated Done criteria:** PMS uses a dynamic hoverable chart; submissions no longer shows a separate blocked count and keeps short spam labeling in the chart; the visible Practice Health score agrees with the executive summary source.

## Revision Verification
- `cd frontend && npm run build` — passed.
- `npx tsc --noEmit` — passed.
- `cd frontend && npx eslint src/components/dashboard/focus/FocusTrendChart.tsx src/components/dashboard/focus/SubmissionsTrendChart.tsx src/components/dashboard/focus/WebsiteCard.tsx src/components/dashboard/focus/PMSCard.tsx src/components/dashboard/focus/LocalRankingCard.tsx` — passed.
- `npm run build` — passed.
- Local browser smoke on `http://127.0.0.1:5174/dashboard` — served app and redirected to `/signin` as expected without auth.
