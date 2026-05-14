# Harvest Row JSON Inspector

## Why
Harvest Activity currently exposes only `rows_fetched`, which makes debugging Rybbit/GSC/Clarity harvests harder than it needs to be. Admins need a safe way to inspect the stored raw payload for one harvest row without bloating the normal log table response.

## What
Add an on-demand JSON inspector for individual harvest activity rows. Clicking an inspect action opens a side drawer with read-only Monaco showing the stored payload for that integration/date, or the failed log/error payload if no stored data exists.

## Context

**Relevant files:**
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` — current integration endpoints and `getHarvestLogs` / `rerunHarvest` handlers.
- `src/routes/admin/websites.ts` — route definitions for integration harvest endpoints.
- `src/models/website-builder/IntegrationHarvestLogModel.ts` — current paginated harvest log queries.
- `src/models/website-builder/GscDataModel.ts` — stored GSC JSON payloads by `project_id + report_date`.
- `src/models/website-builder/RybbitDataModel.ts` — stored Rybbit JSON payloads by `project_id + report_date`.
- `src/models/website-builder/ClarityDataModelV2.ts` — stored Clarity JSON payloads by `project_id + report_date`.
- `frontend/src/api/integrations.ts` — typed frontend integration API calls.
- `frontend/src/components/Admin/integrations/IntegrationPanel.tsx` — Harvest Activity table and per-log actions.
- `frontend/src/components/Admin/MonacoJsonEditor.tsx` — existing lazy-loaded read-only JSON editor wrapper.

**Patterns to follow:**
- Backend: routes stay thin; controller orchestrates; DB reads live in models.
- Frontend: API calls live in `frontend/src/api/integrations.ts`; reuse existing lazy Monaco wrapper.

**Reference file:** `frontend/src/components/Admin/IdentitySliceEditor.tsx` — drawer layout pattern with Monaco JSON editor.

## Constraints

**Must:**
- Fetch raw payload on demand by `integrationId + harvestDate` or by harvest log id.
- Verify the integration belongs to the requested project before returning data.
- Support Rybbit, GSC, and Clarity stored payloads.
- Keep `fetchHarvestLogs` lightweight; do not add raw JSON payloads to the harvest-log list response.
- Render Monaco as read-only.
- For failed logs, expose useful error JSON/details even when no stored data row exists.

**Must not:**
- Add a new editor dependency; Monaco already exists.
- Load all raw payloads for the table page.
- Mutate stored harvest data from this inspector.
- Refactor the broader integrations dashboard.

**Out of scope:**
- JSON editing or replaying payloads.
- Pagination inside a single raw GSC payload.
- Redesigning GSC/Rybbit dashboard charts.

## Risk

**Level:** 2

**Risks identified:**
- Large GSC payloads could make the Integrations page heavy. → **Mitigation:** fetch one payload on demand, mount Monaco only while drawer is open, and keep the table response unchanged.
- Returning the wrong project's stored JSON would leak client analytics data. → **Mitigation:** always load the integration through the existing project-scoped guard, then query by `integration.project_id` and date.
- Platform-specific storage tables invite branching in the controller. → **Mitigation:** add a small service/helper that selects the correct model by `integration.platform` and keeps controller logic thin.

**Blast radius:** integration harvest endpoints, Harvest Activity table, Monaco lazy editor bundle, stored analytics payload reads for Rybbit/GSC/Clarity.

**Pushback:**
- Do not put raw JSON into the list endpoint. Future-us will hate the page weight once GSC stores high-volume query/page rows. The inspect action needs to be lazy.

## Tasks

### T1: Add backend raw payload reader
**Do:** Add model helpers to fetch one stored analytics row by `project_id + report_date` for GSC, Rybbit, and Clarity. Add a small integration service that returns `{ platform, harvestDate, log, data, payloadKind, payloadSizeBytes }`, using log/error JSON when no stored row exists.
**Files:** `src/models/website-builder/GscDataModel.ts`, `src/models/website-builder/RybbitDataModel.ts`, `src/models/website-builder/ClarityDataModelV2.ts`, `src/controllers/admin-websites/feature-services/service.harvest-log-inspector.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Expose project-scoped inspect endpoint
**Do:** Add `GET /:id/integrations/:integrationId/harvest-logs/:logId/payload`. The controller should load the integration via existing project-scoped guard, load the log by id/integration id, then return the on-demand payload.
**Files:** `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/routes/admin/websites.ts`, `src/models/website-builder/IntegrationHarvestLogModel.ts`
**Depends on:** T1
**Verify:** Request an existing GSC/Rybbit log and confirm only one payload returns; request a mismatched log id and confirm 404.

### T3: Add typed frontend API call
**Do:** Add `fetchHarvestLogPayload(projectId, integrationId, logId)` and types for the inspector response.
**Files:** `frontend/src/api/integrations.ts`
**Depends on:** T2
**Verify:** `npm run build` in `frontend`.

### T4: Add Harvest Activity drawer UI
**Do:** Add an inspect button beside each log row. On click, fetch the payload, open a right-side drawer, and render read-only JSON in `MonacoJsonEditor`. Include compact metadata header: platform, report date, outcome, rows fetched, payload kind, and payload size. Show loading/error states inside the drawer.
**Files:** `frontend/src/components/Admin/integrations/IntegrationPanel.tsx`, optionally `frontend/src/components/Admin/integrations/HarvestPayloadDrawer.tsx`
**Depends on:** T3
**Verify:** Open Rybbit and GSC harvest rows; drawer loads JSON lazily and closes cleanly.

## Done
- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` passes in `frontend`.
- [x] Harvest Activity table still loads without raw JSON payloads.
- [x] Inspecting one successful GSC row shows stored summary/query/page/country/device JSON.
- [x] Inspecting one successful Rybbit row shows stored Rybbit overview JSON.
- [x] Inspecting a failed row shows log/error JSON when no stored analytics payload exists.
- [x] Project-scoped route rejects mismatched project/integration/log access.
