# GSC Overrideable Integration Accounts

## Why
The current GSC connect flow treats eligible Search Console credentials as project-org-owned only. That blocks the intended workflow: Alloro/admin can temporarily connect an admin Gmail for a client website, and the client can later override the website's GSC integration with their own Google account and selected Search Console property.

## What
Make the `website_integrations.platform='gsc'` row the source of truth for which Google account/property powers GSC harvests. Admin-owned and org-owned GSC connections can both be attached when authorized, and any later save overwrites only the GSC integration pointer, not the org's standard Google/GBP connection.

## Context

**Relevant files:**
- `src/controllers/auth/AuthController.ts` — generates reconnect OAuth URLs and encodes authenticated org context into state.
- `src/controllers/auth/feature-services/OAuthFlowService.ts` — creates/updates `google_connections`; currently looks up existing rows globally by Google user id.
- `src/models/GoogleConnectionModel.ts` — Google credential lookup helpers; live DB has no unique constraint on `google_user_id`, only primary key `id` and org FK.
- `src/controllers/admin-websites/feature-services/service.gsc-integration.ts` — current GSC service; currently requires selected connection to belong to the website project's organization.
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` and `src/routes/admin/websites.ts` — admin GSC list/site/save endpoints.
- `src/routes/user/website.ts` and `src/controllers/user-website/UserWebsiteController.ts` — authenticated client website surface for org-scoped website management.
- `src/services/integrations/gscHarvestAdapter.ts` — already reads `metadata.googleConnectionId` and `metadata.siteUrl` from the GSC integration row during validation/fetch.
- `frontend/src/api/integrations.ts`, `frontend/src/hooks/queries/useWebsiteIntegrations.ts`, and `frontend/src/components/Admin/integrations/GscConnectPanel.tsx` — admin GSC connection picker.
- `frontend/src/pages/settings/IntegrationsRoute.tsx` — client-facing Google/GSC permission surface.

**Patterns to follow:**
- Keep routes thin; put ownership/selection rules in a GSC service.
- Use existing models for DB access; no inline Knex in controllers.
- Frontend network calls go through typed API helpers/hooks.
- Preserve exact Search Console `siteUrl` values.

**Reference file:** `src/controllers/admin-websites/feature-services/service.gsc-integration.ts` — extend this service rather than adding more controller branches.

**Reference file:** `src/routes/user/website.ts` — use the authenticated client website route pattern for client-side override endpoints.

## Constraints

**Must:**
- Keep standard Google/GBP org connections separate from the selected GSC integration account.
- Preserve `website_integrations.metadata.googleConnectionId` and `metadata.siteUrl` as the active fetch pointer.
- Allow authorized admin UI to attach an admin-owned GSC connection to any website.
- Allow client/org UI to override that website's GSC integration with an org-owned GSC connection and property.
- Ensure later saves overwrite only the `gsc` integration row metadata, not unrelated Google/GBP rows.
- Prevent OAuth reconnect from moving an existing Google connection row across organizations.
- Keep GSC harvest behavior unchanged: the worker fetches with the saved integration metadata.

**Must not:**
- Introduce a parallel Search Console credential table unless the existing model proves insufficient during execution.
- Reassign a `google_connections.organization_id` just because the same Gmail reconnects under another org.
- Expose every Google connection globally to client users.
- Change GBP location/property selection semantics.
- Add new dependencies.

**Out of scope:**
- GSC analytics dashboard/reporting.
- Historical backfill UI.
- Migrating or deduplicating old `google_connections` data beyond any minimal safety fix required for this flow.
- Full admin website route auth hardening outside the GSC endpoints touched here.

## Risk

**Level:** 4

**Risks identified:**
- Cross-org credential exposure: admin-owned GSC credentials can become available to the wrong website/user if ownership rules are too loose. → **Mitigation:** service-level actor context with explicit allowed owner modes: admin-owned for authenticated super/admin admin surface, org-owned for client/org surface.
- OAuth row reassignment: current reconnect can update an existing `google_connections` row found by global `google_user_id`, changing its `organization_id`. → **Mitigation:** when authenticated context exists, lookup by `(google_user_id, orgId)` and create a separate row when the Gmail exists under another org.
- Existing admin website routes are not obviously route-middleware protected. This is already structural debt; relying on those routes for cross-org credential decisions would be bad. → **Mitigation:** add authentication/actor extraction to the GSC-specific admin endpoints and use authenticated API helpers for those GSC calls.
- Settings scope state can become misleading if admin-owned GSC credentials are attached to a client website but not present under the client org. → **Mitigation:** distinguish "org has GSC scope" from "website has active GSC integration" in UI copy; do not infer one from the other.
- Duplicate Google rows for the same Gmail across org contexts are possible and intentional for this fix. → **Mitigation:** metadata stores the exact `googleConnectionId`; labels must show email and owner/source so users know which credential is active.
- Client override could silently replace an admin-managed fallback. → **Mitigation:** connected-state copy should show current Google email/source and save action should clearly mean "Use this account for future Search Console fetches."

**Blast radius:**
- Google OAuth reconnect/callback persistence.
- `google_connections` ownership and lookup semantics.
- Admin website GSC connection/site/save endpoints.
- Client settings or user-website GSC override flow.
- Settings scope reporting and missing-scope banners.
- GSC harvest validation/fetch through `metadata.googleConnectionId` and `metadata.siteUrl`.
- HubSpot/Rybbit/Clarity panels through shared integrations UI and query keys.

**Pushback:**
- This should not be solved by making `listGscConnections` global again. That was the original tenant leak. The safe version is actor-aware: admin can select admin-owned credentials for a website; client users can only select their org-owned credentials.
- Do not move a Google connection row between orgs as a side effect of OAuth. Future-us will hate debugging why a client's GBP account disappeared from their org context.

## Tasks

### T1: Context-safe Google OAuth persistence
**Do:** Update OAuth completion/fallback so authenticated reconnects resolve existing Google rows by `(google_user_id, authenticated orgId)` instead of global Gmail identity. If the same Gmail exists under another org, create/update the row for the authenticated org without changing the other row. Preserve the existing refresh-token guard.

**Files:** `src/controllers/auth/feature-services/OAuthFlowService.ts`, `src/models/GoogleConnectionModel.ts`

**Depends on:** none

**Verify:** `npx tsc --noEmit`; read-only DB constraint check confirms no `google_user_id` unique index blocks per-org rows.

### T2: Actor-aware GSC integration service
**Do:** Replace the current single org-only GSC connection check with an explicit actor context. The service should support:
- org-owned mode: connection must belong to the website project's organization.
- admin-owned mode: authenticated admin/super-admin can use their own org's GSC connection for the website.
- save/upsert: write `metadata.googleConnectionId`, `googleEmail`, `siteUrl`, `permissionLevel`, and an owner/source marker such as `connectionOwner: "admin" | "organization"`.
- overwrite: later saves replace only the GSC integration metadata/status and queue initial harvest.

**Files:** `src/controllers/admin-websites/feature-services/service.gsc-integration.ts`, `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/models/website-builder/WebsiteIntegrationModel.ts`

**Depends on:** T1

**Verify:** `npx tsc --noEmit`; service rejects unauthorized cross-org connection ids and accepts authorized admin-owned connection ids.

### T3: Authenticated admin GSC endpoint path
**Do:** Add authentication/actor extraction to the GSC-specific admin endpoints without refactoring the full admin websites router. Ensure the frontend GSC API calls send auth headers through the shared API helper. Admin list should include labeled eligible connections from allowed sources, not global arbitrary Google rows.

**Files:** `src/routes/admin/websites.ts`, `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `frontend/src/api/integrations.ts`, `frontend/src/hooks/queries/useWebsiteIntegrations.ts`

