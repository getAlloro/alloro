# Rybbit Integration Cleanup And Dashboard

## Why
Rybbit is currently split between legacy `header_footer_code` snippets and the newer `website_integrations` registry. That lets a site track analytics while still showing "Not connected", and it can also produce the opposite failure: an active integration row with no live tracking script.

## What
Build a proper Rybbit integration surface for each website: detect legacy header/footer tracking scripts, require those scripts to be disabled or removed before reconnecting, store the Rybbit site ID in `website_integrations`, inject tracking from the integration row, and show basic stored analytics plus raw daily rows in the Integrations screen.

## Context

**Observed runtime state:**
- Artful Orthodontics has no `platform='rybbit'` row, no `rybbit_data`, and one enabled legacy snippet named `Alloro Tracking` with `data-site-id="265a78f78f4e"`.
- One Endodontics has an active Rybbit integration row and a disabled legacy snippet, but the live homepage did not include the Rybbit tracking script during investigation.
- Surf City has an active Rybbit integration row and still has an enabled legacy header/footer snippet, so live tracking there does not prove integration-based injection is working.
- Current DB snapshot showed 2 Rybbit integrations and 5 enabled Rybbit-like legacy snippets.

**Relevant files:**
- `frontend/src/components/Admin/integrations/RybbitTab.tsx` — current Rybbit UI placeholder.
- `frontend/src/components/Admin/integrations/IntegrationPanel.tsx` — existing harvest/test/disconnect panel.
- `frontend/src/api/integrations.ts` — admin integration API client and GSC performance analog.
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` — integration controller; currently CRM-shaped plus GSC-specific endpoints.
- `src/routes/admin/websites.ts` — admin website integration routes.
- `src/controllers/admin-websites/feature-services/service.rybbit.ts` — current custom-domain provisioning path; still creates header/footer snippets.
- `src/controllers/admin-websites/feature-services/service.hfcm-manager.ts` — source of truth for header/footer snippet operations.
- `src/models/website-builder/WebsiteIntegrationModel.ts` — integration registry model.
- `src/models/website-builder/RybbitDataModel.ts` — stored daily Rybbit data model.
- `src/services/integrations/rybbitHarvestAdapter.ts` — Rybbit daily harvest adapter.
- `/Users/rustinedave/Desktop/website-builder-rebuild/src/routes/site.ts` — live renderer integration script injection.

**Patterns to follow:**
- GSC-specific integration endpoints in `WebsiteIntegrationsController.ts` for a platform-specific connect/performance flow.
- GSC dashboard UI in `GscTab`/integration components for stored metrics, range controls, chart, table, and harvest activity.
- Existing integration renderer helper in `website-builder-rebuild/src/routes/site.ts` for script injection from active `script_injection` or `hybrid` rows.

**Reference files:**
- `frontend/src/components/Admin/integrations/GscTab.tsx` — closest frontend analog for platform-specific integration state and performance dashboard.
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` — closest backend analog for platform-specific integration endpoints.
- `/Users/rustinedave/Desktop/website-builder-rebuild/src/routes/site.ts` — closest renderer analog for integration-managed scripts.

## Constraints

**Must:**
- Detect Rybbit scripts by content, not by snippet name. Match `analytics.getalloro.com`, `/api/script.js`, `data-site-id`, and Rybbit-specific script URLs.
- Parse and display detected `data-site-id` values from legacy snippets.
- Block Rybbit connect/reconnect while enabled legacy Rybbit snippets exist unless the user explicitly disables/removes them through the flow.
- Store the canonical connected state in `website_builder.website_integrations`.
- Keep `projects.rybbit_site_id` synchronized for existing Proofline/monthly agent utilities until those consumers are migrated.
- Use renderer-managed script injection as the only long-term tracking source.
- Verify integration script injection on a live/rendered page after legacy snippets are disabled.
- Keep backend DB access behind models/services where practical; do not add new inline Knex sprawl to the controller.
- Keep frontend API calls in `frontend/src/api/integrations.ts` or query hooks, not directly in components.

**Must not:**
- Silently mark a legacy header/footer snippet as a healthy integration.
- Keep creating new `header_footer_code` Rybbit snippets from `provisionRybbitSite`.
- Bulk-disable live tracking snippets until renderer-based injection is proven on at least one known project.
- Add a new analytics table unless execution proves `rybbit_data` cannot support the dashboard.
- Mix unrelated cleanup or visual redesign into this work.

