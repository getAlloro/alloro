# GBP Review Reply Draft Deploy Foundation

## Why
Alloro can read GBP reviews and existing owner replies, but it cannot draft, approve, deploy, retry, or audit GBP replies from inside the app. We need the review-reply workflow first, while laying the shared content/deployment foundation that future twice-monthly GBP post generation will reuse.

## What
Build a first-class GBP automation foundation and ship the first milestone: AI-drafted GBP review replies with human approval, direct Alloro-to-Google deployment, retry/audit history, in-app notifications, and admin/client UI. The schema and service boundaries must support future GBP local posts with featured images and twice-monthly generation, but full automated post generation/publishing is not in this first execution milestone.

## Context

**Relevant files:**
- `src/models/website-builder/ReviewModel.ts` - current OAuth/Apify review storage; OAuth reviews have `google_review_name` and are the only valid v1 reply targets.
- `src/workers/processors/reviewSync.processor.ts` - syncs GBP reviews and existing owner replies into `website_builder.reviews`.
- `src/controllers/gbp/gbp-services/review-handler.service.ts` - read-only review API helper; new reply write helper should live near this.
- `src/controllers/gbp/gbp-services/post-handler.service.ts` - read-only local post helper; future create-local-post helper should live near this.
- `src/controllers/gbp/gbp-services/gbp-api.service.ts` - shared OAuth header/client helper.
- `src/auth/oauth2Helper.ts` - refresh-token-backed OAuth client creation by Google connection.
- `src/models/GooglePropertyModel.ts` - selected GBP profile binding through `google_properties`.
- `src/models/NotificationModel.ts` - existing in-app notification feed.
- `src/workers/queues.ts` and `src/workers/worker.ts` - BullMQ queue and worker registration.
- `frontend/src/components/dashboard/RankingsDashboard.tsx` - client Local Rankings page where the intuitive UI should appear.
- `frontend/src/pages/admin/OrganizationDetail.tsx` - organization-scoped admin surface; better canonical home than website-project Reviews.
- `frontend/src/components/Admin/ReviewsTab.tsx` and `frontend/src/components/Admin/reviews/ReviewRow.tsx` - existing admin review list reference, not the canonical ownership boundary.
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts` - docs copy for Local Rankings.
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx` - docs visual replica that must stay in parity.

**Patterns to follow:**
- Backend flow must stay `Routes -> Controllers -> Services -> Models`; no Knex queries outside models.
- New files should mirror the small-file service/model split used by `ReviewModel`, `GooglePropertyModel`, `reviewSync.processor.ts`, and the notification controller/service pattern.
- Frontend server state must use typed API modules plus React Query hooks and `QUERY_KEYS`, not raw API calls inside new components.
- Agent prompts should use the existing `src/agents/service.prompt-loader.ts` pattern.
- In-app alerts should use `NotificationModel` with `type: "system"` and GBP-specific `metadata.kind`, avoiding a notification-type schema migration unless needed later.

**Reference files:**
- `src/models/SkillWorkRunModel.ts` - status transition and audit-shaped model reference.
- `src/models/website-builder/ReviewModel.ts` - review identity and source modeling reference.
- `src/workers/processors/reviewSync.processor.ts` - Google API worker reference.
- `frontend/src/hooks/queries/useAdminReviewQueries.ts` - React Query reference for review actions.
- `frontend/src/components/Admin/OrgRankingsTab.tsx` - organization/location-scoped admin tab reference.
- `frontend/src/components/Admin/ReviewsTab.tsx` - review-list UX reference.

**Google API references verified during planning:**
- Review replies: `PUT https://mybusiness.googleapis.com/v4/{name=accounts/*/locations/*/reviews/*}/reply`, creates or updates a reply for verified locations and accepts `business.manage`.
- Review reply body: `ReviewReply.comment` is plain text with max length 4096 bytes; Google returns `reviewReplyState`.
- Local posts: `POST https://mybusiness.googleapis.com/v4/{parent=accounts/*/locations/*}/localPosts`, accepts `business.manage`.
- Local post media: `LocalPost.media[]` supports `MediaItem`; for local posts, `sourceUrl` is the supported data field.

