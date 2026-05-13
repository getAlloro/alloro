# Rybbit Historic Daily Backfill

## Why
Rybbit integrations now exist for active website projects, but stored `rybbit_data` is sparse and includes incomplete/future local-date rows. The admin dashboard should read complete daily history from Alloro's normalized tables, not call the analytics backend on every page render.

## What
Add a safe Rybbit historic backfill path that rebuilds daily stored rows for every active Rybbit integration from each Rybbit site's `createdAt` date through the latest complete `America/New_York` report date. Provide a per-project admin action and an admin all-project runner for the current active integrations.

## Context

**Current evidence:**
- Active Rybbit integrations: 7 projects.
- Stored coverage is inconsistent: several projects only have a single May 14 row, while One Endodontics and Surf City have nine stored days.
- Rybbit site API returns `createdAt`; Artful's site endpoint returned `createdAt="2026-03-12 05:54:32.542833"`.
- Rybbit overview endpoint accepts `start_date`, `end_date`, and `time_zone`, but the guessed `/timeseries` endpoint returned 404.

**Relevant files:**
- `src/services/integrations/rybbitHarvestAdapter.ts` - one-date Rybbit overview fetch.
- `src/workers/processors/dataHarvest.processor.ts` - daily/manual harvest processor.
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` - integration endpoints and GSC backfill analog.
- `src/controllers/admin-websites/feature-services/service.gsc-integration.ts` - closest historic backfill queue pattern.
- `src/controllers/admin-websites/feature-services/service.rybbit-integration.ts` - Rybbit status/connect service.
- `src/models/website-builder/RybbitDataModel.ts` - stored daily Rybbit rows.
- `src/models/website-builder/IntegrationHarvestLogModel.ts` - harvest activity rows.
- `src/models/website-builder/WebsiteIntegrationModel.ts` - active integration lookup.
- `frontend/src/components/Admin/integrations/RybbitTab.tsx` - Rybbit admin screen.
- `frontend/src/api/integrations.ts` - typed admin API client.

**Patterns to follow:**
- GSC `queueHistoricBackfill()` for clear-then-queue behavior.
- Existing `rerunHarvest` endpoint for enqueuing single explicit date jobs.
- Existing Rybbit performance dashboard should continue reading only from `rybbit_data`.

**Reference file:** `src/controllers/admin-websites/feature-services/service.gsc-integration.ts` - closest service structure for history discovery, date enumeration, clearing stored rows, and queueing per-day harvest jobs.

## Constraints

**Must:**
- Backfill only active `platform='rybbit'` integrations with a valid `metadata.siteId`.
- Use Rybbit's `createdAt` as the earliest possible report date for that site.
- Use the latest complete report date in `America/New_York`, not local machine time.
- Queue individual date jobs newest-first so dashboards become useful quickly.
- Clear existing `rybbit_data` and harvest logs for a project before its historic rebuild when explicitly requested.
- Keep dashboard reads against `website_builder.rybbit_data`.
- Return skipped integrations with reasons instead of failing the whole all-project run.
- Keep DB access in models/services; do not spread inline Knex through controllers.

**Must not:**
- Fetch directly from Rybbit in the dashboard render path.
- Store current/future Rybbit dates as historic complete days.
- Treat zero-metric complete historical dates as failures.
- Add a new analytics table.
- Run an unbounded all-project loop synchronously inside an HTTP request.

**Out of scope:**
- Replacing Rybbit or changing Rybbit's schema.
- Adding query/page/device dimensions for Rybbit.
- Reworking GSC or Clarity harvest behavior.
- Migrating projects that do not already have an active Rybbit integration.

## Risk

**Level:** 4 - Major Impact

**Risks identified:**
- Cross-project data rewrite can erase useful rows if date range discovery is wrong. -> **Mitigation:** compute range from Rybbit site metadata, return a dry summary, and clear per project only when queueing that project's rebuild.
- Queue fan-out can create hundreds of jobs at once. -> **Mitigation:** use `addBulk` in bounded project batches, newest-first, with one job per date and no worker concurrency increase.
- Rybbit API may rate-limit or slow down under large date-by-date pulls. -> **Mitigation:** keep each day as a normal harvest job with existing retry/log handling; do not synchronously fetch all days in the request.
- Complete historical zero days are valid, but incomplete current-day zeros are misleading. -> **Mitigation:** latest date helper uses Rybbit reporting timezone and excludes today.
- All-project operation could accidentally include inactive or broken sites. -> **Mitigation:** query only `status='active'`, `platform='rybbit'`, and valid `metadata.siteId`; report skips.

**Blast radius:**
- Rybbit admin integrations screen.
- Rybbit stored dashboard data.
- `harvest-daily` BullMQ queue load.
- `integration_harvest_logs` for Rybbit integrations.
- Existing daily scheduled harvest behavior for Rybbit.

**Pushback:**
- Do not turn the dashboard into a live Rybbit API proxy. That couples admin UX to analytics API latency and loses auditability. The correct shape is Rybbit as source of truth and Alloro DB as the normalized read model.
- Do not infer "all projects" as every website project. It should mean every active Rybbit integration; disconnected projects have no canonical Rybbit site ID.

## Tasks

### T1: Rybbit Backfill Service
**Do:** Create a focused service that validates Rybbit config, fetches site metadata, computes `fromDate` from `createdAt`, computes `toDate` as latest complete `America/New_York` date, enumerates dates newest-first, and queues per-day harvest jobs. Include both single-integration and all-active-integration entry points with skip reporting.
**Files:** `src/controllers/admin-websites/feature-services/service.rybbit-history.ts`, `src/services/integrations/rybbitHarvestAdapter.ts`
**Depends on:** none
**Verify:** Script/unit-level dry check for a known site computes `fromDate=2026-03-12` and excludes current New York date.

### T2: Model Support For Safe Clearing And Lookup
**Do:** Add model methods to find active integrations by platform, delete Rybbit data by project, and delete harvest logs by integration/platform where needed. Keep all queries parameterized and model-owned.
**Files:** `src/models/website-builder/WebsiteIntegrationModel.ts`, `src/models/website-builder/RybbitDataModel.ts`, `src/models/website-builder/IntegrationHarvestLogModel.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`; read-only query confirms seven active Rybbit integrations before queueing.

### T3: Admin Endpoints And Queue Contracts
**Do:** Add `POST /:id/integrations/:integrationId/rybbit/backfill` for one project and an admin-only all-project runner route that queues every active Rybbit integration. Responses must include queued project count, queued day count, cleared row counts, and skipped integrations with reasons.
**Files:** `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/routes/admin/websites.ts`, `frontend/src/api/integrations.ts`
**Depends on:** T1, T2
**Verify:** API smoke queues one known integration and returns a sane date range without blocking the request.

### T4: Rybbit Admin Button
**Do:** Add a Rybbit "Fetch History" action mirroring the GSC button, with confirmation that stored Rybbit rows and harvest activity for that website will be rebuilt from Rybbit. Keep the all-project runner out of the normal website screen unless explicitly needed later.
**Files:** `frontend/src/components/Admin/integrations/RybbitTab.tsx`, `frontend/src/api/integrations.ts`
**Depends on:** T3
**Verify:** Frontend build/typecheck; connected Rybbit tab shows the action and queues the request.

### T5: One-Time All-Project Queue Run
**Do:** After Redis is healthy, queue the all-active Rybbit historic rebuild for the seven current active integrations. Monitor harvest logs until jobs are draining and spot-check at least Artful, Caswell, One Endodontics, and Surf City for non-sparse `rybbit_data`.
**Files:** no code file beyond T1-T4; uses the endpoint/service from T3.
**Depends on:** T3
**Verify:** Database read confirms each active Rybbit project has daily rows from its Rybbit created date through latest complete New York date, or has a recorded skip/error reason.

## Done
- [x] `npx tsc --noEmit` passes or only unrelated pre-existing errors are documented.
- [x] Rybbit historic range excludes the current incomplete New York date.
- [x] Per-project Rybbit Fetch History queues one job per daily date and returns queued/cleared counts.
- [x] All-project Rybbit backfill queues active Rybbit integrations only and reports skips.
- [x] Existing dashboard still reads from `website_builder.rybbit_data`, not directly from Rybbit.
- [x] Current active integrations are backfilled or have explicit skip/error reasons.
- [x] At least four active projects are spot-checked in DB after the run.

## Revision Log

### Rev 1 - May 14, 2026
**Change:** Integrations with no complete historical Rybbit day now clear stale stored rows and return `queued=false` instead of throwing.
**Reason:** A brand-new site can have only current-day partial data. Leaving an old future/local-date row behind would keep the dashboard anchored to misleading zeros.
**Updated Done criteria:** Garrison Orthodontics may correctly have zero stored rows until its first complete Rybbit reporting day exists.
