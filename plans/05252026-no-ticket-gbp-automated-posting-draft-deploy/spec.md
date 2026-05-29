# GBP Automated Posting Draft And Deploy

## Why
GBP review replies are now using a draft/edit/deploy workflow, and Phase D added review-to-post draft creation without publishing. The missing piece is the actual automated GBP posting loop: twice-monthly post draft generation, human editing, and explicit deploy to Google.

## What
Build GBP local post automation as a draft-first workflow. The system should generate scheduled and manual local post drafts per location, include a featured image from the start, let admin and client users edit/save/delete/deploy those drafts, and publish approved posts to Google Business Profile through the existing OAuth connection.

Done means:
- Due locations can generate a local post draft twice per month without duplicate drafts for the same due window.
- Users can create, edit, regenerate, save, delete, preview, and deploy `local_post` work items.
- Google publish uses the GBP local posts API path, records attempts/events, returns actionable failures, and never auto-publishes without a user action.
- Client Alloro Engage and admin GBP Automation both expose the same post workflow with role-appropriate UX.

## Context

**Parent/foundation plans:**
- `plans/05252026-no-ticket-gbp-phase-d-review-to-post-sync-health/spec.md` - created `local_post` drafts from eligible reviews and sync health, explicitly stopping before post publishing.
- `plans/05252026-no-ticket-gbp-automation-hardening-fixes/spec.md` - hardened IDOR/RBAC/transactions/retries/safety around the existing GBP review reply write path.

**Relevant files:**
- `src/controllers/gbp-automation/feature-services/GbpLocalPostDraftService.ts` - current review-to-local-post draft generator and closest backend generation analog.
- `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts` - existing draft/update/approve/reject/enqueue pattern for work items.
- `src/controllers/gbp-automation/feature-services/GbpReviewReplyDeploymentService.ts` - existing Google write deployment pattern; use as reference, but keep local post deployment separate.
- `src/controllers/gbp-automation/feature-services/GbpDeployPreviewService.ts` - current reply deploy preview; must become content-type aware.
- `src/controllers/gbp/gbp-services/gbp-write.service.ts` - already exposes `createGbpLocalPost()` and Google error classification.
- `src/models/GbpWorkItemModel.ts` - existing `review_reply | local_post` work item model with local post payload, featured image URL, attempts, and publish fields.
- `src/models/GbpAutomationSettingsModel.ts` - already stores local post enablement, frequency, next generation time, customizations, rules, voice examples, and default featured image URL.
- `src/workers/processors/gbpAutomation.processor.ts` - current GBP async processor; only supports review reply deploy today.
- `src/workers/worker.ts` and `src/workers/queues.ts` - worker registration and queue helpers.
- `src/routes/gbpAutomation.ts` and `src/routes/admin/gbpAutomation.ts` - client/admin GBP Automation route surfaces.
- `frontend/src/api/gbpAutomation.ts` and `frontend/src/api/admin-gbp-automation.ts` - client/admin API contracts.
- `frontend/src/hooks/queries/useGbpAutomationQueries.ts` and `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts` - client/admin React Query action surfaces.
- `frontend/src/components/dashboard/gbp-automation/*` - client Alloro Engage UI.
- `frontend/src/components/Admin/gbp-automation/*` - admin GBP Automation UI.
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts` - docs page data for Local Rankings and Alloro Engage.
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx` - docs replica that must stay in parity with dashboard UI.

**Patterns to follow:**
- Keep domain logic in services, controllers thin, models responsible for DB shape, and UI limited to rendering/actions.
- Match the existing review reply split: draft service, preview service, deployment service, queue processor, controller route, API hook, UI card.
- Use `GbpAutomationError` and `handleGbpError()` for backend error contracts.
- Use existing React Query invalidation and component patterns instead of introducing a parallel state system.

**Reference file:** `src/controllers/gbp-automation/feature-services/GbpReviewReplyDeploymentService.ts` - closest existing external Google write path, attempt tracking, failure handling, and notification pattern.