## Constraints

**Must:**
- Start with review reply draft + approval + deploy.
- Support both admin and client surfaces.
- Keep admin more technical and client Local Rankings UI more intuitive.
- Allow all org roles for v1 actions, but every action must be org/location scoped through auth, RBAC, and location scope.
- Use direct Alloro-to-Google deployment, not n8n publish channels.
- Keep review-reply automation behind an explicit org/location enablement flag, disabled by default.
- Store full audit history: original draft, edited draft, approver, deployer, timestamps, Google request/response, error, retry attempts, and final published text.
- Return failed deployments to editable draft state, keep the failed attempt record, expose retry, and create an in-app notification.
- Create two prompt files: one for GBP review replies and one for future GBP local posts.
- Support organization/location-level generation customizations for both prompt types.
- Enforce public healthcare/dental reply safety: do not confirm patient relationship, mention treatment specifics, expose PHI-like details, make medical/legal claims, or exceed Google's 4096-byte reply limit.
- Include post-ready fields for featured image URL, post schedule metadata, and next post generation countdown data.
- Expose backend-owned readiness detection for Google reconnection, missing GBP profile, no replyable reviews, and Maps/Apify-only review states.
- Update Alloro Docs when dashboard UI changes.

**Must not:**
- Reply to Apify-only reviews in v1; they lack an official `google_review_name` target.
- Put GBP write ownership under website project identity; website reviews can reference the data, but GBP reply ownership is organization/location/profile scoped.
- Auto-publish in v1.
- Store Google access tokens or refresh tokens in new tables.
- Treat frontend role checks as security.
- Add new dependencies unless the existing `axios`, `googleapis`, BullMQ, and LLM helpers cannot support the job.
- Refactor existing rankings, review sync, or Minds work-run systems beyond what is required for integration.

**Out of scope for this first milestone:**
- Full automated GBP local post generation and deployment.
- Calendar editing for local posts.
- Post media upload pipeline beyond storing/validating a featured image source URL contract.
- Auto-deploy based on approval history.
- Email notifications.
- Deleting Google review replies.

## Risk

**Level:** 4

**Risks identified:**
- Public Google writes can damage client reputation if a bad reply is published -> **Mitigation:** human approval is mandatory in v1; no auto-publish.
- "All roles can approve" is permissive and could be abused -> **Mitigation:** keep it explicit as v1 policy, audit `approved_by_user_id` and `published_by_user_id`, and enforce org/location scope server-side.
- Apify reviews look replyable but are not official reply targets -> **Mitigation:** only enable draft/deploy for reviews where `source = 'oauth'` and `google_review_name` is present.
- Direct Google deployment can partially fail after local approval -> **Mitigation:** deploy through a worker, record each attempt, return the work item to draft state on failure, expose retry, and notify in-app.
- New schema will run first on dev and later production -> **Mitigation:** additive tables/indexes only; no destructive migration; down migration drops only the new tables in reverse order.
- Post foundations can overgrow the reply milestone -> **Mitigation:** include shared schema/settings and a local-post prompt only; defer full post generation/publishing to a second spec or revision.
- Canonical admin placement could drift into website-project Reviews -> **Mitigation:** build the canonical technical admin UI under organization/location context and optionally link from website reviews later.
- Local Rankings is already a large component -> **Mitigation:** extract focused GBP automation panels/hooks instead of growing `RankingsDashboard.tsx` further.
- Google API behavior and moderation states can change -> **Mitigation:** keep request/response payloads in attempts, surface Google errors directly to admin, and keep API methods isolated in GBP services.
- Reconnection/replyability logic can drift if each UI checks it differently -> **Mitigation:** add one backend readiness service and endpoint as the source of truth for client and admin UI.
- Review replies in healthcare/dental contexts can accidentally acknowledge patient status or disclose PHI-like details -> **Mitigation:** add prompt rules plus pre-deploy content validation that blocks unsafe replies and returns an editable error.
- Feature rollout could accidentally expose public Google write actions before a client is ready -> **Mitigation:** store `review_reply_enabled` in automation settings, default it to false, and include `feature_disabled` in readiness until enabled.

