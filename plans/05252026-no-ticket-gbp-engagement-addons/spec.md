# GBP Engagement Add-ons

## Why
The GBP review reply foundation now has draft, edit, deploy, delete-draft, readiness, and client/admin surfaces. The next useful layer is operational intelligence: help users know which reviews are risky, urgent, stale, useful for posts, or blocked by sync freshness before they publish anything to Google.

## What
Add the agreed GBP engagement add-ons except draft version history: reply safety/confidence score, negative-review escalation, brand voice examples, review themes, reply-aging metrics, review-to-post draft creation, per-location rules, deploy preview, and sync health/freshness. This spec extends the existing GBP automation foundation; it does not replace the current review reply workflow.

## Context

**Related plan:** `plans/05242026-no-ticket-gbp-review-reply-draft-deploy-foundation/spec.md`

**Relevant files:**
- `src/controllers/gbp-automation/feature-services/GbpContentSafetyService.ts` - current reply safety validation boundary.
- `src/controllers/gbp-automation/feature-services/GbpDraftGenerationService.ts` - current review reply draft generation boundary.
- `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts` - current generate/update/approve/deploy orchestration.
- `src/controllers/gbp-automation/feature-services/GbpWorkItemService.ts` - current list payload for client/admin GBP automation views.
- `src/controllers/gbp-automation/feature-services/GbpCustomizationService.ts` - current org/location settings access.
- `src/models/GbpAutomationSettingsModel.ts` - existing org/location settings model.
- `src/models/GbpWorkItemModel.ts` - current review reply and local post work item model.
- `src/models/website-builder/ReviewModel.ts` - source review identity, replyability, month buckets, and owner-reply state.
- `src/workers/processors/reviewSync.processor.ts` - review sync completion point for freshness tracking.
- `frontend/src/components/dashboard/gbp-automation/*` - shared client GBP automation UI.
- `frontend/src/components/Admin/gbp-automation/*` - admin GBP automation UI.
- `frontend/src/components/dashboard/RankingsDashboard.tsx` - client Local Rankings/Alloro Engage entry point.

**Patterns to follow:**
- Backend stays `Routes -> Controllers -> Services -> Models`.
- DB access remains inside models only.
- Client and admin API calls stay in typed API modules plus React Query hooks.
- AI classification/generation lives behind GBP automation services, not components.
- Public Google writes remain explicit; no auto-deploy.
- Docs parity is required for dashboard UI changes.

**Reference files:**
- `src/models/GbpWorkItemModel.ts` - work item status/audit pattern.
- `src/models/GbpAutomationSettingsModel.ts` - org/location scoped settings pattern.
- `src/controllers/gbp-automation/feature-services/GbpReadinessService.ts` - backend-owned status/action payload pattern.
- `frontend/src/components/dashboard/gbp-automation/GbpReplyWorkItemCard.tsx` - shared draft action card pattern.
- `frontend/src/components/dashboard/gbp-automation/GbpClientReviewsPanel.tsx` - client review queue pattern.

## Constraints

**Must:**
- Exclude draft version history for now.
- Keep negative-review escalation lightweight: mark/release/escalate with note, not a full support-ticket system.
- Keep review-to-post as draft creation only; do not publish GBP posts in this spec.
- Keep safety scoring backend-owned and visible in both admin and client UI.
- Keep deploy preview read-only and explicit about target GBP property/review identity.
- Keep sync freshness backend-owned and based on real sync events, not only review row counts.
- Preserve current single-review deploy behavior; no bulk deploy.
- Support org-level defaults with location-level overrides for voice examples and rules.
- Update Alloro Docs for client-facing Local Rankings / Alloro Engage changes.

**Must not:**
- Add draft version history.
- Add a bulk deploy action.
- Build a full CRM/escalation inbox.
- Auto-publish review replies or local posts.
- Classify Apify-only reviews as deployable GBP replies.
- Put Google write identity in frontend-only state.
- Store Google tokens in new tables.
- Use free-form metadata when a field becomes a first-class filter/control.

