# Inversion, Slice 1: Data Truth Pass

*Draft spec for Dave's Claude (`alloro-engineer`). Staged for Corey's review; not yet on Jo's board.
Written to be executed from the repo, anchored to real `origin/dev/dave` file:lines (the live base). 2026-07-06.*

## Why this exists (read first: the owner, not the code)
A scared owner trusts the whole product only if every number survives their own gut-check. Right now
(illustrative of the bug pattern; confirm exact counts against the live account) Garrison sees "#1 of 11
locally" on one page and "#3 of 11" on another; Pawlak sees "Not connected yet" on a site that IS
connected; owners see a "gap to top" that's fabricated. **One number an owner can catch as wrong poisons
all the rest.** The Journey Lattice (substrate: alloro-brain, local, not code) names the target:
*confidence they can't get anywhere else at any price.* This slice makes every displayed number true and consistent.

## The frame for Dave (what OUGHT to be there)
This is **not a rebuild.** The surfaces you built are right; these are four small, surgical diffs so
the numbers under them are honest, each reading from one true source. **Minimum rework, maximum reuse**:
where a correct pattern already exists in the code, copy it. No surface is redesigned.

---

## dev/dave re-verification (2026-07-06)
All four fixes CONFIRMED present and still needed on `origin/dev/dave` (the live base; none fixed since). Deltas from the main-based trace:
- **FIX 1a** unchanged: `stageReaders.ts:390` (`row.rank_position ?? null`).
- **FIX 1b**, the `|| 1` fabricated-#1 fallback lives in **three** places, not two: `service.ranking-stage-scoring.ts:393`, `service.ranking-stage-llm.ts:197`, and `service.ranking-pipeline.ts:259`. Fix all three, default `null`, never `1`.
- **FIX 2**, the leads gate lives in `PatientJourneyService.ts` (the `emptyRead` resolves at `:143/:146/:149`, the reason pass-through at `:111`); the reuse-pattern to copy is at `stageReaders.ts:202` (`{ ...emptyRead(), unavailableReason: "not_connected" }`).
- **FIX 3** unchanged: `sectionBuilders.ts:228`. **FIX 4** unchanged: `metricsHelpers.ts:164`.

Chapter 1 is grounded on dev/dave, spec locked, ready to build.

## FIX 1: Rank consistency (kill the fabricated "#1")
- **Owner sees:** "#1 of 11 locally" (Patient Journey) vs "#3 of 11 nearby" (Local Rankings), same practice. (Counts are illustrative of the inconsistency; confirm against the live practice before merge.)
- **Root cause:** Patient Journey reads `rank_position`, a Practice-Health rank that **defaults to `1`
  via a `|| 1` fallback** when the practice isn't matched among competitors. Local Rankings reads the
  real `search_position` (SerpApi sampled Maps position).
- **Fix (the small diff):**
  1. `src/controllers/patient-journey/feature-services/stageReaders.ts:390` → read `row.search_position`, not `row.rank_position`.
  2. Add `"search_position"` to the `.select(...)` in `src/models/PracticeRankingModel.ts:568-573` (`findLatestCompletedRankingMetrics` selects only `rank_position`, `rank_score`, `total_competitors`, `ranking_factors`, not `search_position`, though the column is persisted and selected by a sibling method at `:536`).
  3. **Handle null:** if `search_position` is null (SerpApi miss), show "estimate pending," never a fabricated number.
- **Deeper flag (separate, recommend fixing):** the same `|| 1` fallback lives in all THREE writers,
  `service.ranking-stage-scoring.ts:393`, `service.ranking-stage-llm.ts:197`, and `service.ranking-pipeline.ts:259`
  (canonical; matches the re-verification above). Each writes rank **1** whenever the practice isn't matched: a false,
  over-optimistic number anywhere `rank_position` is shown. **Default to `null` (unknown), never `1`.** (Never fabricate; the Theranos row.)
- **Source of truth:** `practice_rankings.search_position`.
- **Done when:** both pages show the same rank for the same practice; no practice shows "#1" from the fallback.

## FIX 2: "Not connected yet" honesty
- **Owner sees (Pawlak):** "Website Leads: Not connected yet" on a site that's connected but has few/no
  verified form submissions. Reads as broken; dead-ends the pipeline.
- **Root cause:** `readLeads` returns `emptyRead()` with **no `unavailableReason`** for THREE different
  states (no website project / zero submissions ever / read error). All collapse to the default copy
  "Not connected yet" (`frontend/.../patientJourney.utils.ts:38`).
- **Fix (reuse the pattern that already works):** the impressions reader already distinguishes
  `not_connected` / `pending` / `no_data` at `stageReaders.ts:202-206`. Copy it into `readLeads`:
  1. `src/controllers/patient-journey/feature-services/stageReaders.ts:330` (and the `:341` catch) → set an `unavailableReason` (`no_data` when the project exists but has no submissions; `not_connected` when there's no project).
  2. Add the matching copy in `patientJourney.utils.ts` ("No leads yet this month" vs "Not connected yet").
- **Source of truth:** connected = a `project_id` present + ≥1 verified form-submission row (`FormSubmissionModel`).
- **Done when:** a connected site with zero leads reads "No leads yet this month," and the pipeline no longer dead-ends for a working site.

## FIX 3: Kill the score_gap proxy
- **Owner sees:** a "gap to top" that's fabricated as `100 - your score`, not the real distance to the actual top competitor.
- **Root cause:** `src/utils/dashboard-metrics/sectionBuilders.ts:228`: `scoreGapToTop = 100 - score` (comment at `:227` admits "cheap proxy").
- **Fix:** compute the real gap (top competitor's score minus this practice's score) from competitor data
  already fetched. **Consumer check first:** trace who reads `scoreGapToTop` before changing it (it
  feeds a dashboard section); ensure no `null` breaks a downstream calc. If a reliable real top score
  isn't available, **remove the number rather than show a fabricated one** (Value #6, never fabricate).
- **Done when:** the gap shown is the real distance to the real top competitor, or it isn't shown.

## FIX 4: Weight multi-location ratings
- **Owner sees (multi-location):** an average star rating that treats a 5-review 5.0 location equal to a 500-review 4.2 location. (Review counts illustrative.)
- **Root cause:** `src/utils/dashboard-metrics/metricsHelpers.ts:164`: plain mean of per-location ratings, ignoring each location's review count (already summed nearby at `:140-146`).
- **Fix:** weight the average by each location's `totalReviewCount`. (Mirror the same pattern at `service.dashboard-metrics.ts:152`.)
- **Done when:** the org rating is the review-count-weighted average.

---

## The staking gates (the humans own the truth)
- **Corey** stakes that the framing is right (this is the vision's "every number true").
- **Dave / his Claude** implements the diffs and **verifies each against a real practice's live data before merge**: the number on screen must match reality (this is the truth-gate that a Claude-to-Claude wire cannot skip).

## Scope boundary
This slice is **truth only** (numbers are honest + consistent). It does NOT yet make the recommendations
specific; that's **Slice 2 (Card Upgrade: make every card the Chancellor Crossing card)**, which needs
one more trace (where the referral "1 thing that matters" insight is generated) before it can be anchored.
Land Slice 1 first.