## Constraints

**Must:**
- Keep all posting draft-first. Scheduler creates drafts only; it must never publish to Google.
- Use the existing `local_post` work item type instead of introducing a separate post table unless execution proves the current schema cannot safely represent the workflow.
- Generate on a twice-monthly cadence using `gbp_automation_settings.local_post_generation_enabled`, `local_post_frequency`, and `next_post_generation_at`.
- Prevent duplicate scheduled drafts for the same organization/location/due window.
- Include a featured image URL from the start. Deploy preview should block deploy when the local post has no usable featured image URL.
- Limit v1 to GBP `STANDARD` local posts with one featured image URL.
- Persist generated `local_post_payload`, `draft_content`, `featured_image_url`, generation input/customizations, and audit events.
- Use content-type-aware safety checks. Review reply PHI checks cannot be blindly reused as local post marketing checks.
- Keep Google calls outside DB transactions, but make local status transitions transactional where multiple local writes must move together.
- Reuse Google API error classification and retry/backoff behavior.
- Maintain client/admin parity for local post draft editing, deleting, previewing, and deploying.
- Update Alloro Docs parity for Local Rankings / Alloro Engage visible workflow changes.

**Must not:**
- Add auto-publish.
- Add a separate media upload/storage pipeline outside the existing site media library.
- Add event, offer, alert, or CTA post types in v1.
- Add new OAuth scopes unless Google proves `business.manage` is insufficient.
- Fold local post deployment into reply deployment with fragile content-type branches.
- Rewrite the review reply UX or backend flow except where content-type shared contracts require it.
- Change production schema unless the spec is revised first with migration risk notes.

**Out of scope:**
- Full content calendar with drag/drop scheduling.
- Bulk post generation or bulk deploy.
- Image generation or asset hosting.
- Multi-image posts.
- Bulk historical post import beyond the posts returned by Google for the selected GBP location.
- Email notifications.

## Risk

**Level:** 4

**Risks identified:**
- Google local posts publishing is an external write with API-specific validation, rate limits, and account policy constraints. → **Mitigation:** isolate publishing in `GbpLocalPostDeploymentService`, reuse `createGbpLocalPost()`, classify Google failures, and keep deploy preview explicit.
- Scheduled generation can create duplicate drafts if repeatable jobs run twice or the worker restarts mid-run. → **Mitigation:** compute a deterministic due window per location, check for an existing local post work item with that window in metadata before creating, and update `next_post_generation_at` only after successful draft creation.
- Local post copy can become generic or accidentally include sensitive review details. → **Mitigation:** use a dedicated local-post safety validator, mark review/settings text as untrusted prompt input, prohibit patient-specific/clinical-private details, and persist blocked generation as a failed event rather than a deployable draft.
- Featured image URLs can be missing, malformed, or unusable by Google. → **Mitigation:** validate URL shape on save/generation, show image preview in UI, block deploy without a URL, and surface Google media errors if Google rejects the image.
- Scheduler fan-out can create noisy jobs across every location. → **Mitigation:** scan only enabled settings due at or before now, enqueue per-location generation with bounded batch size, and log skipped locations with reasons.
- Client/admin parity can drift. → **Mitigation:** keep shared API types and shared small UI components where practical, then document both surfaces in the Done checklist.
- Existing schema may be almost-but-not-quite enough for idempotency metadata. → **Mitigation:** start with `metadata.generationWindow` on `gbp_work_items`; if a uniqueness guarantee requires a new column/index, halt and revise this spec with migration files before implementation.

**Blast radius:**
- GBP Automation client routes, admin routes, and controllers.
- GBP work item model/status transitions.
- GBP worker queue and worker process.
- Google Business Profile write service.
- Client Local Rankings / Alloro Engage UI.
- Admin organization GBP Automation UI.
- Alloro Docs Local Rankings docs and replica.
- Notification and audit event surfaces if post deploy/failure notifications are added.

