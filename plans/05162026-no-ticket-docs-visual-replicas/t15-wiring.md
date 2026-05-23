# T15: Update Page Configs & Loader

## Why
All page config files still reference screenshot paths, zoom regions, and percentage-based hotspot positions. They need to be updated to use the new replica system: remove screenshot/zoom data, reference replica components, and adjust hotspot IDs to match the `HotspotZone` IDs used in each replica.

## What
Update all 14 page config files, the page loader, and the page registry.

## Context

**Files to modify:**
- `docs/src/data/pages/signin.ts`
- `docs/src/data/pages/signup.ts`
- `docs/src/data/pages/forgot-password.ts`
- `docs/src/data/pages/practice-hub.ts`
- `docs/src/data/pages/referrals-hub.ts`
- `docs/src/data/pages/local-rankings.ts`
- `docs/src/data/pages/todo-list.ts`
- `docs/src/data/pages/notifications.ts`
- `docs/src/data/pages/settings-integrations.ts`
- `docs/src/data/pages/settings-users.ts`
- `docs/src/data/pages/settings-billing.ts`
- `docs/src/data/pages/settings-account.ts`
- `docs/src/data/pages/website.ts` (may split into 3 or keep as 1 with sub-views)
- `docs/src/data/pages/support.ts`
- `docs/src/data/pageLoader.ts`
- `docs/src/data/pages.ts` (PAGE_REGISTRY — may need website-submissions, website-menus entries)
- `docs/src/types/docs.ts` (already updated in T1, but verify)

## Tasks

### 1. Update each page config file
For every `data/pages/*.ts` file:
- Remove `fullScreenshot` property
- Remove `zoomRegions` array entirely
- Remove `zoomRegionId` from every step
- Remove `x`, `y`, `width`, `height` from hotspots (no longer needed — zones are inline)
- Add `replica` field pointing to the imported replica component
- Ensure hotspot `id` values match the `HotspotZone` `id` values used in the corresponding replica component (cross-reference each replica spec)

### 2. Update `pageLoader.ts`
- Import all replica components
- Pass replica component reference through the page data
- Ensure `getDocPageData()` returns the updated `DocPage` shape

### 3. Handle website multi-tab
**Decision:** Keep a single `website` page entry in the registry. The `website.ts` page config can have a `replica` field pointing to `WebsiteEditorReplica` as default view. Optionally add `website-submissions` and `website-menus` entries to PAGE_REGISTRY if we want them as separate sidebar items.

**Recommended:** Add all 3 as separate entries in PAGE_REGISTRY under Features:
```
website-editor → WebsiteEditorReplica
website-submissions → WebsiteSubmissionsReplica
website-menus → WebsiteMenusReplica
```
Update the sidebar to show "Website" as a group with sub-items, or list all 3 as "Website: Editor", "Website: Submissions", "Website: Menus".

### 4. Verify cross-references
For each page, verify:
- Every hotspot ID in the page config has a matching `<HotspotZone id="...">` in the replica
- Every step's `hotspotId` maps to a valid hotspot
- The replica component is correctly imported and assigned

## Verify
- `npx tsc --noEmit` passes (or only pre-existing errors)
- `npm run build` succeeds
- Every page loads in the docs app without errors

## Depends on
T1-T14 (all infrastructure and replicas must exist)
