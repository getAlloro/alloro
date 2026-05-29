# Clear Caswell PMS, Ranking Data, and Tasks

## Why
Caswell Orthodontics org `43` now owns the canonical website, locations, users, Google connection, and historical operational rows. The requested cleanup is to clear PMS ingestion/run data, ranking run history, and generated tasks for Caswell without deleting the org, locations, website, users, Google connection, reviews, or client setup.

## What
For org `43`, snapshot and then hard-delete the scoped PMS/ranking/task rows: `pms_jobs`, `agent_results`, `agent_recommendations` tied to those agent results, `practice_rankings`, and `tasks`. Leave backup tables behind so the deleted rows can be restored during a rollback window.

## Context

**Current DB evidence:**
- Org `43` is the canonical Caswell org after the prior consolidation.
- Org `43` currently has:
  - `1` row in `pms_jobs`
  - `186` rows in `agent_results`, all `agent_type = proofline`
  - `0` rows in `agent_recommendations` joined through those `agent_results`
  - `12` completed rows in `practice_rankings`
  - `10` rows in `tasks`, all `agent_type = RANKING`
  - `0` rows in `location_competitors`
  - `0` rows in `pms_column_mappings`
- Org `43` also has unrelated retained rows: `3` locations, `1` Google connection, `3` Google properties, `519` OAuth reviews, `150` Apify place-backed reviews, `160` google data store rows, `9` notifications, `2` user memberships, and `1` live website project.

**Relevant files:**
- `src/controllers/admin-organizations/feature-services/service.reset-org-data.ts` - existing admin reset service, but its scope is too narrow for this request.
- `src/database/migrations/20260423000002_reset_pms_data_org_36.ts` - closest one-shot destructive reset pattern with backup tables and rollback guidance.
- `src/models/AgentResultModel.ts` - `agent_results` model and org/location scoping.
- `src/models/PracticeRankingModel.ts` - `practice_rankings` model and ranking run history.
- `src/models/TaskModel.ts` - task model and org/location scoping.

**Patterns to follow:**
- Use a single transaction for backup creation plus deletes.
- Create backup tables before deleting rows.
- Delete `agent_recommendations` before `agent_results`, even though the current count is `0`.
- Keep deletes scoped by `organization_id = 43`; for `agent_recommendations`, scope by joined `agent_results.organization_id = 43`.
- Use parameterized SQL. Do not print secrets or raw env values.

**Reference file:** `src/database/migrations/20260423000002_reset_pms_data_org_36.ts` - backup-first destructive reset pattern.

## Constraints

**Must:**
- Clear org `43` rows from `pms_jobs`.
- Clear org `43` rows from `agent_results`, including `proofline` rows.
- Clear `agent_recommendations` that point to org `43` `agent_results`.
- Clear org `43` rows from `practice_rankings`.
- Clear org `43` rows from `tasks`.
- Create backup tables before deleting, preserving original row contents and IDs.
- Verify post-delete counts are zero for the scoped tables.

**Must not:**
- Delete org `43`.
- Delete org `25`.
- Delete locations `6`, `7`, or `8`.
- Delete Google connection `45` or any Google properties.
- Delete website project `86abb2c6-7a8d-4b27-897e-90d0cfac4a65`.
- Delete users or organization memberships.
- Delete reviews, media, pages, posts, forms, or website content.
- Delete `google_data_store`, `notifications`, `organization_recipient_settings`, or ranking archive backup tables unless separately requested.
- Delete competitor onboarding/config data; current `location_competitors` count is `0`, so there is nothing to clear there.

**Out of scope:**
- Re-running PMS ingestion or rankings after cleanup.
- Deleting the remaining org `25` recipient setting.
- Productizing this reset into a reusable admin endpoint.
- Changelog/commit/push until the user later runs `--done`.

## Risk

**Level:** 4 - Major Impact

**Risks identified:**
- This is destructive live data cleanup. -> **Mitigation:** create backup tables first and only delete inside the same transaction after pre-counts match expected scope.
- `agent_results` may have dependent recommendations even if current count is zero. -> **Mitigation:** always snapshot and delete `agent_recommendations` joined through the target `agent_results` before deleting `agent_results`.
- Deleting `practice_rankings` and `tasks` removes current dashboard-visible ranking/task history for Caswell. -> **Mitigation:** this is the explicit requested outcome; preserve backup tables for rollback.
- Deleting adjacent rows like `notifications` or `google_data_store` would exceed the ask and erase useful history. -> **Mitigation:** leave them untouched unless the user explicitly expands scope.
- Running against the wrong org would be bad. -> **Mitigation:** lock and verify org `43` name/domain, live project, and expected row counts before deletion.

**Blast radius:**
- Caswell PMS/analysis history.
- Caswell ranking dashboard history.
- Caswell client/admin task lists.
- Any dashboard cards that derive status from latest `practice_rankings`, `tasks`, `pms_jobs`, or `agent_results`.