**Pushback:**
- Do not wire this through the generic agent scheduler table just because it exists. This is not an arbitrary agent run; it is a product workflow with location settings, Google readiness, media, audit trail, retries, and work-item state. Keep the scheduling service inside GBP Automation and enqueue concrete GBP jobs.
- Do not skip image validation. The original feature expectation was "include images from the start"; shipping text-only posts would make the feature look complete while violating the product intent.
- Do not reuse review reply deploy preview verbatim. A post deploy preview needs post payload, image, summary length, and Google local post parent validation, not review resource validation.

## Tasks

### T1: Local Post Contract And Safety
**Do:** Make `local_post` work items first-class in backend contracts. Add post-specific input validation, output safety checks, featured image validation, and update helpers for summary/payload/image fields. Keep review reply safety separate.
**Files:** `src/controllers/gbp-automation/feature-services/GbpLocalPostDraftService.ts`, `src/controllers/gbp-automation/feature-services/GbpLocalPostSafetyService.ts`, `src/controllers/gbp-automation/feature-services/GbpDeployPreviewService.ts`, `src/models/GbpWorkItemModel.ts`, `src/models/website-builder/ReviewModel.ts`, `src/controllers/gbp-automation/feature-utils/controllerResponses.ts`, `src/agents/gbpAgents/LocalPost.md`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Scheduled And Manual Post Draft Generation
**Do:** Add a GBP-owned scheduler service that tracks due enabled locations and advances the cadence safely. Manual "generate next post draft now" endpoints must require a per-post image URL, create a refresh-safe queued work item, and let the worker generate the draft without publishing. Because there is no default image anymore, due scheduled generation skips text generation until a per-post image workflow exists.
**Files:** `src/controllers/gbp-automation/feature-services/GbpLocalPostDraftService.ts`, `src/controllers/gbp-automation/feature-services/GbpLocalPostScheduleService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`, `src/workers/processors/gbpAutomation.processor.ts`, `src/workers/worker.ts`, `src/workers/queues.ts`, `src/models/GbpAutomationSettingsModel.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Local Post Deploy Pipeline
**Do:** Add post-specific deploy preview and deployment. Deploy should approve current content, enqueue a `deploy-local-post` job, call `createGbpLocalPost()`, store Google response/resource name, record attempts/events, classify failures, retry transient failures, and return failed posts to draft with actionable errors.
**Files:** `src/controllers/gbp-automation/feature-services/GbpLocalPostDeploymentService.ts`, `src/controllers/gbp-automation/feature-services/GbpWorkItemActionService.ts`, `src/controllers/gbp-automation/feature-services/GbpDeployPreviewService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`, `src/workers/processors/gbpAutomation.processor.ts`, `src/controllers/gbp/gbp-services/gbp-write.service.ts`, `src/models/GbpDeploymentAttemptModel.ts`, `src/models/GbpWorkEventModel.ts`, `src/models/GbpWorkItemModel.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T4: API Types And Hooks
**Do:** Extend client/admin API modules and React Query hooks with local post save, regenerate, delete draft, generate-now, deploy preview, and deploy actions. Ensure invalidation updates both review queues and draft lists without duplicate queries.
**Files:** `frontend/src/api/gbpAutomation.ts`, `frontend/src/api/admin-gbp-automation.ts`, `frontend/src/hooks/queries/useGbpAutomationQueries.ts`, `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts`, `frontend/src/lib/queryClient.ts`
**Depends on:** T2, T3
**Verify:** `cd frontend && npm run build`

### T5: Client And Admin Post UX
**Do:** Add a user-friendly local post workflow to client Alloro Engage and admin GBP Automation. Drafts should show source review context when present, summary textarea, per-post image URL with preview, status/errors, Save, Generate Draft, Deploy to GBP, and Delete Draft. Settings should expose post automation enablement and next generation countdown only; generation and image entry live in GBP Posts. Keep the review queue uncluttered.
**Files:** `frontend/src/components/dashboard/gbp-automation/*`, `frontend/src/components/dashboard/gbp-automation/GbpLocalPostWorkItemCard.tsx`, `frontend/src/components/Admin/gbp-automation/*`
**Depends on:** T4
**Verify:** `cd frontend && npm run build`; Manual: `/rankings` Alloro Engage and admin GBP Automation draft/settings tabs

