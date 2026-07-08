# Inversion, Chapter 4: Choosable (Stage 3)

*Draft spec for Dave's Claude (`alloro-engineer`). Staged for Corey's review; not yet on Jo's board.
Written to be executed from the repo. Every `file:line` that names a `.ts`/`.tsx`/`.md` agent-prompt
path is real code verified on `origin/dev/dave` (2026-07-07). Every `*-lattice.md` citation is
**substrate (alloro-brain, local)**, not code and not on dev/dave: it is the framework this chapter
reasons from, not something Dave can `git show`. 2026-07-06.*
*Source framework (substrate, alloro-brain, local): journey-lattice.md, Stage 3 Consideration: Be
Choosable (lines 96-113).*

## Why this exists (read first: the owner, not the code)
Stage 3 is where the framework says **the most revenue leaks** (substrate: journey-lattice.md:113):
"The customer found them but chose someone else. This is the most expensive stage to lose because the
marketing dollars to be findable have already been spent." The patient already has the practice on
their list. Now they compare (reviews, photos, the website, "is this the one?") and pick a competitor.

Today Alloro is **blind to that comparison.** The card engine (the SUMMARY agent) that writes the
"1 thing that matters" card receives the practice's OWN review count and rating, and nothing about the
competitors the patient is weighing it against. So on a zero-upload account the best it can say is
"get more reviews": homework any tool gives, not the specific move, caught from data the owner can't
see. Worse, the ranking side already *has* competitor review counts and can use them in a way that
contradicts the rank claim: a practice can be told it is **#1 locally** and, in the same breath, to
**"close the gap with competitors who have far more reviews."** A card that contradicts itself poisons
trust (the same failure Chapter 1 fixed for rank). *(The specific "#1 + close a 441-1026 review gap"
pairing is an ILLUSTRATIVE example of the failure mode, not a verified card capture; Dave must confirm
against a real produced card before treating it as fact.)*

The framework's own worked example of a Choosable card (substrate: journey-lattice.md:201):
> *"You're losing the Choosable stage in Fredericksburg. Three competitors added more recent reviews
> than you in the past 30 days. Ask three patients this week to leave a review."*

That names the stage, names what's leaking and why, and one action, **caught from the competitor
comparison, which is 100% public data.** This chapter's job is the READ: feed the card engine that
comparison as a grounded Choosable *choose-signal*, and add the card-layer guardrail that keeps it
true (no self-contradiction) and relief-first (never "you're failing"). **The review-ASK action that
acts on the gap ("ask N patients to leave a review") is owned by Chapter 6 (Memorable), not here** (see
"What this chapter owns"); Chapter 4 supplies the caught comparison, Chapter 6 emits the ask.

## The frame for Dave (what OUGHT to be there)
This is **not a rebuild.** The public data already exists in the product: `location_competitors`
rows carry each competitor's `review_count`, `rating`, and a `profile_strength_score` computed by a
pure function already in the tree. The gap is that this data **never reaches the card engine's grounded
dictionary** (`dashboard_metrics`), so the SUMMARY agent can't cite it and can't build a comparison
read. Four surgical changes: (A) add one deterministic `choosable` section to the metrics dictionary
that computes the review/rating gap vs the curated competitors; (B) reuse the existing profile-strength
function to add the other Choosable dimensions honestly; (C) teach the SUMMARY prompt to surface a
relief-first, non-contradicting Choosable *choose-signal* from it and hand the review-ask candidate to
Chapter 6; (D) the anti-contradiction guardrail.
**Minimum rework, maximum reuse.** No surface is redesigned: the card renders through the existing
`OneThingBanner` path unchanged.

## What this chapter owns, and what it does NOT
- **Owns:** the Choosable-stage READ (review quality/quantity and rating vs competitors, and, honestly
  scoped, photo presence, website presence, and credibility completeness, all on public data) surfaced
  as a grounded Choosable *choose-signal* to the Chapter 2 (Chancellor) standard for Chapter 7 selection.
