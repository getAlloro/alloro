# No GBP Manual Identity Intake

## Why
Some new website projects will not have a Google Business Profile yet. The current Identity warmup form technically allows no GBP, but it hides the structured business/location fields admins need, so identity can come out with weak `business` and `locations` data.

## What
Add a first-class **No GBP yet** path in the Project Identity modal. When selected, the form shows structured manual inputs for business basics, hours, and a location loop. Warmup uses those manual fields to build `identity.business` and `identity.locations[]` without inventing Google `place_id`s.

## Context

**Relevant files:**
- `frontend/src/components/Admin/IdentityModal.tsx` — owns the empty warmup form, selected GBP flow, rerun-source rehydration, ready tabs, and location rows.
- `frontend/src/api/websites.ts` — frontend `WarmupInputs`, `ProjectIdentityBusiness`, and `ProjectIdentityLocation` types.
- `src/controllers/admin-websites/AdminWebsitesController.ts` — `startIdentityWarmup` request extraction and project location endpoints.
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` — builds `project_identity.business`, `locations[]`, and source metadata.
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts` — backend identity shape and prompt context.
- `src/controllers/admin-websites/feature-utils/util.project-identity.ts` — shared readiness gate for page/layout/slot generation.

**Patterns to follow:**
- Keep `project_identity` as the source of truth.
- Keep location CRUD in the Identity modal; do not create a parallel website setup surface.
- Use `patchIdentitySlice(projectId, "locations", nextLocations)` for manual location edits where possible, matching existing slice-update behavior for doctors/services.

**Reference file:** `frontend/src/components/Admin/AddLocationModal.tsx` — closest modal/add-row pattern for locations.

## Constraints

**Must:**
- Add an explicit mode control: `Google Business Profile` vs `No GBP yet`.
- In `No GBP yet`, show business name, category/specialty, phone, website URL, and a repeatable manual locations list.
- Manual location fields must include at minimum: name, address, city, state, zip, phone, website URL, and hours.
- Manual locations must not be stored as fake Google `place_id`s.
- Existing GBP flow must continue to work unchanged for selected Google profiles.
- Rerun warmup with “keep current sources” must rehydrate manual business/location inputs as well as URLs/text/GBP.
- Ready Locations tab must display manual and Google-backed rows together, but only show GBP resync on Google-backed rows.

**Must not:**
- Add a database table for manual locations.
- Write manual locations into `selected_place_ids`, `primary_place_id`, or `selected_place_id`; valid manual-only warmup should clear stale GBP selections instead.
- Invent ratings/review counts for manual locations.
- Force a GBP search before identity can be generated.
- Mix unrelated Identity modal refactors into this feature.

**Out of scope:**
- Public renderer changes for showing all locations.
- Ranking/reviews features for manual locations.
- Converting manual locations to real GBP locations later.
- Schema migrations; this is JSONB shape expansion only.

## Risk

**Level:** 3

**Risks identified:**
- Manual locations conflict with existing Google-backed assumptions in location endpoints. **Mitigation:** add an explicit location identity key (`id`) and `source: "manual" | "gbp"` while keeping `place_id` only for GBP rows.
- `identity.business` can drift from the primary manual location. **Mitigation:** warmup derives business from the selected primary manual location plus business basics; Ready-tab primary changes must rewrite business for both manual and GBP rows.
- Existing UI uses `loc.place_id` as React key and action identifier. **Mitigation:** introduce a `getIdentityLocationKey()` helper and only call GBP endpoints for rows with `source !== "manual"` and a real `place_id`.
- Overloading the warmup form could become a giant unmaintainable component. **Mitigation:** extract manual business/location inputs into small subcomponents inside the IdentityModal module or sibling components if the file gets worse.

**Blast radius:**
- Identity warmup payload contract.
- Identity readiness and stable prompt context indirectly through richer `business` / `locations[]`.
- Identity modal empty-state form, rerun rehydration, and Locations tab.
- Existing GBP add/resync/remove/primary endpoints must not regress.

**Pushback:**
- Do not solve this by stuffing “No GBP” into text notes. That already works technically, but it gives the generator weak structured data.
- Do not fake `place_id`. A manual location is not a Google location. Treat it honestly in the data model.

## Tasks

