# GBP Phase B Safety And Deploy Preview

## Why
Before adding richer review intelligence, the public Google write path needs clearer guardrails. Users should know whether a reply is safe and exactly where it will be deployed before queueing a Google action.

## What
Add visible safety confidence and a deploy preview for GBP review replies. Unsafe content still blocks deployment. `needs_review` content requires an explicit confirmation in the deploy preview.

## Context

**Parent plan:** `plans/05252026-no-ticket-gbp-engagement-addons/spec.md`
**Previous phase:** `plans/05252026-no-ticket-gbp-phase-a-reply-ops-metrics/spec.md`

**Relevant files:**
- `src/controllers/gbp-automation/feature-services/GbpContentSafetyService.ts` - current hard safety validator.
- `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts` - update/approve/deploy orchestration.
- `src/controllers/gbp-automation/feature-services/GbpReviewReplyDeploymentService.ts` - final pre-Google write boundary.
- `src/controllers/gbp-automation/feature-services/GbpReadinessService.ts` - target GBP readiness.
- `src/models/GbpWorkItemModel.ts` - draft/deploy state.
- `frontend/src/components/dashboard/gbp-automation/GbpReviewReplySlot.tsx` - inline reply composer.
- `frontend/src/components/dashboard/gbp-automation/GbpReplyWorkItemCard.tsx` - draft tab card.

## Constraints

**Must:**
- Add safety status values: `safe`, `needs_review`, `blocked`.
- Store safety reason codes and user-facing reason copy with the draft/work item.
- Re-run safety before deploy.
- Add a deploy preview endpoint that resolves the same Google target deployment uses.
- Preview must show reply text, selected GBP property, account/location ids or resource names, review resource, safety status, and stale readiness warnings.
- `blocked` cannot deploy.
- `needs_review` can deploy only after explicit preview confirmation.

**Must not:**
- Treat safety confidence as a guarantee.
- Add bulk deploy.
- Change Google target resolution in frontend.
- Add draft version history.

**Out of scope:**
- Review themes.
- Escalation.
- Sync health persistence.
- Review-to-post.

## Risk

**Level:** 3

**Risks identified:**
- Safety labels can create false confidence -> **Mitigation:** keep hard blocking for unsafe patterns and show reason labels, not a magic score alone.
- Preview can drift from actual deploy target -> **Mitigation:** preview and deploy must call the same backend target resolver.
- Schema changes affect production after merge -> **Mitigation:** additive nullable columns only; no rewrites of existing work items.

**Blast radius:**
- Draft save/generate/update/deploy flows.
- Client and admin draft cards.
- GBP deployment worker.
- Migration pipeline.

## Tasks

### T1: Add Safety Fields
**Do:** Add nullable safety columns to `gbp_work_items` if current fields/metadata are insufficient for filtering and UI. Update model types.
**Files:** `src/database/migrations/*_gbp_safety_deploy_preview.ts`, `src/models/GbpWorkItemModel.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Add Safety Confidence
**Do:** Extend content safety to return status, reason codes, and user-facing reasons. Store results after generation/manual save and before approval/deploy.
**Files:** `src/controllers/gbp-automation/feature-services/GbpContentSafetyService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewDraftSlotService.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Add Deploy Preview Service
**Do:** Add a service and endpoint that resolves exact Google target and returns deploy preview payload. Reuse it during deployment.
**Files:** `src/controllers/gbp-automation/feature-services/GbpDeployPreviewService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyDeploymentService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`
**Depends on:** T2
**Verify:** `npx tsc --noEmit`

### T4: Render Safety And Preview UI
**Do:** Show safety badges/reasons on reply slots and draft cards. Replace direct deploy click with deploy preview confirmation when appropriate.
**Files:** `frontend/src/components/dashboard/gbp-automation/*`, `frontend/src/components/Admin/gbp-automation/*`, `frontend/src/api/gbpAutomation.ts`, `frontend/src/api/admin-gbp-automation.ts`, `frontend/src/hooks/queries/useGbpAutomationQueries.ts`, `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts`
**Depends on:** T3
**Verify:** `cd frontend && npm run build`

### T5: Update Docs Parity
**Do:** Document safety badges and deploy preview behavior in Local Rankings docs/replica.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T4
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`

## Migration Notes

Additive only. Columns should be nullable/defaulted and must not rewrite existing draft content. This migration runs on dev first, then production after merge.

## Done
- [x] Migration is additive and reversible.
- [x] `npx tsc --noEmit` passes.
- [x] `cd frontend && npm run build` passes.
- [x] Docs build passes.
- [x] Safety status appears on generated and manually saved drafts.
- [x] Blocked content cannot deploy.
- [x] Deploy preview shows exact Google target and reply text.
- [x] Preview/deploy share target resolution.

## Revision Log

### Rev 1 - 2026-05-25
**Change:** Deploy confirmation uses the backend preview endpoint and a native confirmation dialog instead of a custom modal.
**Reason:** Keeps the chain shippable without introducing another modal pattern; backend still owns target/safety resolution.
**Updated Done criteria:** Preview endpoint and deploy path both re-run backend target/readiness/safety checks before Google write.

## Autonomous Chain
Run after Phase A. If verification passes, proceed to `plans/05252026-no-ticket-gbp-phase-c-review-intelligence/spec.md`.