- **Does NOT own the review ASK.** The review-domain ACTION that acts on the gap ("ask N patients to
  leave a review," review velocity, the review reply) is owned end-to-end by **Chapter 6 (Memorable)**.
  Chapter 4 supplies the caught comparison as a candidate signal and hands the review-ask candidate to
  Chapter 6; it must NOT emit its own competing review-ask card. Chapter 4 may reference review
  quality/count only as a *choose signal*, never as the ask.
- **Does NOT own the "80 visitors, 0 leads" conversion screen** (`WebsiteOverview.tsx:238`), owned
  end-to-end by **Chapter 5 (Bookable)**. The website-first-impression signal here is only the
  **cause-side** input to that screen (a possible reason a site under-converts). This chapter references
  it, never builds it: that prevents one screen fragmenting across chapters.
- **Boundary with Chapter 3 (Findable):** the local-rank number and the ranking-recommendation LLM are
  Stage 2 / Chapter 3 territory. This chapter reuses the competitor list those pipelines populate but
  does not modify the ranking prompt. The self-contradiction (a "#1 / you lead" claim paired with a
  "close the gap" ask) is closed *at the card layer* here (FIX D); any deeper fix to the ranking
  recommendation text is Chapter 3's.
- **Two altitudes the produced card must serve (§8.8, operator's surface = owner's glance):** the
  Choosable card must be **operator-passable-upward**, not merely owner-glanceable. The owner may never
  log in; the operator (front-desk / office manager) is who actually reads the surface and passes the
  one move up. Write the comparison so it survives that hop intact: a specific, numbered, relief-first
  line the operator can forward as-is, without translation, and the owner can act on at a glance.

---

## Ground truth verified on dev/dave (2026-07-07)
- The card engine is the **SUMMARY (v2)** monthly agent. Its prompt is `src/agents/monthlyAgents/Summary.md`.
  It emits `top_actions[]`; each becomes a USER task rendered by `OneThingBanner` via `useTopAction`
  (`frontend/src/components/dashboard/focus/OneThingBanner.tsx:32`).
- Every `supporting_metrics[*].source_field` an action cites **must resolve to a real dotted path inside
  the `dashboard_metrics` dictionary**, enforced post-generation by `validateSummarySupportingMetrics`
  (`src/controllers/agents/feature-utils/summaryV2Validators.ts:100`), which walks the path with
  `lookupDottedPath` (`:22`, called at `:112`). The validator is **structural**: it accepts any path
  that exists in the dictionary. So adding a new `choosable` section makes `choosable.*` legally citable
  with no allowlist edit.
- The dictionary is built by `computeDashboardMetrics` (`src/utils/dashboard-metrics/service.dashboard-metrics.ts:56`)
  from six section builders (`sectionBuilders.ts`). **None of the six reads `location_competitors`.**
  `buildRankingMetrics` (`sectionBuilders.ts:160`) reads only the practice's OWN ranking row; `buildReviewsMetrics`
  (`sectionBuilders.ts:41`) reads only the practice's OWN GBP review count/rating. There is **no competitor
  comparison anywhere in the dictionary**: this is the whole gap.
- The public competitor data DOES exist: `LocationCompetitorModel.findActiveByLocationId(locationId)`
  (`src/models/LocationCompetitorModel.ts:108`) returns rows carrying `review_count` (`:36`), `rating`,
  `website` (`:40`), `photo_name` (`:41`), `discovery_checked_at` (`:45`), and
  `profile_strength_score` (`:47`). The scoring is a pure function:
  `calculateProfileStrength(...)` (`src/controllers/practice-ranking/feature-utils/util.competitor-profile-strength.ts:18`),
  verified as 30 pts rating + 35 pts review count + completeness (website 8, phone 7, category 8,
  coords 7, photo 5) at `util.competitor-profile-strength.ts:62-73`.
- The practice's OWN review count and rating are already in the dictionary as
  `reviews.total_review_count` (`types.ts:31`) and `reviews.current_rating` (`:30`). The comparison needs
  no new fetch for the practice side, only the competitor side.

---

## FIX A: give the card engine the competitor comparison (the core)
- **Owner sees (today):** "get more reviews": generic homework, not caught from anything they can't see.
  The card can't reference the competitors the patient is actually comparing them to, because that data
  never reaches the engine.
- **Root cause:** `dashboard_metrics` has six sections (`src/utils/dashboard-metrics/types.ts:191`
  `DashboardMetrics`) and none is a Choosable comparison. `computeDashboardMetrics`
  (`service.dashboard-metrics.ts:173–191`) assembles reviews/gbp/ranking/form_submissions/pms/referral and
  stops. The SUMMARY agent therefore has no grounded path to a competitor review count, so it cannot
  build the framework's comparison read (substrate: journey-lattice.md:201) and falls back to generic advice.
- **The fix (new deterministic section, reuse the section-builder pattern exactly):**
  1. **New type + Zod**, `types.ts` after the referral section (~`:185`), and add the key to BOTH the
     interface `DashboardMetrics` (`:191`) and (critically) the `.strict()` schema
     `DashboardMetricsSchema` (`:200`), which will REJECT an unknown key otherwise:
     ```ts
     export interface ChoosableMetrics {
       has_competitor_set: boolean;          // false → whole section is informational only
       competitor_count: number;             // curated competitors compared against
       practice_review_count: number | null; // = reviews.total_review_count, echoed for grounding
       practice_rating: number | null;       // = reviews.current_rating
       competitor_median_review_count: number | null;
       strongest_competitor_name: string | null;      // most reviews among the set
       strongest_competitor_review_count: number | null;
       competitors_ahead_on_reviews: number | null;   // count with more reviews than the practice
       review_count_gap_to_median: number | null;      // median − practice; >0 means practice trails
       practice_leads_on_reviews: boolean | null;       // practice ≥ median (kills the contradiction)
       as_of: string | null;                            // oldest competitor discovery_checked_at (freshness)
     }
     ```
     All fields null/false when no competitor set exists (never fabricated).
  2. **New builder** `buildChoosableMetrics(locationId, reviews)` in `sectionBuilders.ts` (append after
     `buildReferralMetrics`, `:432`), following the same best-effort, never-throw contract as its
     siblings:
     - If `locationId` is null → return the empty section (`has_competitor_set: false`, all nulls).
     - `const competitors = await LocationCompetitorModel.findActiveByLocationId(locationId)`
       (`LocationCompetitorModel.ts:108`). If empty → empty section.
     - Practice side comes straight from the already-computed `reviews` argument
       (`reviews.total_review_count`, `reviews.current_rating`): **no new fetch, no second source of
       truth** (mirrors Chapter 1's "one true source per number" rule).
     - Compute median/strongest/`competitors_ahead_on_reviews` from `competitor.review_count` (skip null
       counts). `review_count_gap_to_median = median − practice_review_count` (null if either side null).
       `practice_leads_on_reviews = practice_review_count >= median`.
     - `as_of` = the oldest `discovery_checked_at` in the set, so the card can be honest about freshness.
  3. **Wire it** in `computeDashboardMetrics`: add `const choosable = await buildChoosableMetrics(locationId, reviews);`
     right after `const reviews = ...` (`service.dashboard-metrics.ts:173`) and add `choosable` to the
     `result` object (`:185`). The trailing `DashboardMetricsSchema.safeParse(result)` (~`:197`) then
     validates the new shape.
- **Source of truth:** practice side = `dashboard_metrics.reviews.*` (already GBP-derived); competitor
  side = `location_competitors.review_count` rows (captured at competitor discovery/refresh). One number,
  one source, each side.
- **Done when:** for a location with a curated competitor set, `dashboard_metrics.choosable` is populated
  with real numbers that match the `location_competitors` rows and the practice's GBP review count; for a
  location with no competitors, the section is present with `has_competitor_set:false` and all nulls, and
  the SUMMARY validator still passes (verify via a dictionary dump for Garrison, Artful/Pawlak, One Endo).

## FIX B: add the other Choosable dimensions HONESTLY (reuse the strength function)
- **Owner sees (today):** review count is the only Choosable lever the engine can reason about; photos,
  website presence, and profile completeness (all named Choosable mechanisms in the framework:
  substrate journey-lattice.md:102, 108-111) are invisible to it.
- **Root cause:** `calculateProfileStrength` (`util.competitor-profile-strength.ts:18`) runs **only for
  competitors** (via `withProfileStrength`, `:90`). The practice never gets a comparable score, so there
  is no like-for-like Choosable read.
- **The fix (pure reuse, no new scoring logic):** inside `buildChoosableMetrics`, call the EXISTING
  `calculateProfileStrength({...})` for the practice using the signals we actually have, and add to the
  `ChoosableMetrics` section:
  ```ts
  practice_profile_strength: number | null;   // 0-100, same scale as competitors (see caveat below)
  competitor_median_profile_strength: number | null;
  weakest_choosable_factor: "reviews" | "rating" | "photo" | "website" | null;
  ```
  - Feed `rating: reviews.current_rating`, `reviewCount: reviews.total_review_count`. These two are known.
  - **HONESTY GATE (do not skip), and a correction to a naive read of the function:** `hasWebsite` /
    `hasPhone` / `hasPhoto` / `hasCategory` for the practice's OWN listing are **not reliably present**
    in the current dashboard GBP fetch (`fetchGBPDataForRange`, `dataAggregator.ts:48`, returns the
    practice's review/insight data, not verified place-detail completeness). **VERIFIED CODE FACT that
    changes the design:** `calculateProfileStrength` coerces each completeness input with
    `Boolean(input.website)` etc. (`util.competitor-profile-strength.ts:38-42`), so a missing/`undefined`
    factor collapses to `false` and is scored identically to a confirmed absence (0 pts). The function
    therefore **cannot distinguish "unknown" from "absent"** in its score. Consequences we MUST honor:
    - Do NOT assert absence from a null. Passing `undefined` does not mark a factor "unknown" to the
      function; it scores it as absent. So we must never READ presence/absence off the raw score (Value
      #6: `Boolean(x)` asserts absence, not unknown).
    - Because unknown completeness deflates the score, `practice_profile_strength` is **only comparable
      like-for-like when the practice's completeness factors are actually known.** When they are not,
      either set `practice_profile_strength: null` (preferred) or compute it and treat it as
      lower-bound-only, NOT as an equal-footing comparison. Do not present a deflated score as if the
      practice genuinely scored low on completeness.
  - `weakest_choosable_factor` is derived ONLY from factors we actually measured (review count vs
    competitors, rating vs competitors, and photo/website ONLY when the practice's own presence is
    independently confirmed present-or-absent, not inferred from the score). If we only know reviews +
    rating, the weakest factor is chosen from those two. **Never name "photo" or "website" as the weak
    factor from a null or from a 0 that only means "unknown."**
- **Scope honesty (state plainly in the card rules, FIX C):** this gives **presence and quantity**, never
  **quality**. "Photo quality" and "website first impression looks dated/unprofessional"
  (substrate: journey-lattice.md:108, 110) are NOT computable from any signal in the tree today (see
  UNRESOLVED). The card may say "a competitor ranked near you has photos and a website; your listing is
  missing a photo" **only when the practice's own presence is independently confirmed**; it must NEVER
  assert design quality.
- **Done when:** `dashboard_metrics.choosable.practice_profile_strength` is either a real 0-100 score
  built from confirmed factors, or `null` when the practice's completeness is unknown (never a
  silently-deflated score presented as comparable); any factor whose practice-side value is unknown is
  absent from `weakest_choosable_factor` consideration (confirm with a case where the practice's
  photo/website presence is unknown: the field must fall back to reviews/rating, not claim a missing photo).

## FIX C: teach the card engine to surface the Choosable choose-signal (relief-first, hand ask to Ch6)
- **Owner sees (today):** even with the data, the SUMMARY prompt has no instruction to read the
  comparison, and its only review guidance (`Summary.md:105` "REVIEW VERBIAGE RULES") is about
  replying to unanswered reviews, not about the competitive comparison that informs Stage 3.
- **Root cause:** `Summary.md` never mentions the Choosable comparison. Its grounded key list
  (`Summary.md:30`, `:77`, `:168`) is `reviews, gbp, ranking, form_submissions, pms, referral`: no
  `choosable`.
- **Ownership boundary (from the reconciliation directive):** Chapter 4 owns the READ (the choosable
  comparison as a grounded *choose-signal* and its truth-guard). It does **NOT** own the review ASK card
  ("ask N patients to leave a review"): that action, and the review-velocity/reply moves, are authored
  by **Chapter 6 (Memorable)**. So this chapter's prompt edits make the comparison *citable and framed*,
  and explicitly hand the review-ask candidate to Chapter 6; they must **not** add a competing
  "emit a review-ask action" instruction. The concrete review-ask verbiage lives in Chapter 6's edits.
- **The fix (prompt-only, no code):** in `src/agents/monthlyAgents/Summary.md`:
  1. Add `choosable` to the enumerated valid `source_field` top-level keys in all three places
     (`:30`, `:77`, `:168`) so the model knows it may cite `choosable.*` (e.g.
     `choosable.strongest_competitor_review_count`, `choosable.review_count_gap_to_median`,
     `choosable.practice_review_count`). No change to `TopActionSchema` (`agent-output-schemas.ts:358`)
     or the domain enum is needed; a review-count-gap read stays in the `review` domain.
  2. Add a new block after "REVIEW VERBIAGE RULES" (`:105`):
     ```
     CHOOSABLE COMPARISON RULES (STRICT)
     Stage 3 (Consideration) is where the most revenue leaks: the {{customer}} found the
     {{org_noun}} and is choosing between it and its competitors. When choosable.has_competitor_set
     is true AND choosable.practice_leads_on_reviews is false, the review-count gap is a real
     Choosable signal. Surface it as the DETAIL of the review domain_summary (see DOMAIN SUMMARIES),
     framed as the competitor comparison. Do NOT invent a separate "run a review campaign" action
     here; the concrete review-ask top_action is governed by the review-ask rules (Chapter 6). This
     block governs how the comparison is READ and stated, not the ask itself.
     - Name the specific gap with real numbers: the practice's review count
       (choosable.practice_review_count) vs the strongest competitor
       (choosable.strongest_competitor_name, choosable.strongest_competitor_review_count) or the
       set median (choosable.competitor_median_review_count). Cite them via supporting_metrics
       source_field = choosable.* paths.
     - RELIEF-FIRST FRAMING (non-negotiable): open on where they stand, not on failure. Forbidden:
       "you are failing," "you are losing," "0 leads," "you are behind." Allowed shape: "You have
       {N} reviews; the practices ranked near you average {M}. Closing that gap is the highest-leverage
       way to improve how {{customers}} choose you." State the fact, calmly, not alarmed. Never predict
       a magnitude of gain (the OUTCOME RULE still applies).
     - PRESENCE, NEVER QUALITY: you may reference photo/website ONLY as presence and ONLY when the
       choosable factor for it is non-null. NEVER claim a website "looks dated," is "unprofessional,"
       or that photos are "low quality": that data does not exist. If choosable.weakest_choosable_factor
       is "photo" or "website", speak only to presence.
     - Qualify freshness when it matters: competitor counts are as of choosable.as_of.
     ```
  3. Add a `domain_summaries` note (the `DOMAIN SUMMARIES` block, `:122`): a `review` domain summary may
     use the choosable comparison as its "detail" when a set exists (same grounding + framing rules).
     This is where Chapter 4's read lands; the review-ask top_action that acts on it is emitted per
     Chapter 6.
- **Done when:** on a real account where the practice trails its competitors on reviews (verify against
  a real account's actual `location_competitors`), the SUMMARY agent's `review` domain_summary names the
  specific competitor gap with numbers that pass `validateSummarySupportingMetrics`, phrased
  relief-first, with no photo/website quality claim and no "you're failing" phrasing; and it does NOT
  emit a second, competing review-ask card (the single review-ask card is Chapter 6's).

## FIX D: kill the self-contradiction (the "you lead / close the gap" trust bug)
- **Owner sees (illustrative failure mode, not a verified capture):** a practice told it is **#1
  locally** and, at once, to **"close the gap with competitors who have far more reviews."** Both can't
  be the headline move; the card contradicts itself and trust drops (the Stage-3 twin of Chapter 1's
  fabricated "#1"). *(The concrete "441-1026 reviews" pairing quoted earlier is an example of this
  shape, not a confirmed produced card; treat it as illustrative until Dave captures a real one.)*
- **Root cause (verified flow on dev/dave):** the competitor review counts reach the card only through
  the **interpretive** ranking recommendations, which can urge "close the review gap" even for a
  practice that already leads. The monthly processor pulls them via
  `fetchLatestRankingRecommendations(...)` (`src/controllers/agents/feature-services/service.monthly-agent-processor.ts:344`)
  into a local `rankingRecommendations` array, then passes them to Summary as
  `additional_data.ranking_recommendations` (`src/controllers/agents/feature-services/service.agent-input-builder.ts:226`).
  The SUMMARY prompt has no rule to reconcile that interpretive text against the deterministic reality.
- **The fix (card-layer guardrail, in the FIX C block, this chapter's boundary):** add to the CHOOSABLE
  COMPARISON RULES:
  ```
  - ANTI-CONTRADICTION: if choosable.practice_leads_on_reviews is true (the practice is at or above the
    competitor median on reviews), you MUST NOT tell the owner to "close a review gap," regardless of any
    ranking_recommendations wording. A practice that leads on reviews gets either (a) a different,
    truthful Choosable read, or (b) a domain_summary that says reviews are a STRENGTH ("You lead your
    local set on reviews, keep it current"). Never pair "you're #1 / you lead" with "close the gap."
  ```
  The deterministic `choosable.practice_leads_on_reviews` flag (FIX A) is the ground truth that overrides
  the interpretive ranking text. **The deeper fix to the ranking recommendation prompt itself is
  Chapter 3's** (Findable owns the ranking LLM); this chapter only stops the card from shipping the
  contradiction.
- **Done when:** for a real account whose data shows the practice leads its set on reviews, the SUMMARY
  agent never emits a "close the review gap" action or rationale; it either surfaces a different true
  read or frames reviews as a strength. Re-run the monthly agent for that account and read the produced
  task.

---

## How this READ reaches Chancellor quality on THIS data source
The gold standard (One Endo, PMS-gated): *"Call Dental Care at Chancellor Crossing, your single largest
referral source, dropped from 26 referrals to 21 this period. Call them this week."* Specific, caught
something they couldn't see, ONE move. On PUBLIC Choosable data the equivalent READ (numbers below are
**ILLUSTRATIVE placeholders**, not captured from any real account: at build time they must be the
account's real `choosable.*` values, validator-checked) is:

> *"You have {practice_review_count} reviews. The practices Google ranks next to you average
> {competitor_median_review_count}; the strongest, {strongest_competitor_name}, has
> {strongest_competitor_review_count}. That review-count gap is a leading reason patients comparing you
> side-by-side pick them."*

- **Specific:** real counts from `choosable.*` (`practice_review_count`, `competitor_median_review_count`,
  `strongest_competitor_review_count`), each grounded and validator-checked, no fabricated figures.
- **Caught something they couldn't see:** the owner cannot see how their review count stacks against the
  specific competitors the patient is comparing them to; that comparison lived nowhere in the product
  until this chapter.
- **NS1-ATTRIBUTED (recognizably Alloro's caught insight):** the produced read must be recognizably
  *Alloro's* catch, not an ambient fact the owner could have stumbled on anywhere. The "how did they
  know?" Guidara moment (voice rules below) is here an **attribution requirement**, not only a voice
  heuristic: the card should read as *Alloro spotted this competitor gap*, so the insight is credited to
  Alloro (NS1's attributed leg). A true read the owner can't tell came from Alloro fails the NS1 bar.
- **This READ is the front of an attribution LOOP Chapter 6 closes.** The comparison is a one-shot read
  today; paired with a Chapter 6 loop-back it becomes the front of an attribution loop that compounds.
  **Attribute ONLY what the rail CAUSES (Ch7's cross-chapter invariant, FIX 4: attribute the CATCH and the
  ACTION Alloro took, never a CAUSE the rail cannot produce).** After the owner approves the in-lane BUILT
  move (a review REPLY or a GBP POST via Alloro's approve-gated rail), Chapter 6 closes the loop with the
  REAL, logged outcome, what Alloro actually DID: *"Alloro replied to {N} of your reviews this month, on
  your approval."* A reply or a post does NOT create new reviews, so it is **never** credited for a
  review-COUNT rise. If the owner's review count moved, report it as THEIR number and context (*"your
  review count is {N}, up from {M} last period"*), never as *"Alloro made it rise."* Uses data already in
  this chapter; **no new capability.** *({N}/{M} are ILLUSTRATIVE placeholders; real values come from the
  account.)*
- **The ACTION on this gap is Chapter 6's.** Chapter 4 delivers the caught comparison (the READ above);
  the review-ask move that acts on it ("ask N specific patients," per the framework's Fredericksburg
  example, substrate: journey-lattice.md:201, 209) is emitted under Chapter 6's rules, not here.
- **No fabrication, no quality claim:** only counts/ratings/presence that exist; freshness qualified by
  `as_of`; photo/website spoken to as presence only.

## Voice rules this chapter enforces (from substrate: the lattices, alloro-brain, local)
- **Relief-first, never discouraging** (substrate: sentiment-lattice.md The Watchline; journey-lattice.md:161
  "the owner is the hero"). State where they stand, then the move. Kill "you're failing / losing / 0 leads."
- **Plain, fifth-grade, no jargon** (substrate: journey-lattice.md:164; and Summary.md's own plain-language
  rule). "Reviews," "photos," "your website"; never "E-E-A-T," "citation authority," "conversion rate."
- **Trend/comparison-focused, one action** (substrate: journey-lattice.md:166, 192, 207 "never more than
  one recommendation"). The read names ONE competitor gap; the single action is Chapter 6's.
- **Proof, not a number-in-a-vacuum** (substrate: sentiment-lattice.md "Score Rings Removed"): the
  comparison is a narrative (what's happening: they're being out-reviewed) not a bare score.
- **Heuristics that apply** (substrate: knowledge-lattice.md): Cialdini (social proof, reviews ARE the
  Stage-3 proof patients weigh); Rogers/Moore (a pragmatist ICP moves on documented specifics, not vague
  "improve reviews"); Guidara (name the specific competitor nobody told them about, the "how did they
  know?" moment); Theranos (never a number you can't show, hence the strict grounding +
  presence-not-quality gate).

## The staking gates (the humans own the truth)
- **Corey** stakes the framing (a relief-first Choosable comparison READ is the right Stage-3 signal, and
  the review-ask belongs to Chapter 6) and that the honest scope (quantity/presence, not quality) is
  acceptable for the first slice.
- **Dave / his Claude** implements FIX A/B (code) and FIX C/D (prompt), and **verifies against a real
  practice's live `location_competitors` before merge**: the numbers in the produced read must match the
  actual competitor rows and the practice's real GBP review count. Confirm a review-leading practice's
  card no longer self-contradicts, and that Chapter 4 emits no competing review-ask card. Run
  `npm run build` (tsc clean): the `.strict()` schema change in `types.ts` is the one place a missing key
  will fail the build, which is the intended guard.

## Scope boundary
This chapter makes the Choosable **READ** real on public data (review/rating comparison + honest presence)
and hands the review-ask to Chapter 6. It does NOT build website-first-impression QUALITY (not in the
tree, see UNRESOLVED), does NOT build the "80 visitors, 0 leads" conversion screen
(`WebsiteOverview.tsx:238`, Chapter 5), does NOT own the review-ask card (Chapter 6), and does NOT
rewrite the ranking recommendation LLM (Chapter 3). It depends on Chapter 1 (data truth) being landed so
`reviews.*` and the rank numbers it sits beside are already honest.

## UNRESOLVED (could not be grounded; flagged honestly, not assumed)
1. **Website first-impression QUALITY does not exist in the code.** The only website signal is Rybbit
   analytics (sessions/bounce), which `computeDashboardMetrics` explicitly **no-ops** and does not read
   into any dictionary field (verified: `service.dashboard-metrics.ts:166-170` comment "Rybbit data is
   not a source for any DashboardMetrics field today" + `void fetchRybbitMonthlyComparison`). There is no
   read of whether the site is dated, mobile-friendly, or has a clear CTA. This chapter therefore covers
   website only as **presence** (from profile strength), and only when the practice's own presence is
   confirmed. A true first-impression read (e.g. a Lighthouse/render pass on the practice URL) would be
   new capability, out of scope here; flag for a future chapter.
2. **Photo QUALITY does not exist:** only `hasPhoto` (at least one photo present), a boolean in the
   profile-strength factors. "Generic stock images" (substrate: journey-lattice.md:110) is not
   detectable. Presence only.
3. **The practice's OWN website/photo/phone presence may not be reliably available** in the current
   dashboard GBP fetch. FIX B handles this honestly: because `calculateProfileStrength` collapses a
   missing factor to `false` (scored as absent, not "unknown"), the read must NOT assert absence from a
   null and `practice_profile_strength` is null-or-lower-bound when completeness is unknown. In practice
   this means the Choosable read leads with the review/rating gap (which IS fully grounded) and references
   photo/website only when presence is confirmed. If Dave confirms the practice's place-detail
   completeness is fetchable cheaply, FIX B can widen; until then, reviews/rating is the load-bearing
   signal.
4. **Competitor review counts are as-of discovery, not live.** `location_competitors.review_count` is
   captured at competitor discovery/refresh (`discovery_checked_at`), not re-pulled monthly. The `as_of`
   field surfaces this so the read is honest; a staleness threshold (e.g. suppress the gap read if the set
   is >90 days old) is a judgment call for Dave/Corey, not assumed here.

---

## Revision Log

### Rev 1, 2026-07-07
- **Change:** Frame-sharpening pass against the 2026-07-07 staked frame (`strategy/inversion-frame-validation.md`),
  applied as ADDITIVE framing only, no rework of this chapter, which stays a READ and is the cleanest
  chapter on scope/honesty. Three additions: (1) a two-altitude note in "What this chapter owns" naming that
  the produced Choosable card must be **operator-passable-upward**, not just owner-glanceable (§8.8,
  operator's surface = owner's glance); (2) an **NS1-ATTRIBUTED** bullet in "How this READ reaches Chancellor
  quality" naming that the read must be recognizably Alloro's caught insight ("how did they know?" as an
  attribution requirement, not only a voice heuristic); (3) a forward-hook bullet turning the one-shot
  comparison READ into the front of an **attribution LOOP** that Chapter 6 closes, re-reading the same
  `choosable.*` / `reviews.total_review_count` signals after the owner acts (via the BUILT, approve-gated
  GBP reply/post rail) and attributing the review-count delta to the move Alloro flagged. All new
  illustrative numbers ({N}/{N+7}) are flagged as placeholders.
- **Reason:** Frame validation, the 7/07 stake (Value #2 split, done-for-you definition, NS1-attributed,
  two-altitude §8 owner-glance/operator-surface) was staked AFTER this spec was written 2026-07-06, and the
  attribution leg + operator altitude were absent across all six inversion chapters. Honesty preserved: the
  "Alloro did it" attribution is truthful only for the BUILT, approve-gated GBP post/reply rail; unbuilt
  rails (photos, category, review-generation, booking, PMS) stay read-only. The coherence guard (FIX D),
  presence-only-never-quality scoping (FIX B/C), and every illustrative-number flag are unchanged.
- **Updated Done criteria:** none (additive framing; no new build task, no change to FIX A/B/C/D acceptance
  criteria). The forward-hook's attributed loop-back is executed under Chapter 6, not here.