### T6: Docs Parity
**Do:** Update Alloro Docs Local Rankings page and replica to document scheduled GBP post drafts, featured image requirement, post draft editing/deploying, and the distinction between review replies and post drafts.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T5
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`

### T7: Published GBP Posts Manager
**Do:** Extend GBP Posts into a real manager by listing existing published Google Business Profile local posts for the selected location, allowing edits to summary/image URL, and allowing explicit Google-backed deletion. Keep published Google posts distinct from Alloro draft work items, but reconcile local `published` work items when their Google resource name is edited or deleted.
**Files:** `src/controllers/gbp/gbp-services/gbp-write.service.ts`, `src/controllers/gbp-automation/feature-services/GbpPublishedLocalPostService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`, `src/models/GbpWorkItemModel.ts`, `frontend/src/api/gbpAutomation.ts`, `frontend/src/api/admin-gbp-automation.ts`, `frontend/src/hooks/queries/useGbpAutomationQueries.ts`, `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts`, `frontend/src/lib/queryClient.ts`, `frontend/src/components/dashboard/gbp-automation/GbpPublishedLocalPostCard.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpClientDraftsPanel.tsx`, `frontend/src/components/Admin/gbp-automation/AdminGbpWorkItemsPanel.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpAutomationPanel.tsx`, `frontend/src/components/Admin/OrgGbpAutomationTab.tsx`
**Depends on:** T3, T4, T5
**Verify:** `npx tsc --noEmit`; `cd frontend && npm run build`; Manual: published posts load in admin/client GBP Posts, save edits, and delete only after explicit confirmation.

### T8: Local Post Sync, Pagination, And Settings Clarity
**Do:** Mirror GBP local posts into the database by Google resource name, add manual posts sync, list published posts from the DB with pagination/counts, and separate review-reply vs GBP-post feature statuses in Settings/Diagnostics. Reviews remain DB-synced through the existing review sync flow.
**Files:** `src/database/migrations/20260526020000_create_gbp_local_posts.ts`, `src/models/GbpLocalPostModel.ts`, `src/models/GbpSyncHealthModel.ts`, `src/controllers/gbp-automation/feature-services/GbpPublishedLocalPostService.ts`, `src/controllers/gbp-automation/feature-services/GbpReadinessService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`, `frontend/src/api/gbpAutomation.ts`, `frontend/src/api/admin-gbp-automation.ts`, `frontend/src/hooks/queries/useGbpAutomationQueries.ts`, `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts`, `frontend/src/components/dashboard/gbp-automation/GbpSettingsSection.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpClientDraftsPanel.tsx`, `frontend/src/components/Admin/gbp-automation/AdminGbpWorkItemsPanel.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpAutomationPanel.tsx`, `frontend/src/components/Admin/OrgGbpAutomationTab.tsx`
**Depends on:** T7
**Verify:** `npx tsc --noEmit`; `npm run build`; `cd frontend && npm run build`

### T9: Auto Sync Registration And Source Labels
**Do:** Mark review and post sync-health rows with `metadata.syncSource` as `auto` or `manual`, register a daily auto sync for published GBP local posts alongside the existing daily review sync, and show the last-run source pill in Settings for admin and client.
**Files:** `src/workers/worker.ts`, `src/workers/processors/reviewSync.processor.ts`, `src/workers/processors/gbpAutomation.processor.ts`, `src/controllers/gbp-automation/GbpReviewManagementController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/feature-services/GbpPublishedLocalPostService.ts`, `src/models/GbpSyncHealthModel.ts`, `frontend/src/api/gbpAutomation.ts`, `frontend/src/components/dashboard/gbp-automation/GbpSettingsSection.tsx`, `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T8
**Verify:** `npx tsc --noEmit`; `npm run build`; `cd frontend && npm run build`; `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`

