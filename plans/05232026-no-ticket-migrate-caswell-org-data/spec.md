# Migrate Caswell Org Data

## Why
Caswell Orthodontics has two organization rows for the same real client. Org `43` owns the live website project, but org `25` still owns the real locations, Google connection/properties, rankings, and review history.

## What
Keep org `43` as the canonical Caswell organization and move the location/Google-backed operational data from org `25` to org `43`. Also move the client login membership from org `25` to org `43`. After migration, org `43` should own the live project plus the three real Caswell locations, their Google/ranking/review history, and both Caswell user accounts; org `25` should be left with no location, Google, or user-account ownership and can be evaluated for deletion separately.

## Revision Log

### Rev 1 - 2026-05-23
**Change:** Include the org `25` user account membership in the ownership transfer.
**Reason:** The legacy Caswell admin user belongs only to org `25`; deleting org `25` later would cascade-delete or orphan access if the membership is not moved first.
**Updated Done criteria:** Org `43` must include both Caswell user memberships after migration, and org `25` must have no remaining user memberships.

## Context

**Current DB evidence:**
- Org `43` is the keep row: `DFY`, `stripe_customer_id = exempt`, live project `86abb2c6-7a8d-4b27-897e-90d0cfac4a65`, `custom_domain = caswellorthodontics.com`.
- Org `25` is the legacy data row: three real locations, one Google connection, three Google properties, `12` practice rankings, `186` agent results, `10` tasks, `519` OAuth review rows, and `160` google data store rows.
- Org `43` has one placeholder location, `22` / `Honolulu Office`, with no `client_place_id` and no observed dependent data.
- Org `25` has one login membership: user `32` / Erin White / admin. Org `43` has one login membership: user `70` / frontdesk / admin. `organization_users` enforces unique `(organization_id, user_id)`, so moving user `32` to org `43` does not conflict with the existing frontdesk user.
- Locations `6`, `7`, and `8` on org `25` have the real Caswell Google place IDs:
  - `6` Honolulu: `ChIJJRFHyeZtAHwRWWmq72Ii48w`
  - `7` Mililani: `ChIJy59i1g5nAHwRheBwZR0GH0A`
  - `8` Kahala: `ChIJI7ByhGBtAHwR1heKNZ3ahfI`
- The live website project on org `43` already references those place IDs in `selected_place_ids`, so the project identity points at the old org's Google data by place ID but not by org/location ownership.

**Relevant files:**
- `src/controllers/settings/feature-services/service.delete-organization.ts` - hard-delete service and cascade expectations if org `25` is deleted later.
- `src/database/migrations/20260222000007_fix_fk_cascade_for_org_delete.ts` - documents org/location cascade behavior.
- `src/models/LocationModel.ts` - existing location ownership lookup pattern.
- `src/models/GoogleConnectionModel.ts` - existing Google connection ownership lookup pattern.
- `src/models/PracticeRankingModel.ts` - existing ranking ownership fields.
- `website_builder.projects` table - org `43` owns the live website project.

**Patterns to follow:**
- Use a single transaction for multi-table writes.
- Read and verify before writing; do not infer row ownership from names alone.
- Preserve existing location IDs rather than recreating locations, because reviews, rankings, tasks, and agent results already reference those IDs.
- Use parameterized SQL or Knex bindings only. Do not concatenate live IDs into ad hoc SQL strings.

**Reference file:** `src/controllers/settings/feature-services/service.delete-organization.ts` - closest existing operational path for org-related cleanup and cascade awareness.

## Constraints

**Must:**
- Keep org `43` and its live project.
- Move the real Caswell locations `6`, `7`, `8` from org `25` to org `43`.
- Move the Google connection on org `25` to org `43`.
- Preserve `google_properties` by preserving their current `location_id` and `google_connection_id` links.
- Rehome org-scoped operational rows from `25` to `43` where those rows represent the Caswell location/history set: `practice_rankings`, `agent_results`, `tasks`, `pms_jobs`, `notifications`, and `google_data_store`.
- Move the org `25` user membership for user `32` to org `43`, preserving the user account and admin role.
- Resolve the one-primary-location constraint before moving location `6`; location `22` should be deleted if final preflight confirms it is still an empty placeholder.
- Verify after the transaction that org `43` owns the live project, locations `6/7/8`, the Google connection, and the dependent history.

**Must not:**
- Delete org `43`.
- Delete the live project `86abb2c6-7a8d-4b27-897e-90d0cfac4a65`.
- Delete org `25` in this migration step.
- Recreate locations and break existing `location_id` relationships.
- Revoke Google OAuth tokens.
- Print secrets, full tokens, or raw `.env` values.
- Touch sandbox.

**Out of scope:**
- Permanent product fix for duplicate organizations.
- Billing model cleanup for the `stripe_customer_id = exempt` sentinel.
- Website content edits or public renderer changes.
- Final deletion of org `25`; this requires a separate explicit execution after post-migration verification.

## Risk

**Level:** 4 - Major Impact

