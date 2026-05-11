# GSC Integration — End-to-End Connect Flow

## Why
The GSC (Google Search Console) backend plumbing exists — harvest adapter, daily worker, data storage — but the user-facing flow to actually connect GSC to a project is broken. The scope checker doesn't know about GSC, the reconnect endpoint doesn't carry auth context, and there's no admin UI to create a GSC integration record. Without this, the daily harvest has nothing to process.

Additionally, the admin team uses a single Google account with GSC access to all client sites, so we need to support connecting an admin-level Google account (separate from the client's GBP account).

## What
A working end-to-end flow: admin opens a project's Integrations tab → connects their GSC-capable Google account (or grants GSC scope to an existing one) → picks a site from the connection's Search Console → integration record is created → daily harvest starts pulling data.

## Context

**Relevant files:**
- `src/controllers/settings/feature-utils/util.scope-parser.ts` — scope detection (only has GBP, needs GSC)
- `src/controllers/auth/AuthController.ts` — `getReconnectUrl()` at line 249 (generates OAuth URL without auth context)
- `src/controllers/auth/feature-services/ScopeManagementService.ts` — canonical SCOPE_MAP with both `gbp` and `gsc`
- `src/controllers/auth/feature-services/OAuthFlowService.ts` — `buildAccountData()` at line 143 (persists scopes from token response)
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` — `createIntegration()` at line 143 (CRM-centric, requires credentials string)
- `src/routes/admin/websites.ts` — admin website routes (integrations at lines 420-482)
- `src/models/GoogleConnectionModel.ts` — Google connection CRUD
- `src/models/website-builder/WebsiteIntegrationModel.ts` — integration CRUD with encrypted credentials
- `src/services/integrations/gscHarvestAdapter.ts` — harvest adapter (functional, needs `googleConnectionId` + `siteUrl` in metadata)
- `src/auth/oauth2Helper.ts` — `getValidOAuth2ClientByConnection()` (fetches by connection ID, no org check)
- `frontend/src/components/GoogleConnectButton.tsx` — popup OAuth pattern (reference for admin GSC connect)
- `frontend/src/components/Admin/integrations/GscTab.tsx` — current GSC tab (broken state logic)
- `frontend/src/components/Admin/integrations/GscConnectPanel.tsx` — current connect panel (navigates to JSON endpoint)
- `frontend/src/components/Admin/IntegrationsTab.tsx` — derives `hasGscScope` from phantom metadata field
- `frontend/src/pages/settings/IntegrationsRoute.tsx` — settings page reconnect link (broken)
- `frontend/src/api/integrations.ts` — API client (no GSC-specific functions)

**Patterns to follow:**
- Popup OAuth: `GoogleConnectButton.tsx` — fetch URL → open popup → listen for `GOOGLE_OAUTH_SUCCESS` postMessage
- Harvest integration: `RybbitTab.tsx` / `ClarityTab.tsx` — tab structure for data harvest integrations
- Controller pattern: `WebsiteIntegrationsController.ts` — `ok()`/`fail()` response helpers, `LOG_PREFIX`

**Reference file:** `frontend/src/components/GoogleConnectButton.tsx` — closest analog for the admin GSC OAuth popup flow

## Constraints

**Must:**
- Use the popup OAuth pattern (not page navigation) for Google account connection
- Encode auth context in OAuth state so callbacks link to the correct org
- Support two scenarios: (a) grant GSC scope to existing Google connection, (b) connect a separate Google account with GSC scope
- Validate that the admin's Google connection actually has `webmasters.readonly` scope before listing sites
- Use `connected_by: "admin"` and `type: "data_harvest"` for GSC integration records
- Keep the existing HubSpot/CRM creation flow untouched

**Must not:**
- Modify the harvest adapter or daily worker (already functional)
- Make `google_connections.organization_id` nullable (admin's connection lives under admin's own org)
- Add client self-service GSC connection (admin-only for now)
- Touch Rybbit or Clarity integration flows

**Out of scope:**
- GSC data visualization or dashboards
- Multiple GSC integrations per project
- Cross-org Google connection sharing (admin's connection referenced by ID is sufficient)

## Risk

**Level:** 2

**Risks identified:**
- `createIntegration` is CRM-centric (requires credentials string, validates via CRM adapter) → **Mitigation:** Add a dedicated `createGscIntegration` endpoint that accepts `{ connectionId, siteUrl }` instead of overloading the generic create
- Reconnect state doesn't carry auth context → **Mitigation:** Extract auth context from Authorization header in `getReconnectUrl`, encode in state (same pattern as `getGoogleAuthUrl` at AuthController.ts:50-62)
- Admin connection referenced by any project without access control → **Mitigation:** Verify the requesting admin user belongs to the org that owns the Google connection before allowing site listing or integration creation

**Blast radius:**
- `util.scope-parser.ts` — consumed by `service.scopes.ts` → `SettingsController.getScopes` → settings page scope display
- `AuthController.getReconnectUrl` — consumed by settings page reconnect link and GscConnectPanel
- `WebsiteIntegrationsController` — consumed by admin websites routes → admin integrations UI
- `IntegrationsTab.tsx` — parent of all integration tab components

**Pushback:** None. This is completing existing unfinished work, not adding new architecture.

## Tasks

### T1: Backend — Add GSC to scope parser
**Do:**
- In `util.scope-parser.ts`: add `gsc: "https://www.googleapis.com/auth/webmasters.readonly"` to `SCOPE_MAP`
- Update `buildScopeStatus()` to include a GSC entry with `granted` check, name, and description
- This makes `getMissingScopes()` correctly report GSC as missing when the scope isn't granted
**Files:** `src/controllers/settings/feature-utils/util.scope-parser.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Backend — Fix reconnect endpoint auth context
**Do:**
- In `AuthController.getReconnectUrl()`: extract auth context from Authorization header using the same `tryExtractAuthContext` + org lookup pattern used in `getGoogleAuthUrl` (lines 50-62)
- Encode `userId` and `orgId` into the state parameter via `encodeAuthState()`
- This ensures the callback links the Google connection to the correct org (admin's org for admin callers, client's org for settings page callers)
**Files:** `src/controllers/auth/AuthController.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T3: Backend — Admin GSC endpoints (connections, sites, create integration)
**Do:**
- Add to `WebsiteIntegrationsController.ts`:
  - `listGscConnections(req, res)` — query `google_connections` for the admin user's org, filter to connections whose `scopes` field includes `webmasters.readonly`. Return `[{ id, email, scopes }]` (no tokens).
  - `listGscSites(req, res)` — takes `connectionId` query param, validates the connection belongs to the admin's org and has GSC scope, calls `google.searchconsole({ version: "v1" }).sites.list()` via the connection's OAuth client, returns site entries.
  - `createGscIntegration(req, res)` — takes `{ connectionId, siteUrl }` body, validates connection access, validates site exists in GSC via adapter's `validateConnection`, creates `website_integrations` row with `platform: "gsc"`, `type: "data_harvest"`, `connected_by: "admin"`, `metadata: { googleConnectionId, siteUrl, googleEmail }`. No `credentials` field needed.
- Add to `GoogleConnectionModel.ts`: `findByOrgWithScope(orgId, scopeSubstring)` — returns connections for org where `scopes` ILIKE `%scopeSubstring%`
- Add routes in `src/routes/admin/websites.ts`:
  - `GET /:id/integrations/gsc/connections`
  - `GET /:id/integrations/gsc/sites?connectionId=X`
  - `POST /:id/integrations/gsc`
**Files:** `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/models/GoogleConnectionModel.ts`, `src/routes/admin/websites.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T4: Frontend — Admin GSC connect flow
**Do:**
- Add to `frontend/src/api/integrations.ts`:
  - `fetchGscConnections(projectId)` → `GET /:id/integrations/gsc/connections`
  - `fetchGscSites(projectId, connectionId)` → `GET /:id/integrations/gsc/sites?connectionId=X`
  - `createGscIntegration(projectId, payload)` → `POST /:id/integrations/gsc`
  - `getReconnectUrl(scopes)` → `GET /auth/google/reconnect?scopes=X` (returns `{ authUrl }`)
- Rewrite `GscConnectPanel.tsx` as a multi-step flow:
  1. **No connections**: Show "Connect Google Account for Search Console" button → opens popup OAuth for `gsc` scope (follow `GoogleConnectButton.tsx` popup pattern, using the reconnect endpoint for the authUrl)
  2. **Connections available**: Show connection dropdown (email + id) → on select, fetch sites
  3. **Sites loaded**: Show site picker dropdown → on select, create integration
  4. **Error states**: connection has no GSC scope (prompt reconnect), site not found, network errors
- Update `GscTab.tsx`: replace phantom `hasGscScope`/`hasGoogleConnection` checks with actual data from `fetchGscConnections`. If integration exists → show IntegrationPanel. If no integration → show GscConnectPanel with connection data.
- Update `IntegrationsTab.tsx`: remove the broken `hasGscScope` / `hasGoogleConnection` derivation from integration metadata. Pass `projectId` to `GscTab` and let it manage its own data fetching.
**Files:** `frontend/src/api/integrations.ts`, `frontend/src/components/Admin/integrations/GscConnectPanel.tsx`, `frontend/src/components/Admin/integrations/GscTab.tsx`, `frontend/src/components/Admin/IntegrationsTab.tsx`
**Depends on:** T3

### T5: Frontend — Fix settings page reconnect flow
**Do:**
- In `IntegrationsRoute.tsx`: replace the `<a href="/api/auth/google/reconnect?scopes=gsc">` with a button that uses the popup OAuth pattern:
  1. Fetch `GET /api/auth/google/reconnect?scopes=gsc` (include Authorization header)
  2. Open `authUrl` in popup
  3. Listen for `GOOGLE_OAUTH_SUCCESS` postMessage
  4. On success, call `refetchScopes()`
- Extract the popup logic into a small hook or inline it (matching `GoogleConnectButton.tsx` pattern)
**Files:** `frontend/src/pages/settings/IntegrationsRoute.tsx`
**Depends on:** T1, T2
**Verify:** Manual: settings page shows correct GSC scope status, reconnect button opens popup and grants scope

## Done
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Settings page correctly shows "Connected" when GSC scope is granted, "Action needed" when not
- [ ] Settings page "Grant Access" button opens OAuth popup (not JSON page), scope is persisted after consent
- [ ] Admin integrations tab → GSC tab shows available Google connections with GSC scope
- [ ] Admin can pick a connection, see available sites, and create a GSC integration
- [ ] Integration record created with correct metadata (`googleConnectionId`, `siteUrl`, `googleEmail`)
- [ ] Existing HubSpot/Rybbit/Clarity integration flows are unaffected
- [ ] No regressions in OAuth callback flow (GBP connection still works)