**Blast radius:**
- GBP OAuth and selected property resolution.
- Review sync and existing review display.
- Local Rankings client dashboard.
- Admin organization detail tabs.
- BullMQ worker startup.
- Notifications feed.
- Database migration pipeline on `dev/dave`, then production after merge to `main`.
- Alloro Docs Local Rankings replica/page copy.

**Pushback:**
- Building review replies and full post automation in one execution would be too large. The right approach is one umbrella foundation with phased execution. Review replies prove the Google write path, approval flow, audit trail, and retry behavior before posts add scheduling, image handling, and content calendar complexity.
- Putting this only in the existing website Reviews tab is the wrong ownership layer. Reviews used for website rendering are website-adjacent, but replying to Google is a GBP profile operation tied to organization, location, Google connection, and selected GBP property.

## Tasks

### T1: Add GBP Automation Schema And Models
**Do:** Add additive schema for GBP content settings, work items, deployment attempts, and audit events. Implement models for settings, work items, attempts, and events. Use UUID work item ids, org/location/google_property foreign keys, `content_type` values for `review_reply` and `local_post`, draft/approval/deploy status fields, source review linkage, post-ready featured image fields, retry fields, and JSON payload columns. Include `review_reply_enabled` defaulting to false. Use partial unique indexes for org-level default settings versus location-specific settings.
**Files:** `src/database/migrations/*_create_gbp_automation_tables.ts`, `src/models/GbpAutomationSettingsModel.ts`, `src/models/GbpWorkItemModel.ts`, `src/models/GbpDeploymentAttemptModel.ts`, `src/models/GbpWorkEventModel.ts`, `src/models/index.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Add Google GBP Write Services
**Do:** Add isolated service helpers for review reply publish and local post create. Review reply uses the OAuth connection on the selected `google_properties` row, builds the official review reply URL from `google_review_name`, sends `ReviewReply.comment`, and returns Google response metadata. Local post helper accepts the future post payload contract with summary/topic type/call-to-action/featured media source URL but does not need a caller in v1.
**Files:** `src/controllers/gbp/gbp-services/review-handler.service.ts`, `src/controllers/gbp/gbp-services/post-handler.service.ts`, `src/controllers/gbp/gbp-services/gbp-write.service.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Add Generation Prompts And Draft Service
**Do:** Create `ReviewReply.md` and `LocalPost.md` prompts under a GBP agent folder. Add a generation service that loads org/location customizations, builds review context from `ReviewModel`, generates review-reply drafts, stores prompt version/input metadata, applies healthcare-safe public reply rules, and leaves local-post generation wiring behind a service boundary for Phase 2.
**Files:** `src/agents/gbpAgents/ReviewReply.md`, `src/agents/gbpAgents/LocalPost.md`, `src/controllers/gbp-automation/feature-services/GbpDraftGenerationService.ts`, `src/controllers/gbp-automation/feature-services/GbpCustomizationService.ts`, `src/controllers/gbp-automation/feature-services/GbpContentSafetyService.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T4: Add GBP Readiness Detection
**Do:** Add one backend readiness service and endpoint that reports whether a location can generate/deploy GBP replies. It must check feature enablement, Google connection presence, refresh-token presence, `business.manage` scope, selected GBP property, `account_id`, `external_id`, replyable OAuth review counts, Maps/Apify-only review counts, and actionable next steps. Return statuses such as `ready`, `feature_disabled`, `reconnect_required`, `missing_gbp_property`, `missing_business_manage_scope`, `no_replyable_reviews`, and `maps_only_reviews`.
**Files:** `src/controllers/gbp-automation/feature-services/GbpReadinessService.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T5: Add Review Reply API Surface
**Do:** Add authenticated org/location-scoped endpoints to list GBP work items, generate a reply draft, update draft text, approve, reject, deploy, retry deploy, fetch attempt history, and read/update generation customizations. Add super-admin organization endpoints for the technical admin surface using the same services. Draft/deploy actions must call the readiness service and content safety service, returning machine-readable disable/block reasons instead of relying on frontend checks.
**Files:** `src/routes/gbpAutomation.ts`, `src/routes/admin/gbpAutomation.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/feature-services/GbpWorkItemService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts`, `src/index.ts`
**Depends on:** T1, T2, T3, T4
**Verify:** `npx tsc --noEmit`