**Out of scope:**
- Replacing Rybbit itself or changing analytics vendor.
- Building a full Rybbit clone with every dimension/filter the Rybbit app supports.
- Bulk live-data migration for every client without an explicit dry run and approval.
- Changing GSC or Clarity behavior except where shared IntegrationPanel/API types need compatibility.

## Risk

**Level:** 4 — Major Impact

**Risks identified:**
- Duplicate tracking scripts corrupt analytics silently. → **Mitigation:** detect enabled legacy scripts and block reconnect until disabled/removed.
- Active integration rows may not inject scripts in production renderer. → **Mitigation:** verify renderer env/deploy path and live HTML before migrating existing legacy snippets.
- Disabling legacy snippets before renderer injection works would stop analytics collection. → **Mitigation:** staged rollout: Artful dry run, one controlled migration, live HTML check, then broader migration.
- Rybbit harvest endpoint params may be wrong (`startDate`/`endDate` versus `start_date`/`end_date`). → **Mitigation:** verify against the existing shared Rybbit utility/API response and fix adapter before trusting dashboard data.
- Existing `projects.rybbit_site_id` and `website_integrations.metadata.siteId` can disagree. → **Mitigation:** define `website_integrations.metadata.siteId` as canonical, then sync `projects.rybbit_site_id` for legacy consumers during connect/update.
- Cross-repo deployment can drift between Alloro admin and the renderer. → **Mitigation:** include renderer verification in Done criteria and do not call the migration complete from admin-only tests.

**Blast radius:**
- Admin website integrations screen.
- Header/footer code management.
- Custom domain verification side effect.
- Daily data harvest worker for Rybbit.
- Proofline/monthly agent Rybbit analytics fetches.
- Live website renderer in `/Users/rustinedave/Desktop/website-builder-rebuild`.
- Existing clients with enabled Rybbit-like `header_footer_code` snippets.

**Pushback:**
- This should not be treated as a simple UI status fix. A status badge that says "Connected" while tracking comes from a legacy script is lying to operators.
- The old provisioning function writing header/footer snippets is architectural drift. Future-us will hate having two injection owners. The integration row should own tracking, and the renderer should inject it.
- A bulk cleanup is not safe until renderer injection is proven in production-like output. Do the detection and explicit disable path first.

## Tasks

### T1: Backend Rybbit Status And Legacy Detection
**Do:** Add a Rybbit-specific backend service/model path that returns the current integration, synchronized project site ID, detected legacy snippets, and whether reconnect is blocked. Detection must inspect active project snippets and relevant template snippets by script content, parse `data-site-id`, and return snippet IDs/names/locations/status.
**Files:** `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/routes/admin/websites.ts`, `src/models/website-builder/WebsiteIntegrationModel.ts`, `src/models/website-builder/RybbitDataModel.ts`, `src/controllers/admin-websites/feature-services/service.hfcm-manager.ts`, new focused Rybbit service/model files if needed.
**Depends on:** none
**Verify:** Backend targeted tests or `npx tsc --noEmit`; API smoke for Artful returns legacy snippet `Alloro Tracking` and `siteId=265a78f78f4e`.

### T2: Rybbit Connect, Manage, And Disable Flow
**Do:** Add platform-specific endpoints to connect/update a Rybbit integration by site ID, disable selected legacy snippets, validate the site ID, and synchronize `projects.rybbit_site_id`. Return `409 LEGACY_SCRIPT_PRESENT` when enabled legacy scripts would cause duplicate tracking. Update `provisionRybbitSite` so future domain verification creates/upserts the integration row without injecting header/footer code.
**Files:** `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/routes/admin/websites.ts`, `src/controllers/admin-websites/feature-services/service.rybbit.ts`, `src/models/website-builder/WebsiteIntegrationModel.ts`, HFC model/service files used by T1.
**Depends on:** T1
**Verify:** API smoke can connect Artful only after disabling/removing the detected legacy snippet; no new `header_footer_code` Rybbit snippet is created by provisioning.

