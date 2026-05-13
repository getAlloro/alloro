# Integration Freshness Window And GSC Date Display

## Why
Recent analytics data can arrive late or be revised after the first harvest. We currently store successful zero-row harvests for recent dates and do not naturally revisit them, while the GSC admin UI can also display date-only DB fields one day early.

## What
Make scheduled daily harvesting refresh bounded recent windows per provider, normalize GSC date-only fields as `YYYY-MM-DD` before they hit the frontend, and let admins manually refresh successful zero-row GSC dates.

## Context

**Relevant files:**
- `src/workers/processors/dataHarvest.processor.ts` — runs explicit one-date jobs and the scheduled daily harvest across active data-harvest integrations.
- `src/workers/worker.ts` — schedules daily data harvest at 5:00 AM UTC.
- `src/services/integrations/gscHarvestAdapter.ts` — fetches one date at a time for summary, queries, pages, countries, and devices; zero rows are still a successful API response.
- `src/services/integrations/rybbitHarvestAdapter.ts` — fetches one date at a time for Rybbit analytics.
- `src/services/integrations/clarityHarvestAdapter.ts` — fetches one date at a time for Clarity analytics.
- `src/models/website-builder/IntegrationHarvestLogModel.ts` — returns harvest log rows for the admin activity table.
- `src/models/website-builder/GscDataModel.ts` — returns stored GSC daily rows for the dashboard aggregator.
- `src/controllers/admin-websites/feature-services/service.gsc-performance.ts` — aggregates stored GSC rows into the performance dashboard.
- `frontend/src/components/Admin/integrations/IntegrationPanel.tsx` — renders harvest dates, row counts, and rerun actions.

**Patterns to follow:**
- Keep DB access inside models; no controller-level Knex queries.
- Follow existing UTC helpers in `src/controllers/admin-websites/feature-services/service.gsc-integration.ts` for date math.
- Keep API responses in the existing `{ success, data, error }` envelope.

**Reference file:** `src/controllers/admin-websites/feature-services/service.gsc-integration.ts` — closest existing analog for UTC date enumeration and GSC-specific queueing behavior.

## Constraints

**Must:**
- Apply rolling recent-date refresh through an explicit provider freshness map.
- Keep explicit jobs with `{ integrationId, harvestDate }` as single-date jobs.
- Use named freshness constants: GSC = 4 days, Rybbit = 3 days, Clarity = 3 days.
- Normalize Postgres `date` fields to plain `YYYY-MM-DD` strings at the model/API boundary.
- Keep zero-row GSC API responses as successful harvests; they are not transport/auth failures.
- Avoid schema changes and new dependencies.

**Must not:**
- Use the same window for every provider by accident; the windows must be explicit and reviewed.
- Change historic backfill semantics or manually mutate existing data.
- Hide zero rows in the UI; the system should make them explainable and refreshable.
- Add a parallel dashboard/data path.

**Out of scope:**
- Reworking OAuth account ownership or organization-level GSC binding.
- Backfilling every client again.
- Redesigning the full GSC dashboard.
- Adding quota telemetry or a Google API usage dashboard.

## Risk

**Level:** 2 — scheduling and serialization concern, bounded blast radius.

**Risks identified:**
- Rolling refresh multiplies provider API calls → **Mitigation:** use an explicit provider freshness map, bound GSC to four dates, bound Rybbit/Clarity to three dates, and leave explicit/manual/backfill jobs unchanged.
- Postgres `date` fields can be shifted by JS timezone serialization → **Mitigation:** return date-only fields as SQL/text `YYYY-MM-DD` from the model layer.
- Admins may interpret zero-row success as final data → **Mitigation:** allow manual refresh for GSC successful zero-row logs and keep the row count visible.
- Existing dirty worktree has unrelated integration and ranking changes → **Mitigation:** execution must read current files and touch only this spec's files.

**Blast radius:**
- Daily data harvest worker behavior for active GSC, Rybbit, and Clarity integrations.
- GSC harvest activity table date labels and rerun actions.
- GSC performance dashboard date range and latest report date.
- Existing Rybbit/Clarity daily harvest path, which will move from one date to three recent dates.

**Pushback:**
- Do not make this a vague "last few days" behavior. Future-us will hate that. Use a named provider map: GSC gets four recent UTC dates because Google can lag or revise data for 2-3 days; Rybbit and Clarity get three recent UTC dates because they need late-arrival protection without the same GSC lag profile.

## Tasks

### T1: Date-Only API Normalization
**Do:** Return `harvest_date` and `report_date` as plain `YYYY-MM-DD` strings from the model/API boundary so the frontend cannot display date-only rows one day early.
**Files:** `src/models/website-builder/IntegrationHarvestLogModel.ts`, `src/models/website-builder/GscDataModel.ts`, `src/controllers/admin-websites/feature-services/service.gsc-performance.ts`
**Depends on:** none
**Verify:** Fetch Caswell GSC logs/dashboard and confirm API payload dates match DB dates exactly, e.g. `2026-05-12` stays `2026-05-12`.

### T2: Provider Rolling Recent-Date Daily Harvest
**Do:** Update scheduled daily harvest processing so active integrations refresh provider-specific recent UTC windows: GSC D-1 through D-4, Rybbit D-1 through D-3, and Clarity D-1 through D-3. Preserve explicit manual/historic jobs as one-date jobs.
**Files:** `src/workers/processors/dataHarvest.processor.ts`
**Depends on:** none
**Verify:** Unit or script-level dry check that daily mode generates four dates for GSC, three dates for Rybbit, three dates for Clarity, and exactly one date for explicit `{ integrationId, harvestDate }` jobs.

### T3: Refresh Action For Zero-Row GSC Logs
**Do:** Allow the admin activity table to show a refresh/rerun action for GSC logs where `outcome === "success"` and `rows_fetched === 0`, in addition to existing failed-log retry behavior.
**Files:** `frontend/src/components/Admin/integrations/IntegrationPanel.tsx`, `frontend/src/api/integrations.ts`
**Depends on:** T1
**Verify:** In the GSC activity table, a successful zero-row recent date exposes a manual refresh action and sends the unchanged `YYYY-MM-DD` date to the existing rerun endpoint.

### T4: Verification And Regression Pass
**Do:** Run targeted typecheck/lint/build checks and inspect the affected GSC API payload shape.
**Files:** touched files only
**Depends on:** T1, T2, T3
**Verify:** `npx tsc --noEmit`; `cd frontend && npx tsc -b --pretty false`; `cd frontend && npx eslint src/components/Admin/integrations/IntegrationPanel.tsx`; `cd frontend && npm run build`

## Done
- [x] GSC logs and dashboard API date fields are plain `YYYY-MM-DD` strings.
- [x] Daily scheduled GSC harvest refreshes four recent UTC dates.
- [x] Daily scheduled Rybbit harvest refreshes three recent UTC dates.
- [x] Daily scheduled Clarity harvest refreshes three recent UTC dates.
- [x] Manual and historic GSC harvest jobs still run their explicitly requested dates only.
- [x] Successful zero-row GSC logs can be manually refreshed from the admin UI.
- [x] `npx tsc --noEmit` passes or has only documented pre-existing errors.
- [x] `cd frontend && npx tsc -b --pretty false` passes or has only documented pre-existing errors.
- [x] Targeted frontend ESLint passes for the touched GSC integration component.
