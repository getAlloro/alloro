# Organization Detail Mission Control Navigation

## Why
Mission Control is now the admin process hub, so single organization detail should return there instead of the legacy Organizations list. The organization page also needs a flatter top-level workflow with the connected website surface available in-context.

## What
Update the single organization admin page so the back button goes to Mission Control, the section menu becomes a horizontal top menu, Subscription is renamed, Reset Data is hidden, a Website tab renders the connected website detail, and the main admin sidebar temporarily hides Organizations.

## Context

**Relevant files:**
- `frontend/src/pages/admin/OrganizationDetail.tsx` - single organization shell, section state, back button, reset action.
- `frontend/src/pages/admin/WebsiteDetail.tsx` - existing full website project detail surface.
- `frontend/src/components/Admin/AdminSidebar.tsx` - main admin sidebar icon list.
- `/Users/rustinedave/Desktop/alloro-docs` - docs parity repo; currently documents client surfaces, not admin organization detail.

**Patterns to follow:**
- Keep admin page state URL-driven via search params.
- Reuse existing website detail behavior rather than duplicating page management UI.
- Keep direct routes available even when a nav item is temporarily hidden.

**Reference file:** `frontend/src/pages/admin/OrganizationDetail.tsx` - existing org tab routing and section rendering.

## Constraints

**Must:**
- Preserve existing organization section query params.
- Render Website only from the organization's connected website.
- Keep the original `/admin/websites/:id` route behavior intact.
- Avoid touching unrelated GBP automation work already in the working tree.

**Must not:**
- Delete organization routes or backend endpoints.
- Add new dependencies.
- Expose Reset Data in the org page UI.

**Out of scope:**
- Reworking website builder internals.
- Creating or linking a website when none is connected.
- Production deployment or changelog finalization.

## Risk

**Level:** 2

**Risks identified:**
- `WebsiteDetail.tsx` is a large existing page; duplicating it would create drift. -> **Mitigation:** make it accept `projectId`/embedded props and reuse the same component.
- Website tabs use the `tab` search param while OrganizationDetail uses `tab` for Agent Results. -> **Mitigation:** only interpret agent `tab` while `section=agent`; Website can own `tab` while `section=website`.

**Blast radius:** Admin organization detail, admin website detail, admin sidebar navigation.

**Pushback:** This is UI reuse across a page boundary. It is acceptable as a bounded bridge, but future-us should extract WebsiteDetail into a proper `WebsiteProjectDetail` component if this surface gets reused again.

## Tasks

### T1: Organization Detail Navigation
**Do:** Change back target to Mission Control, replace side menu with horizontal top menu, rename Subscription, add Website section, hide Reset Data.
**Files:** `frontend/src/pages/admin/OrganizationDetail.tsx`, `frontend/src/components/Admin/OrganizationDetailNavigation.tsx`
**Depends on:** none
**Verify:** `cd frontend && npm run build`

### T2: Embedded Website Detail
**Do:** Allow website detail to render from explicit connected website ID without its own back link in the org tab.
**Files:** `frontend/src/pages/admin/WebsiteDetail.tsx`
**Depends on:** T1
**Verify:** `cd frontend && npm run build`

### T3: Hide Organizations Sidebar Item
**Do:** Remove Organizations from the main admin sidebar nav list without deleting its route.
**Files:** `frontend/src/components/Admin/AdminSidebar.tsx`
**Depends on:** none
**Verify:** Manual: Organizations icon is absent from sidebar while `/admin/organization-management` route still works.

## Done
- [x] `cd frontend && npm run build`
- [x] Back button goes to `/admin/mission-control`
- [x] Organization sections render as a horizontal top menu
- [x] Reset Data is not visible
- [x] Website tab shows connected website detail or an empty state
- [x] Main sidebar no longer shows Organizations
