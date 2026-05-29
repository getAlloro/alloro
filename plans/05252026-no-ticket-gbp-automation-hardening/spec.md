# GBP Automation Hardening

## Why
GBP review replies are now a real Google write path. The current implementation is good enough for dev iteration, but it has production blockers around authorization scope, partial failure consistency, Google API error handling, retry behavior, and LLM input hardening.

## What
Harden the GBP automation surface so client/admin reads are scoped, Google reply deploys are idempotent and recoverable, transient Google failures retry with actionable errors, prompt inputs are framed as untrusted, and frontend actions cannot race autosave/deploy. This is not a UX expansion; it is a production-safety pass over the existing feature.

## Context

**Relevant files:**
- `src/middleware/rbac.ts` - resolves organization and location scope for client routes.
- `src/routes/gbpAutomation.ts` - client GBP automation route mount.
- `src/routes/admin/gbpAutomation.ts` - admin GBP automation route mount.
- `src/controllers/gbp-automation/GbpAutomationController.ts` - client controller and `clientContext`.
- `src/controllers/gbp-automation/AdminGbpAutomationController.ts` - admin controller and admin org/location context.
- `src/controllers/gbp-automation/GbpReviewManagementController.ts` - published reply edit/delete Google write surface.
- `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts` - draft, approve, retry, and deploy queue orchestration.
- `src/controllers/gbp-automation/feature-services/GbpReviewReplyDeploymentService.ts` - actual Google review reply deployment.
- `src/controllers/gbp-automation/feature-services/GbpDeployPreviewService.ts` - deploy preview and safety re-check.
- `src/controllers/gbp-automation/feature-services/GbpDraftGenerationService.ts` - review reply LLM input and output handling.
- `src/controllers/gbp-automation/feature-services/GbpLocalPostDraftService.ts` - review-to-post LLM input and output handling.
- `src/controllers/gbp-automation/feature-services/GbpContentSafetyService.ts` - deterministic safety rules and Google byte limit.
- `src/controllers/gbp-automation/feature-utils/controllerResponses.ts` - API error response shaping.
- `src/controllers/gbp/gbp-services/gbp-write.service.ts` - Google review reply/local post write helpers.
- `src/controllers/gbp/gbp-services/gbp-api.service.ts` - OAuth bearer header construction.
- `src/models/GbpWorkItemModel.ts` - work item status transitions.
- `src/models/GbpDeploymentAttemptModel.ts` - deployment attempt numbering and payload storage.
- `src/models/GbpAutomationSettingsModel.ts` - customization/settings upsert.
- `src/models/GbpReviewInsightModel.ts` - review insight upsert.
- `src/models/GbpReviewEscalationModel.ts` - escalation upsert.
- `frontend/src/components/dashboard/gbp-automation/GbpReviewReplySlot.tsx` - review queue autosave/deploy interaction.
- `frontend/src/components/dashboard/gbp-automation/GbpReplyWorkItemCard.tsx` - draft tab deploy interaction.
- `frontend/src/components/dashboard/gbp-automation/GbpClientReviewsPanel.tsx` - maps review rows to active work items.
- `frontend/src/components/Admin/gbp-automation/AdminGbpNeedsReplyPanel.tsx` - admin equivalent review/work item mapping.
- `src/agents/gbpAgents/ReviewReply.md` - review reply generation prompt.
- `src/agents/gbpAgents/LocalPost.md` - local post generation prompt.

**Patterns to follow:**
- Keep route/controller/service/model separation. Controllers should orchestrate only; DB access stays in models.
- Prefer explicit status transition methods on models over blind update calls.
- Use existing `{ success, data, error }` response shape from `controllerResponses.ts`.
- Keep frontend server state behind React Query hooks and API modules.

**Reference files:**
- `src/controllers/gbp-automation/feature-utils/GbpAutomationError.ts` - domain error shape to extend for Google/actionable errors.
- `src/models/GbpWorkEventModel.ts` - example of model-level override when table shape differs from `BaseModel`.
- `frontend/src/components/dashboard/gbp-automation/GbpReviewReplySlot.tsx` - closest client-side autosave/action flow to harden.

## Constraints

