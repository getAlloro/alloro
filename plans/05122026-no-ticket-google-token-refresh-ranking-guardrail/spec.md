# Google Token Refresh and Ranking Guardrail

## Why
Ranking reruns can complete with incorrect Practice Health scores when GBP requests return 401 and the fetch layer converts the failure into null data. The app has refresh tokens, but stale access tokens still need a forced refresh retry before the pipeline decides data is unavailable.

## What
Add a forced-refresh retry path for GBP data fetches and block rankings from completing when required client GBP data is missing. Dashboard/PMS-adjacent GBP metrics should also retry once on 401, while staying best-effort for dashboard rendering.

## Context

**Relevant files:**
- `src/auth/oauth2Helper.ts` — creates Google OAuth clients and refreshes tokens based on expiry.
- `src/utils/dataAggregation/dataAggregator.ts` — shared GBP aggregation used by rankings and dashboard metrics.
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — scoring pipeline that must not turn missing GBP data into zeros.
- `src/controllers/agents/feature-services/service.ranking-executor.ts` — scheduled ranking pre-identification fetch before calling the pipeline.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — onboarding/reselection specialty fallback fetch.
- `src/controllers/practice-ranking/feature-services/service.google-data-fetcher.ts` — ranking identifier wrapper around OAuth and GBP data fetches.
- `src/utils/dashboard-metrics/service.dashboard-metrics.ts` — PMS statistics/main dashboard metrics path that mixes PMS and GBP data.

**Patterns to follow:**
- Keep token refresh centralized in auth helper.
- Keep routes untouched; this is service-layer behavior.
- Ranking pipeline should fail safely and preserve old completed dashboard rows rather than publishing a bad completed row.

## Constraints

**Must:**
- Retry GBP fetches once after forced token refresh when Google returns 401.
- Preserve existing best-effort dashboard metrics behavior after the retry.
- Treat missing ranking GBP data as a failed rerun, not a zero-review practice.
- Avoid logging token values.

**Must not:**
- Do not change PMS upload/parsing behavior.
- Do not rewrite OAuth storage.
- Do not mutate historical ranking rows.

**Out of scope:**
- Reconnect UX redesign.
- Background repair of bad historical row 145.
- Review sync token behavior.

## Risk

**Level:** 2

**Risks identified:**
- Forced refresh can be called concurrently by multi-location dashboard metrics. -> **Mitigation:** share one refresh promise per fetch call.
- Ranking failure status may expose a new failed state in polling UI. -> **Mitigation:** existing dashboard already keeps previous completed rows visible; failed rerun should not become latest completed result.
- 401 can mean revoked scopes, not just stale access token. -> **Mitigation:** retry once, then fail clearly with reconnect-oriented error.

**Blast radius:**
- Ranking reruns and scheduled/manual rankings.
- Dashboard metrics that include GBP review/performance data.
- OAuth token refresh helper callers.

## Tasks

### T1: Force Refresh Support
**Do:** Add optional `forceRefresh` support to Google OAuth helper methods.
**Files:** `src/auth/oauth2Helper.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: GBP Fetch Retry
**Do:** Add shared one-time 401 retry support to `fetchGBPDataForRange`.
**Files:** `src/utils/dataAggregation/dataAggregator.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T3: Ranking Guardrail
**Do:** Use force-refresh retry in rankings and ranking-adjacent specialty identification. Mark reruns failed if required GBP data is still unavailable.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/controllers/agents/feature-services/service.ranking-executor.ts`, `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`, `src/controllers/practice-ranking/feature-services/service.google-data-fetcher.ts`
**Depends on:** T2
**Verify:** `npx tsc --noEmit`

### T4: Dashboard Metrics Retry
**Do:** Use the same retry hook in dashboard/PMS-adjacent GBP metric fetches.
**Files:** `src/utils/dashboard-metrics/service.dashboard-metrics.ts`
**Depends on:** T2
**Verify:** `npx tsc --noEmit`

## Done
- [x] 401 GBP fetch retries once with forced token refresh.
- [x] Ranking required GBP data no longer falls back to zeros.
- [x] Dashboard metrics GBP fetches retry once but remain best-effort.
- [x] No token values logged.
- [x] `npx tsc --noEmit` passes.
