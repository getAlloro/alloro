# Ranking Resilience Guardrails and Custom Website Auditor

## Why
The ranking pipeline currently has mixed failure behavior: some failures retry the whole location, some are swallowed inside a step, and the website audit failure path converts unknown data into fake zero scores. That creates inaccurate LLM recommendations like "critical website issues" when the real issue is an unavailable audit dependency.

## What
Add explicit failure mitigation across the ranking pipeline and replace the broken Apify Lighthouse dependency with an in-house "website basics check." The run should retry transient external failures up to 3 times where appropriate, fail fast on permanent configuration/auth issues, record final outcomes in `pipeline_timings` / `raw_data`, and never present unknown audit data as a measured zero.

## Context

**Relevant files:**
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — orchestrates ranking steps, status updates, pipeline timings, and raw data persistence.
- `src/controllers/practice-ranking/feature-services/service.apify.ts` — current Apify Maps lookup, competitor detail scraping, and broken Lighthouse audit function.
- `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts` — compacts ranking context and calls Claude for final client-facing analysis.
- `src/controllers/agents/feature-services/service.webhook-orchestrator.ts` — current Identifier Agent entry point used before ranking and competitor onboarding.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — calls identifier and triggers rerank from the competitor reselection flow.
- `src/utils/dataAggregation/dataAggregator.ts` — GBP fetch helper with one 401 refresh retry.
- `src/auth/oauth2Helper.ts` — Google OAuth refresh helper.
- `src/agents/service.llm-runner.ts` — low-level Anthropic caller used by Identifier and ranking LLM.

**Patterns to follow:**
- Keep ranking-specific orchestration in `src/controllers/practice-ranking/feature-services/`.
- Keep status/timing data inside existing `status_detail` and `raw_data.pipeline_timings`; no schema migration.
- Preserve the current outer `MAX_RETRIES = 3` location retry contract, but do not rely on it for swallowed inner failures.
- Follow the existing `beginPipelineTiming` / `finishPipelineTiming` pattern in `service.ranking-pipeline.ts`.

**Reference files:**
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — timing/status integration pattern.
- `src/controllers/audit/audit-services/service.audit-apify.ts` — external call helper separation pattern.
- `src/controllers/pms/pms-utils/agent-json-parse.util.ts` — existing max-3 AI parse retry precedent.

## Constraints

**Must:**
- Use max 3 attempts for transient LLM and Apify failures.
- Preserve Google OAuth refresh behavior and the explicit 401 forced-refresh retry.
- Fail fast on non-retryable failures: missing env token, revoked/missing Google refresh token, invalid scopes after refresh, Apify actor not found, invalid request, 400/401/403 non-rate-limit responses.
- Record retry attempts, final status, and concise failure reason in timing metadata where practical.
- Return `unknown` / `failed` / `skipped` audit semantics instead of zero scores when the website check cannot run.
- Keep the LLM from recommending website fixes based on failed or skipped audit data.
- Keep current ranking score and competitor math unchanged except for replacing audit input semantics.
- Avoid new npm dependencies unless the existing stack cannot do the job.

**Must not:**
- Do not keep calling `apify~lighthouse` for ranking website audit.
- Do not claim Lighthouse scores, Core Web Vitals, accessibility scores, or true mobile performance from the custom auditor.
- Do not retry permanent failures three times.
- Do not change dashboard UI copy unless required to stop showing false website-audit values.
- Do not modify unrelated Rybbit/media/GSC work currently present in the dirty worktree.

**Out of scope:**
- Building a full crawler or multi-page website audit.
- Replacing the leadgen audit pipeline's separate Apify services.
- Changing practice health scoring weights.
- Backfilling old `practice_rankings` rows that already contain zero-score audit data.
- Adding a new database table for telemetry.

## Risk

**Level:** 3 — Structural Risk

**Risks identified:**
- Fake-zero audit data is materially inaccurate and directly creates bad client recommendations. → **Mitigation:** custom auditor returns typed status and nullable measured fields; LLM compacting excludes failed/skipped audit values.
- Blanket retry can increase latency/cost and hide permanent configuration issues. → **Mitigation:** add retry classification and only retry transient errors; fail fast on known permanent failures.
- Existing outer location retries do not run when inner steps swallow errors. → **Mitigation:** add retry wrappers at the failing step boundaries before graceful degradation.
- Changing `fetchGBPDataForRange` globally could affect dashboard metrics and other Google consumers. → **Mitigation:** keep global behavior intact; wrap ranking GBP calls locally if additional retry is needed.
- The custom auditor could be misread as Lighthouse parity. → **Mitigation:** name it "website basics check" in code comments/LLM context and remove Lighthouse-only score language.

**Blast radius:**
- Ranking scheduler and manual ranking reruns.
- Competitor reselection rerank flow.
- Latest ranking dashboard recommendations, because the LLM consumes `website_audit`.
- Admin ranking detail page if it renders raw `website_audit`.
- Google token refresh flows indirectly through ranking GBP fetch.
- Apify Maps estimate and competitor detail consumers inside ranking.

**Pushback:**
- "Max retry everywhere" is the wrong model. Future-us will hate a pipeline that retries bad config for 15 minutes and still produces fake output. The better model is **classified retries**: transient errors get up to 3 attempts; permanent errors fail fast with clear status.
- A homegrown auditor should be intentionally modest. It can check basics well; it must not pretend to be a performance lab.

## Tasks