### T10: Site-Scoped Post Media Uploads And Existing Post Image Rendering
**Do:** Render synced Google post images using Google media `sourceUrl`/`googleUrl` fallbacks, and replace raw post image URL entry with a scoped image uploader for generated drafts, draft cards, and published post cards. Uploads must resolve the organization-linked website project first and must fail without uploading when no linked site project exists.
**Files:** `src/controllers/gbp-automation/feature-services/GbpPublishedLocalPostService.ts`, `src/controllers/gbp-automation/feature-services/GbpPostMediaService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`, `frontend/src/api/gbpAutomation.ts`, `frontend/src/api/admin-gbp-automation.ts`, `frontend/src/hooks/queries/useGbpAutomationQueries.ts`, `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts`, `frontend/src/components/dashboard/gbp-automation/GbpPostImageUploader.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpClientDraftsPanel.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpLocalPostWorkItemCard.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpPublishedLocalPostCard.tsx`, `frontend/src/components/Admin/gbp-automation/AdminGbpWorkItemsPanel.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpAutomationPanel.tsx`, `frontend/src/components/Admin/OrgGbpAutomationTab.tsx`, `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T7, T8
**Verify:** `npx tsc --noEmit`; `npm run build`; `cd frontend && npm run build`; Manual: synced published post images render and uploads are blocked for orgs without a linked website project.

## Migration Notes

Rev 3 adds `gbp_local_posts` as a local mirror of Google Business Profile local posts. Production risk is low-to-medium: this is an additive table with foreign keys and indexes only, no backfill, no destructive data rewrite, and no changes to existing rows. Manual sync populates the table after deployment. Rollback drops the mirror table only; it does not delete Google posts or `gbp_work_items`.

## Done
- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` passes.
- [x] `cd frontend && npm run build` passes.
- [x] `cd /Users/rustinedave/Desktop/alloro-docs && npm run build` passes.
- [ ] Manual: client `/rankings` shows Alloro Engage post drafts and settings without cluttering the review queue.
- [ ] Manual: admin GBP Automation shows the same post draft workflow with admin context.
- [ ] Manual: due scheduled generation skips draft creation without a per-post image and advances `next_post_generation_at` without publishing.
- [ ] Manual: "Generate next post draft now" queues a generation job, then creates a draft and never publishes it.
- [ ] Manual: local post draft can be edited, saved, regenerated, deleted, and deployed.
- [ ] Manual: deploy preview blocks missing/invalid featured image URL and over-length summary.
- [ ] Manual: successful deploy records Google response/resource name and marks the work item published.
- [ ] Manual: existing Google local posts are visible in GBP Posts Manager for admin and client views.
- [ ] Manual: existing Google local posts can be edited and deleted from Google without deleting unrelated Alloro drafts.
- [ ] Manual: existing Google local posts can be manually synced, stored by Google resource name, and paginated from the DB.
- [ ] Manual: Settings shows separate Review replies and GBP post drafts toggles with matching language.
- [ ] Manual: Diagnostics separates review reply feature status from GBP post draft feature status.
- [ ] Manual: failed deploy records a classified error, returns item to draft, and supports retry where appropriate.
- [ ] No review reply regression in draft, save, deploy, delete draft, replied review edit/delete, or metrics cards.
- [x] Migration risk is documented; migration runs on dev first and production only after promotion to `main`.

## Verification Notes

### 2026-05-25
- Automated checks passed: `npx tsc --noEmit`, `npm run build`, `cd frontend && npm run build`, and `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`.
- Frontend touched-file lint passed with `npx eslint` against the modified GBP Automation files. Full frontend lint still fails on pre-existing unrelated repo-wide errors.
- Manual client/admin pilot verification was not claimed in this execution pass; direct `/rankings` is not the correct validation route for the client pilot context.
- Live Google publish-path validation was not run to avoid writing to GBP without a controlled test target.

