# Ranking Pipeline Optimization

## Why
The Falls Church timing run completed correctly after the token refresh guardrail, but it took about 202 seconds end to end. Most of that time is avoidable duplicate GBP fetching, expensive Apify competitor detail scraping, and a large LLM response.

## What
Reduce ranking runtime while preserving accuracy: reuse fetched GBP data, add structured timing telemetry, skip unnecessary competitor detail scrapes when curated metadata is fresh, normalize specialty keywords, audit the actual GBP website URL, and make the LLM step leaner without losing client-facing insight quality.

## Quality Preservation Contract

The optimization must cut duplicated and noisy context, not decision-critical context.

**Decision-critical context that must remain available to the LLM:**
- Client identity, specialty, market, GBP category, website URL, rating, total reviews, review velocity, posts, photos, phone/website/hour completeness.
- Practice Health score, rank position, weighted factor scores, and weakest/strongest factors with plain-English details.
- Google Maps estimate: query, status, sampled position, top 5 Maps results, selected competitor Maps positions, and discovery radius.
- Competitor benchmark summary: median/average reviews, median/average rating, top competitor review/rating gap, and total competitor count.
- Top relevant competitors with enough fields to explain why they are stronger/weaker: name, category, reviews, rating, velocity when available, score, rank position, and key factor deltas.
- Website audit summary only: successful URL, HTTPS/mobile/schema/high-level issues. Do not send raw crawl internals.

**Context that should be cut or summarized:**
- Full raw GBP payloads once deterministic metrics have been extracted.
- Duplicate competitor fields already represented in scored competitor summaries.
- Long raw website audit objects that are not referenced by the prompt.
- Internal identifiers unless the prompt explicitly uses them for citations/debugging.
- Any payload fields that are not available to the client or do not affect recommendations.

**Output quality must be preserved by acceptance checks:**
- JSON must parse and keep the existing schema.
- `one_line_summary` must remain specific and cite the top actionable next step.
- `client_summary` and `render_text` must remain non-generic and mention the actual Maps estimate, Practice Health driver, and biggest improvement lever.
- Top recommendations must be grounded in provided numeric facts, not vague SEO advice.
- A before/after Falls Church comparison must show equivalent or better usefulness before T6 is accepted.

## Expected Time Savings

**Observed Falls Church baseline:** about 202 seconds end to end.

**Conservative savings:**
- Reuse pre-identification GBP payload in the pipeline: **24-26s saved per location**.
- Skip full Apify detail scrape when curated competitor metadata is fresh: **25-35s saved per location**.
- Use GBP website URI for audit instead of fallback domain: **0-1s saved**, mostly accuracy/reliability.
- Keyword normalization: **0s saved**, accuracy fix.
- Structured telemetry: **0s saved directly**, makes future optimization measurable.

**Likely total without LLM change:** **49-62s saved**, bringing Falls Church-like runs from about **202s to 140-153s**.

**Additional LLM savings target:**
- Reduce/split the 80s LLM step: target **35-55s saved** if the prompt/output contract is tightened.

**Likely total with LLM optimization:** **84-117s saved**, bringing Falls Church-like runs to about **85-118s**.

## Context

**Relevant files:**
- `src/controllers/agents/feature-services/service.ranking-executor.ts` — scheduled ranking setup does the first GBP fetch for specialty/market identification.
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — core ranking pipeline repeats the GBP fetch, scrapes competitors, audits the website, calculates scores, and calls the LLM.
- `src/controllers/practice-ranking/feature-services/service.apify.ts` — competitor detail scrape, website audit, and specialty keyword helper.
- `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts` — LLM prompt/schema and analysis persistence handoff.
- `src/controllers/practice-ranking/feature-services/service.llm-webhook-handler.ts` — marks rankings completed after LLM save.
- `src/controllers/practice-ranking/feature-services/service.competitor-source-resolver.ts` — hydrates finalized curated competitors before pipeline scoring.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — creates curated competitor snapshots with metadata that can be reused.
- `src/utils/dataAggregation/dataAggregator.ts` — GBP fetch helper with forced-refresh retry.