**Out of scope:**
- Full GBP local post calendar and post deployment.
- Email/SMS notifications.
- Assignment workflows and role-specific approval.
- Competitive sentiment benchmarking.
- Public website review rendering changes.

## Risk

**Level:** 4

**Risks identified:**
- This touches DB schema, AI classification, public Google write UX, client UI, admin UI, and sync state -> **Mitigation:** keep it additive and phased across independent tasks; no destructive migration.
- Safety scoring can create false confidence if treated as a guarantee -> **Mitigation:** show confidence/reasons as decision support and keep hard safety validation before deployment.
- Negative escalation can accidentally become a parallel support-ticket product -> **Mitigation:** limit v1 to `open`, `resolved`, and `dismissed` states plus a note and audit event.
- Review-to-post can accidentally scope-creep into full local-post publishing -> **Mitigation:** create a `local_post` work item draft only; deployment remains out of scope.
- Theme tagging can become expensive or stale if run on every list view -> **Mitigation:** classify on sync/generation/on-demand and persist `gbp_review_insights`.
- Sync freshness can mislead users if derived only from latest review date -> **Mitigation:** track explicit sync start/success/failure timestamps per location/property.
- More settings can make the UI noisy -> **Mitigation:** group advanced controls under voice/rules sections and keep the client UI simpler than admin.
- New migrations will run on dev first and production after merge to `main` -> **Mitigation:** additive tables/columns/indexes only; reversible `down`; no data rewrites except optional backfill with safe defaults.

**Blast radius:**
- GBP Automation API payloads and query hooks.
- Review sync worker.
- GBP work item list and status handling.
- Client Local Rankings / Alloro Engage UI.
- Admin organization GBP Automation UI.
- Alloro Docs Local Rankings replica and page copy.
- Dev/prod migration pipeline.

**Pushback:**
- Do not implement all of this as a single giant component or one giant service. This belongs in discrete services: safety scoring, insights/theme classification, escalation state, sync health, deploy preview, and post draft creation.
- Do not add bulk actions yet. The safer path is reliable single-item operations with good scoring, preview, and audit before any scale action.
- Do not use draft version history now. It is useful later, but it would pull in retention, diff UI, and restore semantics before the core workflow is proven.

## Tasks

### T1: Add Engagement Add-on Schema
**Do:** Add additive schema for review insights, lightweight escalations, and sync health. Extend settings with structured brand voice examples and per-location reply/post rules. Extend work items with first-class safety/confidence fields if current metadata is insufficient for filtering. Include indexes for organization/location/review/status/month access.
**Files:** `src/database/migrations/*_gbp_engagement_addons.ts`, `src/models/GbpReviewInsightModel.ts`, `src/models/GbpReviewEscalationModel.ts`, `src/models/GbpSyncHealthModel.ts`, `src/models/GbpAutomationSettingsModel.ts`, `src/models/GbpWorkItemModel.ts`, `src/models/index.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Add Safety Confidence Service
**Do:** Extend the current safety validation into a visible confidence result: `safe`, `needs_review`, or `blocked`, with reason codes and plain-English reasons. Store the result on generated/manual drafts and re-run before deploy. Unsafe replies remain blocked; `needs_review` is allowed only after explicit user deploy confirmation.
**Files:** `src/controllers/gbp-automation/feature-services/GbpContentSafetyService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyDeploymentService.ts`, `src/models/GbpWorkItemModel.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Add Review Insight Classification
**Do:** Add a service that tags reviews with themes such as `Scheduling`, `Cost`, `Staff`, `Pain`, `Emergency`, `No text`, `Praise`, and `Clinical concern`. Include sentiment/urgency fields and suggested handling. Run classification after OAuth sync for new reviews and on demand when insight data is missing.
**Files:** `src/controllers/gbp-automation/feature-services/GbpReviewInsightService.ts`, `src/models/GbpReviewInsightModel.ts`, `src/workers/processors/reviewSync.processor.ts`, `src/agents/gbpAgents/ReviewInsight.md`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T4: Add Lightweight Negative Review Escalation
**Do:** For low-star or high-urgency reviews, expose `Needs call`, `Resolved`, and `Dismiss` actions with an optional internal note. Store escalation status separately from the review and work item so it does not mutate Google review data. Show escalated reviews in client/admin queues with clear labels.
**Files:** `src/controllers/gbp-automation/feature-services/GbpReviewEscalationService.ts`, `src/models/GbpReviewEscalationModel.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`
**Depends on:** T1, T3
**Verify:** `npx tsc --noEmit`