**Risks identified:**
- Partial migration would split live website ownership from Google/ranking/review ownership. -> **Mitigation:** run all writes in one transaction and roll back on any mismatch.
- Updating only `google_connections.organization_id` is insufficient because location-scoped rows still point through locations `6/7/8`. -> **Mitigation:** move existing location rows to org `43` and preserve their IDs.
- Org `43` currently has placeholder primary location `22`, and org `25` location `6` is also primary. Moving without resolving this violates `idx_locations_one_primary_per_org`. -> **Mitigation:** in the same transaction, verify location `22` is empty, delete it, then update locations `6/7/8`.
- Org-scoped rows may drift if only location rows are moved. -> **Mitigation:** update org-scoped Caswell history tables from `25` to `43` in the same transaction, then verify row counts moved.
- Deleting org `25` after migration may delete the legacy admin user if user `32` is not attached elsewhere. -> **Mitigation:** move the `organization_users` membership for user `32` to org `43` during this migration, then verify org `25` has no remaining memberships.
- `organization_recipient_settings` exists on both orgs. -> **Mitigation:** do not overwrite org `43` recipient settings automatically; compare values during preflight and choose a deliberate merge only if needed.
- Production data risk: this changes live client ownership rows. -> **Mitigation:** run on dev first if the local `.env` points at dev, capture before/after counts, and require explicit confirmation before any production-equivalent execution.

**Blast radius:**
- Client/org selection and access for Caswell org `43`.
- Location-scoped ranking, review, task, and agent result surfaces.
- Google connection/property lookup for Caswell.
- Website review rendering if it relies on organization/location ownership.
- Admin organization delete flow for org `25` later.

**Pushback:**
- This should not be a casual delete-and-recreate. Future-us will hate that because the stable `location_id`s already carry reviews, rankings, and tasks. The safer approach is a surgical ownership transfer that preserves IDs.
- Moving recipient settings blindly would be sloppy. It is not "location data and Google ID"; it needs separate confirmation unless preflight proves it is identical or disposable. User membership is now in scope because the user explicitly asked to move the account too, and preflight shows no unique-key conflict.

## Tasks

### T1: Final preflight snapshot
**Do:** Run a read-only transaction against the target database and confirm the current row state still matches the snapshot in this spec. Verify org `43` owns exactly one live Caswell project, org `25` owns locations `6/7/8`, org `43` placeholder location `22` is empty, org `43` has no existing Google connection that would conflict, and moving user `32` to org `43` will not violate `organization_users_organization_id_user_id_unique`.
**Files:** Database only; no repo code.
**Depends on:** none
**Verify:** Read-only SQL output showing counts for orgs `25` and `43`, plus location/project rows.

### T2: Transactional ownership transfer
**Do:** In one transaction, lock orgs `25` and `43`, delete placeholder location `22` only if it remains dependency-free, update locations `6/7/8` to `organization_id = 43`, update the org `25` Google connection to `organization_id = 43`, move the `organization_users` row for user `32` to `organization_id = 43`, and rehome org-scoped operational rows from `25` to `43` for `practice_rankings`, `agent_results`, `tasks`, `pms_jobs`, `notifications`, and `google_data_store`.
**Files:** Database only; no repo code.
**Depends on:** T1
**Verify:** Transaction commits only if post-update counts match expected movement and no duplicate primary location exists for org `43`.

### T3: Post-migration verification
**Do:** Re-query Caswell relationships and verify org `43` owns the live project, locations `6/7/8`, one Google connection, three Google properties, OAuth reviews via location IDs, both user memberships, and the moved ranking/task/history rows. Verify org `25` has zero location, Google, and user-account ownership.
**Files:** Database only; no repo code.
**Depends on:** T2
**Verify:** Read-only SQL output with before/after count table.

### T4: Deletion readiness report for org 25
**Do:** Generate a read-only report of whatever remains on org `25`, especially `organization_recipient_settings` and any non-cascading references. Do not delete org `25`; report whether the only remaining decision is recipient-setting cleanup.
**Files:** Database only; no repo code.
**Depends on:** T3
**Verify:** Report clearly says whether org `25` is safe to delete later and what would be lost.

## Done
- [x] Preflight confirms org `43` is still the canonical live website org.
- [x] Preflight confirms placeholder location `22` is still safe to remove.
- [x] Locations `6`, `7`, and `8` belong to org `43`.
- [x] Org `43` has exactly one primary location after migration.
- [x] The Caswell Google connection belongs to org `43`.
- [x] User `32` belongs to org `43` with admin role.
- [x] Org `43` has both expected Caswell user memberships.
- [x] Google properties remain attached to the migrated locations/connection.
- [x] OAuth review rows remain reachable through locations `6/7/8`.
- [x] Ranking/task/agent/PMS/notification/google-data history is rehomed from org `25` to org `43`.
- [x] Org `25` has no remaining location or Google ownership.
- [x] Org `25` has no remaining user memberships.
- [x] Org `25` is not deleted during this step.