### T1: Ranking retry classification helper
**Do:** Add a ranking-scoped retry utility with `maxAttempts`, backoff, transient/permanent classification, and structured attempt metadata. It should support async functions without knowing the ranking domain, so LLM, Apify, and GBP callers can share it.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-resilience.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Identifier and final LLM retry guardrails
**Do:** Apply max-3 transient retry to `identifyLocationMeta` and `runRankingAnalysis`. Identifier fallback should derive specialty/market from GBP data where possible and avoid hardcoded `orthodontist` when the client is clearly endodontic/orthodontic/periodontic/etc. Final LLM should retry transient Claude/API/parse failures before completing without AI insights.
**Files:** `src/controllers/agents/feature-services/service.webhook-orchestrator.ts`, `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`, `src/agents/service.llm-runner.ts` only if needed for typed error inspection
**Depends on:** T1
**Verify:** `npx tsc --noEmit`; Manual: force a mocked transient LLM error and confirm 3 attempts before fallback.

### T3: Google/GBP failure mitigation audit
**Do:** Preserve current token refresh and 401 force-refresh retry. Add ranking-local transient retry around GBP fetch only where it does not alter global `fetchGBPDataForRange` semantics. Ensure revoked/missing refresh token, scope errors, and repeated 401s fail with a clear reconnect message instead of retry noise.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/controllers/agents/feature-services/service.ranking-executor.ts`, `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`; Manual: inspect logs for token refresh path and reconnect failure message.

### T4: Apify Maps and competitor detail retry boundaries
**Do:** Add classified max-3 retry around transient Apify actor start/run/dataset fetch failures for Maps estimate and detail scrape paths. Preserve existing fallback to Places API for Maps position. Fail fast on missing `APIFY_TOKEN`, 401/403, actor not found, or invalid input.
**Files:** `src/controllers/practice-ranking/feature-services/service.apify.ts`, `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`; Manual: simulate actor failure and confirm retry attempts are logged, then fallback status is recorded.

### T5: Custom website basics auditor
**Do:** Replace ranking's Apify Lighthouse audit with a custom single-URL auditor. Checks should include URL normalization, HTTPS, final URL, redirect count, HTTP status, response time, reachable HTML, title, meta description, viewport, canonical, robots noindex, JSON-LD presence, local/organization/dental schema signals, phone/address text hints, sitemap/robots reachability where cheap. Return typed `status: success | partial | failed | skipped`, nullable metrics, and check-level evidence. Keep old Lighthouse-only fields out or nullable for backward compatibility.
**Files:** `src/controllers/practice-ranking/feature-services/service.website-audit.ts`, `src/controllers/practice-ranking/feature-services/service.website-audit-parser.ts`, `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/controllers/practice-ranking/feature-services/service.apify.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`; Manual: audit `https://www.1endodontics.com/` and confirm failure does not become zero scores.

### T6: LLM website-audit semantics
**Do:** Update `compactWebsiteAudit` and ranking prompt context so failed/skipped audits are treated as unknown, not as proof of website problems. Only include measured checks and concise failure labels. Prevent recommendations that say "performance/mobile/SEO scored zero" unless those exact metrics were truly measured by a supported tool.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`
**Depends on:** T5
**Verify:** `npx tsc --noEmit`; Manual: run or fixture-test Falls Church payload and confirm no false critical website recommendation from failed audit.

### T7: Status and telemetry hardening
**Do:** Ensure `raw_data.pipeline_timings` records retry attempts and final statuses for LLM, GBP, Apify Maps, competitor details, and website audit. Add compact `raw_data.failure_mitigations` or equivalent nested metadata only if it can be kept small and useful. Keep client-facing status messages plain and non-technical.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`
**Depends on:** T2, T3, T4, T5, T6
**Verify:** Manual: inspect latest `practice_rankings.raw_data` JSON after a test run.

### T8: Verification run and regression checks
**Do:** Run targeted TypeScript/build checks and a local Falls Church ranking run or dry-run harness. Verify that the website audit no longer returns fake zero scores, the LLM output quality remains intact, retry behavior is visible in logs/timings, and the ranking dashboard still loads the latest snapshot.
**Files:** no code files unless fixes are required
**Depends on:** T7
**Verify:** `npx tsc --noEmit`; targeted lint on touched files if configured; Manual: Falls Church ranking run and latest dashboard response inspection.

## Done
- [x] `npx tsc --noEmit` passes or only pre-existing unrelated errors are documented.
- [x] Identifier LLM has max-3 transient retry before fallback.
- [x] Final ranking LLM has max-3 transient retry before graceful completion without insights.
- [x] GBP fetch still performs token refresh and 401 retry; reconnect-required failures are clear.
- [x] Apify Maps estimate has classified max-3 transient retry and keeps Places fallback.
- [x] Ranking no longer calls `apify~lighthouse`.
- [x] Website audit failures produce `failed` / `unknown`, not zero performance/mobile/SEO scores.
- [x] LLM context cannot convert failed website audit into critical website recommendations.
- [x] `raw_data.pipeline_timings` captures final status and retry evidence for the mitigated steps.
- [x] Manual Falls Church run verifies the prior false "critical website issues" recommendation does not recur from audit failure.

## Revision Log

### Rev 1 — 2026-05-14
**Change:** Split pure website-audit HTML parsing helpers into `service.website-audit-parser.ts`.
**Reason:** Keep the custom auditor service under backend file-size conventions while preserving the same behavior.
**Updated Done criteria:** unchanged.