**Depends on:** T2

**Verify:** `npx tsc --noEmit`; `cd frontend && npm run build`; unauthenticated GSC admin calls fail; authenticated admin can list/select admin-owned or org-owned GSC connections.

### T4: Client/user override endpoints
**Do:** Add authenticated client website GSC endpoints that resolve the current user's organization website, list org-owned GSC connections, list sites for a selected org-owned connection, and save/overwrite the same website `gsc` integration. Client route must not accept arbitrary project ids.

**Files:** `src/routes/user/website.ts`, `src/controllers/user-website/UserWebsiteController.ts`, `src/controllers/user-website/user-website-services/userWebsite.service.ts`, `src/controllers/admin-websites/feature-services/service.gsc-integration.ts`

**Depends on:** T2

**Verify:** `npx tsc --noEmit`; authenticated org admin/manager can override only their own website GSC integration.

### T5: Admin and client UI clarity
**Do:** Update admin GSC connect UI to show connection source/owner and current connected account/source. Extend the client settings or website UI enough for a user to grant GSC scope, choose a Search Console property, and overwrite the website's active GSC integration. The copy must make it clear that future Search Console fetches use the selected account/property.

**Files:** `frontend/src/components/Admin/integrations/GscConnectPanel.tsx`, `frontend/src/components/Admin/integrations/GscTab.tsx`, `frontend/src/pages/settings/IntegrationsRoute.tsx`, `frontend/src/api/integrations.ts`, `frontend/src/hooks/queries/useWebsiteIntegrations.ts`, `frontend/src/lib/queryClient.ts`

**Depends on:** T3, T4

**Verify:** `cd frontend && npm run build`; scoped ESLint on touched frontend files; manual UI smoke for admin fallback connect and client override.

