# GBP Phase C Review Intelligence

## Why
Once the reply queue has metrics and deploy guardrails, the next improvement is context: what is the review about, does it need human follow-up, and what voice/rules should guide the reply.

## What
Add review theme classification, lightweight negative-review escalation, brand voice examples, and per-location reply/post rules. This phase adds persistent review intelligence and settings, but not post drafting or sync health.

## Context

**Parent plan:** `plans/05252026-no-ticket-gbp-engagement-addons/spec.md`
**Previous phase:** `plans/05252026-no-ticket-gbp-phase-b-safety-deploy-preview/spec.md`

**Relevant files:**
- `src/controllers/gbp-automation/feature-services/GbpDraftGenerationService.ts` - prompt input composition.
- `src/controllers/gbp-automation/feature-services/GbpCustomizationService.ts` - settings read/write.
- `src/models/GbpAutomationSettingsModel.ts` - settings storage.
- `src/models/website-builder/ReviewModel.ts` - source review rows.
- `src/workers/processors/reviewSync.processor.ts` - point to classify synced reviews.
- `frontend/src/components/dashboard/gbp-automation/*` - client UI.
- `frontend/src/components/Admin/gbp-automation/*` - admin UI.

## Constraints

**Must:**
- Persist review themes, sentiment, urgency, and suggested handling.
- Add lightweight escalation states: `open`, `resolved`, `dismissed`.
- Escalation must not mutate source Google review rows.
- Add org/location brand voice examples and rules.
- Feed voice/rules into review reply generation.
- Keep client UI simple: chips, labels, clear actions.
- Keep admin UI more technical: filters, reason codes, notes.

**Must not:**
- Build a full support-ticket system.
- Add assignment or role-specific workflows.
- Add draft version history.
- Add review-to-post yet.
- Add sync health yet.

**Out of scope:**
- Local post draft creation.
- Sync freshness.
- Bulk actions.

## Risk

**Level:** 4

**Risks identified:**
- AI classification can be wrong -> **Mitigation:** store confidence and make tags editable or dismissible later; do not use themes as hard safety gates.
- Escalation can turn into a CRM -> **Mitigation:** v1 supports only status and note.
- Settings can become noisy -> **Mitigation:** keep client settings simplified and admin controls explicit.
- Migration affects production after merge -> **Mitigation:** additive tables/columns only, no source review mutation.

**Blast radius:**
- Review sync worker.
- Draft generation prompts.
- GBP settings API.
- Client/admin review queues.
- Migration pipeline.

## Tasks

### T1: Add Review Intelligence Schema
**Do:** Add `gbp_review_insights`, `gbp_review_escalations`, and structured settings columns for voice examples/rules.
**Files:** `src/database/migrations/*_gbp_review_intelligence.ts`, `src/models/GbpReviewInsightModel.ts`, `src/models/GbpReviewEscalationModel.ts`, `src/models/GbpAutomationSettingsModel.ts`, `src/models/index.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Add Review Insight Classification
**Do:** Add prompt/service for tagging themes, sentiment, urgency, and suggested handling. Classify on sync and on-demand when missing.
**Files:** `src/agents/gbpAgents/ReviewInsight.md`, `src/controllers/gbp-automation/feature-services/GbpReviewInsightService.ts`, `src/workers/processors/reviewSync.processor.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Add Lightweight Escalation
**Do:** Add endpoints/services for `Needs call`, `Resolved`, and `Dismiss`, with optional internal note.
**Files:** `src/controllers/gbp-automation/feature-services/GbpReviewEscalationService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`
**Depends on:** T1, T2
**Verify:** `npx tsc --noEmit`

### T4: Add Voice Examples And Rules
**Do:** Add structured settings UI/API and feed examples/rules into reply generation.
**Files:** `src/controllers/gbp-automation/feature-services/GbpCustomizationService.ts`, `src/controllers/gbp-automation/feature-services/GbpDraftGenerationService.ts`, `src/controllers/gbp-automation/feature-utils/controllerResponses.ts`, `frontend/src/components/dashboard/gbp-automation/GbpSettingsSection.tsx`, `frontend/src/components/Admin/gbp-automation/*`
**Depends on:** T1
**Verify:** `npx tsc --noEmit && cd frontend && npm run build`

### T5: Render Intelligence UI
**Do:** Show theme chips, urgency, escalation controls, and rule-aware settings in client/admin surfaces.
**Files:** `frontend/src/components/dashboard/gbp-automation/*`, `frontend/src/components/Admin/gbp-automation/*`, `frontend/src/api/gbpAutomation.ts`, `frontend/src/api/admin-gbp-automation.ts`, `frontend/src/hooks/queries/useGbpAutomationQueries.ts`, `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts`
**Depends on:** T2, T3, T4
**Verify:** `cd frontend && npm run build`

### T6: Update Docs Parity
**Do:** Update Local Rankings docs/replica for theme chips, escalation labels, and voice/rules settings.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T5
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`

## Migration Notes

Additive only. New tables start empty. Do not rewrite source reviews. This migration runs on dev first, then production after merge.

## Done
- [x] Migration is additive and reversible.
- [x] `npx tsc --noEmit` passes.
- [x] `cd frontend && npm run build` passes.
- [x] Docs build passes.
- [x] Review themes are persisted and visible.
- [x] Negative reviews can be marked Needs call, Resolved, or Dismissed.
- [x] Voice examples and per-location rules affect generation.
- [x] No full ticketing system or assignment workflow is added.

## Revision Log

### Rev 1 - 2026-05-25
**Change:** Review insight classification starts with deterministic rules plus a prompt scaffold instead of running an LLM for every synced review.
**Reason:** Running an LLM during review sync would create cost/latency risk and failure coupling in the worker. The persisted schema and prompt boundary are ready for a future AI classifier.
**Updated Done criteria:** Persist and render sentiment/themes/urgency now; keep AI classifier upgrade out of this execution pass.

## Autonomous Chain
Run after Phase B. If verification passes, proceed to `plans/05252026-no-ticket-gbp-phase-d-review-to-post-sync-health/spec.md`.
