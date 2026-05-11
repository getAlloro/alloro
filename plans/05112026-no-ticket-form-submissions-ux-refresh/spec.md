# Form Submissions UX Refresh

## Why
The Forms/Form Submissions surface is functional but too dense: default recipients, per-form routing, filters, bulk actions, and submission detail all compete for attention. Client-facing website users should get the same clearer workflow without using admin-only routes.

## What
Simplify the shared form submissions UI, move per-form routing into a focused modal, and expose safe user-scoped routing endpoints for the client website tab. Done means admin and client website Forms tabs can scan submissions, inspect details, and manage routing without the current clutter.

## Context

**Relevant files:**
- `frontend/src/components/Admin/FormSubmissionsTab.tsx` - shared admin/client submission list and detail modal.
- `frontend/src/components/Admin/FormRecipientRoutingPanel.tsx` - current per-form routing panel.
- `frontend/src/pages/admin/WebsiteDetail.tsx` - admin Forms tab composition.
- `frontend/src/pages/DFYWebsite.tsx` - client-facing website tab composition.
- `src/controllers/user-website/UserWebsiteController.ts` - user-scoped website endpoints.
- `src/routes/user/website.ts` - user website route registration.

**Patterns to follow:**
- Shared UI should stay reusable through injected API functions where admin and client routes differ.
- User website routing endpoints must resolve the project from `req.organizationId`; do not accept arbitrary project IDs.
- Keep backend routing logic in the existing form recipient services/models.

## Constraints

**Must:**
- Keep `FormSubmissionsTab` usable by admin and client surfaces.
- Make the submissions list easier to scan with clear filters, statuses, tooltips, and a focused detail modal.
- Move per-form routing into an explicit modal launched from the Forms tab.
- Let the client-facing website tab manage routing through `/api/user/website` routes.
- Preserve existing submission actions: read/unread, delete, resend where available, export, bulk actions.

**Must not:**
- Change public form submission behavior.
- Change recipient routing rules or matching semantics.
- Use admin project-scoped routes from the client-facing website page.
- Refactor unrelated editor/posts/menus/ranking code.

## Risk

**Level:** 2 - Concern

**Risks identified:**
- Client-facing routing controls could accidentally bypass project ownership if they reused admin endpoints. Mitigation: add user-scoped routes that resolve project by organization.
- Shared component changes can regress both admin and client tabs. Mitigation: keep API injection points intact and verify both build/typecheck paths.
- Over-simplifying could hide operational controls. Mitigation: keep actions visible as icon buttons with tooltips and expose detail/resend in the modal.

**Blast radius:**
- Admin website Forms tab.
- Client-facing `DFYWebsite` submissions tab.
- User website recipient routing APIs.
- Shared submission detail modal and bulk action bar.

## Tasks

### T1: Add user-scoped routing endpoints
**Do:** Add `GET /api/user/website/forms/catalog` and `PUT /api/user/website/forms/recipients` using existing form catalog/rule services and organization-derived project ownership.
**Files:** `src/controllers/user-website/UserWebsiteController.ts`, `src/routes/user/website.ts`
**Depends on:** none
**Verify:** backend typecheck.

### T2: Turn routing into a modal workflow
**Do:** Convert the routing panel into a compact launcher plus modal, support injected fetch/update functions for client routes, and keep admin behavior unchanged.
**Files:** `frontend/src/components/Admin/FormRecipientRoutingPanel.tsx`, supporting form recipient components/hooks/API types as needed
**Depends on:** T1
**Verify:** frontend build and targeted lint.

### T3: Simplify shared submissions UI
**Do:** Improve scanning and action clarity in `FormSubmissionsTab`: clearer header, filter pills, status chips/tooltips, cleaner empty/loading states, and a more readable detail modal.
**Files:** `frontend/src/components/Admin/FormSubmissionsTab.tsx`
**Depends on:** none
**Verify:** frontend build and targeted lint.

### T4: Apply to admin and client tabs
**Do:** Wire the routing modal and simplified submissions UI into both `WebsiteDetail` and `DFYWebsite`, with client route wrappers for catalog/update.
**Files:** `frontend/src/pages/admin/WebsiteDetail.tsx`, `frontend/src/pages/DFYWebsite.tsx`
**Depends on:** T1, T2, T3
**Verify:** frontend build and targeted lint.

## Done
- [x] `npx tsc --noEmit` passes.
- [x] `cd frontend && npm run build` passes.
- [x] Targeted ESLint passes for new/touched frontend files or pre-existing issues are documented.
- [x] Admin Forms tab shows compact default recipients, routing modal launcher, and simplified submissions list.
- [x] Client Website submissions tab shows the same simplified list and can open/manage routing through user-scoped APIs.
- [x] No admin-only endpoint is used by the client-facing website page.

## Revision Log

### Rev 1 - 2026-05-11
**Change:** Replace the per-form routing modal's stacked cards with a form selector plus one focused routing editor.
**Reason:** The first modal still exposed every recipient control at once, making the workflow feel dense and the "disable override" language unclear.
**Updated Done criteria:** Routing modal explains that new forms are auto-detected and default to global recipients until a custom route is saved.

### Rev 2 - 2026-05-12
**Change:** Make recipient add/remove and route-mode saves optimistic with local loading indicators.
**Reason:** The current controls do not clearly show which clicked prefill, custom email, chip removal, or route-mode change is saving.
**Updated Done criteria:** Recipient chips update immediately, pending chips show adding/removing states, and route-mode cards show a focused saving indicator.

### Rev 3 - 2026-05-12
**Change:** Group submissions by detected form with a form sidebar and move recipient settings to a bottom settings action.
**Reason:** A flat submission list makes it hard to answer "which form did this come from?" and mixes operational settings with the inbox workflow.
**Updated Done criteria:** The sidebar lists detected forms, the main pane shows submissions for the selected form with scoped All/Verified/Flagged filters, and Settings opens default recipients plus routing controls.

### Rev 4 - 2026-05-12
**Change:** Move per-form routing out of the global settings modal and into a selected-form Settings tab beside the Submissions tab.
**Reason:** Default recipients are global fallback settings; per-form routing belongs with the selected form. The inbox also needs live refresh, unread indicators, and a form-scoped mark-all-read action.
**Updated Done criteria:** The form title row has Submissions/Settings tabs on the right, form sidebar shows unread indicators, submissions refresh every 5 seconds, and Mark all as read sits beside the filter tabs.

### Rev 5 - 2026-05-12
**Change:** Add visual-only form labels and manual ordering to the grouped form sidebar.
**Reason:** Admin/client admins need friendly labels and control over the form list order, but routing and submission filters must continue using the original detected form name.
**Updated Done criteria:** Form catalog preferences persist label/order, the UI shows the label with the original form name in muted text below, and reorder/rename controls do not alter submission routing semantics.
