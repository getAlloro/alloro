# Website Editor Media Boundary Hardening

## Why
The client-facing DFY website editor currently depends on admin media endpoints for browsing and uploading replacement photos. That is the wrong boundary: client editing needs a user-scoped media surface, and admin media/editor routes need explicit admin authentication before more editor features are layered on top.

## What
Create a safe media boundary for both editor surfaces: authenticated user-scoped media list/upload endpoints for DFY projects, admin media/editor calls that carry auth consistently, and shared editor media components that receive the correct API adapter instead of hardcoding `/api/admin/...`.

## Context

**Relevant files:**
- `frontend/src/pages/DFYWebsite.tsx` — client-facing editor surface and save/publish flow.
- `frontend/src/pages/admin/PageEditor.tsx` — admin editor surface and draft/autosave flow.
- `frontend/src/pages/admin/LayoutEditor.tsx` — admin header/footer editor that also consumes the shared editor sidebar.
- `frontend/src/components/PageEditor/ChatPanel.tsx` — currently uploads media through an admin media route.
- `frontend/src/components/PageEditor/MediaBrowser.tsx` — currently lists media through an admin media route.
- `frontend/src/components/Admin/MediaTab.tsx` — admin media management surface backed by the admin media route.
- Admin post media field editors — admin-only consumers of the shared media picker/upload behavior.
- `frontend/src/api/index.ts` — authenticated user API helper pattern.
- `frontend/src/api/websites.ts` — admin website/page editor API calls, many using raw `fetch`.
- `src/routes/user/website.ts` — authenticated user website route pattern.
- `src/controllers/user-website/UserWebsiteController.ts` — client website controller boundary.
- `src/routes/admin/websites.ts` — admin website/editor routes mounted by the app.
- `src/routes/admin/media.ts` — admin media CRUD routes mounted under website projects.
- `src/index.ts` — route mounting for admin website/media and user website APIs.

**Patterns to follow:**
- User-facing routes must follow `src/routes/user/website.ts`: `authenticateToken`, RBAC middleware, role constraints, controller-owned authorization.
- Frontend user calls must follow `frontend/src/api/index.ts`, which attaches the bearer token from auth storage.
- Admin calls should be centralized behind an auth-aware helper instead of scattering one-off header construction.

**Reference file:** `src/routes/user/website.ts` — closest existing route analog for authenticated, role-scoped website access.

## Constraints

**Must:**
- Add user-scoped media list/upload behavior under the user website API boundary.
- Verify project ownership/organization access server-side before listing or uploading media.
- Keep admin and client media APIs separate even if they share internal service logic.
- Update shared editor media components so the route choice is injected by each surface.
- Preserve existing media response shape or add a typed adapter so the UI does not fork unnecessarily.
- Add explicit Authorization handling to admin website/media calls before enforcing admin route guards.

**Must not:**
- Let the client-facing editor call `/api/admin/...`.
- Trust project IDs from the browser without server-side ownership checks.
- Broaden user roles beyond the existing DFY website access model.
- Introduce a new storage provider, media table, or schema migration.
- Mix in direct text/link/image editing behavior; that belongs in the follow-up editor-controls spec.

**Out of scope:**
- Traditional inline editing controls.
- Media library redesign.
- AI editor prompt changes.
- CDN/storage migration.
- Database schema changes.

## Risk

**Level:** 4

**Risks identified:**
- Admin route hardening may break existing admin website/media screens that currently rely on raw `fetch` without auth headers. → **Mitigation:** update admin frontend API helpers/call sites first, then enforce route guards.
- A user media upload endpoint can become an authorization bypass if it only checks project ID. → **Mitigation:** verify the project belongs to an organization/account the authenticated user can manage before every list/upload.
- Shared media components can hide route mistakes if they still construct URLs internally. → **Mitigation:** make route behavior explicit through an adapter prop or typed API functions owned by each editor surface.
- Upload limits, MIME validation, and filename handling may differ between admin and user paths. → **Mitigation:** reuse existing admin media validation/storage service after authorization, not duplicate upload parsing.

**Blast radius:**
- Admin website editor media browser/upload.
- Admin layout editor media browser/upload through the shared editor sidebar.
- Client DFY website editor media browser/upload.
- Admin website project media management.
- Admin post editor media picker/upload fields.
- Any admin API calls in `frontend/src/api/websites.ts` that hit newly guarded routes.
- User website routes and DFY project authorization.
- Server route mounting in `src/index.ts`.

**Pushback:**
- Do not solve this by simply allowing client users to hit admin media routes. That leaves the system with a fake boundary and makes future editor controls harder to secure.
- Do not turn on admin route guards until the frontend callers are auth-ready. Future-us will hate debugging a half-secured admin surface where some calls silently 401.

## Tasks

### T1: Admin Media And Website Auth Audit
**Do:** Inventory admin website/media routes used by the page editor and media manager, identify raw frontend callers, and define the exact guard placement.
**Files:** `src/routes/admin/websites.ts`, `src/routes/admin/media.ts`, `src/index.ts`, `frontend/src/api/websites.ts`
**Depends on:** none
**Verify:** Manual: route/caller list matches actual imports and fetch URLs.

### T2: User-Scoped Media Backend
**Do:** Add list/upload endpoints under the user website API boundary, including project access checks, role constraints, upload validation, and response shaping compatible with the existing media browser.
**Files:** `src/routes/user/website.ts`, `src/controllers/user-website/UserWebsiteController.ts`, user website service files as needed
**Depends on:** T1
**Verify:** API: authenticated allowed user can list/upload for their project; unrelated project ID returns 403/404.

### T3: Auth-Ready Admin API Calls
**Do:** Move admin website/media editor calls onto an auth-aware frontend helper or add consistent auth headers to the existing API module before backend guard enforcement.
**Files:** `frontend/src/api/websites.ts`, admin page/media callers as needed
**Depends on:** T1
**Verify:** Manual: admin page editor and media manager still load, upload, edit, save, and publish after guards are enabled.

### T4: Media Component API Adapter
**Do:** Refactor `MediaBrowser` and `ChatPanel` to receive typed list/upload functions or an explicit media API adapter from the parent editor surface.
**Files:** `frontend/src/components/PageEditor/MediaBrowser.tsx`, `frontend/src/components/PageEditor/ChatPanel.tsx`, parent editor pages, admin media/post consumers
**Depends on:** T2, T3
**Verify:** `npx tsc --noEmit`; manual: admin and client editors call different endpoints.

### T5: Enforce Route Guards
**Do:** Apply admin authentication/RBAC to admin website/media routes involved in editor and media operations after frontend auth headers are in place.
**Files:** `src/routes/admin/websites.ts`, `src/routes/admin/media.ts`, `src/index.ts`
**Depends on:** T3, T4
**Verify:** API: unauthenticated admin media/editor requests reject; authenticated admin requests still succeed.

## Done
- [ ] Client DFY media list/upload no longer calls `/api/admin/...`.
- [ ] Admin media/editor routes reject unauthenticated requests.
- [ ] User media endpoints verify project ownership/access server-side.
- [ ] Admin editor media browse/upload still works.
- [ ] Client editor media browse/upload works for an allowed DFY project and fails for an unrelated project.
- [ ] `npx tsc --noEmit` passes or only pre-existing errors are documented.
- [ ] No database migration is introduced.

## Revision Log

### Rev 1 — 2026-05-21
**Change:** Added `LayoutEditor`, `MediaTab`, and admin post media field editors to the blast radius.
**Reason:** Implementation found these are real consumers of the guarded admin media route or shared editor media components.
**Updated Done criteria:** none.