### T1: Extend identity and warmup types for manual business data
**Do:** Add frontend/backend types for `manualBusiness` and `manualLocations` on `WarmupInputs`. Extend `ProjectIdentityLocation` / backend `ProjectIdentity` locations with `id?: string`, `source?: "gbp" | "manual"`, and `place_id?: string | null` while preserving compatibility with existing GBP rows.
**Files:** `frontend/src/api/websites.ts`, `src/controllers/admin-websites/feature-utils/util.identity-context.ts`, `src/controllers/admin-websites/feature-services/service.identity-warmup.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Build manual identity during warmup
**Do:** Validate and pass manual business/location inputs from `startIdentityWarmup` to `runIdentityWarmup`. In warmup, build manual locations with stable `id`s, `source: "manual"`, no `place_id`, no rating/review count, and `warmup_status: "ready"`. If no GBP primary exists, derive `identity.business` from manual business + the primary manual location. Clear stale selected GBP columns during valid manual-only warmup. Keep generation readiness strict: raw URL/text scrape evidence alone is not enough to proceed without GBP or manual business/location data.
**Files:** `src/controllers/admin-websites/AdminWebsitesController.ts`, `src/controllers/admin-websites/feature-services/service.identity-warmup.ts`, `src/controllers/admin-websites/feature-utils/util.project-identity.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Add No GBP mode to the warmup form
**Do:** Add a segmented control in `EmptyWarmupForm`. In GBP mode, keep the current picker. In No GBP mode, hide GBP search and show structured manual business fields plus a repeatable manual location editor. Include add/remove/set-primary controls for manual locations.
**Files:** `frontend/src/components/Admin/IdentityModal.tsx`
**Depends on:** T1
**Verify:** frontend build or targeted TypeScript check

### T4: Wire form payload and rerun rehydration
**Do:** Update `handleGenerate()` to send `manualBusiness` and `manualLocations` when No GBP mode is active. Update `rehydrateFromIdentity()` and `canKeepSources` so rerun keeps manual business/location data. Preserve existing URL/text/logo/brand behavior.
**Files:** `frontend/src/components/Admin/IdentityModal.tsx`
**Depends on:** T2, T3
**Verify:** Manual: existing manual identity can rerun with “keep current sources”.

### T5: Make Locations tab source-aware
**Do:** Render manual and GBP-backed rows together. Manual rows show an editable/manual badge and no resync button. GBP rows retain resync/remove behavior. Primary switching must work for manual rows through a slice update that rewrites `identity.business`; GBP rows can keep using the existing primary endpoint or be normalized through the same helper.
**Files:** `frontend/src/components/Admin/IdentityModal.tsx`, `frontend/src/api/websites.ts`
**Depends on:** T1
**Verify:** Manual: manual row can become primary; GBP row can still resync.

### T6: Verification pass
**Do:** Run TypeScript checks, verify no import/export drift, and manually exercise both form modes in the admin UI.
**Files:** no new files expected unless T3 extraction is necessary
**Depends on:** T1-T5
**Verify:** `npx tsc --noEmit`; frontend build or targeted frontend typecheck; browser test for Identity modal.

## Done
- [x] Existing GBP warmup still accepts selected Google profiles.
- [x] No GBP mode can generate identity with business name and at least one manual location.
- [x] Warmup refuses to start when neither GBP nor complete No GBP manual data is provided.
- [x] Manual locations in JSON have no fake `place_id`.
- [x] Layout/page generation sees the manual business name in stable identity context.
- [x] Locations tab distinguishes manual rows from GBP-backed rows.
- [x] `npx tsc --noEmit` has no errors caused by this work.

## Revision Log

### Rev 1 — 2026-05-13
**Change:** Add a hard preflight gate so admins cannot start warmup unless they either select at least one GBP profile or provide complete No GBP manual business/location data.
**Reason:** The user explicitly wants to prevent proceeding with neither GBP nor useful no-GBP data.
**Updated Done criteria:** Added warmup refusal when neither source path is complete.

### Rev 2 — 2026-05-13
**Change:** Keep page/layout/slot readiness strict so scraped URLs or text notes alone do not make identity usable.
**Reason:** The failed project had no selected GBP, no business name, and no locations; only raw scrape/text evidence. That should remain blocked until GBP or complete No GBP manual data exists.
**Updated Done criteria:** Existing warmup refusal criterion also applies to generation readiness semantics.

### Rev 3 — 2026-05-13
**Change:** Clear stale `selected_place_id`, `selected_place_ids`, and `primary_place_id` when a valid manual-only No GBP warmup starts.
**Reason:** Otherwise a project that previously had GBP selected could accidentally pull old GBP locations back into a manual-only identity run.
**Updated Done criteria:** Manual-only warmup must not retain or create selected GBP ids.
