# GSC Integrations End To End

## Why
Google Search Console support exists in fragments, but there is still no trustworthy end-to-end path from OAuth scope grant to project-level site binding to harvest data. Right now the database has zero `gsc` integrations, zero GSC harvest logs, and zero `gsc_data` rows, even though several Google connections already have the Search Console scope.

## What
Make GSC operational for website projects: an admin can select an org-scoped Google connection, choose a Search Console site, save a `platform='gsc'` integration, validate it, queue an initial harvest, and see harvest status/logs. Settings must accurately report GSC scope state.

## Context

**Relevant files:**
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` — current integrations controller; already contains partial GSC endpoints but with controller-level Google API logic.
- `src/routes/admin/websites.ts` — route ordering for project integration endpoints.
- `src/controllers/admin-websites/feature-services/service.form-detection.ts` — domain service analog for moving controller-specific business logic out of the controller.
- `src/models/website-builder/ProjectModel.ts` — source of project `organization_id`, required for tenant scoping.
- `src/models/GoogleConnectionModel.ts` — Google connection lookup and scope filtering.
- `src/models/website-builder/WebsiteIntegrationModel.ts` — project integration source of truth.
- `src/services/integrations/gscHarvestAdapter.ts` — existing Search Console validation and fetch adapter.
- `src/workers/processors/dataHarvest.processor.ts` — existing harvest processor that can upsert GSC data when an active GSC row exists.
- `src/controllers/auth/feature-services/OAuthFlowService.ts` — OAuth token persistence; must preserve refresh tokens during incremental grants.
- `src/controllers/settings/feature-services/service.scopes.ts` and `src/controllers/settings/feature-utils/util.scope-parser.ts` — settings scope reporting.
- `frontend/src/api/integrations.ts` — typed admin integration API client.
- `frontend/src/components/Admin/integrations/GscConnectPanel.tsx` and `GscTab.tsx` — GSC admin UI.
- `frontend/src/pages/settings/IntegrationsRoute.tsx` — user-facing GSC scope grant surface.

**Patterns to follow:**
- Routes remain thin and ordered before `/:integrationId` params.
- Controllers orchestrate only; GSC ownership checks, site listing, and save logic belong in a domain service.
- DB access goes through models.
- Frontend network calls should go through typed API helpers/hooks, not ad hoc `fetch` plus direct localStorage token reads.

**Reference file:** `src/controllers/admin-websites/feature-services/service.form-detection.ts` — closest local analog for admin-website domain service structure.

**Reference file:** `frontend/src/hooks/queries/useSettingsQueries.ts` — closest hook/query analog for settings state and invalidation.

## Constraints

**Must:**
- Scope Google connections by the website project's `organization_id`.
- Preserve exact `siteUrl` values returned by Search Console; do not normalize `sc-domain:` or URL-prefix properties into a different format.
- Keep the existing HubSpot integration flow intact.
- Store no Google access or refresh tokens in `website_integrations.metadata`.
- Use existing Google OAuth connection records and `metadata.googleConnectionId`.
- Queue or expose an initial harvest path so success can be verified immediately after connect.
- Treat live DB mutation as manual verification only; do not mutate shared DB during implementation unless explicitly approved.

**Must not:**
- Add a new Search Console credentials system.
- Expose all Google connections globally to a project admin flow.
- Add analytics dashboards or query/page charts in this scope.
- Rewrite the whole integrations architecture or form-mapping flow.
- Introduce new dependencies.

**Out of scope:**
- GSC performance dashboards beyond connection status and harvest logs.
- Historical multi-day backfill UI beyond an initial/yesterday harvest.
- Renderer script injection work.
- Refactoring non-GSC provider UI unless required to keep shared components correct.

## Risk

**Level:** 3

**Risks identified:**
- Tenant boundary leak: current partial `listGscConnections` can expose all GSC-scoped Google connections, regardless of the website project's org. → **Mitigation:** resolve the project first, require `organization_id`, and query only connections for that org.
- OAuth incremental grants may not return a refresh token and must not erase an existing one. → **Mitigation:** update token persistence to omit `refresh_token` when Google does not return it.
- Settings scope state can be wrong if it checks one arbitrary org connection. → **Mitigation:** aggregate scope status across all Google connections for the org.
- Search Console site ownership is exact and can use URL-prefix or domain properties. → **Mitigation:** list and save Google's exact `siteUrl`; validate selected values against `sites.list()` before saving.
- Initial harvest can fail because Redis/worker is down while the connection itself is valid. → **Mitigation:** keep the integration saved, return/record a queue warning, and surface validation/log status clearly.
- Existing controller is already oversized. → **Mitigation:** move GSC business logic into a focused service instead of adding more inline controller logic.

**Blast radius:**
- Admin website integrations tab: HubSpot, Rybbit, Clarity, GSC provider list.
- Google OAuth connect/reconnect flows used from settings and admin GSC connect.
- Settings integrations scope banner and GSC section.
- Daily data harvest worker and harvest logs.
- `website_builder.website_integrations`, `integration_harvest_logs`, and `gsc_data` runtime behavior.

**Pushback:**
- This does not belong as a few more branches in `WebsiteIntegrationsController.ts`. Future-us will hate that. The GSC flow crosses project tenancy, Google OAuth, external API calls, integration persistence, and queueing; it needs a small service boundary.
- Do not call this "working" when the UI can grant a scope but cannot bind a Search Console site to a project. Scope grant is only one prerequisite.

## Tasks

### T1: Org-scoped GSC backend service
**Do:** Add a focused GSC integration service that resolves the project, enforces `organization_id`, lists only org-owned Google connections with the GSC scope, lists Search Console sites for a verified connection, validates selected `siteUrl`, saves or updates the project GSC integration, and queues an initial harvest for yesterday as best effort. Keep controller methods thin and route ordering intact.

**Files:** `src/controllers/admin-websites/feature-services/service.gsc-integration.ts`, `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/routes/admin/websites.ts`, `src/models/GoogleConnectionModel.ts`, `src/models/website-builder/WebsiteIntegrationModel.ts`

**Depends on:** none

**Verify:** `npx tsc --noEmit`; manual read-only DB check confirms no global connection exposure path remains.

### T2: OAuth and settings scope correctness
**Do:** Make incremental OAuth safe by preserving existing refresh tokens when Google omits a new one. Ensure reconnect state remains authenticated/org-bound. Update settings scope calculation to aggregate all Google connections for the org and report `gsc` accurately. Fix copy/error text that still says only `gbp` is valid.

**Files:** `src/controllers/auth/feature-services/OAuthFlowService.ts`, `src/controllers/auth/AuthController.ts`, `src/controllers/auth/feature-services/ScopeManagementService.ts`, `src/controllers/settings/feature-services/service.scopes.ts`, `src/controllers/settings/feature-utils/util.scope-parser.ts`, `frontend/src/pages/settings/IntegrationsRoute.tsx`, `frontend/src/components/settings/MissingScopeBanner.tsx`

**Depends on:** none

**Verify:** `npx tsc --noEmit`; authenticated `GET /api/auth/google/reconnect?scopes=gsc` returns an auth URL and org-bound state; `GET /api/settings/scopes` reports `gsc` missing/granted based on org connections.

### T3: Admin GSC connect UI
**Do:** Finish the admin GSC tab as a deterministic connect flow: load org-scoped eligible connections, allow scope grant when none are eligible, list Search Console sites for the chosen connection, display permission levels, save the selected site, refresh the integration list, and show connected state using the shared `IntegrationPanel`. Remove raw token/localStorage fetch behavior from the GSC UI path.

**Files:** `frontend/src/api/integrations.ts`, `frontend/src/hooks/queries/useWebsiteIntegrations.ts`, `frontend/src/components/Admin/integrations/GscConnectPanel.tsx`, `frontend/src/components/Admin/integrations/GscTab.tsx`, `frontend/src/components/Admin/IntegrationsTab.tsx`, `frontend/src/components/Admin/integrations/IntegrationProviderList.tsx`

**Depends on:** T1, T2

**Verify:** `cd frontend && npm run build`; manual admin UI smoke test on `/admin/websites/:id?tab=integrations` for no-connection, missing-scope, site-picker, connected, and error states.

### T4: Harvest status and verification path
**Do:** Ensure a newly saved GSC integration can be proven operational without waiting for the next daily cron. The create/save path should either queue yesterday's harvest or return a clear warning if the queue is unavailable. Existing validate, harvest logs, and rerun endpoints should work for GSC rows and should not regress Rybbit/Clarity.

**Files:** `src/controllers/admin-websites/feature-services/service.gsc-integration.ts`, `src/workers/processors/dataHarvest.processor.ts`, `src/services/integrations/gscHarvestAdapter.ts`, `frontend/src/components/Admin/integrations/IntegrationPanel.tsx`, `frontend/src/api/integrations.ts`

**Depends on:** T1

**Verify:** `npx tsc --noEmit`; `cd frontend && npm run build`; with an approved test project, create GSC integration, validate it, observe queued harvest/log entry, and confirm `website_builder.gsc_data` receives a row after the worker processes the job.

## Revision Log

### Rev 1 — May 12, 2026
**Change:** Defer live/manual smoke checks and commit the implementation-only scope.
**Reason:** User explicitly requested deferring manual smoke. The live DB still has zero `gsc` integration rows, zero GSC harvest logs, and zero `gsc_data` rows from the read-only check, so runtime data-flow proof requires a later approved test project connection.
**Updated Done criteria:** Manual GSC row/log/data proof and HubSpot/Rybbit/Clarity visual panel smoke are deferred follow-up checks, not blockers for the implementation-only commit.

## Done
- [x] `npx tsc --noEmit` passes or only unrelated pre-existing errors are documented.
- [x] `cd frontend && npm run build` passes.
- [x] Admin GSC connection list is scoped to the website project's organization.
- [x] Admin can select a Search Console site and save a `platform='gsc'`, `type='data_harvest'` integration.
- [x] Settings accurately reports GSC scope state for the org.
- [x] Incremental OAuth does not delete existing refresh tokens.
- [x] Initial GSC harvest is queued or a clear queue warning is surfaced.
- [x] Manual approved smoke test confirms a GSC integration row, harvest log, and `gsc_data` row. Deferred by Rev 1 for implementation-only commit.
- [x] HubSpot, Rybbit, and Clarity integration panels still render and load logs. Deferred by Rev 1 for implementation-only commit.
