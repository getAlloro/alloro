# Audit Competitor Specialty Filter — fix the Oz-moment comparison

## Why

The audit's competitor cohort is chosen naively: `scrapeCompetitorGBPs` does `textSearch(competitorString, limit).slice(0, limit)` — it takes the first N raw Google Places results with **no specialty filtering**. So a specialist's audit can show **general dentists (or other irrelevant practices) as "competitors"** against an endodontist/orthodontist. For a sophisticated specialist, a visibly-wrong comparison is the single most damaging thing in the front-door "Oz moment" — worse than showing nothing. This is the gate the whole inbound engine sits on (all traffic terminates at the audit).

The specialty is **already known** — the LLM `CompetitorStringBuilder` produces `competitorString` in the format `category: location` (e.g. `orthodontist: West Orange NJ`) — it's simply never used to *filter* the results. The dashboard solved this exact problem on May 10 (`05102026-specialty-aware-competitor-filter`). This is a **port of `filterBySpecialty`, not new logic.**

Scope is **specialty-relevance only.** Maps-position ranking (SerpApi, per-audit cost at scale) and the Places-vs-Apify competitor **fidelity asymmetry** stay deferred as separate, measured decisions (known, accepted limits for now).

## What

In the audit's competitor selection, fetch a **larger candidate pool**, filter it to the practice's specialty using the dashboard's proven `filterBySpecialty`, and take the top `limit`. **Fall back** to the unfiltered top-`limit` if filtering would starve the cohort (thin markets), so a specialist always gets a non-empty comparison. Done = an audit for a known endodontist/orthodontist shows a **specialty-relevant** competitor set (no general dentists), and the cohort is **non-empty** even where exact specialists are scarce.

## Context

