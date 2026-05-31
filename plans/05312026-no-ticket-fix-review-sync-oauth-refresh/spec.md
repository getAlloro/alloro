# Fix Review Sync OAuth Refresh

## Why
Garrison Orthodontics showed a failed automatic Reviews sync because the worker hit Google API `401` errors while using stored OAuth credentials. The next daily run recovered after the token row was refreshed elsewhere, which means the worker is too dependent on lucky token freshness.

## What
Make the OAuth review sync worker refresh-aware and retry one Google unauthorized response per connection before marking locations failed. Failed connection setup should also write fresh per-location sync health rows so the UI does not show stale status.

## Context

**Relevant files:**
- `src/workers/processors/reviewSync.processor.ts` - owns daily and manual OAuth review sync, per-location sync health writes, and Google review ingestion.
- `src/auth/oauth2Helper.ts` - already exposes `getValidOAuth2ClientByConnection`, which refreshes and persists access tokens when needed.
- `src/controllers/gbp/gbp-services/gbp-api.service.ts` - `buildAuthHeaders` obtains the bearer token used by Google Business Profile review API calls.
- `src/models/GbpSyncHealthModel.ts` - records the UI-facing last sync status, count, source, and error message.
- `src/workers/worker.ts` - schedules `daily-review-sync`; currently dirty locally from unrelated work, so this plan avoids editing it unless a scheduler defect is later proven and the dirty state is resolved.

**Patterns to follow:**
- Keep route/controller surfaces untouched; this is worker behavior, not UI behavior.
- Reuse the existing OAuth helper instead of creating another refresh mechanism.
- Preserve current per-location health semantics: started row, succeeded row with count, failed row with machine-readable error code and safe message.

**Reference file:** `src/auth/oauth2Helper.ts` - `getValidOAuth2ClientByConnection` is the closest existing token refresh/persist pattern.

## Constraints

**Must:**
- Keep the fix scoped to OAuth review sync.
- Retry Google `401`/unauthorized once per connection with a forced token refresh.
- Record fresh `gbp_sync_health` failed rows when connection auth setup fails before location processing starts.
- Keep logs free of secrets, tokens, and full Google credential payloads.
- Validate against Garrison Orthodontics in dev or production read-only checks after deployment.

**Must not:**
- Manually patch Garrison's sync health rows as a "fix."
- Change Apify review fetch behavior.
- Change dashboard UI copy or review rendering.
- Touch `src/workers/worker.ts` while it has unrelated dirty edits unless the user explicitly resolves that conflict first.
- Add dependencies.
- Add migrations.

**Out of scope:**
- Google reconnect UX changes.
- Backfilling historical failed health rows.
- Scheduler refactors or lock-loop changes.
- Review insight generation behavior.
- Website review-loop rendering.

## Risk

**Level:** 3

**Risks identified:**
- Cross-client worker behavior changes can affect all connected orgs' OAuth review syncs -> **Mitigation:** keep the implementation inside `reviewSync.processor.ts`, use existing OAuth helpers, and verify with typecheck plus targeted production/dev status checks.
- Retrying every unauthorized error blindly could hide real GBP permission problems -> **Mitigation:** retry once per connection only; if forced refresh still fails, record the original location failure normally.
- Connection-level OAuth failures currently skip per-location health rows, causing stale UI status -> **Mitigation:** when auth creation/refresh fails, write failed health rows for every selected property in that connection.
- Duplicate sync health rows were observed for the same repeat timestamp -> **Mitigation:** verify repeatable job and PM2 process state during testing; do not mix scheduler edits into this fix unless the duplicate is reproducible and clearly caused by review sync code.
- Local working tree already has unrelated worker changes -> **Mitigation:** execution must re-check `git status` and avoid unrelated files, especially `src/workers/worker.ts`.

**Blast radius:**
- Daily OAuth review sync for all selected GBP properties.
- Manual review sync from client dashboard and admin GBP automation.
- `gbp_sync_health` rows displayed in Reviews sync status.
- OAuth-synced `website_builder.reviews` rows and downstream review insight creation.

**Pushback:**
- Do not solve this by manually rerunning or patching Garrison only. That masks the actual defect: the worker can use stale access tokens even when a valid refresh token exists.
- Do not fold the duplicate scheduler-row investigation into a scheduler refactor here. That belongs to the existing worker/scheduler dirty work unless direct evidence ties it to this bug.

## Tasks

### T1: Refresh-aware review sync auth
**Do:** Replace the review sync processor's raw OAuth client creation with the existing refresh-aware connection helper. Add a one-time forced refresh retry when a Google review fetch fails with unauthorized/`401` for a connection.
**Files:** `src/workers/processors/reviewSync.processor.ts`, `src/auth/oauth2Helper.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Fresh health rows for connection auth failure
**Do:** When a connection-level OAuth setup/refresh failure happens before individual locations are synced, mark each selected property under that connection as failed with safe error metadata so the UI does not keep showing a stale previous result.
**Files:** `src/workers/processors/reviewSync.processor.ts`, `src/models/GbpSyncHealthModel.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Runtime verification and duplicate-row check
**Do:** After deployment, verify the repeatable review sync job is not duplicated, PM2 has one worker process, and Garrison's latest review sync row stays succeeded after the next manual or scheduled run. If duplicate rows persist, classify that as a separate scheduler follow-up.
**Files:** none
**Depends on:** T1, T2
**Verify:** Manual: `ssh alloro-dev` or `ssh alloro-app` read-only checks for PM2, BullMQ repeatable jobs, and `gbp_sync_health` rows.

## Done
- [x] `npx tsc --noEmit` passes or only pre-existing unrelated errors remain.
- [x] No new dependencies.
- [x] No migrations.
- [x] Manual: review sync worker retries one unauthorized Google API response with forced token refresh.
- [x] Manual: connection-level auth failure writes current failed health rows instead of leaving stale UI status.
- [x] Manual: Garrison Orthodontics has a current successful Reviews sync row after a scheduled or manual run.
- [x] Manual: BullMQ has one `daily-review-sync` repeatable job and PM2 has one `minds-worker` process.
- [x] Docs parity checked: no Alloro Docs update needed because this changes backend worker reliability only, not dashboard UI behavior/copy.

## Verification Notes

- `npx tsc --noEmit` passed locally.
- `git diff --check` passed locally.
- Production read-only check showed one PM2 `minds-worker` process.
- Production BullMQ read-only check showed one `daily-review-sync` repeatable job at `0 4 * * *` UTC.
- Production `gbp_sync_health` rows for Garrison Orthodontics showed latest review sync status `succeeded` with `90` reviews synced on `2026-05-31 04:00 UTC`.
- The forced-refresh retry and connection-auth health row behavior were verified by implementation inspection; live forced retry will only execute on a future Google unauthorized response.
