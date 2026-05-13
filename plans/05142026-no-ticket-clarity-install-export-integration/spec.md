# Clarity Install + Export Integration

## Why
The Clarity integration currently asks for Project ID and API token as if Clarity is only a data source. That is wrong: Clarity tracking installation only needs the Project ID, while the API token is only for recent Data Export pulls.

## What
Make Clarity work like an integration-owned install path first, with optional server-side Data Export credentials. The admin screen should manage tracking install, detect legacy header/footer scripts, and only enable harvest actions when an API token exists.

## Context

**Relevant files:**
- `frontend/src/components/Admin/integrations/ClarityTab.tsx` - current Clarity admin surface; only shows Project ID and harvest panel.
- `frontend/src/components/Admin/integrations/ClarityConnectModal.tsx` - currently posts Clarity through generic CRM endpoints, which is the wrong backend path.
- `frontend/src/api/integrations.ts` - existing Rybbit/GSC specific API helpers to mirror for Clarity.
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` - generic CRM integration controller plus Rybbit/GSC specific routes.
- `src/controllers/admin-websites/feature-services/service.rybbit-integration.ts` - closest backend service pattern for status, legacy snippet detection, and save.
- `src/controllers/admin-websites/feature-utils/util.rybbit-snippet.ts` - closest utility pattern for legacy script detection.
- `src/services/integrations/clarityHarvestAdapter.ts` - current Clarity Data Export adapter; ignores the harvest date and always pulls `numOfDays=1`.
- `/Users/rustinedave/Desktop/website-builder-rebuild/src/routes/site.ts` - renderer already injects Clarity scripts from active `website_integrations` rows.

**Patterns to follow:**
- Use Rybbit-specific status/save routes instead of the generic CRM create/update endpoint.
- Keep routes thin, put business rules in `feature-services`, and keep snippet parsing in `feature-utils`.
- Frontend should use typed API helpers and component-local state; no direct fetch calls inside components.

**Reference file:** `src/controllers/admin-websites/feature-services/service.rybbit-integration.ts` - closest backend analog for integration-owned script installation.

**External docs:**
- Microsoft Clarity setup: tracking starts after installing the unique project tracking code.
- Microsoft Clarity Data Export API: token is generated under Settings -> Data Export, `numOfDays` is limited to 1-3, max 10 calls/project/day, max 1,000 rows, no pagination.

## Constraints

**Must:**
- Treat Clarity Project ID as the public tracking/script identifier.
- Treat the Clarity API token as a server-only Data Export credential; never expose it to the browser.
- Allow Project ID only installs using `type='script_injection'`.
- Use `type='hybrid'` only when an API token is present and Data Export is enabled.
- Detect enabled legacy Clarity snippets in project and template header/footer code before connecting.
- Allow disabling project-level legacy Clarity snippets from the integration flow.
- Preserve template-level snippets but mark them as blockers that must be removed from the template/code manager path.
- Ensure live renderer output contains one Clarity script, not duplicates.
- Keep Clarity harvest within Microsoft API limits.

**Must not:**
- Do not route Clarity create/update through the HubSpot/CRM adapter registry.
- Do not promise or implement historic Clarity backfill from the Data Export API.
- Do not store fake per-day Clarity data by writing the same recent export payload under multiple report dates.
- Do not remove existing `/clarity/*` legacy routes in this pass.
- Do not change GSC or Rybbit behavior except shared UI helpers if needed.

**Out of scope:**
- A full Clarity analytics dashboard redesign.
- Manual CSV imports from Clarity.
- Creating Clarity projects through Microsoft APIs.
- Template snippet removal automation.

## Risk

**Level:** 3 - Structural Risk

**Risks identified:**
- Current modal uses the generic CRM endpoint, which only registers HubSpot -> **Mitigation:** add Clarity-specific endpoints mirroring Rybbit and stop using `createIntegration()` for Clarity.
- Clarity Data Export is not historical and has a 10-call/day quota -> **Mitigation:** script install works without API token; harvest uses one recent call and no fake date loop.
- Existing renderer injects Clarity globally for live sites -> **Mitigation:** keep renderer behavior backward-compatible and only harden duplicate detection if necessary.
- Legacy snippets can create duplicate tracking -> **Mitigation:** block connection while enabled legacy Clarity snippets exist, with project-level disable controls.
- Connected rows may already exist from system migration -> **Mitigation:** service save must upsert by `project_id + platform` and preserve existing metadata where valid.

**Blast radius:**
- `website_builder.website_integrations` rows for Clarity.
- Admin Integrations tab for Clarity only.
- Generic integration controller if shared helper types are touched.
- Harvest worker behavior for Clarity.
- Renderer script injection for all live websites if touched.

**Pushback:**
- Do not model Clarity like GSC. Future-us will hate that because Microsoft’s API cannot backfill arbitrary history. The integration should clearly say “tracking installed” and “recent export enabled” as separate states.

## Tasks

### T1: Clarity backend status and save service
**Do:** Create `service.clarity-integration.ts` and `util.clarity-snippet.ts`. Implement status, legacy snippet detection, project-level snippet disable, Project ID sanitization, and upsert save for `script_injection` or `hybrid` rows.
**Files:** `src/controllers/admin-websites/feature-services/service.clarity-integration.ts`, `src/controllers/admin-websites/feature-utils/util.clarity-snippet.ts`, `src/models/website-builder/WebsiteIntegrationModel.ts`
**Depends on:** none
**Verify:** Unit-level smoke through service methods or targeted API calls.

### T2: Clarity-specific admin routes and API helpers
**Do:** Add controller methods and routes for `GET /clarity/status`, `POST /clarity`, and `POST /clarity/legacy-snippets/disable`. Add typed frontend API helpers and stop Clarity from using the generic CRM create/update helpers.
**Files:** `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/routes/admin/websites.ts`, `frontend/src/api/integrations.ts`
**Depends on:** T1
**Verify:** API returns status for existing Artful Clarity row and rejects invalid Project IDs/tokens cleanly.

### T3: Clarity admin UI rewrite
**Do:** Replace the current credential-only modal with a status-driven screen: Project ID install, optional API token section, legacy script blockers, connected state, token/export state, and clear copy for tracking vs Data Export.
**Files:** `frontend/src/components/Admin/integrations/ClarityTab.tsx`, `frontend/src/components/Admin/integrations/ClarityConnectModal.tsx` or replacement subcomponents, `frontend/src/components/Admin/integrations/IntegrationPanel.tsx`
**Depends on:** T2
**Verify:** Admin can connect Project ID only; admin can add/update API token; UI shows legacy blockers before connect.

### T4: Clarity harvest semantics fix
**Do:** Stop treating Clarity like exact per-day historical data. Set Clarity freshness to one recent export or otherwise store only the actual API window represented. Validate the adapter behavior against `numOfDays=1` and do not loop 3 dates with the same response.
**Files:** `src/services/integrations/clarityHarvestAdapter.ts`, `src/workers/processors/dataHarvest.processor.ts`
**Depends on:** T1
**Verify:** Daily harvest writes one accurate Clarity report date/window and does not duplicate the same API response across multiple dates.

### T5: Renderer verification and duplicate hardening
**Do:** Verify existing renderer injection works for Clarity rows. If needed, harden duplicate detection to catch both `clarity.ms/tag/{projectId}` and standard IIFE snippets without suppressing unrelated scripts.
**Files:** `/Users/rustinedave/Desktop/website-builder-rebuild/src/routes/site.ts`
**Depends on:** T1
**Verify:** Published Artful HTML contains exactly one Clarity script after connection and no legacy header/footer duplicate.

### T6: End-to-end verification
**Do:** Run targeted backend/frontend checks, validate an existing row such as `artfulorthodontics.com`, and smoke live HTML output. Confirm Clarity still appears connected when a valid row already exists.
**Files:** no new source files expected
**Depends on:** T2, T3, T4, T5
**Verify:** Backend typecheck, frontend build/typecheck, renderer check if touched, and live/script smoke.

## Done
- [ ] Clarity can be installed with Project ID only.
- [ ] Clarity API token is optional and only enables Data Export/harvest actions.
- [ ] Clarity rows are saved as `script_injection` without token and `hybrid` with token.
- [ ] Legacy Clarity snippets are detected and project-level snippets can be disabled.
- [ ] Current generic CRM endpoint is no longer used by Clarity UI.
- [ ] Clarity harvest no longer stores the same latest API response under multiple dates.
- [ ] Existing Artful Clarity integration still renders the tracking script.
- [ ] Live rendered HTML has no duplicate Clarity script.
- [ ] `npx tsc --noEmit` has no new errors from this work.
- [ ] Frontend build/typecheck has no new errors from this work.