### T3: Rybbit Harvest Correctness And Analytics APIs
**Do:** Verify and fix Rybbit overview API params, then add stored analytics endpoints for summary, daily series, and raw daily rows from `rybbit_data`. Include pagination for rows and stable range options for 28D/3M/6M/12M. Keep response shape similar to GSC performance APIs but with Rybbit metrics.
**Files:** `src/services/integrations/rybbitHarvestAdapter.ts`, `src/utils/rybbit/service.rybbit-data.ts`, `src/models/website-builder/RybbitDataModel.ts`, `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/routes/admin/websites.ts`.
**Depends on:** T1
**Verify:** `npx tsc --noEmit`; known projects with `rybbit_data` return non-empty summary/rows; adapter test/manual run stores a valid daily row.

### T4: Admin Rybbit Management And Analytics UI
**Do:** Replace the placeholder Rybbit tab with a real integration screen: legacy-script blocking warning, detected snippet details, disable/remove action, site ID connect/update form, connected-state details, existing IntegrationPanel actions, basic analytics cards/chart, and raw rows view. Keep it visually aligned with existing Integrations/GSC surfaces.
**Files:** `frontend/src/components/Admin/integrations/RybbitTab.tsx`, `frontend/src/api/integrations.ts`, possible small co-located Rybbit subcomponents under `frontend/src/components/Admin/integrations/`.
**Depends on:** T1, T2, T3
**Verify:** Frontend typecheck/build; Artful shows "legacy script detected" instead of plain "Not connected"; connected sites show analytics and rows when data exists.

### T5: Renderer Injection Hardening
**Do:** Verify the renderer reads active `website_integrations` rows in the deployed/live path and injects Rybbit scripts for normal pages, artifact pages, and any other render path that emits a full HTML document. Confirm `INTEGRATIONS_SCRIPT_INJECTION=true` in the relevant environment or remove the hidden failure mode with explicit logging/health visibility.
**Files:** `/Users/rustinedave/Desktop/website-builder-rebuild/src/routes/site.ts`, renderer env/deployment configuration if present.
**Depends on:** T2
**Verify:** With a known active Rybbit integration and disabled legacy snippet, rendered/live HTML contains exactly one Rybbit script with the integration `siteId`.

### T6: Controlled Legacy Migration And Backfill
**Do:** Add a dry-run inventory command or admin-only operation that lists legacy Rybbit snippets, matching projects, parsed site IDs, existing integration rows, and `rybbit_data` coverage. After renderer verification, migrate one project first by disabling the legacy snippet, creating/updating the Rybbit integration, syncing `projects.rybbit_site_id`, and queueing historical harvest as needed.
**Files:** script/admin operation location to be chosen during execution, existing integration/harvest models and services.
**Depends on:** T2, T3, T5
**Verify:** Dry run lists Artful, Caswell, DentalEMR, San Diego Center For Endodontics, and Surf City from the current snapshot; apply mode is idempotent and only runs after explicit approval.

## Done
- [ ] `npx tsc --noEmit` passes or only unrelated pre-existing errors are documented.
- [ ] Frontend build/typecheck for touched admin integration files passes.
- [ ] Renderer typecheck/build passes in `/Users/rustinedave/Desktop/website-builder-rebuild`.
- [ ] Artful shows a legacy Rybbit script warning with detected `siteId=265a78f78f4e`.
- [ ] Artful cannot reconnect Rybbit while the enabled legacy snippet remains active.
- [ ] After disabling/removing legacy script and connecting, Artful has one active `platform='rybbit'` integration row and synchronized `projects.rybbit_site_id`.
- [ ] Live/rendered HTML for a migrated project contains exactly one Rybbit script, injected from the integration row.
- [ ] Rybbit dashboard displays summary metrics, daily trend, and raw daily rows when `rybbit_data` exists.
- [ ] Rybbit harvest uses verified API params and stores non-empty data for a known site/date.
- [ ] Legacy migration/backfill remains dry-run only until explicitly approved for live data mutation.

## Revision Log

### Rev 1 — May 13, 2026
**Change:** Template-level Rybbit snippets are detected and block connect, but the project integration flow only disables project-level snippets.
**Reason:** Disabling a template snippet from one website's integration screen can affect multiple client sites. Template cleanup belongs in Code Manager or an explicitly scoped migration.
**Updated Done criteria:** The legacy warning must distinguish project snippets that can be disabled from template snippets that require manual/template-level cleanup.