**Must:**
- Fail closed when location scope cannot be resolved.
- Scope deployment attempts by organization and accessible location before returning them.
- Stop `clientContext` from trusting raw location IDs independently of verified location scope.
- Use transactions for DB-only multi-write state changes.
- For Google writes, avoid pretending external API calls are transactional; instead make pre/post DB transitions idempotent and never mark a published Google reply as draft because a later local DB write failed.
- Add backend deploy idempotency so double-clicks or concurrent jobs do not publish/queue the same work item twice.
- Classify Google errors into actionable domain codes such as reconnect required, permission revoked, review missing, rate limited, transient failure, and permanent bad request.
- Add bounded retry/backoff for transient Google failures only.
- Sanitize and bound admin-controlled generation inputs: customizations, voice examples, rules, featured image URL where relevant.
- Frame Google review text and custom settings as untrusted content in prompts and generation input.
- Enforce local post and reply length limits programmatically, not only in prompt prose.
- Fix autosave/deploy races and double-submit paths on the frontend.
- Preserve the existing user/admin UI shape unless a small state message is needed for safety.
- Update Alloro Docs only if visible UI copy or behavior changes.

**Must not:**
- Add new product features, bulk actions, or new queues beyond retry/backoff for the existing deployment job.
- Expand role permissions.
- Weaken Google OAuth scope requirements.
- Hide safety failures by silently rewriting user-entered drafts.
- Add a migration unless execution proves one is necessary. If a migration becomes necessary, update this spec first and include production migration risk notes.
- Refactor unrelated review, rankings, or support code.

**Out of scope:**
- Full custom modal replacement for all confirm flows.
- Bulk reply approval/deployment.
- Rebuilding the review intelligence classifier.
- Numeric safety confidence schema cleanup unless required by this hardening pass.
- Unrelated seed migration cleanup.

## Risk

**Level:** 4

**Risks identified:**
- IDOR on deployment attempts can leak cross-org Google response/error payloads -> **Mitigation:** add scoped attempt retrieval and route admin/client through the correct controller/context.
- RBAC currently fails open on scope resolution errors -> **Mitigation:** return an error/403 instead of calling `next()` with undefined location scope.
- External Google writes cannot be rolled back by DB transactions -> **Mitigation:** isolate the external call, use deterministic status transitions, record attempts, and never revert a successfully published item to draft because a later local write failed.
- Concurrent deploys can duplicate attempt numbers or queue duplicate jobs -> **Mitigation:** conditional status transitions, transaction-backed attempt creation, and idempotency checks before queueing/running jobs.
- Prompt injection and PHI leakage are higher risk in healthcare replies -> **Mitigation:** treat reviews/settings as untrusted, bound inputs, enforce deterministic safety/length checks, and make prompts explicitly ignore embedded instructions.
- Google failure states can mislead users if all errors become generic deploy failures -> **Mitigation:** centralize Google error classification and surface actionable messages without leaking internals.
- Retry/backoff can accidentally hammer Google or duplicate publishes -> **Mitigation:** retry only classified transient failures and guard each job by current work item status.

**Blast radius:**
- GBP client routes and admin routes.
- Location-scoped client authorization.
- GBP deployment attempt visibility.
- GBP review reply deploy/retry workers.
- Google review reply update/delete helpers.
- Draft generation prompt inputs and safety behavior.
- Alloro Engage review queue and draft tab action buttons.

**Pushback:**
- The current code moved too quickly from UX prototype to Google write path. Future-us will hate this if we ship without hardening. The right move is not more UI polish; it is a security/write-consistency pass before production exposure.
- Do not solve Google writes with one giant transaction. That is fake safety because Google is outside the database. Use idempotent state transitions and explicit recovery states instead.

## Tasks

### T1: Close Authorization And Attempt Scoping
**Do:** Make `locationScopeMiddleware` fail closed on scope resolution errors. Add a trusted location resolver so client controllers use verified `req.locationId`/`accessibleLocationIds`, not raw query/body fallback. Add scoped attempt retrieval to `GbpWorkItemService` and route client/admin attempts through controllers that validate organization and location access. Add explicit comments for super-admin-only admin paths where location scoping is intentionally org-scoped.
**Files:** `src/middleware/rbac.ts`, `src/controllers/gbp-automation/GbpAutomationController.ts`, `src/controllers/gbp-automation/AdminGbpAutomationController.ts`, `src/controllers/gbp-automation/feature-services/GbpWorkItemService.ts`, `src/routes/admin/gbpAutomation.ts`, `src/routes/gbpAutomation.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`; manual API check that cross-location attempts return 403/404.