### T5: Add Brand Voice Examples And Location Rules
**Do:** Add structured settings for org/location voice examples, do/don't rules, escalation language preferences, and post-draft preferences. Feed those into review reply generation and review-to-post generation. Client settings should be simple; admin can expose rawer controls.
**Files:** `src/controllers/gbp-automation/feature-services/GbpCustomizationService.ts`, `src/controllers/gbp-automation/feature-services/GbpDraftGenerationService.ts`, `src/controllers/gbp-automation/feature-utils/controllerResponses.ts`, `src/models/GbpAutomationSettingsModel.ts`, `frontend/src/components/dashboard/gbp-automation/GbpSettingsSection.tsx`, `frontend/src/components/Admin/gbp-automation/*Settings*.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit && cd frontend && npm run build`

### T6: Add Reply Aging Metrics
**Do:** Add backend-computed metrics for oldest unreplied review, average reply time, reviews waiting 7+ days, reviews waiting 30+ days, reply coverage, and last-30-days unreplied count. Add compact UI in the overview card and admin diagnostics/settings.
**Files:** `src/models/website-builder/ReviewModel.ts`, `src/controllers/gbp-automation/feature-services/GbpReadinessService.ts`, `src/controllers/gbp-automation/feature-services/GbpWorkItemService.ts`, `frontend/src/components/dashboard/gbp-automation/GbpEngagementSummaryCard.tsx`, `frontend/src/components/Admin/gbp-automation/*`
**Depends on:** T1
**Verify:** `npx tsc --noEmit && cd frontend && npm run build`

### T7: Add Review-to-Post Draft Creation
**Do:** For eligible 5-star/praise reviews, add a `Create post draft` action that creates a `local_post` work item using the source review, location rules, featured image setting, and post customization prompt. This creates a draft only and does not deploy the post to GBP.
**Files:** `src/controllers/gbp-automation/feature-services/GbpLocalPostDraftService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`, `src/models/GbpWorkItemModel.ts`, `src/agents/gbpAgents/LocalPost.md`
**Depends on:** T1, T3, T5
**Verify:** `npx tsc --noEmit`

### T8: Add Deploy Preview
**Do:** Add a preview endpoint and UI state that shows the exact reply text, Google review resource, selected GBP property, target account/location ids, safety status, and last sync freshness before deploy. Deployment must use the same backend target resolution as preview.
**Files:** `src/controllers/gbp-automation/feature-services/GbpDeployPreviewService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`, `frontend/src/components/dashboard/gbp-automation/*`, `frontend/src/components/Admin/gbp-automation/*`
**Depends on:** T1, T2
**Verify:** `npx tsc --noEmit && cd frontend && npm run build`

### T9: Add Sync Health/Freshness
**Do:** Track review sync start/success/failure by organization/location/google property. Surface `Last synced`, `Sync in progress`, `Last sync failed`, `Next sync`, and `Manual sync` actions where supported. Do not infer freshness only from review dates.
**Files:** `src/models/GbpSyncHealthModel.ts`, `src/workers/processors/reviewSync.processor.ts`, `src/controllers/gbp-automation/feature-services/GbpSyncHealthService.ts`, `src/controllers/gbp-automation/feature-services/GbpReadinessService.ts`, `frontend/src/components/dashboard/gbp-automation/*`, `frontend/src/components/Admin/gbp-automation/*`
**Depends on:** T1
**Verify:** `npx tsc --noEmit && cd frontend && npm run build`