### T6: Runtime proof and regression check
**Do:** With an approved test project, connect admin Gmail as the GSC integration, run/observe initial harvest, then override from client/org UI and confirm the next harvest uses the new `googleConnectionId` and `siteUrl`. Confirm standard GBP connection rows/properties were not moved or changed.

**Files:** no code files expected

**Depends on:** T1, T2, T3, T4, T5

**Verify:** Manual DB/API checks: GSC integration metadata changes only on `platform='gsc'`; `google_connections.organization_id` for standard GBP rows remains unchanged; `integration_harvest_logs` and `gsc_data` receive rows after worker processing.

## Done
- [x] `npx tsc --noEmit` passes.
- [x] `cd frontend && npm run build` passes.
- [x] Scoped ESLint on touched frontend files passes or only pre-existing unrelated warnings are documented.
- [x] OAuth reconnect no longer moves an existing Google connection row across organizations.
- [ ] Admin can attach an admin-owned Gmail Search Console property to a client website.
- [ ] Client/org user can override the same website's GSC integration with their own Google account/property.
- [x] Future GSC harvests use the `googleConnectionId` and `siteUrl` currently saved on the GSC integration row.
- [x] Standard GBP/org Google connection rows and property selections are not overwritten by GSC connect or override.
- [ ] HubSpot, Rybbit, and Clarity integration panels still load.

## Execution Notes

- 2026-05-13: Implemented T1-T5. Manual OAuth/UI/worker smoke in T6 remains intentionally unverified in this execution; code verification passed via backend TypeScript, frontend build, and scoped frontend ESLint.
- 2026-05-13: Rev 1 verified with `npx tsc --noEmit` and a read-only service call for One Endodontics using an admin actor with no organization id; the connection list now returns successfully instead of throwing `AUTH_REQUIRED`.
- 2026-05-13: Rev 2 verified with `npx tsc --noEmit`, signed-state encode/decode for an authenticated no-org admin, and a read-only One Endodontics service call returning the newly connected Alloro/admin GSC connection.
- 2026-05-13: Rev 3 verified with `npx tsc --noEmit` and a live Search Console sites call for the One Endodontics selected Alloro/admin connection; Google returned 10 accessible properties.
- 2026-05-13: Rev 4 added a connected integration panel action to enqueue a manual harvest for the browser-local current date using the existing rerun queue path.
- 2026-05-13: Rev 5 added a confirmed GSC historic refresh action. Verification passed via backend TypeScript, frontend build, and scoped frontend ESLint; the destructive endpoint was not executed in-session.
- 2026-05-13: Rev 6 moved the GSC historic refresh action into the visible Search Console property card after the shared panel action slot did not appear in the current admin layout.
- 2026-05-13: Rev 7 clarifies harvest activity as report-date logs and adds a GSC performance dashboard aggregated from stored daily `gsc_data`.
- 2026-05-13: Rev 8 changes GSC harvest storage from a single query/page payload to separate date, query, and page payloads so dashboard totals match Search Console aggregation semantics.
- 2026-05-13: Rev 9 adds country and device GSC dimension harvests/tables and plans the bulk admin-token project matching/backfill as a separate guarded operation.
- 2026-05-13: Bulk GSC wiring executed for 7 approved projects using admin Google connection `61`; Caswell org `25` was skipped per user direction. Backfills were queued for each approved integration, and One Endodontics existing GSC data/logs were cleared before queueing the v3 refresh.

## Revision Log

### Rev 1 — 2026-05-13
**Change:** Allow the admin GSC panel to load for super-admin users who do not have an `organization_users` membership yet.
**Reason:** Opening One Endodontics showed "Authentication is required to manage Search Console integrations" because the admin-only website surface authenticates by super-admin email, while the new GSC actor check also required an RBAC organization id.
**Updated Done criteria:** Admin GSC connection list can render for super-admin users with or without an attached org; admin-owned connection selection is still only allowed when the authenticated admin has an org-owned Google connection row.

### Rev 2 — 2026-05-13
**Change:** Include GSC-capable Google connections whose email is listed in `SUPER_ADMIN_EMAILS` in the admin GSC picker, and preserve authenticated OAuth state even when the logged-in admin has no org yet.
**Reason:** After OAuth succeeded for One Endodontics, the new Google connection row existed as an Alloro/admin-owned row but was not rediscovered by the picker because the current admin actor had no stable org context.
**Updated Done criteria:** One Endodontics admin GSC connection listing returns the newly connected Alloro/admin Search Console account; future no-org super-admin OAuth reconnects bind to the authenticated admin user instead of falling back to an unauthenticated Google-profile-owned org.

### Rev 3 — 2026-05-13
**Change:** Apply the same super-admin Google connection rule to Search Console site/property loading that the admin GSC account picker uses.
**Reason:** The picker showed the Alloro/admin Google account, but selecting it failed because `listSites` still rejected super-admin-email-owned connections unless the current admin actor also had a matching `organizationId`.
**Updated Done criteria:** Selecting the Alloro/admin GSC account on One Endodontics loads Search Console properties from Google.

