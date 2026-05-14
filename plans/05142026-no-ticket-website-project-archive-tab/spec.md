# Website Project Archive Tab

## Why
The admin website projects list needs a way to move projects out of the day-to-day Active/Inactive views without hiding them from staff. This is admin organization only: archived projects can still have organizations, custom domains, and live sites.

## What
Add an admin Archive tab to `/admin/websites` and an Archive row action. Archive is an admin visibility state, not a website lifecycle status: archiving must not erase whether a project is `LIVE`, `CREATED`, or `IN_PROGRESS`.

## Context

**Relevant files:**
- `frontend/src/pages/admin/WebsitesList.tsx` - owns website list tabs, status filter, cards, row actions, bulk selection, and pagination.
- `frontend/src/api/websites.ts` - typed website list filters and project response shape.
- `frontend/src/lib/queryClient.ts` - React Query key shape for admin website filters.
- `src/controllers/admin-websites/AdminWebsitesController.ts` - parses list/update request parameters.
- `src/controllers/admin-websites/feature-services/service.project-manager.ts` - existing list, status query, project update, and org join logic.
- `src/database/migrations/20260303000002_simplify_project_status.ts` - proves `projects.status` is a lifecycle enum with `CREATED`, `IN_PROGRESS`, `LIVE`.

**Patterns to follow:**
- Keep list filtering server-backed so tab totals and pagination are truthful.
- Keep the existing `status` dropdown as lifecycle filtering, separate from admin archive visibility.
- Match the existing `WebsitesList.tsx` `TabBar`, confirmation modal, and `updateWebsite` mutation pattern.

**Reference file:** `frontend/src/pages/admin/WebsitesList.tsx` - current Active/Inactive tab implementation and row action pattern.

## Constraints

**Must:**
- Add `website_builder.projects.archived_at TIMESTAMPTZ NULL`.
- Treat Archive tab as `archived_at IS NOT NULL`.
- Treat Active tab as `archived_at IS NULL AND organization_id IS NOT NULL`.
- Treat Inactive tab as `archived_at IS NULL AND organization_id IS NULL`.
- Preserve `projects.status` unchanged when archiving so live/custom-domain projects remain lifecycle-live.
- Keep archived projects visible in Archive regardless of organization attachment or custom domain state.
- Add a row-level Archive button for non-archived projects.
- Use a confirmation modal before archiving.

**Must not:**
- Add `ARCHIVED` to `website_builder.project_status`.
- Change public rendering, custom-domain routing, or renderer behavior.
- Hide archived projects from detail routes.
- Delete or unlink organizations/custom domains during archive.
- Refactor the website project query layer beyond the minimal archive filter/update scope.

**Out of scope:**
- Restore/unarchive action, unless added in a later revision.
- Bulk archive.
- Client-facing archive controls.
- Public-site disable/unpublish behavior.
- Existing row Delete semantics.

## Risk

**Level:** 4 - Major Impact

**Risks identified:**
- Using `projects.status = ARCHIVED` would collapse lifecycle and admin labeling into one field, breaking `LIVE` checks and future generation state assumptions -> **Mitigation:** add `archived_at` as admin visibility metadata and leave `status` untouched.
- Schema migration must be deployed before archive UI writes `archived_at` -> **Mitigation:** execution must add a reversible Knex migration and verify against local type/build gates before shipping.
- Existing list consumers that call `fetchWebsites()` without visibility filters might unexpectedly include archived rows -> **Mitigation:** add an explicit optional `visibility`/`archiveState` filter and make only `WebsitesList` default to non-archived tabs; do not silently change generic API callers unless the call site explicitly opts in.
- `getProjectStatuses()` currently reads distinct lifecycle statuses from all rows, including archived rows -> **Mitigation:** leave status enumeration alone because archive is not a lifecycle status; status filter remains orthogonal.

**Blast radius:**
- `/api/admin/websites` list responses and pagination.
- `/api/admin/websites/:id` patch handling for the new `archived_at` field.
- `useAdminWebsites` cache keys and all callers of `fetchWebsites`.
- Admin website list only; public renderer and detail routes must not change.

**Pushback (if any):**
- The request says "new status called archive", but this does not belong in `projects.status`. Future-us will hate that because the current enum is lifecycle state, not admin labelling. Recommended path is `archived_at`; it gives the Archive tab the admin behavior requested without corrupting lifecycle semantics.

## Tasks

### T1: Archive schema
**Do:** Add a reversible Knex migration for `website_builder.projects.archived_at TIMESTAMPTZ NULL`, plus a supporting partial/indexed lookup for archive list filtering if consistent with local migration style.
**Files:** `src/database/migrations/20260514000000_add_website_project_archived_at.ts`
**Depends on:** none
**Verify:** `npm run build` from repo root or `npx tsc --noEmit`

### T2: Server-backed archive filtering and update
**Do:** Extend list filters with an admin archive state: `active`, `inactive`, `archive`. Filter Active/Inactive to non-archived rows and Archive to archived rows. Allow project patching of `archived_at` through the existing update route with controlled values only.
**Files:** `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/controllers/admin-websites/feature-services/service.project-manager.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Frontend API typing and cache keys
**Do:** Replace the current organization-only tab filter type with a website list tab/archive-state type that includes `active`, `inactive`, and `archive`. Include it in `fetchWebsites` request params and React Query cache keys.
**Files:** `frontend/src/api/websites.ts`, `frontend/src/lib/queryClient.ts`
**Depends on:** T2
**Verify:** `cd frontend && npm run build`

### T4: Website list Archive tab and action
**Do:** Add an Archive tab to `WebsitesList`, keep Archive independent of organization attachment, add an Archive button on non-archived rows, refresh list after archiving, and update copy/counts so labels read as admin visibility labels.
**Files:** `frontend/src/pages/admin/WebsitesList.tsx`
**Depends on:** T3
**Verify:** `cd frontend && npm run build`; targeted ESLint on touched frontend files

## Done
- [x] `npx tsc --noEmit` passes or only unrelated pre-existing errors remain.
- [x] `cd frontend && npm run build` passes.
- [x] Targeted frontend ESLint passes for touched frontend files.
- [x] Archive tab lists archived projects even if they have organizations or custom domains.
- [x] Active/Inactive tabs exclude archived projects.
- [x] Archiving does not change `projects.status`, `organization_id`, `custom_domain`, or `generated_hostname`.
- [x] Migration is reversible and does not require data backfill.
