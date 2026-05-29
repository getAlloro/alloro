# GBP Phase A Reply Ops Metrics

## Why
Alloro Engage needs operational review metrics before adding more workflow state. Users should immediately see how stale the unreplied queue is, not just how many reviews exist.

## What
Add backend-computed reply operations metrics and show them in the client overview card, Alloro Engage review queue, and admin Settings/Diagnostics. This phase is deterministic DB/query/UI work only.

## Context

**Parent plan:** `plans/05252026-no-ticket-gbp-engagement-addons/spec.md`

**Relevant files:**
- `src/models/website-builder/ReviewModel.ts` - source review dates and owner-reply fields.
- `src/controllers/gbp-automation/feature-services/GbpReadinessService.ts` - readiness/count payload.
- `src/controllers/gbp-automation/feature-services/GbpWorkItemService.ts` - client/admin list payload.
- `frontend/src/components/dashboard/gbp-automation/GbpEngagementSummaryCard.tsx` - client overview card.
- `frontend/src/components/dashboard/gbp-automation/GbpClientReviewsPanel.tsx` - Alloro Engage queue.
- `frontend/src/components/Admin/gbp-automation/*` - admin GBP Automation surface.

**Patterns to follow:**
- Metrics are computed server-side; frontend only renders.
- No schema change unless current review fields prove insufficient during execution.
- Keep client UI compact and admin UI more detailed.

## Constraints

**Must:**
- Show `avgReplyTime`, `oldestUnreplied`, `waiting7d`, `waiting30d`, `replyCoverage`, and `last30dUnreplied`.
- Show high-level metrics in the Rankings Overview review engagement card.
- Show actionable queue metrics above the Alloro Engage review list.
- Show fuller metrics in admin Settings/Diagnostics.
- Keep metrics location-scoped.

**Must not:**
- Add AI classification.
- Add escalation state.
- Add new Google write behavior.
- Add bulk deploy.

**Out of scope:**
- Safety confidence.
- Deploy preview.
- Review themes.
- Sync health.

## Risk

**Level:** 2

**Risks identified:**
- Average reply time can lie when one old review skews it -> **Mitigation:** always pair average with oldest unreplied and 7+/30+ waiting counts.
- Review date/reply date fields may be inconsistent across OAuth/Apify rows -> **Mitigation:** compute metrics only from OAuth rows where reply timing is reliable, and expose null/empty states honestly.

**Blast radius:**
- GBP automation response shape.
- Client overview card.
- Alloro Engage queue header.
- Admin GBP settings/diagnostics.

## Tasks

### T1: Add Reply Ops Metrics Query
**Do:** Add a ReviewModel method that computes reply operations metrics for one location using OAuth reviews. Keep null-safe date math and document which rows are included.
**Files:** `src/models/website-builder/ReviewModel.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Add Metrics To GBP Payload
**Do:** Add metrics to the GBP automation list/readiness payload so client and admin use one source of truth.
**Files:** `src/controllers/gbp-automation/feature-services/GbpWorkItemService.ts`, `src/controllers/gbp-automation/feature-services/GbpReadinessService.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Render Client Metrics
**Do:** Add compact metrics to the Rankings Overview card and queue-level metrics above the Alloro Engage review list.
**Files:** `frontend/src/components/dashboard/gbp-automation/GbpEngagementSummaryCard.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpClientReviewsPanel.tsx`, `frontend/src/api/gbpAutomation.ts`
**Depends on:** T2
**Verify:** `cd frontend && npm run build`

### T4: Render Admin Metrics
**Do:** Add the fuller operations block to admin Settings/Diagnostics.
**Files:** `frontend/src/components/Admin/gbp-automation/*`, `frontend/src/api/admin-gbp-automation.ts`
**Depends on:** T2
**Verify:** `cd frontend && npm run build`

### T5: Update Docs Parity
**Do:** Update Local Rankings docs/replica for the new overview and queue metrics.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T3
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`

## Done
- [x] `npx tsc --noEmit` passes.
- [x] `cd frontend && npm run build` passes.
- [x] Docs build passes.
- [x] Client overview shows avg reply time, oldest unreplied, and waiting counts.
- [x] Alloro Engage queue shows actionable reply-aging metrics.
- [x] Admin Settings/Diagnostics shows fuller reply operations metrics.
- [x] No migration was added unless execution proved one was required.
- [x] No AI classification, escalation, deploy preview, or sync health work slipped in.

## Revision Log

### Rev 1 — 2026-05-25
**Change:** Reworked the Rankings Overview review engagement card so the five reply metrics render as compact tiles above the full-width engagement chart.
**Reason:** The previous side-by-side layout made the card feel crowded and buried the graph beside oversized metric cards.
**Updated Done criteria:** Client overview metrics remain visible, but the preferred layout is compact metrics first and chart second.

## Autonomous Chain
Run this first. If verification passes, proceed to `plans/05252026-no-ticket-gbp-phase-b-safety-deploy-preview/spec.md`.