### Rev 4 — 2026-05-13
**Change:** Add a `Run Today` action to connected harvest integration panels.
**Reason:** After connecting GSC, admins need a direct way to enqueue a same-day manual harvest without waiting for scheduled daily processing or requiring an existing failed log row.
**Updated Done criteria:** Connected GSC/Rybbit/Clarity panels can enqueue a manual harvest for today through the existing queue endpoint.

### Rev 5 — 2026-05-13
**Change:** Add a GSC-only historic refresh action that clears existing GSC daily data and harvest logs for the selected integration, then queues daily harvest jobs from the first available Search Console date through Google's latest available date.
**Reason:** GSC is delayed and range-based; admins need one destructive refresh button to rebuild the complete stored GSC history after selecting a property.
**Updated Done criteria:** Connected GSC panel exposes a confirmed historic refresh action; the backend restricts it to GSC integrations and returns the queued date range/count without running it for unrelated providers.

### Rev 6 — 2026-05-13
**Change:** Move the `Fetch History` button directly into the GSC property detail card and remove the unused shared-panel action slot.
**Reason:** The top integration panel rendered for the connected state, but the injected action was not visible in the current admin layout.
**Updated Done criteria:** Connected GSC panel visibly exposes `Fetch History` beside the selected Search Console property metadata.

### Rev 7 — 2026-05-13
**Change:** Add a GSC performance aggregation endpoint and dashboard, show harvest report dates separately from attempt timestamps, and queue historic refresh jobs newest-first.
**Reason:** The harvest table currently looks like five same-day attempts even though each row represents a separate GSC report date. The page also needs a Search Console-style summary view from stored daily data, not just raw harvest logs.
**Updated Done criteria:** Connected GSC panel shows clicks, impressions, CTR, position, a daily trend, and top query/page aggregates from `gsc_data`; harvest logs expose the report date used for each daily fetch.

### Rev 8 — 2026-05-13
**Change:** Fetch and store separate daily GSC payloads for `date`, `query`, and `page` dimensions, then aggregate dashboard totals from the date payload instead of summing query/page rows.
**Reason:** Search Console metrics are not safely interchangeable across dimension sets. Summing `query + page` rows can double-count impressions and truncate lower-ranked click rows, which made the Alloro dashboard diverge from Google's Performance UI.
**Updated Done criteria:** Newly refreshed GSC history stores dashboard-safe payloads; totals/trend use date-level rows, top queries use query-level rows, and top pages use page-level rows.

### Rev 9 — 2026-05-13
**Change:** Include `country` and `device` GSC dimensions in the daily harvest payload and dashboard tabs. Plan the cross-client admin-token backfill as a guarded bulk operation.
**Reason:** The dashboard should support countries/devices now, while bulk wiring many client projects to one admin token is a live-data mutation with broad blast radius and needs a match/audit step before writes.
**Updated Done criteria:** Newly refreshed GSC history stores `summary`, `queries`, `pages`, `countries`, and `devices`; the dashboard exposes country/device tables. Bulk backfill requires an explicit matched-project review before DB writes.

#### Bulk Admin GSC Backfill Task List

### T7: List admin GSC domain properties
**Do:** Read Search Console properties from the One Endodontics admin connection and keep only `sc-domain:*` properties with owner/full access.
**Files:** no code expected unless promoted to a repeatable script.
**Depends on:** Rev 9 dimension code.
**Verify:** Output property list with `siteUrl`, normalized host, and permission.

### T8: Map GSC properties to website projects
**Do:** Match normalized GSC hosts against `website_builder.projects.custom_domain`, `custom_domain_alt`, and `selected_website_url`; flag duplicates and unmatched properties.
**Files:** no code expected unless promoted to a repeatable script.
**Depends on:** T7.
**Verify:** Review matched project list before any writes.

### T9: Upsert GSC integrations for approved matches
**Do:** For reviewed matches only, upsert `website_integrations.platform='gsc'` using the One Endodontics admin Google connection id, matched `siteUrl`, permission level, and `connectionOwner='admin'`. Do not update `google_connections.organization_id`.
**Files:** DB write script or service action if promoted.
**Depends on:** T8 approval.
**Verify:** Read back integration rows; standard Google/GBP org rows unchanged.

### T10: Queue historic backfills for approved matches
**Do:** Run the GSC historic refresh per approved integration, clearing only each project's GSC daily data/logs and queueing daily harvest jobs with the new summary/query/page/country/device payload shape.
**Files:** no schema change.
**Depends on:** T9.
**Verify:** Harvest logs/data populate; dashboard totals align with Search Console on spot checks.