**Patterns to follow:**
- Keep ranking orchestration in service files; do not add route-level business logic.
- Preserve existing ranking row fields; use JSONB `status_detail` and/or `raw_data.pipeline_timings` for telemetry.
- Follow the existing status update pattern in `updateStatus` rather than introducing a parallel progress system.

**Reference files:**
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — main execution structure to extend.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — snapshot metadata shape for curated competitors.

## Constraints

**Must:**
- Preserve the token-refresh retry behavior added in `plans/05122026-no-ticket-google-token-refresh-ranking-guardrail/spec.md`.
- Never publish a completed ranking with missing required GBP data.
- Keep Maps estimate, Practice Health, and selected competitor projections behaviorally consistent.
- Record timing for major steps in a structured JSON field.
- Normalize specialty aliases before resolving specialty keywords.
- Prefer `profileData.websiteUri` for website audit when present.
- Preserve LLM output quality by compressing deterministic facts, not removing the facts needed for reasoning.
- Keep the existing ranking LLM JSON schema unless a separate approved spec changes downstream consumers.

**Must not:**
- Do not remove Apify entirely; it is still needed for live Maps position and stale/missing competitor metadata.
- Do not mutate historical completed rankings.
- Do not create user tasks from ranking output.
- Do not add a new database table or migration unless JSONB telemetry proves insufficient.
- Do not reduce LLM quality by sending only scores without the supporting driver facts.
- Do not lower `maxTokens` before the payload has been compacted and output length has been measured.

**Out of scope:**
- UI redesign for displaying telemetry.
- Reprocessing bad historical ranking row `145`.
- Background queue concurrency changes.
- Reconnect/OAuth UX changes.

## Risk

**Level:** 3

**Risks identified:**
- Reusing pre-identification GBP data could accidentally reuse the wrong date range or location. -> **Mitigation:** pass a typed `clientGbpData` only for the exact `gbpAccountId` + `gbpLocationId`; fallback to fetch when identity does not match.
- Skipping Apify detail scrape can reduce competitor metadata quality if cached curated data is stale or incomplete. -> **Mitigation:** gate skip on metadata freshness/completeness and scrape only missing/stale competitors.
- LLM reduction can make summaries less useful or break JSON parsing. -> **Mitigation:** preserve schema, reduce verbose inputs first, then separately test any schema split against latest dashboard copy.
- Over-compression can create generic recommendations even when JSON parsing succeeds. -> **Mitigation:** use a quality fixture from the Falls Church run and compare specificity, numeric grounding, and recommendation usefulness before accepting T6.
- Timing telemetry can bloat `status_detail` if every log line is captured. -> **Mitigation:** store only named step start/end/duration records, not raw logs.
- Website audit URL change can expose invalid GBP URLs. -> **Mitigation:** validate/sanitize URL and fallback to `https://${domain}` if GBP URL is absent or invalid.

**Blast radius:**
- Scheduled ranking runs.
- Manual/admin ranking trigger.
- Competitor reselection rerank path.
- Ranking LLM output and dashboard insight copy.
- Dashboard latest ranking data through `raw_data` and `status_detail`.

**Pushback:**
- The LLM optimization is the only part that should not be bundled blindly with the mechanical fixes. Future-us will hate this if we change speed and analysis quality at the same time with no telemetry split. Recommended path: ship T1-T5 first, run a timed Falls Church rerun, then execute T6 with before/after LLM output comparison.
- Do not confuse smaller input with better input. The goal is a curated analysis packet. Sending too little context will produce fast but bland output, which is a product regression.

## Tasks

### T1: Reuse Client GBP Payload
**Do:** Extend `processLocationRanking` to accept optional pre-fetched client GBP data with identity metadata. Pass the pre-identification GBP result from `processRankingWork` into the pipeline and skip Step 1 fetch when it matches the same account/location/date window.
**Files:** `src/controllers/agents/feature-services/service.ranking-executor.ts`, `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`
**Depends on:** none
**Verify:** Run a Falls Church timing run; Step 1 should log/use reused GBP and avoid the second 24-26s fetch.

