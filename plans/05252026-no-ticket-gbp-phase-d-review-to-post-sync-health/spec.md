# GBP Phase D Review-to-Post And Sync Health

## Why
After metrics, safety, and review intelligence are in place, the workflow can safely connect positive reviews to future GBP post drafting and expose whether review data is fresh.

## What
Add `Create post draft` from strong/praise reviews and backend-owned review sync health/freshness. This phase creates local post drafts only; it does not publish GBP posts.

## Context

**Parent plan:** `plans/05252026-no-ticket-gbp-engagement-addons/spec.md`
**Previous phase:** `plans/05252026-no-ticket-gbp-phase-c-review-intelligence/spec.md`

**Relevant files:**
- `src/models/GbpWorkItemModel.ts` - already supports `content_type = local_post`.
- `src/agents/gbpAgents/LocalPost.md` - local post prompt.
- `src/controllers/gbp-automation/feature-services/GbpCustomizationService.ts` - post customizations/rules.
- `src/controllers/gbp-automation/feature-services/GbpReviewInsightService.ts` - praise/theme signal source.
- `src/workers/processors/reviewSync.processor.ts` - sync lifecycle hook.
- `src/controllers/gbp/gbp-services/post-handler.service.ts` - future post API boundary reference.
- `frontend/src/components/dashboard/gbp-automation/*` - client Alloro Engage UI.
- `frontend/src/components/Admin/gbp-automation/*` - admin UI.

## Constraints

**Must:**
- Create `local_post` work item drafts from eligible strong reviews.
- Use source review, location rules, post customizations, and default featured image setting.
- Do not publish GBP posts.
- Track review sync start/success/failure by org/location/GBP property.
- Show `Last synced`, `Sync in progress`, `Last sync failed`, and next sync when known.
- Keep freshness backend-owned.

**Must not:**
- Build post calendar or deploy local posts.
- Infer freshness only from latest review date.
- Make Apify-only reviews deployable as official GBP replies.
- Add bulk post/reply actions.

**Out of scope:**
- Full GBP post publishing.
- Media upload pipeline.
- Email notifications.

## Risk

**Level:** 4

**Risks identified:**
- Review-to-post can creep into full post automation -> **Mitigation:** create draft work items only.
- Sync health can be misleading if not tied to real worker lifecycle -> **Mitigation:** write health on sync start/success/failure, not from review row dates alone.
- Local post draft generation can produce generic marketing copy -> **Mitigation:** use source review plus location/post rules and keep human edit required.
- Migration affects production after merge -> **Mitigation:** additive sync-health table only; no source review rewrites.

**Blast radius:**
- Review sync worker.
- GBP work item list/filtering.
- Local post prompt/generation service.
- Client/admin GBP automation UI.
- Migration pipeline.

## Tasks

### T1: Add Sync Health Schema
**Do:** Add `gbp_sync_health` and model for review sync lifecycle state.
**Files:** `src/database/migrations/*_gbp_sync_health.ts`, `src/models/GbpSyncHealthModel.ts`, `src/models/index.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Track Sync Health
**Do:** Update review sync worker to write start/success/failure state with timestamps and error details.
**Files:** `src/workers/processors/reviewSync.processor.ts`, `src/controllers/gbp-automation/feature-services/GbpSyncHealthService.ts`, `src/models/GbpSyncHealthModel.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Add Review-to-Post Draft Service
**Do:** Generate a `local_post` work item draft from eligible praise reviews. Use existing featured image/post settings and do not deploy.
**Files:** `src/controllers/gbp-automation/feature-services/GbpLocalPostDraftService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`, `src/models/GbpWorkItemModel.ts`, `src/agents/gbpAgents/LocalPost.md`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T4: Add UI For Post Drafts And Sync Freshness
**Do:** Add `Create post draft` action on eligible reviews and surface sync freshness in client/admin settings/headers.
**Files:** `frontend/src/components/dashboard/gbp-automation/*`, `frontend/src/components/Admin/gbp-automation/*`, `frontend/src/api/gbpAutomation.ts`, `frontend/src/api/admin-gbp-automation.ts`, `frontend/src/hooks/queries/useGbpAutomationQueries.ts`, `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts`
**Depends on:** T2, T3
**Verify:** `cd frontend && npm run build`

### T5: Update Docs Parity
**Do:** Update Local Rankings docs/replica for review-to-post draft action and sync freshness.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T4
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`

## Migration Notes

Additive sync-health table only. New rows are written as syncs happen. Do not rewrite existing review rows. This migration runs on dev first, then production after merge.

## Done
- [x] Migration is additive and reversible.
- [x] `npx tsc --noEmit` passes.
- [x] `cd frontend && npm run build` passes.
- [x] Docs build passes.
- [x] Eligible praise reviews can create local post drafts.
- [x] Created post drafts are not published to Google.
- [x] Sync freshness shows real start/success/failure state.
- [x] Manual sync or existing sync actions refresh sync health where supported.

## Autonomous Chain
Run after Phase C. This is the final phase in the current add-on chain. After it passes, stop for human review instead of continuing into post publishing.
