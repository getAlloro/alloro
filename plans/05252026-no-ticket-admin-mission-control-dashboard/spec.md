# Admin Mission Control Dashboard

## Why
Admins need a single operational view of revenue, payment risk, and organization health. The current Organizations page is a thin list and already tries to show billing state without loading the billing columns it checks, so extending it further would bake in drift.

## What
Create an admin dashboard called `Mission Control` that becomes the primary organization overview: top-level MRR/payment metrics, organization grid tiles with movement sparklines, payment status flags, lifetime revenue received, and an on-demand AI insight based only on the displayed aggregate data. Clicking an organization tile opens the existing single-organization view at `/admin/organizations/:id`.

## Context

**Relevant files:**
- `frontend/src/pages/Admin.tsx` - admin route registration.
- `frontend/src/components/Admin/AdminSidebar.tsx` - admin navigation and active state.
- `frontend/src/pages/admin/OrganizationManagement.tsx` - current org list, create-org modal, and billing badge attempt.
- `frontend/src/pages/admin/OrganizationDetail.tsx` - existing single-organization destination that must remain intact.
- `frontend/src/api/admin-organizations.ts` - current typed admin org API client.
- `frontend/src/hooks/queries/useAdminQueries.ts` - current React Query hooks for org list/detail.
- `frontend/src/lib/queryClient.ts` - query key factory.
- `frontend/src/components/dashboard/focus/Sparkline.tsx` - closest existing sparkline rendering pattern.
- `src/routes/admin/organizations.ts` - current admin org route shape and auth pattern.
- `src/controllers/admin-organizations/AdminOrganizationsController.ts` - closest controller analog.
- `src/controllers/admin-organizations/feature-services/OrganizationEnrichmentService.ts` - current enrichment pattern, but it performs per-org metadata calls.
- `src/models/OrganizationModel.ts` - org billing columns and current `listAll` selection.
- `src/controllers/billing/BillingService.ts` - Stripe invoice/subscription detail logic.
- `src/controllers/billing/BillingController.ts` - admin billing detail endpoint pattern.
- `src/config/stripe.ts` - Stripe client access and configured-state helper.
- `src/services/businessMetrics.ts` - existing hardcoded MRR map; not acceptable as the canonical source for this dashboard.
- `/Users/rustinedave/Desktop/alloro-docs` - dashboard/admin UI docs parity target.

**Patterns to follow:**
- Backend flow must stay `Routes -> Controllers -> Services -> Models`.
- Database reads must live in models, not controllers or frontend-facing services.
- Frontend server state must use an API module plus a React Query hook and `QUERY_KEYS`.
- Admin route protection must match existing `authenticateToken` plus `superAdminMiddleware`.
- New UI should use Alloro admin conventions, lucide icons, Framer Motion entrance states, skeleton loading, and no direct API calls in components.

**Reference files:**
- `src/controllers/admin-organizations/AdminOrganizationsController.ts` - controller export style and response handling.
- `src/routes/admin/organizations.ts` - route auth/mounting pattern.
- `frontend/src/pages/admin/OrganizationManagement.tsx` - existing org entry surface and create-org behavior.
- `frontend/src/pages/admin/ProjectsDashboard.tsx` - existing admin dashboard layout with compact charts.
- `frontend/src/components/dashboard/focus/Sparkline.tsx` - SVG sparkline math and edge handling.

## Constraints

**Must:**
- Use Stripe as the financial source of truth for expected MRR and received payments.
- Calculate expected MRR from active Stripe subscription items, quantities, and active recurring pricing.
- Calculate received payments from paid Stripe invoices, with month-to-date and 12-month buckets.
- Show no-payment-method and no-Stripe-client states clearly.
- Keep `/admin/organizations/:id` as the single organization detail destination.
- Keep the legacy organization management route available until Mission Control has create/edit parity.
- Use one aggregate backend endpoint for the dashboard data; no per-card frontend calls.
- Gracefully degrade when Stripe is unavailable and make freshness/degraded state visible.
- Send only sanitized aggregate data to any LLM insight endpoint.
- Check `/Users/rustinedave/Desktop/alloro-docs` during execution and update docs parity if an admin docs page exists or is added.