### T2: Add Idempotent Status Transitions And Deployment Attempts
**Do:** Add model methods for guarded status changes: approve only draft/awaiting states, mark deploying only approved/draft retry states, mark published only deploying, mark failed only if still deploying. Make attempt creation transaction-safe and avoid duplicate `attempt_number` races. Cap work item list limits defensively and fix `locationId === 0` filtering truthiness.
**Files:** `src/models/GbpWorkItemModel.ts`, `src/models/GbpDeploymentAttemptModel.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyDeploymentService.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`; targeted deploy/retry API smoke tests; verify duplicate deploy calls do not create duplicate Google writes.

### T3: Make Multi-Write Operations Consistent
**Do:** Wrap DB-only multi-write operations in transactions: draft save/create + events, approve + event, reject + event, settings/insight/escalation upserts where feasible. For deployment, split DB transitions around the external Google call and make failure handling conditional so a local post-Google failure does not incorrectly return a live Google reply to draft. Ensure notifications/events do not break core state transitions.
**Files:** `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewDraftSlotService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyDeploymentService.ts`, `src/controllers/gbp-automation/feature-services/GbpCustomizationService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewEscalationService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewInsightService.ts`, `src/models/GbpAutomationSettingsModel.ts`, `src/models/GbpReviewInsightModel.ts`, `src/models/GbpReviewEscalationModel.ts`
**Depends on:** T2
**Verify:** `npx tsc --noEmit`; simulate event/notification failure where practical and verify work item state remains correct.

### T4: Harden Google Write Error Handling And Retries
**Do:** Centralize Google/axios error classification for review reply update/delete and local post create. Throw `GbpAutomationError` codes with safe public messages and diagnostic metadata. Make `buildAuthHeaders` fail if no access token is returned. Tighten Google resource name validation for review reply routes. Add bounded BullMQ retry/backoff for transient Google errors only, and leave permanent failures as draft with actionable messages.
**Files:** `src/controllers/gbp/gbp-services/gbp-write.service.ts`, `src/controllers/gbp/gbp-services/gbp-api.service.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyService.ts`, `src/controllers/gbp-automation/feature-services/GbpReviewReplyDeploymentService.ts`, `src/controllers/gbp-automation/GbpReviewManagementController.ts`, `src/controllers/gbp-automation/feature-utils/controllerResponses.ts`
**Depends on:** T2
**Verify:** `npx tsc --noEmit`; mocked/manual checks for 401, 403, 404, 429, and 5xx error mapping.

### T5: Harden LLM Inputs, Prompts, And Safety Limits
**Do:** Add input length limits and sanitization for customizations, voice examples, rules, review text, and local post fields before sending to LLM. Update prompts to explicitly label review text/settings as untrusted data and ignore embedded instructions. Enforce reply character/byte limits and local post summary max length in code. Keep deterministic safety checks as the gate before save/deploy, and do not rely on prompt instructions alone.
**Files:** `src/controllers/gbp-automation/feature-services/GbpDraftGenerationService.ts`, `src/controllers/gbp-automation/feature-services/GbpLocalPostDraftService.ts`, `src/controllers/gbp-automation/feature-services/GbpContentSafetyService.ts`, `src/controllers/gbp-automation/feature-utils/controllerResponses.ts`, `src/agents/gbpAgents/ReviewReply.md`, `src/agents/gbpAgents/LocalPost.md`
**Depends on:** none
**Verify:** `npx tsc --noEmit`; manual generation check with adversarial review text and malicious customization instructions.

### T6: Fix Frontend Action Races And Stale Work Item Mapping
**Do:** Clear pending autosave timers before deploy, block deploy while a manual edit is pending, and use refs or mutation state to prevent double-submit before React state renders. Sort/select the most relevant active work item per review instead of keeping whichever item appears first. Replace single-underscore `status.replace` calls with `replaceAll` or a shared formatter where touched.
**Files:** `frontend/src/components/dashboard/gbp-automation/GbpReviewReplySlot.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpReplyWorkItemCard.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpClientReviewsPanel.tsx`, `frontend/src/components/Admin/gbp-automation/AdminGbpNeedsReplyPanel.tsx`, `frontend/src/components/Admin/gbp-automation/AdminGbpWorkItemsPanel.tsx`
**Depends on:** T2
**Verify:** `cd frontend && npm run build`; targeted ESLint for touched GBP frontend files; manual double-click/autosave deploy smoke test.