### 2026-05-26
- Local API smoke passed through the non-publishing path: health check, missing featured-image block, settings save/restore, manual post generation, over-length save rejection, safe save, regenerate, approve, deploy-preview, and delete-draft cleanup.
- Smoke intentionally stopped before `POST /api/gbp-automation/work-items/:id/deploy`; no Google Business Profile post was published.
- Generation initially failed local-post safety because the model wrote reply-like private-detail language. `LocalPost.md` and `GbpLocalPostDraftService` were tightened to frame posts as public practice updates and retry bounded safety repairs before returning a draft.
- Client/admin visual pilot verification is still not claimed from this pass because Chrome focus drift made the open pilot window unreliable from automation.
- Rev 3 automated checks passed: `npx tsc --noEmit`, `npm run build`, `cd frontend && npm run build`, focused frontend `npx eslint` on touched GBP files, and `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`.
- Browser smoke on local admin GBP Automation verified Settings now shows separate Review replies and GBP post drafts toggles, Manual reviews/posts sync cards, diagnostics without the single ambiguous `featureEnabled` row, and GBP Posts reads the local synced-post list with a clear empty state. No Google post sync/write action was clicked.
- Local dev migration was applied with `npm run db:migrate` (Batch 112, one migration) and read-only DB verification confirmed `gbp_local_posts` exists.
- Rev 4 automated checks passed: `npx tsc --noEmit`, `npm run build`, `cd frontend && npm run build`, focused frontend `npx eslint` on the touched Settings/API files, and `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`.
- Code inspection confirmed review sync already had a daily all-org schedule. Rev 4 tags daily review sync as `auto`, tags manual review/post sync as `manual`, and registers a daily `sync-local-posts` job for the local GBP post mirror at 4:45 AM UTC. No live Google sync/write was triggered.
- Local BullMQ repeatable-job inspection confirmed `daily-review-sync` on `minds-review-sync`, plus `sync-local-posts` and `scan-local-post-generation` on `gbp-automation-deployment`.
- Rev 5 automated checks passed: `npx tsc --noEmit`, `npm run build`, `cd frontend && npm run build`, focused frontend `npx eslint` on the touched GBP media/upload files, and `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`.
- Local DB/service smoke confirmed synced published posts now return `featuredImageUrl` from Google `media.googleUrl`, and the new upload service returns `GBP_SITE_PROJECT_MISSING` before any media-library write when the organization has no linked website project.
- Rev 6 automated checks passed: `npx tsc --noEmit`, `npm run build`, `cd frontend && npm run build`, focused frontend `npx eslint` on touched GBP post files, `git diff --check`, and `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`.
- Full frontend lint remains blocked by pre-existing unrelated repo-wide errors; the touched GBP files pass targeted lint.
- Rev 7 automated checks passed: `npx tsc --noEmit`, `npm run build`, `cd frontend && npm run build`, focused frontend `npx eslint` on touched GBP post files, `git diff --check`, and `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`.
- Rev 8 automated checks passed: `npx tsc --noEmit`, `npm run build`, `cd frontend && npm run build`, focused frontend `npx eslint` on touched GBP post files, and `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`.
- Full `cd frontend && npm run lint` still fails on pre-existing unrelated repo-wide errors; the touched GBP post files pass targeted lint.
- Rev 9 automated checks passed: `npx tsc --noEmit`, `npm run build`, `cd frontend && npm run build`, focused frontend `npx eslint` on touched GBP post files, `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`, and `git diff --check` across app/docs.
- Full `cd frontend && npm run lint` was rerun after Rev 9 and still fails on the same pre-existing unrelated repo-wide errors; touched GBP post files pass targeted lint.
- Rev 10 automated checks passed: `npx tsc --noEmit`, `npm run build`, `cd frontend && npm run build`, focused frontend `npx eslint` on touched GBP review/nav files, `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`, and `git diff --check` across app/docs.
- Full `cd frontend && npm run lint` was rerun after Rev 10 and still fails on pre-existing unrelated repo-wide errors; touched GBP review/nav files pass targeted lint.