**Relevant files:**
- `src/controllers/audit/audit-services/service.audit-apify.ts` — `scrapeCompetitorGBPs(searchString, limit)` (the naive `textSearch().slice()`), and `placeToGbpMinimized` (Places result → `GbpMinimized`). The change lives here.
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts` — REUSE: `filterBySpecialty(competitors: DiscoveredCompetitor[], specialty)`, `resolveComparisonSpecialty`, the `DiscoveredCompetitor` type, and mirror the fallback shape from `discoverCompetitorsWithFallback`. Pure, DB-free — confirmed portable.
- `src/workers/processors/auditLeadgen.processor.ts:369` — caller: `scrapeCompetitorGBPs(competitorString, COMPETITOR_LIMIT)`. `competitorString` carries the `category:` prefix to derive specialty from.
- `src/agents/auditAgents/CompetitorStringBuilder.md` — documents the `competitor_string` = `category: location` format (category = lowercase singular specialty, e.g. `endodontist`).

**Patterns to follow:**
- Reuse `resolveComparisonSpecialty` + `filterBySpecialty` exactly; do not re-implement specialty logic.
- Mirror `discoverCompetitorsWithFallback`'s "filter, and if too few, fall back to broader" so the cohort never starves.
- Keep competitors **Places-API-only** (no Apify) — preserves the audit's speed; this spec changes *which* competitors, not their fidelity.

**Reference file:** `service.places-competitor-discovery.ts` — `discoverCompetitorsWithFallback` is the closest analog (filter + fallback).

## Constraints

**Must:**
- Derive the specialty from the `category:` prefix of `competitorString` (e.g. split on `:`, take the category), passed into `scrapeCompetitorGBPs` (add a param or parse internally).
- Fetch a larger candidate pool (e.g. `max(limit * 3, 15)`) from `textSearch`, then filter to the specialty, then take the top `limit`.
- Map each Places result to the `DiscoveredCompetitor` shape (`name`, `category`, `primaryType`, `types`) for `filterBySpecialty`, keyed by `placeId`/index so the surviving results map back to `placeToGbpMinimized` for the downstream pipeline.
- **Fallback (NS1-correct — revised):** show the relevant filtered competitors **even if fewer than `limit` (down to 1)**. NEVER pad a real cohort with off-specialty practices (a general dentist next to an endodontist is the exact trust-breaker this fix removes). Fall back to the unfiltered top-`limit` **only when filtering yields ZERO matches** (a specialist truly alone in their market — better than an empty cohort). Log when the zero-fallback fires.
- **Reuse, don't hand-roll:** export the existing `placesToCompetitors` (Places result → full `DiscoveredCompetitor`) from the discovery service and use it for the mapping; import `filterBySpecialty` + the `DiscoveredCompetitor` type. (Avoids a partial-cast and reuses the proven mapper.)
- Near-zero added cost: one larger `textSearch` call (~$0.03), no Apify.

**Must not:**
- Add maps-position ranking / SerpApi (deferred — its own measured decision).
- Touch the Places-vs-Apify competitor fidelity asymmetry (deferred).
- Change the self-GBP scrape, the downstream condensers, or the pillar prompts.
- Touch the conversion-infra (T1–T3) or the rate-limit (T4, already shipped #128).

**Out of scope:**
- Maps-ranking, fidelity parity, and any audit-conversion/email/lead-bridge work.

## Risk

**Level:** 2

**Risks identified:**
- Thin-market starvation (a specialist with few same-specialty neighbors) → **Mitigation:** the ≥3 fallback to unfiltered top-`limit`; logged.
- Type-mapping (Places result → `DiscoveredCompetitor`) wrong → **Mitigation:** map the same fields `placeToGbpMinimized` already reads (`displayName.text`, `primaryType`, `primaryTypeDisplayName.text`, `types`); verify on a real specialist audit on dev.
- Unexpected `competitorString` format (no `:`/category) → **Mitigation:** if specialty can't be derived, skip filtering (behave as today). No regression.

**Blast radius:**
- Audit competitor selection only (prospect-facing Oz moment). No other endpoint, no data writes, no self-GBP, no dashboard.

**Pushback:**
- The honest caveat from Conversation phase stands: this fixes *which* competitors (selection), not the full-detail-self vs sparse-competitor *fidelity* gap. That's deferred on purpose.

## Tasks

### T1: Specialty-filter the audit competitor cohort (with fallback)
**Do:** In `scrapeCompetitorGBPs`, derive specialty from the `competitorString` category, fetch a larger Places candidate pool, map to `DiscoveredCompetitor`, `filterBySpecialty`, take top `limit`, and fall back to unfiltered top-`limit` if filtered `< 3`. Map survivors back through `placeToGbpMinimized` unchanged for the pipeline.
**Files:** `src/controllers/audit/audit-services/service.audit-apify.ts` (reuse from `service.places-competitor-discovery.ts`)
**Depends on:** none
**Verify:** backend `tsc --noEmit`; Manual on dev — run an audit for a known endodontist/orthodontist; confirm the competitor set is specialty-relevant (no general dentists) and non-empty; run one in a thin market and confirm the fallback yields a cohort.

## Done
- [ ] backend `tsc --noEmit` passes
- [ ] Manual on dev: specialist audit → specialty-relevant, non-empty cohort; thin-market audit → fallback cohort present.

## Docs Parity
- No dashboard/admin/client UI change (the audit report renders whatever cohort it's given; the *set* changes, not the UI). Note in `CHANGELOG.md`; no docs-UI surface to update.

## Revision Log

- **2026-06-07 (pre-execution):** (1) Fallback corrected per cross-terminal review — relevant-few (down to 1), unfiltered only at zero matches; never pad with off-specialty. (2) Implementation grounded: reuse `placesToCompetitors` (export it) + `filterBySpecialty`. (3) Coupling note: `service.audit-apify.ts` is intentionally standalone, but that comment targets `service.apify.ts` (Apify/prompt-parity stability), not pure utilities — importing the pure specialty filter from `service.places-competitor-discovery.ts` is accepted reuse; duplicating the specialty taxonomy would be worse (drift). If a future refactor wants zero cross-service coupling, extract the specialty filter to a shared util.