**Must not:**
- Do not use `ORG_MONTHLY_RATE` as the canonical Mission Control MRR source.
- Do not add a billing ledger, snapshot table, or other schema migration in this first pass.
- Do not run an AI call on every dashboard page load.
- Do not expose raw Stripe customer IDs, payment method details beyond brand/last4, invoice URLs, or secrets to the LLM.
- Do not remove or rewrite the current organization detail tabs.
- Do not introduce new frontend or backend dependencies.
- Do not touch unrelated dirty GBP/ranking work currently present in the working tree.

**Out of scope:**
- Billing checkout, portal, webhook behavior changes.
- A full accounting ledger or reconciliation system.
- Client-facing billing UI changes.
- Production deployment or data backfill.
- Replacing all admin navigation IA beyond adding Mission Control and keeping the old org route reachable.

## Risk

**Level:** 3 - Structural Risk

**Risks identified:**
- Financial data can be misleading if mixed with the hardcoded MRR map. -> **Mitigation:** Stripe subscription/invoice data is canonical; hardcoded MRR is not used for Mission Control calculations.
- Stripe aggregation can become slow or rate-limited. -> **Mitigation:** aggregate server-side with bounded concurrency, no interval polling, fresh reads on page load, refresh control, and degraded response metadata.
- Lifetime revenue can be expensive to fetch for customers with deep invoice history. -> **Mitigation:** paginate Stripe invoices with a sane ceiling and return `historyComplete: false` if capped.
- AI insight can leak sensitive data or create noisy guesses. -> **Mitigation:** on-demand endpoint, sanitized numeric payload only, deterministic fallback signals, and no raw customer/payment identifiers.
- Replacing the Organizations tab too soon could drop create/edit flows. -> **Mitigation:** extract/reuse create organization behavior and keep `/admin/organization-management` available as the legacy list during first pass.
- Existing org enrichment is N+1. -> **Mitigation:** new `MissionControlModel` uses grouped aggregate queries for counts and latest status summaries.
- Dashboard docs parity can be missed because docs live in a separate repo. -> **Mitigation:** make docs parity an explicit task and verify both working trees separately at finalization.

**Blast radius:**
- Admin navigation and route tree.
- Admin organization list/creation flow.
- Admin organization detail routing only as destination, not internals.
- Stripe read operations from the backend.
- Organization, locations, users, Google connections, website projects, tasks, notifications, PMS jobs, and practice rankings read paths.
- React Query cache keys for admin pages.
- Alloro Docs parity workflow.

**Production migration safety:**
- No database schema migration is planned.
- If execution discovers that reliable MRR movement requires persisted billing snapshots, halt and revise this spec with a `migrations/` folder before writing schema code.

**Pushback:**
- This should not be a visual-only dashboard stitched from existing frontend calls. Future-us will hate the latency and the inconsistent numbers.
- This also should not silently redefine billing truth. Stripe owns received/expected payments here; the old hardcoded MRR helper can stay for legacy call sites but not this dashboard.
- The AI insight should not pretend to be the source of truth. It is commentary over displayed metrics, not a hidden decision engine.

## Data Contract

`GET /api/admin/mission-control`

Returns:
- `generatedAt`
- `stripeFreshness`: `fresh | unavailable`
- `summary`: expected MRR, month-to-date paid, previous-month paid, lifetime paid, active Stripe client count, admin-granted active count, no-payment-method count, failed/past-due count, cancellation count.
- `revenueTrend[]`: 12 monthly aggregate paid-recurring revenue buckets for the Mission Control revenue graph.
- `organizations[]`: id, name, domain, created date, user/location counts, admin user options for pilot sessions, website status, GBP connected, subscription status, Stripe status, payment method summary, expected monthly amount, month-to-date paid, lifetime paid, last payment date/status, 12-month payment sparkline, latest PMS/ranking/task/notification summaries, and risk flags.
- `movementSignals[]`: deterministic short signals derived from the same data.

`POST /api/admin/mission-control/insight`

Returns:
- sanitized AI insight text plus the deterministic fallback signals.
- This endpoint must accept/derive only the aggregate Mission Control payload, never raw invoices, email addresses, card data, or Stripe identifiers.

## Tasks

### T1: Backend aggregate model
**Do:** Create a read-only model that gathers organization overview data in grouped queries: org billing columns, user counts, location counts, GBP connection presence, website status, pending task counts, unread notification counts, latest approved PMS job, latest ranking row, and active admin-granted org states. Avoid per-org DB loops.
**Files:** `src/models/MissionControlModel.ts`, `src/models/index.ts`
**Depends on:** none
**Verify:** `npm run build`