### T10: Update Client And Admin UX
**Do:** Add the new states without crowding the current flow. Client UI should show compact chips, metrics, and clear CTAs. Admin UI can show technical status, raw reason codes, sync timestamps, and review insight filters. Both should avoid making filters look like primary actions.
**Files:** `frontend/src/components/dashboard/gbp-automation/*`, `frontend/src/components/Admin/gbp-automation/*`, `frontend/src/api/gbpAutomation.ts`, `frontend/src/api/admin-gbp-automation.ts`, `frontend/src/hooks/queries/useGbpAutomationQueries.ts`, `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts`, `frontend/src/lib/queryClient.ts`
**Depends on:** T2, T3, T4, T5, T6, T7, T8, T9
**Verify:** `cd frontend && npm run build`

### T11: Update Docs Parity
**Do:** Update Alloro Docs for the Local Rankings overview card, Alloro Engage safety badges, escalation labels, deploy preview, sync freshness, review-to-post draft action, and settings copy. Include replica updates where the visible UI changed.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T10
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`

## Phase Execution Specs

Use these child specs for autonomous sequential execution:

1. `plans/05252026-no-ticket-gbp-phase-a-reply-ops-metrics/spec.md`
2. `plans/05252026-no-ticket-gbp-phase-b-safety-deploy-preview/spec.md`
3. `plans/05252026-no-ticket-gbp-phase-c-review-intelligence/spec.md`
4. `plans/05252026-no-ticket-gbp-phase-d-review-to-post-sync-health/spec.md`

Each child spec has its own Done criteria and an Autonomous Chain section. Execute one phase, verify it, then continue to the next phase only if the current phase passes with no execution-caused TypeScript/build failures.

Do not proceed beyond Phase D into full GBP post publishing without a new spec.

## Parallelization

After T1, these can run in parallel:
- T2 safety confidence
- T3 review insight classification
- T5 settings/rules
- T6 aging metrics
- T9 sync health

Then:
- T4 depends on T3.
- T7 depends on T3 and T5.
- T8 depends on T2.
- T10 integrates all visible API/UI states.
- T11 follows final client UI.

If using sub-agents:
- Backend/schema sub-agent owns T1, model updates, and migration safety.
- Safety/AI sub-agent owns T2, T3, T5, T7.
- Sync/metrics sub-agent owns T6 and T9.
- UI sub-agent owns T10.
- Docs sub-agent owns T11.

## Migration Notes

This plan requires additive schema changes. The migration must run first on `dev/dave` against the dev database, then production after merge to `main`.

Production-data risk is low if kept additive:
- New tables should start empty.
- Existing settings/work-item columns should have nullable or default values.
- Optional backfills must be bounded and idempotent.
- Down migration should drop only new addon tables/columns and must not touch source reviews or existing published reply records.

## Done
- [x] Migration is additive, reversible, and production-risk notes are included before merge.
- [x] `npx tsc --noEmit` passes or only documented pre-existing errors remain.
- [x] `cd frontend && npm run build` passes.
- [x] Relevant touched-file lint passes or only pre-existing repo-wide lint noise remains.
- [x] Safety confidence appears on generated/manual drafts and hard-blocks unsafe deploys.
- [x] Negative reviews can be marked Needs call, Resolved, or Dismissed without changing source Google review rows.
- [x] Brand voice examples and per-location rules affect generation.
- [x] Review themes are persisted and filterable.
- [x] Reply-aging metrics are visible in client overview and admin diagnostics/settings.
- [x] 5-star/praise reviews can create local-post drafts without publishing.
- [x] Deploy preview shows exact Google target and reply text before queueing deployment.
- [x] Sync freshness shows last sync, failure, and in-progress state from backend-tracked sync health.
- [x] No draft version history is added.
- [x] No bulk deploy action is added.
- [x] Alloro Docs Local Rankings parity is updated.

## Revision Log

### Rev 1 - 2026-05-25
**Change:** Review insight classification starts with deterministic rules plus a prompt scaffold instead of calling an LLM during every review sync.
**Reason:** Prevents sync latency/cost/failure coupling while preserving persisted insight shape for a future AI classifier.
**Updated Done criteria:** Persist/render review insight fields now; upgrade classifier later if product needs richer tagging.