### T2: Structured Timing Telemetry
**Do:** Add a small timing collector for named ranking steps. Persist `pipeline_timings` into `raw_data` and/or `status_detail.timestamps` with step name, startedAt, endedAt, durationMs, and outcome.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`
**Depends on:** none
**Verify:** Completed ranking row contains structured timings for search position, competitor resolution, GBP, competitor details, website audit, score calculation, posts, and LLM.

### T3: Fresh Curated Competitor Fast Path
**Do:** When competitor source is curated and active snapshot metadata has fresh rating/review/category/address/phone/website fields, build `competitorDetails` from curated metadata instead of running full `getCompetitorDetails`. Scrape only competitors with stale or missing required fields.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/controllers/practice-ranking/feature-services/service.competitor-source-resolver.ts`
**Depends on:** T2
**Verify:** Falls Church curated run avoids full 8-competitor Apify scrape when metadata is fresh; timing should save roughly 25-35s.

### T4: Specialty Keyword Normalization
**Do:** Normalize aliases such as `endodontist` -> `endodontics` inside `getSpecialtyKeywords`, matching the ranking algorithm alias behavior.
**Files:** `src/controllers/practice-ranking/feature-services/service.apify.ts`
**Depends on:** none
**Verify:** `getSpecialtyKeywords("endodontist")` returns endodontic keywords; ranking logs should no longer show `Using 0 keywords` for Falls Church.

### T5: Audit GBP Website URI
**Do:** Prefer `profileData.websiteUri` for website audit. Validate URL; fallback to `https://${domain}` only when missing/invalid.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`
**Depends on:** T1
**Verify:** Falls Church audits `https://www.1endodontics.com/` instead of `https://1endodontics.com`.

### T6: Lean LLM Payload And Output
**Do:** Build a deterministic compact analysis packet for the LLM while preserving all decision-critical context listed above. Remove raw/noisy fields only after the scoring code has distilled them into explicit metrics, factor details, benchmark summaries, and competitor deltas. Preserve the existing JSON schema. Only after payload compaction and timing telemetry are working, tighten prose length guidance or lower `maxTokens` if the before/after quality check passes.
**Files:** `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`, `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`
**Depends on:** T2
**Verify:** LLM duration falls materially from the observed 80s without parse failures; compare rendered insight quality against the pre-change Falls Church output using the quality checks in this spec.

### T6a: LLM Quality Fixture
**Do:** Capture the current Falls Church LLM input/output as a local test fixture or documented comparison artifact before changing the prompt/payload. Use it to compare old and new output for specificity, numeric grounding, and recommendation usefulness.
**Files:** `plans/05122026-no-ticket-ranking-pipeline-optimization/` or an existing test fixture location if one exists
**Depends on:** T2
**Verify:** Fixture includes old timing, old input summary, old output, new output, and a short acceptance note.

### T7: Timed Verification Run
**Do:** Run a Falls Church ranking timing pass after T1-T5, then again after T6/T6a. Compare structured timings against the 202s baseline.
**Files:** no production file expected
**Depends on:** T1, T2, T3, T4, T5, T6, T6a
**Verify:** Report total runtime, per-step timings, data correctness, and any remaining bottlenecks.

## Done
- [x] GBP is fetched once for Falls Church scheduled-style execution unless the passed payload identity does not match.
- [x] Ranking row includes structured step timings.
- [x] Fresh curated competitor metadata can skip full Apify detail scrape.
- [x] `getSpecialtyKeywords("endodontist")` returns non-empty endodontic keywords.
- [x] Website audit uses the GBP website URI when available.
- [x] LLM step has a measured before/after timing and no JSON parse regression.
- [x] LLM output remains specific, numeric, and action-oriented against the Falls Church quality fixture.
- [x] Existing LLM JSON schema is preserved.
- [x] Falls Church output still shows real GBP data: `Endodontist`, 5.0 rating, real review count, and Maps estimate.
- [x] `npx tsc --noEmit` passes.
- [x] Relevant frontend/backend build gates pass if touched.