## Revision Log

### Rev 1 — 2026-05-26
**Change:** Remove the default post-image workflow from the UX and require a per-post image URL for every GBP post draft. Manual post generation should run as a durable worker job, not as a page-local synchronous action.
**Reason:** A default image hides the fact that every GBP post needs its own intentional image. Long-running generation must survive refreshes and should keep the UI button locked until the job resolves.
**Updated Done criteria:**
- [ ] Settings no longer presents a default featured image as the normal post image path.
- [ ] GBP Posts Manager requires a per-post image URL before generation/publish.
- [ ] Manual post generation enqueues a job and returns a visible in-progress state.
- [ ] Refreshing while generation is running still shows a loading alert and polling frees the button when ready.

### Rev 2 — 2026-05-26
**Change:** Promote GBP Posts from draft-only workflow to a full posts manager that can list, edit, and delete existing published Google Business Profile posts.
**Reason:** A posts tab that only generates new drafts is incomplete for day-to-day GBP management. Existing Google posts are the source of truth after publish and need to be manageable in the same surface.
**Updated Done criteria:**
- [ ] Existing published Google local posts load in the GBP Posts tab for the selected location.
- [ ] Editing a published Google local post validates summary/image input, patches Google, and refreshes the list.
- [ ] Deleting a published Google local post requires explicit confirmation, calls Google delete, and does not delete unrelated draft work items.
- [ ] Local `published` work items are reconciled when their matching Google resource name is edited or deleted.

### Rev 3 — 2026-05-26
**Change:** Store synced GBP local posts in a local DB mirror keyed by Google resource name, paginate published posts from the DB, add manual posts sync, and split review/post feature statuses in Settings diagnostics.
**Reason:** Live-fetch-only makes counts, pagination, and durable identity weak. Reviews already use the stronger DB-synced pattern; posts should follow that model before this grows into a real manager.
**Updated Done criteria:**
- [ ] `gbp_local_posts` migration is additive and production-safe.
- [ ] Manual posts sync fetches Google local posts and upserts them by Google resource name.
- [ ] GBP Posts Manager reads from DB with total/page/limit metadata.
- [ ] Review sync remains review-only and post sync remains post-only.
- [ ] Settings has parallel toggles and status copy for Review replies and GBP post drafts.
- [ ] Diagnostics displays separate review/post feature checks instead of a single ambiguous `featureEnabled`.

### Rev 4 — 2026-05-26
**Change:** Add source metadata for sync health, surface `auto`/`manual` last-run pills in Settings, and register an automatic daily published-post sync to match the existing automatic daily review sync.
**Reason:** Manual sync already existed, and reviews already had an org-wide scheduled sync. GBP Posts needed the same durable background refresh path so the local post mirror does not depend only on a user pressing the manual button.
**Updated Done criteria:**
- [ ] Existing daily review sync writes sync health with `metadata.syncSource = "auto"`.
- [ ] Manual review and post sync writes sync health with `metadata.syncSource = "manual"`.
- [ ] Daily published-post sync is registered in the worker and writes `local_posts` sync health with `metadata.syncSource = "auto"`.
- [ ] Settings shows the last sync run source as an `auto` or `manual` pill for both reviews and posts.

### Rev 5 — 2026-05-26
**Change:** Render existing published Google post images from synced Google media and replace post image URL entry with a site-scoped media uploader.
**Reason:** Google returns existing post images as media `googleUrl`, not always `sourceUrl`, so the UI showed placeholders. New GBP post images should live in the organization's linked site media library, not arbitrary raw URL entry.
**Updated Done criteria:**
- [ ] Published GBP posts render synced image media when Google returns `googleUrl`.
- [ ] Generate Post Draft uses a media uploader instead of a raw URL input.
- [ ] Draft and published post image changes use the same uploader.
- [ ] Upload API refuses to upload when the organization has no linked website project.