### T7: Verification, Docs Parity, And Risk Review
**Do:** Run backend and frontend verification. Review whether any visible UI copy changed; update `/Users/rustinedave/Desktop/alloro-docs` only if the client/admin experience changed. Re-run the original finding list and mark each item fixed, downgraded, deferred, or out of scope in a spec revision log.
**Files:** `plans/05252026-no-ticket-gbp-automation-hardening/spec.md`, `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T1, T2, T3, T4, T5, T6
**Verify:** `npx tsc --noEmit`; `npm run build`; `cd frontend && npm run build`; docs build if docs are touched.

## Done
- [x] `npx tsc --noEmit` passes with no new errors from this work.
- [x] `npm run build` passes.
- [x] `cd frontend && npm run build` passes.
- [x] Targeted ESLint passes for touched frontend GBP files.
- [x] Client cannot read attempts for another org/location.
- [x] RBAC location resolution fails closed.
- [x] Deploy queueing/running is idempotent under double-click/concurrent calls.
- [x] A successful Google publish cannot be represented as draft solely because a later local DB write failed.
- [x] Google 401/403/404/429/5xx failures produce distinct safe error codes/messages.
- [x] Transient Google failures retry with bounded backoff; permanent failures do not retry.
- [x] Prompt inputs are bounded and explicitly framed as untrusted.
- [x] Reply/local post length limits are enforced in code.
- [x] Autosave cannot race deploy from the review slot.
- [x] Docs parity checked; docs updated if visible behavior/copy changed.
- [x] No migration added unless this spec is revised with production migration risk notes.

## Revision Log

### Rev 1 - 2026-05-25
**Change:** Executed the hardening pass across authorization, scoped attempts, guarded status transitions, transactional DB writes, Google error classification, transient retries, LLM input sanitization, prompt injection framing, and frontend action race guards.

**Reason:** Code review identified production blockers in the GBP write path. This revision records the implementation outcome and verification evidence.

**Finding status:**
- Must-fix #1-4: fixed by failing closed in location scope, trusting verified request scope, scoping attempts, and passing admin location scope to deploy preview/attempts/work item actions.
- Must-fix #5-6: fixed for core DB multi-write flows with transactions, guarded status transitions, and locked deployment attempt creation.
- Must-fix #7: fixed by keeping regenerated drafts behind `generateSafeDraft` and preserving the deterministic safety gate before persistence.
- Must-fix #8-9: fixed by central Google API error classification plus bounded BullMQ retry/backoff for transient errors only.
- Must-fix #10-11: fixed by sanitizing/bounding LLM inputs and marking review/settings content as untrusted in both generation inputs and prompts.
- Must-fix #12-13: fixed by clearing autosave timers before deploy, requiring clean saved state before deploy, and adding ref-based submit guards.
- Concern #14-20: fixed where in scope via database-level upserts, guarded transitions, locationId truthiness fixes, list caps, and explicit active work-item selection. Schema cleanup for `safety_confidence` remains out of scope because this hardening pass adds no migration.
- Concern #21-26: fixed for empty bearer token handling, resource validation, local post length validation, reply length enforcement, and prompt safety. OAuth token refresh locking remains deferred because it requires a broader shared OAuth helper change.
- Concern #27-33: fixed where in scope by safe generic API error fallback, frontend action guards, and `replaceAll` usage in touched GBP UI. Published-reply destructive flow safety is partially covered by existing backend scoping and Google error classification; custom-modal replacement remains out of scope.
- Nitpicks #34-41: noted but mostly deferred; no unrelated refactor or seed cleanup was included.

**Verification:**
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `cd frontend && npm run build` passed with existing Vite warnings for lottie eval, Monaco/PM dynamic imports, and chunk size.
- `npx eslint` on touched GBP frontend files passed.
- `npm run lint -- ...` still runs repo-wide `eslint .` and fails on pre-existing frontend lint backlog unrelated to this pass.
- Local API health smoke check returned `200` with healthy DB response.
- Read-only attempt scoping service smoke passed: wrong accessible location produced `LOCATION_ACCESS_DENIED`, correct location returned attempts.
- Safety smoke check confirmed patient-detail and 900-character reply limit blocks.

**Docs parity:** No docs update required for this hardening revision because it did not add visible UI copy or new dashboard controls; it tightened existing behavior behind the same surfaces.