### T6: Add Deployment Worker And Notifications
**Do:** Add a BullMQ processor for GBP deployment jobs. The worker loads the work item, validates deployability through the readiness service, re-runs content safety before the Google write, writes a deployment attempt, calls the Google write service, updates published fields on success, returns the item to draft with failure metadata on failure, and creates in-app notifications for draft-ready, publish-success, and deploy-failed states.
**Files:** `src/workers/queues.ts`, `src/workers/worker.ts`, `src/workers/processors/gbpAutomation.processor.ts`, `src/controllers/gbp-automation/feature-services/GbpNotificationService.ts`
**Depends on:** T1, T2, T5
**Verify:** `npx tsc --noEmit`

### T7: Add Client Local Rankings UI
**Do:** Add an intuitive GBP actions panel to the Local Rankings dashboard. It shows readiness banners, reconnect/select-GBP/sync-review next steps, reply drafts needing review, quick edit/approve/deploy actions, deployment status, failed retry CTA, disabled reasons for Maps/Apify-only reviews, and a next GBP post generation countdown sourced from automation settings. Keep new UI extracted into focused components/hooks.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`, `frontend/src/components/dashboard/gbp-automation/*`, `frontend/src/api/gbpAutomation.ts`, `frontend/src/hooks/queries/useGbpAutomationQueries.ts`, `frontend/src/lib/queryClient.ts`
**Depends on:** T4, T5, T6
**Verify:** `cd frontend && npm run build`

### T8: Add Technical Admin UI
**Do:** Add a GBP Automation tab under the organization detail admin surface. Include location filter context, readiness diagnostics, enablement controls, work item list, status filters, draft text, source review metadata, Google resource names, attempt history, raw error details, retry controls, and org/location customization settings for both review replies and future posts.
**Files:** `frontend/src/pages/admin/OrganizationDetail.tsx`, `frontend/src/components/Admin/OrgGbpAutomationTab.tsx`, `frontend/src/components/Admin/gbp-automation/*`, `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts`, `frontend/src/api/admin-gbp-automation.ts`, `frontend/src/lib/queryClient.ts`
**Depends on:** T4, T5, T6
**Verify:** `cd frontend && npm run build`

### T9: Add Review Sync Integration
**Do:** Make review sync/update behavior aware of published replies from Alloro. After a successful deploy, update the local review reply fields immediately. On later sync, preserve Google as the source of truth while retaining Alloro audit records. Ensure already-replied reviews show current reply state and do not create duplicate active drafts unless explicitly regenerated.
**Files:** `src/workers/processors/reviewSync.processor.ts`, `src/models/website-builder/ReviewModel.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts`
**Depends on:** T1, T6
**Verify:** `npx tsc --noEmit`

### T10: Update Docs Parity
**Do:** Update Alloro Docs for the Local Rankings GBP actions panel, readiness states, post generation countdown, review reply notifications, and any new tooltip/walkthrough copy. If admin UI gets documented later, note that as admin-only docs scope.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`, `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/notifications.ts`
**Depends on:** T7
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`

## Parallelization

After T1 is done, T2, T3, and T4 can proceed in parallel. T5 depends on T1-T4. T6 depends on T2 and T5. T7 and T8 can proceed after T4-T6. T9 follows T6. T10 follows visible UI decisions from T7.

If using sub-agents during execution:
- Backend schema/models/API worker sub-agent owns T1-T6 and T9.
- Client dashboard sub-agent owns T7 only.
- Admin UI sub-agent owns T8 only.
- Docs sub-agent owns T10 only.

## Done
- [ ] New migration is additive, reversible, and called out as running on dev first, then production after merge.
- [ ] `npx tsc --noEmit` passes or only documented pre-existing errors remain.
- [ ] `cd frontend && npm run build` passes.
- [ ] Relevant touched-file lint passes or only pre-existing repo-wide lint noise remains.
- [ ] Review replies can be generated, edited, approved, deployed to Google, retried after failure, and audited.
- [ ] Unsafe public reply content is blocked before deployment with an editable reason.
- [ ] Review-reply automation is disabled by default and readiness returns `feature_disabled` until enabled for the org/location.
- [ ] Readiness endpoint returns actionable states for ready, reconnect required, missing GBP profile, no replyable OAuth reviews, and Maps/Apify-only reviews.
- [ ] Apify-only reviews cannot be deployed as GBP replies.
- [ ] Deploy failure returns the item to editable draft state and creates an in-app notification.
- [ ] Admin UI exposes technical readiness, attempt, and error details.
- [ ] Client Local Rankings UI exposes intuitive readiness, reply review/deploy actions, disabled reasons, and post generation countdown.
- [ ] Org/location customizations affect generation prompts.
- [ ] Alloro Docs Local Rankings and notifications parity is updated.

## Revision Log

### Rev 1 - May 24, 2026
**Change:** Added GBP readiness detection as a first-class backend service, endpoint, UI state, and Done criterion. Added public healthcare/dental reply safety as a prompt and pre-deploy validation requirement. Added default-off review-reply enablement for controlled rollout.
**Reason:** Users should not have to guess whether they need to reconnect Google, select a GBP profile, sync OAuth reviews, or why a Maps/Apify review cannot be replied to. Public review replies also need guardrails against confirming patient relationships, treatment details, or PHI-like content. Google write actions should not become available for every connected org the moment code ships.
**Updated Done criteria:** Readiness endpoint and client/admin readiness states must be implemented before draft/deploy actions are considered complete. Unsafe public reply content must be blocked before deployment. Review-reply automation must remain disabled by default until enabled for the org/location.

### Rev 2 - May 24, 2026
**Change:** Move admin GBP Automation out of the Agent Results submenu into a top-level organization section. Reshape the admin GBP surface around clearer settings, draft queues, review candidates, and diagnostics. Fix admin actor handling so draft creation does not insert invalid `created_by_user_id` values into `gbp_work_items`.
**Reason:** GBP Automation is not an agent output; it is an organization/location Google Business Profile operation and should not be nested under agent results. The first admin UI exposed too many raw checks too early. Admin actions also need FK-safe audit actor handling because super-admin tokens can be stale or detached from a valid `users` row.
**Updated Done criteria:** Admin navigation must expose GBP Automation as a top-level org section. Admin settings must be the primary starting point for the surface. GBP work item actor ids must be validated or nullable before writing user FK columns.

### Rev 3 - May 24, 2026
**Change:** Add review dates to GBP review candidates and show a per-review draft slot below each list item.
**Reason:** Admins need review timing before drafting a public reply, and the draft target should be visually tied to the source review instead of living only in a separate Drafts tab.
**Updated Done criteria:** Review candidate rows must display the stored review date when present and include a lower slot showing whether a draft exists for that review.

### Rev 4 - May 24, 2026
**Change:** Turn the per-review draft slot into an autosaving textarea. AI draft generation fills that same textarea. Add review list range controls with Latest as the default view.
**Reason:** The review row should be the working surface: source review above, editable reply draft below. Defaulting to Latest avoids empty screens for low-volume clients where a strict 30-day window would hide useful replyable reviews.
**Updated Done criteria:** Existing draft slots autosave edits. Empty slots can create a manual draft on first saved text. The admin review list defaults to latest reviews and exposes Last 30 days and All loaded views.

### Rev 5 - May 24, 2026
**Change:** Replace autosave with an explicit Save button for draft slots, keep Save DB-only, hide draft inputs until a review row is opened, add a separate Deploy to GBP action, and add a Replied reviews tab with edit/delete actions for public GBP replies.
**Reason:** Saving draft text must not imply Google deployment. Public edits/deletes are higher-risk Google writes and need explicit buttons, while the list should stay scannable by default.
**Updated Done criteria:** Draft rows are collapsed by default. Save writes only to Alloro. Deploy queues the Google reply separately. Replied reviews default to Last 30 days and allow explicit update/delete of existing GBP owner replies.

### Rev 6 - May 24, 2026
**Change:** Add debounced autosave back to opened draft slots with a top-right save indicator, while keeping the explicit Save button.
**Reason:** Draft typing should be protected against accidental loss, but autosave must remain DB-only and must not deploy to Google. Deploy remains a separate explicit action.
**Updated Done criteria:** Open draft slots debounce-save to Alloro with Saving/Saved/Save failed state shown in the slot header. Save button performs the same DB-only save immediately.

### Rev 7 - May 24, 2026
**Change:** Keep AI Draft clickable for replyable reviews even when an active draft already exists. Generating again overwrites the existing active work item with a new AI draft and resets it to editable draft state.
**Reason:** Admins need a regenerate path without manually clearing the current draft. Existing draft presence should not turn generation into a disabled terminal state.
**Updated Done criteria:** Drafted review rows still expose AI Draft. Regeneration updates the same active work item, clears approval/error state, and does not deploy to GBP.

### Rev 8 - May 24, 2026
**Change:** Fix audit event insertion by keeping `gbp_work_events` append-only without `updated_at`, add loading animation to row actions, and separate visual hierarchy for section tabs, review tabs, filters, and destructive/public action buttons.
**Reason:** The event model inherited base timestamp insertion that did not match the event table. The review screen also made navigation, filters, and actions look equivalent, which made the workflow harder to trust.
**Updated Done criteria:** Draft generation creates audit events without a missing-column error. Loading actions show animated button feedback. Admin review navigation has distinct section tabs, sub-tabs, filter chips, and CTA styling.

### Rev 9 - May 24, 2026
**Change:** Fix GBP draft-ready notification creation against the actual `notifications` schema, make AI Draft buttons orange with a Generating loading label, and add Read more/Show less controls for long review comments.
**Reason:** The notifications table does not have a `priority` column, so priority-like signal belongs in metadata unless a separate notification schema migration is planned. Long reviews also need a readable expansion control instead of hard truncation.
**Updated Done criteria:** AI draft generation creates a notification without a missing-column error. The AI Draft button uses the orange CTA style and shows a spinner with Generating while active. Long review text can be expanded and collapsed inline.

### Rev 10 - May 24, 2026
**Change:** Pin GBP review reply draft generation to Haiku by default, with `GBP_AUTOMATION_LLM_MODEL` as the override.
**Reason:** Review reply drafting is a short, structured generation task; using Haiku is cheaper and faster than inheriting the global agents Sonnet default.
**Updated Done criteria:** GBP review reply generation passes a Haiku model to the LLM runner and records the model in generation input metadata.

### Rev 11 - May 24, 2026
**Change:** Make Reviews the default admin GBP Automation view, move Settings last, replace the review-reply checkbox with an animated switch, show review loading state during location changes, add review context to draft cards, add a diagnostics refresh action, label reviews that already have active drafts, and hide deploying/published replies from Needs Reply.
**Reason:** The admin workflow should start where operators work, not in configuration. Drafts need source-review context to avoid approving replies blindly, diagnostics need an explicit recheck action, and the Needs Reply list should not keep items that are already in the deploy path.
**Updated Done criteria:** Admin GBP Automation opens on Reviews, location switching shows a review loading state, settings use a switch control, draft cards include separated review context, diagnostics can be rerun, active drafts show a Draft available pill, and deploying/published review replies are removed from the Needs Reply list.

### Rev 12 - May 24, 2026
**Change:** Hide the admin location-context bar when an organization has only one location.
**Reason:** Single-location practices do not need a location selector, and showing an empty context bar creates dead UI.
**Updated Done criteria:** Admin GBP Automation and Agent Results only show the location-context selector row for multi-location organizations.

### Rev 13 - May 24, 2026
**Change:** Merge Diagnostics into Settings, require a diagnostics rerun before enabling review replies, and mirror the Reviews/Drafts/Settings UX and settings controls on the client Local Rankings GBP Automation surface.
**Reason:** Diagnostics are not a separate workflow; they are the safety check for settings. Enabling Google write automation should require a fresh readiness check, and the client-facing surface should not lag behind the admin UX.
**Updated Done criteria:** Admin and client GBP Automation show Reviews, Drafts, and Settings only. Settings includes diagnostics with rerun diagnostics. Review replies cannot be switched on until diagnostics have been rerun for the current location and all non-feature readiness checks pass. Client Local Rankings mirrors review loading, draft labels, draft context, and deployment-list filtering.

### Rev 14 - May 24, 2026
**Change:** Persist the Review replies switch immediately in admin and client settings, show switch-level saving state, and refresh readiness after the setting writes.
**Reason:** The switch currently only changes local draft state, so the header and diagnostics still read `feature_disabled` from the server and refresh resets the toggle. A binary enablement control should not require the separate Save settings button to become real.
**Updated Done criteria:** Turning Review replies on or off writes `review_reply_enabled` immediately, rolls back visually on failure, and refreshes readiness so Feature Disabled clears once the backend setting is enabled.

### Rev 15 - May 24, 2026
**Change:** Hide the No Replyable Reviews badge/action copy after review replies are enabled and diagnostics are complete. Update the Review replies helper copy for the enabled state.
**Reason:** No replyable reviews is not a setup failure once automation is enabled; it is an empty work queue. The enabled-state helper should confirm the feature is on instead of saying it can still be enabled.
**Updated Done criteria:** Completed settings no longer show No Replyable Reviews in the settings status area, and the Review replies row reads as enabled when the switch is on.

### Rev 16 - May 24, 2026
**Change:** Show the active review result count before the Latest 10, Last 30 days, and All loaded filter pills on admin and client review lists.
**Reason:** Operators need immediate feedback on how many reviews the selected range is showing before changing filters.
**Updated Done criteria:** Needs Reply review range controls show `n Reviews` beside the filter pills in both admin GBP Automation and client Local Rankings.

### Rev 17 - May 25, 2026
**Change:** Make review reply AI drafts more review-specific and varied on regeneration. Stop silently saving the generic fallback when LLM generation fails, returns invalid JSON, or produces unsafe public content.
**Reason:** Repeated AI Draft clicks were producing the same generic reply because generation failures and invalid outputs collapsed into a static fallback, and regenerations did not tell the model what previous draft to avoid.
**Updated Done criteria:** Regeneration passes the previous draft and a variation instruction into the generation input, uses a less deterministic temperature, and failed/unsafe generation surfaces an error instead of overwriting the draft with a generic template.

### Rev 18 - May 25, 2026
**Change:** Add automatic safety repair retries for AI-generated GBP review replies.
**Reason:** A good draft attempt can still include a blocked healthcare/privacy phrase such as `your treatment`. The generator should ask the model to rewrite unsafe output before failing the user-facing action.
**Updated Done criteria:** Unsafe AI output is retried with safety reasons and explicit rewrite instructions before returning `GBP_DRAFT_UNSAFE_OUTPUT`.

### Rev 19 - May 25, 2026
**Change:** Treat AI-generated draft content returned from the server as already persisted in the review draft slot UI.
**Reason:** AI generation creates or replaces the `gbp_work_items` draft in the backend. The opened textarea was interpreting the refreshed server value as a local edit, triggering a redundant autosave and leaving the slot stuck on `Saving...`.
**Updated Done criteria:** Generated drafts populate the textarea as saved DB state. Debounced autosave only runs after a real user edit, while manual textarea edits still save to Alloro and never deploy to Google.

### Rev 20 - May 25, 2026
**Change:** Replace the misleading All loaded review filter with backend month loading for Needs Reply and Replied reviews.
**Reason:** The current All loaded chip only filters the reviews included in the initial response, so it can look complete while still hiding older reviews. Month navigation should show all available months with counts, load the latest month by default when All loaded is selected, and fetch the full selected month from the backend.
**Updated Done criteria:** Needs Reply and Replied all-loaded views show a month sidebar with review counts. Clicking a month loads all reviews for that month in the main pane. The initial all-loaded month is the latest available month, and the backend returns all records for the selected month instead of a capped list.

### Rev 21 - May 25, 2026
**Change:** Add stable review-list loading states for month fetches.
**Reason:** Month changes were temporarily showing stale rows or partial empty space while the selected month loaded, then swapping into the final list and causing visible layout shifts.
**Updated Done criteria:** Admin and client review month loads keep the month sidebar and filter layout mounted, render review-shaped skeleton rows in the main pane, and use the selected month count to reserve list height while the backend request is in flight.

### Rev 22 - May 25, 2026
**Change:** Split the client Local Rankings dashboard into Overview and Alloro Engage(tm). Replace the full GBP workflow on Overview with a compact review engagement summary card below the primary rank cards, including total reviews, month-by-month total/reply-needed trend, unreplied last-30-days count, unreplied total count, and a CTA into Alloro Engage(tm).
**Reason:** The client page was crowding the rankings view with operational controls. Clients need a simple engagement signal on the rankings overview, while the full review-reply workflow belongs in a dedicated tab with the same underlying handles rendered in a more approachable way.
**Updated Done criteria:** Client Overview no longer embeds the full GBP automation workflow. Alloro Engage(tm) hosts Reviews, Drafts, and Settings. The overview summary uses backend-owned counts rather than guessing last-30-day unreplied reviews from a capped list.

### Rev 23 - May 25, 2026
**Change:** Add draft deletion from the Drafts tab on admin and client, convert review-list AI Draft CTAs into Reply expanders, move generation into the opened reply slot as Generate Draft alongside Save and Deploy, and replace the overview mini trend with an interactive monthly engagement chart.
**Reason:** The queue should start with intent to reply, not immediate generation. Operators need one opened composer that supports manual save, AI generation, and deployment, while draft deletion should dismiss unwanted work without losing audit history. The overview graph should match the richer interactive dashboard visual language instead of feeling like a static placeholder.
**Updated Done criteria:** Draft deletion uses the existing rejected work-item state and removes dismissed drafts from active draft lists. Review rows show Reply, expand/collapse the composer with animation, and only generate when Generate Draft is clicked inside the slot. Client and admin expose the same Save, Generate Draft, and Deploy controls with correct loading/disabled states. The overview review engagement visualization supports hover interaction and selected-month detail.

### Rev 24 - May 25, 2026
**Change:** Rename the client Review queue tab to Reviews Manager, add Unreplied/Replied sub-tabs, and expose client-side edit/delete actions for published GBP replies.
**Reason:** Clients need one review management surface for creating new replies and maintaining existing public replies. The replied-review workflow was admin-only, which made client-side reply management incomplete.
**Updated Done criteria:** Client Alloro Engage shows Reviews Manager with Unreplied and Replied tabs. Both tabs support Latest 10, Last 30 days, and All loaded month navigation. Unreplied reviews can create/save/deploy replies, while replied reviews can update or delete existing GBP replies through location-scoped client endpoints.