### T2: Stripe revenue aggregation service
**Do:** Create a Mission Control service that merges model data with Stripe subscriptions, payment methods, and paid invoice history. Compute expected MRR, month-to-date received, prior-month comparison, lifetime received, 12-month paid-invoice buckets, payment-risk flags, and degraded freshness metadata. Use bounded concurrency and no raw Stripe identifiers in the frontend payload.
**Files:** `src/controllers/admin-mission-control/feature-services/MissionControlService.ts`, `src/controllers/admin-mission-control/feature-utils/missionControlFormatters.ts`
**Depends on:** T1
**Verify:** `npm run build`

### T3: Admin Mission Control API
**Do:** Add controller and route for `GET /api/admin/mission-control` and `POST /api/admin/mission-control/insight`. Mount the route in `src/index.ts` with super-admin auth. Keep responses in the existing `{ success, data, error }` style for new endpoints, even where older admin org endpoints are inconsistent.
**Files:** `src/controllers/admin-mission-control/AdminMissionControlController.ts`, `src/routes/admin/missionControl.ts`, `src/index.ts`
**Depends on:** T1, T2
**Verify:** `npm run build`

### T4: Frontend API and query hook
**Do:** Add typed API functions and React Query hooks for Mission Control. Add query keys under the admin namespace. Support manual refresh and force a fresh overview read when the page mounts.
**Files:** `frontend/src/api/admin-mission-control.ts`, `frontend/src/hooks/queries/useAdminMissionControlQueries.ts`, `frontend/src/lib/queryClient.ts`
**Depends on:** T3
**Verify:** `cd frontend && npm run build`

### T5: Mission Control page and navigation
**Do:** Build `MissionControl` as the primary admin organization overview: executive revenue strip, payment-risk rail, searchable/filterable organization grid, organization tiles with payment sparklines, status badges, lifetime paid, expected monthly amount, latest operational signals, and click-through to `/admin/organizations/:id`. Extract the current create organization modal into a shared component so Mission Control can create orgs without preserving the old page as the only creation path. Add Mission Control to admin routing/sidebar and keep the legacy Organizations route available.
**Files:** `frontend/src/pages/admin/MissionControl.tsx`, `frontend/src/components/Admin/mission-control/MissionControlHeader.tsx`, `frontend/src/components/Admin/mission-control/MissionControlSummary.tsx`, `frontend/src/components/Admin/mission-control/OrganizationMissionCard.tsx`, `frontend/src/components/Admin/mission-control/MissionControlSparkline.tsx`, `frontend/src/components/Admin/mission-control/MissionControlInsightPanel.tsx`, `frontend/src/components/Admin/CreateOrganizationModal.tsx`, `frontend/src/pages/admin/OrganizationManagement.tsx`, `frontend/src/pages/Admin.tsx`, `frontend/src/components/Admin/AdminSidebar.tsx`
**Depends on:** T4
**Verify:** `cd frontend && npm run build`; manual browser check `/admin/mission-control`, tile click to org detail, create org modal opens, legacy `/admin/organization-management` still loads

### T6: AI movement insight
**Do:** Implement the on-demand insight action using the existing Anthropic runner if available. The prompt must consume only sanitized aggregate values and return concise movement commentary, not recommendations that mutate data. On LLM failure or missing API config, show deterministic `movementSignals` from the GET payload.
**Files:** `src/controllers/admin-mission-control/feature-services/MissionControlInsightService.ts`, `frontend/src/components/Admin/mission-control/MissionControlInsightPanel.tsx`
**Depends on:** T3, T5
**Verify:** `npm run build`; `cd frontend && npm run build`; manual: insight button returns either AI copy or fallback without breaking the dashboard

