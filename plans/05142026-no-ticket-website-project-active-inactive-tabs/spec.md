# Website Project Active/Inactive Tabs

## Why
Website projects are mixed together even though staff need to separate attached client sites from unassigned drafts. The list should make organization attachment status obvious without overloading the existing build/status filter.

## What
Add two tabs to `/admin/websites`: Active for projects attached to an organization, Inactive for projects without an organization. Pagination totals must reflect the selected tab, so the filter belongs in the existing admin websites API query.

## Context

**Relevant files:**
- `frontend/src/pages/admin/WebsitesList.tsx` - website projects list, filters, selection, cards, pagination.
- `frontend/src/api/websites.ts` - typed admin website list request/response.
- `frontend/src/lib/queryClient.ts` - React Query key factory for admin website filters.
- `src/controllers/admin-websites/AdminWebsitesController.ts` - parses list query parameters.
- `src/controllers/admin-websites/feature-services/service.project-manager.ts` - existing list query and organization left join.

**Patterns to follow:**
- Keep using `useAdminWebsites(filters)` and `QUERY_KEYS.adminWebsites(params)`.
- Match existing `WebsitesList.tsx` filter state and DesignSystem `TabBar`.

**Reference file:** `frontend/src/pages/admin/TemplatesList.tsx` - closest admin list that uses `TabBar` at the page level.

## Constraints

**Must:**
- Treat Active as `organization_id IS NOT NULL`.
- Treat Inactive as `organization_id IS NULL`.
- Keep the existing status dropdown behavior independent from the new tabs.
- Reset pagination and selected cards when tabs change.

**Must not:**
- Rename underlying website statuses.
- Change organization linking behavior.
- Refactor the website service/model layering in this pass.

**Out of scope:**
- Adding an "All" tab.
- Adding database schema or indexes.
- Changing detail-page organization assignment UX.

## Risk

**Level:** 2 - Concern

**Risks identified:**
- Client-only filtering would be wrong under pagination -> **Mitigation:** add the tab filter to the API query so totals and pages are scoped correctly.
- The existing project manager service owns Knex queries directly, which conflicts with the stricter backend convention -> **Mitigation:** keep the change inside the existing local pattern and do not broaden this into a layering refactor.

**Blast radius:** `/api/admin/websites` list callers, `useAdminWebsites`, `WebsitesList`, and org subscription website pickers that call `fetchWebsites` without the new optional filter.

**Pushback (if any):**
- Calling these tabs "Active/Inactive" is only accurate by the user's operational definition. It does not mean build status or live status. Keep copy and implementation tied to organization attachment.

## Tasks

### T1: Server-backed attachment filter
**Do:** Add an optional `organizationStatus` list filter that maps `active` to attached projects and `inactive` to unattached projects.
**Files:** `frontend/src/api/websites.ts`, `frontend/src/lib/queryClient.ts`, `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/controllers/admin-websites/feature-services/service.project-manager.ts`
**Depends on:** none
**Verify:** `npm run build` from `frontend`

### T2: Active/Inactive tabs in website list
**Do:** Add the tab state to `WebsitesList`, default to Active, feed it into the existing filters, reset page/selection on tab change, and adjust empty-state copy.
**Files:** `frontend/src/pages/admin/WebsitesList.tsx`
**Depends on:** T1
**Verify:** `npm run build` from `frontend`

## Done
- [x] `cd frontend && npm run build` passes or only pre-existing errors remain.
- [x] Active tab requests `organizationStatus=active`.
- [x] Inactive tab requests `organizationStatus=inactive`.
- [x] Status filter still combines with the selected attachment tab.
- [x] No unrelated files modified beyond existing dirty `.DS_Store`.