**Pushback:**
- Do not use the existing admin reset endpoint for this. It only covers `pms_jobs` and referral-engine agent results, while Caswell's rows include `proofline`, `practice_rankings`, and `RANKING` tasks. Future-us would think it worked while the dashboard still showed old ranking/task state.
- Do not delete notifications or `google_data_store` as a drive-by cleanup. That is adjacent history, not the requested PMS/ranking/task reset.

## Tasks

### T1: Final preflight snapshot
**Do:** Run a read-only transaction against the target DB. Confirm org `43` is Caswell, owns the live project, and current counts match expected scope: `pms_jobs = 1`, `agent_results = 186`, `agent_recommendations = 0`, `practice_rankings = 12`, `tasks = 10`.
**Files:** Database only; no repo code.
**Depends on:** none
**Verify:** Read-only SQL output with counts and org/project guards.

### T2: Backup scoped rows
**Do:** In a write transaction, create backup tables with a unique suffix such as `_caswell_reset_backup_org43_20260523` for `pms_jobs`, `agent_results`, `agent_recommendations`, `practice_rankings`, and `tasks`. Snapshot only rows in scope.
**Files:** Database only; no repo code.
**Depends on:** T1
**Verify:** Backup table counts match pre-delete counts.

### T3: Delete scoped rows
**Do:** In the same transaction as T2, delete in FK-safe order: `agent_recommendations` joined through target `agent_results`, then `agent_results`, `tasks`, `practice_rankings`, and `pms_jobs`.
**Files:** Database only; no repo code.
**Depends on:** T2
**Verify:** Delete counts match backup/preflight counts.

### T4: Post-delete verification
**Do:** Re-query org `43` and confirm scoped table counts are zero. Confirm retained assets still exist: org `43`, locations `6/7/8`, Google connection, live website project, users, reviews, `google_data_store`, and notifications.
**Files:** Database only; no repo code.
**Depends on:** T3
**Verify:** Read-only SQL output with zeroed scoped counts plus retained-row checks.

### T5: Rollback note
**Do:** Record backup table names and restore order in the execution summary. Restore order should insert back `pms_jobs`, `agent_results`, `tasks`, `practice_rankings`, then `agent_recommendations` if a rollback is needed.
**Files:** `plans/05232026-no-ticket-clear-caswell-pms-ranking-tasks/spec.md`
**Depends on:** T4
**Verify:** Summary includes exact backup table names and row counts.

## Done
- [x] Preflight confirms org `43` is Caswell and owns the live project.
- [x] Backup tables exist for all scoped tables.
- [x] Backup counts match pre-delete counts.
- [x] Org `43` has zero `pms_jobs`.
- [x] Org `43` has zero `agent_results`.
- [x] Org `43` has zero joined `agent_recommendations`.
- [x] Org `43` has zero `practice_rankings`.
- [x] Org `43` has zero `tasks`.
- [x] Org `43` still has locations `6/7/8`.
- [x] Org `43` still has the live website project.
- [x] Org `43` still has Google connection/properties and user memberships.
- [x] Reviews, `google_data_store`, and notifications are untouched.

## Execution Summary

Executed on 2026-05-23 for Caswell Orthodontics org `43`.

**Backup tables created:**
- `public.pms_jobs_caswell_reset_backup_org43_20260523` - `1` row
- `public.agent_results_caswell_reset_backup_org43_20260523` - `186` rows
- `public.agent_recommendations_caswell_reset_backup_org43_20260523` - `0` rows
- `public.practice_rankings_caswell_reset_backup_org43_20260523` - `12` rows
- `public.tasks_caswell_reset_backup_org43_20260523` - `10` rows

**Deleted rows:**
- `pms_jobs` - `1`
- `agent_results` - `186`
- `agent_recommendations` - `0`
- `practice_rankings` - `12`
- `tasks` - `10`

**Post-delete verification:**
- Scoped reset counts were `0` for `pms_jobs`, `agent_results`, joined `agent_recommendations`, `practice_rankings`, and `tasks`.
- Retained data remained present: `3` locations, `1` Google connection, `3` Google properties, `2` org users, `519` OAuth reviews, `150` Apify reviews, `160` `google_data_store` rows, `9` notifications, and `1` live website project.

**Rollback note:**
- Restore order if needed: `pms_jobs`, `agent_results`, `tasks`, `practice_rankings`, then `agent_recommendations`.

## Post-Reset Follow-Up

After the reset was verified, a later manual request repopulated ranking data only for all three Caswell locations. Batch `8b00f225-50d2-432e-b472-877e564b89c0` created completed ranking rows `186`, `187`, and `188`.

Current follow-up verification after that manual ranking run:
- `practice_rankings` - `3`
- `tasks` - `0`
- `agent_results` - `0`
- `pms_jobs` - `0`