### T7: Alloro Docs parity
**Do:** Check `/Users/rustinedave/Desktop/alloro-docs` for an admin/dashboard docs section. If the docs app covers admin screens, add a Mission Control docs page, replica, hotspots, and tooltip copy. If the docs app is client-only and should not expose admin surfaces, record that decision in the execution summary and do not force a fake client doc page.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/pages.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/*`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/*` as applicable
**Depends on:** T5
**Verify:** `npm run build` in `/Users/rustinedave/Desktop/alloro-docs` if docs files change

### T8: Verification and parity pass
**Do:** Run backend build, frontend build, targeted browser QA, and inspect git status in both Alloro and Alloro Docs. Confirm spec-code parity and list any Stripe degradation behavior observed locally.
**Files:** none
**Depends on:** T1, T2, T3, T4, T5, T6, T7
**Verify:** `npm run build`; `cd frontend && npm run build`; browser QA for `/admin/mission-control`; `git status --short`; `git -C /Users/rustinedave/Desktop/alloro-docs status --short`

## Parallel Sub-Agent Orchestration

This is large-scope work. During execution:
- Backend agent handles T1-T3 and backend side of T6.
- Frontend agent handles T4-T5 and frontend side of T6 after the API contract is fixed.
- Docs agent handles T7 after the Mission Control UI stabilizes.
- Orchestrator verifies integration, import paths, response types, cache keys, and browser behavior.

If parallel work conflicts on shared files like `src/index.ts`, `frontend/src/lib/queryClient.ts`, `frontend/src/pages/Admin.tsx`, or `frontend/src/components/Admin/AdminSidebar.tsx`, merge sequentially and add a Revision Log note.

## Revision Log

### Rev 1 - May 25, 2026
**Change:** Refine Mission Control from screenshot feedback: exclude the `Test` and `Hamilton Wise's Organization` sandbox accounts, sort clients by highest lifetime paid first, remove the header Stripe freshness pill, rename the count to `{n} Alloro Clients`, remove the generated-time chip, tighten typography/spacing, add a per-card pilot dropdown for admin-role users, and add a Payment Watch toggle between highest lifetime revenue and billing flags.
**Reason:** First-pass UI exposed sandbox rows, noisy metadata, clunky text scale, and missing admin workflow shortcuts.
**Updated Done criteria:** Mission Control client counts exclude the named sandbox accounts; grid ordering is lifetime-paid descending; pilot dropdown opens only admin-role users and starts existing pilot sessions; Payment Watch defaults to highest lifetime revenue and can switch to billing flags.

### Rev 2 - May 25, 2026
**Change:** Also exclude `Alloro Team's Organization` from Mission Control as a sandbox account.
**Reason:** It is an internal/sandbox org and should not count toward Alloro client revenue or client grids.
**Updated Done criteria:** Mission Control client counts exclude `Test`, `Hamilton Wise's Organization`, and `Alloro Team's Organization`.

### Rev 3 - May 25, 2026
**Change:** Add a 12-month recurring revenue graph before Payment Watch, remove the cached Stripe warning, force fresh Mission Control reads on page load, and color Lifetime watch values green.
**Reason:** The dashboard needs a higher-level month-by-month revenue movement view and should not show stale Stripe freshness messaging during normal admin loads.
**Updated Done criteria:** Mission Control exposes an aggregate 12-month revenue trend, renders it with the existing Recharts dashboard interaction pattern, loads the overview with a fresh Stripe read on mount, and uses green lifetime amounts in the Payment Watch lifetime tab.

### Rev 4 - May 25, 2026
**Change:** Replace organization-card custom SVG sparklines with Recharts sparklines.
**Reason:** The dashboard should use one charting system for both the overall revenue trend and per-organization paid-invoice movement.
**Updated Done criteria:** Organization cards render their 12-month paid-invoice movement through Recharts while preserving compact card layout, risk tone coloring, and click-through behavior.

## Done
- [x] `npm run build` passes for backend.
- [x] `cd frontend && npm run build` passes.
- [x] Mission Control route loads at `/admin/mission-control`.
- [x] Mission Control uses one aggregate backend query path, not per-card fetches.
- [x] Expected MRR and received payments come from Stripe data, not `ORG_MONTHLY_RATE`.
- [x] No-payment-method, no-Stripe, locked, cancelling, and failed/past-due states are visible.
- [x] Organization cards route to `/admin/organizations/:id`.
- [x] Create organization flow is still available.
- [x] AI insight is on-demand or falls back to deterministic movement signals.
- [x] No raw Stripe secrets, invoice URLs, or sensitive payment identifiers are exposed to the LLM or frontend.
- [x] `/admin/organization-management` remains available as a legacy path.
- [x] Alloro Docs parity checked and explicitly marked not applicable because the docs app is client-facing and has no admin dashboard section.
- [x] Browser QA confirms desktop and mobile layouts do not overlap.