### Rev 6 — 2026-05-26
**Change:** Fix published-post save UX and Google media updates: keep the existing list rendered during background refetch, preserve Google output-only fields after sparse PATCH responses, and upload GBP post images as Google-compatible JPG/PNG media instead of site-optimized WebP.
**Reason:** Text edits persisted but the list flashed skeletons, `Open on Google` disappeared because `searchUrl` was overwritten by a sparse response, and Google rejected uploaded replacement images because the shared media pipeline converted them to WebP before handing the URL to GBP.
**Updated Done criteria:**
- [ ] Published-post save does not replace the list with skeleton cards during background refetch.
- [ ] `Open on Google` remains visible after successful text-only saves when Google omits `searchUrl` from the PATCH response.
- [ ] GBP post image uploads preserve JPG/PNG format for Google while still storing the media in the linked site media library.
- [ ] WebP uploads are blocked for GBP post images with clear copy.

### Rev 7 — 2026-05-27
**Change:** Make the published-post state pill user-facing instead of raw Google API state, and add successful image-upload feedback for the GBP post image uploader.
**Reason:** Google can keep returning `PROCESSING` for a synced local post even after the visible GBP post is updated, which makes the manager look stuck. Image upload also changed form state silently, so users did not know whether the upload succeeded or what to do next.
**Updated Done criteria:**
- [ ] Published posts with a Google URL do not show the raw `PROCESSING` state as the primary pill.
- [ ] Rejected Google posts remain visibly distinct.
- [ ] GBP post image uploads show a success toast with the next required action.

### Rev 8 — 2026-05-27
**Change:** Make published-post editing read as a staged Google update flow with explicit status help, unsaved-change copy, and a `Save to Google` action.
**Reason:** The post card still mixed raw sync state, upload state, and Google save state in a way that made users wonder what happened after upload or why the Google state pill remained visible.
**Updated Done criteria:**
- [ ] Published post cards explain that text/image edits are staged until saved to Google.
- [ ] Dirty published posts show an inline unsaved-changes indicator.
- [ ] The primary save action says `Save to Google` / `Saving to Google`.
- [ ] The card keeps the Google-open and delete controls visually separate from the staged-save action.

### Rev 9 — 2026-05-27
**Change:** Restructure GBP Posts Manager into a create-modal plus `Published` / `Drafts` tabs, and show the next scheduled post draft countdown inside the manager.
**Reason:** The inline upload/generate bar made post creation feel like a form glued above published posts. Drafts also needed their own home so newly generated posts stay clearly draft-only until deployed.
**Updated Done criteria:**
- [ ] GBP Posts Manager shows a single `Create post draft` button that opens an image-upload modal.
- [ ] The manager shows the next scheduled post draft countdown.
- [ ] Published posts and post drafts are separated into `Published` and `Drafts` tabs.
- [ ] Generated post drafts switch the manager to `Drafts` and remain undeployed until the user deploys them.
- [ ] The old `Published Google posts` section label is removed.

### Rev 10 — 2026-05-27
**Change:** Move review reply drafts out of the top-level GBP Automation navigation and into the Reviews lifecycle as `Needs Reply`, `Reply Drafts`, and `Replied`.
**Reason:** Reply drafts are not a separate product area; they are the middle state of replying to a review. Keeping them inside Reviews reduces navigation clutter and makes the workflow easier to scan.
**Updated Done criteria:**
- [ ] Top-level GBP Automation navigation no longer shows `Reply Drafts`.
- [ ] Reviews tabs read `Needs Reply`, `Reply Drafts`, and `Replied`.
- [ ] Reply draft cards still support save, deploy, retry, and delete from the nested Reviews tab.
- [ ] Admin organization GBP submenu removes `Reply Drafts`.
- [ ] Client and admin surfaces use the same review lifecycle hierarchy.
