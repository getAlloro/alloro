# Inversion, Slice 2: The Card Standard (the unified quality bar)

*Draft spec for Dave's Claude (`alloro-engineer`). Staged for Corey's review; not yet on Jo's board.
Written to be executed from the repo. Every `src/…` and `frontend/…` file:line below is real code,
verified on `origin/dev/dave`. Citations tagged `(substrate)` point to `*-lattice.md` files, which are
alloro-brain **local substrate (not in `origin/dev/dave`)**, i.e. the design intent, not shipped code. 2026-07-06.
Depends on Slice 1 (Data Truth) landing first: a specific card built on a false number is worse than a generic one.*

---

## Why this exists (read first: the owner, not the code)

A scared owner opens Alloro to answer one question in 30 seconds: *is my business healthy, where am
I leaking, and what is the one move this week?* The Journey Lattice locks the promise, *"The
recommendation is the product. Everything else is supporting evidence."* (journey-lattice.md (substrate):213).

Right now, when the owner has uploaded PMS data, Alloro delivers exactly that. The live gold standard
(One Endodontics, PMS-gated):

> *"Call Dental Care at Chancellor Crossing, your single largest referral source, dropped from 26
> referrals to 21 this period. Call them this week."*

Specific. It caught something the owner could not see themselves. Exactly one move: verb (call) +
object (Dental Care at Chancellor Crossing) + when (this week).

But **before** the owner uploads anything, the zero-upload state every prospect and new customer
starts in, the same product says *"get more reviews"* and *"start posting to Google Business Profile
weekly."* That is homework any tool gives. It is not caught-from-data-they-can't-read, it is not one
named move, and it does not make the owner feel their business was seen. Worse, in places it
*discourages*: *"Your website turned [N] visitors into 0 leads this month"* (illustrative; live value
is `monthVisitors`) reads as *"you are failing,"* not *"here is your move."* And it sometimes contradicts the owner's real standing, telling
a practice that ranks **#1** to "close the gap" with competitors who have more reviews.

**This slice defines the one bar every card must clear, the Chancellor bar, and fixes the
zero-upload path so it clears that bar on PUBLIC data, without a single fabricated number and without
discouraging the owner.** The visual UI is already clean; the gap is **content** (advice + framing +
coherence), not chrome. Minimum rework, reuse over rebuild.

---

## THE CARD STANDARD (the one acceptance gate)

A "card" is any owner-facing recommendation surface: the Rankings "Best next actions" card
(NextMoves), the Rankings-Hub top action, the Website overview insight, the monthly Top Action, a
domain summary strip. **One bar governs all of them.** A card PASSES only if it clears every clause
below. If it fails any clause, it is rejected, show *less* (or the honest "we're still gathering
signal" empty state) rather than ship a card that fails the bar.

**Two altitudes, one card (the two seats, icp-spine §8.8).** "Owner-facing" is two surfaces, not one,
and this slice must name both. The **owner** gets a *pushed glance*: the one-line verdict plus the one
command, read in ~30 seconds, often in a digest they never log in to see. The **operator**, the office
manager or marketing coordinator who actually runs the account, gets the *operable surface* beneath it:
the same card with the approve button, the drafted reply, the evidence to sign off on. §8.8: the
operator's operable surface *is* the owner's glance, one altitude down. Every card here serves both,
legible to the owner at a glance, actionable by the operator on the surface. A card that only informs the
owner, with nowhere for the operator to execute the move, half-fails.

### Clause A: Specific (caught-something-the-owner-couldn't-see)
The card names **one concrete subject** the owner could not surface by glancing at their own Google
profile: a *named* competitor, a *named* referral source, a *named* ranking factor, a *named* page,
and **one real number** that traces to input data (a rank, a count, a delta, a gap). Guidara's test:
*"one specific thing about this practice nobody else would notice"* (knowledge-lattice.md (substrate):358). A card
that could be pasted onto any practice in the vertical FAILS Clause A. ("Get more reviews" fails,
true of everyone. "You rank #4; the three practices above you each added reviews last month while
yours has been quiet since [month]" passes.)

**Attribute the catch (NS1).** When the card surfaces something the owner couldn't see, name the finder:
*"Alloro spotted that…"*, the catch is Alloro's, and saying so is what converts a true number into felt
value (NS1's attributed leg). A bare finding with no author reads as a dashboard stat the owner has to
interpret; the attribution is what makes the owner feel *seen*, not just informed.

### Clause B: Exactly ONE move this week (verb + object + when)
The card ends in a single action the owner can act on **this week**, written as **verb + object +
when**. One move, never a list (journey-lattice.md (substrate):207, *"Never show more than one recommendation at
a time"*; :208, *"Never recommend something the owner can't act on this week"*). Fogg's bar: the step
is small enough to feel effortless, not a project (knowledge-lattice.md (substrate):368). "Rebrand your practice"
FAILS. "Reply to the 4 Google reviews left this month" passes.

**Who executes the one move (BUILT in-lane rails, owner commands, Alloro executes on approval).** The
verb+object+when still governs the move, but for the two moves Alloro can actually run, replying to
Google reviews and posting to the Google Business Profile (both **BUILT + WIRED** on `origin/dev/dave`,
behind a human approve-gate: `gbp-write.service.ts` publish/reply paths), the card does **not** hand the
owner homework to go do. It surfaces the insight (so the owner still *sees* what was caught and stays
capable), then ends in a **command, not a chore**: **"Alloro drafted this reply, approve,"** and after
approval, **"Alloro replied for you, here's the result."** The owner *commands*; Alloro *executes on
approval*. The only truthful phrasing is "Alloro drafts it and, on your approval, publishes/replies for
you", never silent-autonomous, never "we already posted." For moves on rails Alloro has **not** built
(GBP photo-refresh, category write-back, review-generation, booking, PMS), the card stays a read-only
observation the owner can act on, it never claims Alloro will do it, and never sends the owner homework
dressed as a rail.

### Clause C: Translation-Layer voice (journey-lattice.md (substrate):159-182)
The card is written in the owner's plain English, not agency-speak:
- **Owner is the hero, Alloro is the guide** (:161).
- **No jargon**, no "SERP," "DA," "GBP," "SEO," "NAP," "E-E-A-T" without the plain-English noun
  standing in its place (:162, :210). The one exception the code already honors: the acronym may
  appear when it *is* the object being fixed ("fix the NAP mismatch"), but the card must still say what
  it means.
- **Trend-focused**, *"up from #3 last week"* beats *"23% above benchmark"* (:166).
- **Action-named**, never a problem without its move (:211).

### Clause D: Relief-first (the fourth-signal frame, journey-lattice.md (substrate):52-54)
The card must **generate relief, not style tone.** The owner arrives from low-grade anxiety, deciding
by feel against three signals (schedule, bank, last agency report); Alloro is *"the fourth signal that
resolves disagreements between the other three"* (:54). So a card opens by placing the owner (are you
healthy, or is this the one thing to watch), THEN states the move. It never opens in evaluation mode
("you turned [N] visitors into 0 leads"). The Standard above both North Stars:
*"Does it make a human feel understood before it makes them feel informed?"* (journey-lattice.md (substrate):32).
Relief is a property of **what the card leads with and whether it caught something real**, not a
softer adjective bolted on.

### Clause E: Coherence (never tell an owner to fix what isn't broken)
The move must not contradict the owner's real standing. If the practice **leads** on a dimension
(ranks #1, or has more reviews than every competitor shown), the card must frame that as *protect the
lead*, never *close the gap*. A card that tells a #1-ranked practice to catch up to competitors it
already beats FAILS Clause E, it destroys trust faster than silence. (This is the live Pawlak/Artful
bug: ranked #1 yet told to close a review gap with practices that hold far more reviews [competitor
counts illustrative, e.g. a 441–1,026 range; confirm against the live account before merge].)

### The rejection rules (fold-in of What We Don't Do + Anti-Patterns)
A card is **rejected**, do not ship it, if it does any of these
(journey-lattice.md (substrate):205-211, 243-256, 260-272):
1. Recommends anything the owner **can't act on this week** (no "rebrand," no "run a campaign").
2. Shows **more than one** move at a time.
3. States a **metric without its translation sentence**, the plain-English "here's what it means and
   what to do" (journey-lattice.md (substrate):264). A bare number is not a card.
4. Uses **marketing jargon** the owner must decode (:270).
5. **Frames a problem without naming the action** (:211).
6. Contradicts the owner's real standing (Clause E).
7. Is **generic**, commodity findings the owner already knows: *"you have fewer reviews,"* *"your
   rating is lower than average,"* *"you should get more reviews"* (this exact list is already
   codified in the Oz-moment prompt at `src/services/ozMoment.ts:232-234`, reuse it).
8. **Fabricates or infers** a number (Value #6, and the Stage-1 Facts-Only boundary,
   sentiment-lattice.md (substrate), never cite referral/dollar data on a zero-upload card).

### The sole-owner trace: where the "1 thing that matters" is generated
This slice owns the trace of the referral "1 thing." It resolves to **two** generators, and the fix
is to make the zero-upload one meet the same bar the PMS one already meets:

- **PMS-gated (already at the bar):** the monthly **Summary v2 "Chief-of-Staff" agent**
  (`src/agents/monthlyAgents/Summary.md`) authors the Chancellor card. Its rules already encode the
  bar: *"Pick exactly 1 action… the one thing that matters most"* (:41-42) and *"ONE subject, ONE next
  step… NEVER bundle"* (:44). The referral one-move is grounded on `referral.top_dropping_source`
  (:171) with the Referral-Engine's own wording preserved verbatim (the passthrough rule). Output
  shape: `TopActionSchema` (`src/controllers/agents/types/agent-output-schemas.ts:358`) inside
  `SummaryV2OutputSchema` (:410-415, `top_actions` min 1). **This agent only runs when PMS +
  referral_engine_output are present**, so it never fires for a zero-upload owner. That is the gap.

  > ⚠️ **CORRECTION (coherence pass, verified on `origin/dev/dave` `service.monthly-agent-processor.ts:152 / :195 / :384`):** the line above is FALSE. The Summary v2 agent runs UNCONDITIONALLY, `pmsData` starts `null` and, when no approved PMS is found, the processor logs "No approved PMS data found" and CONTINUES to invoke SUMMARY anyway (with null PMS). So SUMMARY is NOT PMS-gated. That means a zero-upload owner can receive BOTH a SUMMARY `top_action` (OneThingBanner) AND a ranking-LLM `top_recommendation` (NextMoves), two competing "one move" surfaces, the two-selector split-brain. Do NOT build on the "zero-upload = ranking-LLM only" framing below; the real fix is ONE candidate-card TYPE + ONE selector (see inversion-map's coherence-pass note + the spec-resolution).
- **Zero-upload (below the bar, this slice fixes it):** the practice-ranking LLM
  (`service.ranking-llm.ts:109`) authors `top_recommendations` (the prompt emits exactly 1 item),
  which is what actually renders as the owner's "one move" on the zero-upload dashboard (`NextMoves.tsx:9,49,53` and
  `RankingsHubSurface.tsx:96`). Its prompt says *"Be specific"* (:128) but does not enforce Clauses
  A/B/E, so it emits generic homework. **The fix is to lift that prompt to the same bar, using the
  discipline that already exists in `ozMoment.ts`.**

---

## The frame for Dave (what OUGHT to be there)

This is **not a rebuild.** Every render surface, the schema, and a working Chancellor-grade generator
(`ozMoment.ts`) already exist. Four surgical changes make the zero-upload card clear the bar:
1. Lift the ranking-LLM prompt to the Chancellor bar (the primary generic-advice root cause).
2. Stop the overview sub-line from flattening a specific rec back into generic homework.
3. Define the relief-first bar the discouraging Website insight must clear (Chapter 5 owns the concrete rewrite).
4. Add the coherence guard so a leader is never told to close a gap.

**Minimum rework, maximum reuse.** Where the discipline already exists (`ozMoment.ts`), copy it. No
surface is redesigned.

---

## FIX 1: Lift the zero-upload card to the Chancellor bar (the primary generic-advice fix)

- **Owner sees (zero-upload, all three live customers):** *"Post more Google updates" / "Start posting
  to Google Business Profile weekly" / "get more reviews"*, the "Best next actions" card and the
  Rankings-Hub top action. Generic homework, not a caught-from-data one move. Fails Clauses A, B, D.
- **Root cause:** the card renders `result.llmAnalysis.top_recommendations` **verbatim** (NextMoves
  reads the array at `:9` and maps up to 3 slots via `slice(0, 3)` at `:12,30`, rendering each
  `rec.title`/`rec.description` at `:49,53`; RankingsHubSurface takes `top_recommendations?.[0]` at
  `:96`; the prompt constrains the array to exactly 1 item, so one move shows)
  (`frontend/src/components/dashboard/RankingsDashboard/NextMoves.tsx:9,49,53`;
  `frontend/src/components/dashboard/rankings-hub/RankingsHubSurface.tsx:96`). So specificity is set
  entirely by the generating prompt, `SYSTEM_PROMPT` in
  `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts:109-222`. That prompt asks
  to *"Be specific with numbers and comparisons"* (:128) and keeps `top_recommendations` to *"exactly
  1 item"* (:212), but it does **not** require: naming one competitor, citing one number the owner
  can't self-discover, ending in one verb+object+**this week** move, or banning the commodity findings.
  So the model defaults to safe generic advice.
- **The fix (reuse the pattern that already works):** the Oz-moment prompt is a proven
  Chancellor-grade generator on the SAME public data (GBP + competitor + review signals). Copy its
  discipline into the ranking-LLM `top_recommendations` rules. Specifically, add to the prompt's rules
  block (near `service.ranking-llm.ts:127-129`) and the `top_recommendations` constraint (near :212)
  the following, lifted from `src/services/ozMoment.ts:206-241`:
  1. **Name one competitor or one factor specifically**, never "your competitor," never "the market"
     (ozMoment.ts:207).
  2. **Cite one specific number the owner cannot see by looking at their own Google profile:**
     cross-reference two signals so it feels caught, not obvious (ozMoment.ts:214).
  3. **End in one move phrased as verb + object + this week** (ozMoment.ts:241, *"What to do THIS
     WEEK"*).
  4. **Ban the commodity findings verbatim**, reuse the exact reject list at ozMoment.ts:232-234
     ("you have fewer reviews," "your rating is lower than average," "you should get more reviews").
  5. Keep it inside existing guardrails already in this prompt: no fabricated/estimated numbers, no
     website-performance advice, plain non-technical language (already at :128-140). No new numbers are
     invented, every figure still traces to the ranking inputs (competitor review counts, the sampled
     `search_position`, the lowest ranking factor), honoring Value #6 and the Stage-1 Facts-Only
     boundary (public data only; never referral/dollar figures on a zero-upload card).
- **Do NOT** change the render components (they already show title + description); only the generating prompt changes in THIS fix. **But `TopActionSchema` IS extended, ADDITIVELY, into the one unified candidate-card TYPE, see the section below.**

### THE UNIFIED CANDIDATE-CARD TYPE (coherence-pass resolution 2026-07-07, Corey-staked)
*The coherence pass found the engine had no single card contract, so every generator produced a different shape (SUMMARY's `TopActionSchema`, the ranking-LLM's `top_recommendations`, Ch5/Ch6's `OzMoment`) and Ch7's selector read only SUMMARY, a two-selector split-brain. This defines the ONE contract every generator emits and the one selector consumes.*

**The type = `TopActionSchema` (the existing, richest carrier) extended ADDITIVELY with 3 fields** (additive = backward-compatible; existing outputs still validate, this is NOT a breaking reshape):
- `stage`: the journey stage the card ADDRESSES, the leak it fixes (`findable` | `choosable` | `bookable` | `memorable`), set by the generating chapter, NOT derived from `domain` by a static map. **Reviews = `choosable`** (Corey-staked 2026-07-07: reviews are the choose-signal, so the owner-facing stage is Choosable in BOTH the verdict and the eyebrow). "Memorable" is the internal OWNERSHIP bucket (Ch6 owns the review WORK), never the owner-facing label; ownership is not the stage the owner sees. Ch7's eyebrow reads THIS field (`DOMAIN_TO_STAGE` fallback agrees: review→Choosable).
- `execution_state`: `built` | `read-only` | `handoff`. Makes the FLIP machine-readable: `built` = Alloro drafts + does it on approval + attributes; `read-only` = honest observation (unbuilt rail); `handoff` = owner action (minimize; never owner-homework for an unbuilt rail).
- `generic`: boolean. Ch2's quality flag, `true` fails the Card Standard bar (a generic card is never selected).

**Every generator emits this type:** SUMMARY (`top_actions`), the ranking-LLM (`top_recommendations`; map its `hook`→`rationale`, `action`→`cta`), Ch5 (bookable), Ch6 (memorable). One shape, one pool.

**Ch7's selector reads the WHOLE pool** (all generators) and picks the single highest-priority winner (see Ch7). No generator renders its own competing top-of-dashboard card.

**The WIRING is Dave's** (his HOW): whether each generator writes the type into `dashboard_metrics` fields the selector reads (extends the working Ch4 pattern), or the selector ingests pre-built cards from each pipeline. Both are valid; he owns the code. This spec fixes the CONTRACT, not the plumbing.
- **Ownership note (single owner of this `SYSTEM_PROMPT`):** this FIX owns the *base* Chancellor-bar rule
  in `service.ranking-llm.ts` `SYSTEM_PROMPT` (name a competitor, cite a hidden number, one weekly move,
  ban commodity findings). The Findable-STAGE framing layered on top of it, the top-set (#2/#3) vs
  outside-top-set bands and the specialist-vs-generalist review-count reframe, is **Chapter 3's** (its
  FIX 1 / FIX 2). Chapter 3 references this base rule and does not re-spec it; the two chapters edit the
  same prompt for *different, non-overlapping* rules.
- **Done when:** for each of the three live zero-upload practices (Garrison, Artful/Pawlak, One
  Endo-without-PMS), the "Best next actions" card names one competitor or one factor, cites one real
  number from that practice's ranking data, and ends in one verb+object+this-week move, and none of
  the three read as advice that could be pasted onto any practice. Verify against real data before
  merge (a Claude-to-Claude wire cannot skip this, see the staking gate).

## FIX 2: Stop the overview sub-line from re-flattening a specific rec into generic homework

- **Owner sees:** even after FIX 1 makes `top_recommendations[0]` specific, the Rankings **overview**
  card's "Recommended Action:" tail still says *"Start posting to Google Business Profile weekly"*,
  because that sub-line is generated by keyword-matching, not by reading the specific rec.
- **Root cause:** `frontend/src/components/dashboard/rankingsDashboard.utils.ts:105-133`
  (`getOverviewRecommendedAction`) lowercases the recs, checks whether any contains the substring
  "post" / "review" / "photo", and returns a **hardcoded generic string** for the match (:117 and the
  default at :130 both return *"Start posting to Google Business Profile weekly to …"*). The specific
  title the model wrote is discarded.
- **The fix (minimum diff):** when `top_recommendations[0]` exists, the overview recommended-action
  should be the **specific rec's own title** (already plain-English and ≤160 chars per the prompt),
  not a keyword-derived generic. Fall back to the existing hardcoded strings ONLY when
  `top_recommendations` is empty. Keep the existing `isLocalSearchLeader` branch as the coherence
  guard (see FIX 4). This is a single function edit; the callers
  (`getStructuredOverviewInsight:133-146`, `getOverviewDisplayInsight:149-163`) are unchanged.
- **Done when:** the overview "Recommended Action:" tail matches the specific move shown in "Best next
  actions" for the same practice, no practice shows a generic tail while its Best-next-action is
  specific.

## FIX 3: Define the relief-first bar for the Website insight (Chapter 5 owns the rewrite)

- **Owner sees (Pawlak/Artful and any low-lead month):** *"Your website turned [N] visitors into 0
  leads this month."* (numbers illustrative; the live values are `monthVisitors`/`monthLeads`.) Opens
  in evaluation mode, reads as failure. Fails Clause D.
- **Root cause:** `frontend/src/components/website/overview/WebsiteOverview.tsx:238` builds the insight
  as `Your website turned ${monthVisitors} visitors into ${monthLeads} ${leadWord} this month.`, a
  bare deficit statement with no move. (The connected-but-zero empty state at :437 already reads the
  honest, non-discouraging *"No leads yet"*, mirror that tone.)
- **What this slice owns (the bar, not the rewrite):** per the single-ownership directive, this slice
  fixes only the *standard* the `:238` line must clear, Clause D relief-first: (a) place the owner
  before it informs, (b) name one this-week move, (c) invent no number (`monthVisitors`/`monthLeads`
  are the same fields already in scope), (d) keep the honest `hasAnalytics === false` branch (:239) and
  `insightHighlights` (:240) intact. Structure per the Translation-Layer examples
  (journey-lattice.md (substrate):176, 180): plain sentence of what's happening, the likely bottleneck,
  one this-week move. **The concrete rewrite of the `:238` string is owned end-to-end by Chapter 5
  (Bookable), FIX 5.1**, so exactly one rewrite of this string ships. This slice does not prescribe the
  replacement copy.
- **Done when:** the Clause D bar for the Website insight is stated here and handed to Chapter 5;
  Chapter 5 verifies the rewritten zero-lead insight leads with the owner's situation (not "0 leads")
  and ends in one this-week move, with no Website surface stating a bare deficit without a named action.

## FIX 4: Coherence guard (a leader is never told to close a gap)

- **Owner sees (Pawlak, the live trust-breaker):** ranked **#1**, yet the recommendation frames a gap
  with competitors who hold far more reviews (illustrative range e.g. 441–1,026; confirm against the
  live account before merge), "close the gap" advice given to the market leader.
  Fails Clause E; erodes trust in every other number.
- **Root cause:** two spots lack a leader-coherence check:
  1. The ranking-LLM prompt (`service.ranking-llm.ts:109-222`) produces `gaps[]` and
     `top_recommendations` without a rule that says *when the practice already leads a dimension, do
     not frame that dimension as a deficit.* (The prompt has a #1-vs-not format only for
     `overview_card.text`, not for the actual recommendation or gaps.)
  2. The overview fallback `getOverviewRecommendedAction`
     (`frontend/src/components/dashboard/rankingsDashboard.utils.ts:105-133`) already handles the
     review case correctly via `isLocalSearchLeader` (flag defined :110-111; the review branch :120-123
     returns "protect trust signals" when leading), but only for the hardcoded strings, and only for
     the review branch.
- **The fix (minimum diff, prompt-side is primary):**
  1. Add one rule to the ranking-LLM prompt rules block (near :127-129): *"If the practice ranks #1 or
     leads a dimension (more reviews / higher rating than every competitor shown), never frame that
     dimension as a gap or tell them to 'catch up' / 'close the gap.' Frame the strongest dimension as
     'protect the lead' and point the one move at the true weakest signal instead."* This enforces
     Clause E at the source.
  2. Keep the existing frontend `isLocalSearchLeader` branch as a belt-and-suspenders guard; no change
     needed there beyond what FIX 2 already touches.
- **Done when:** for any practice that ranks #1 or out-reviews every competitor shown, no card, gap, or
  recommended-action tells them to close a gap on the dimension they lead, the leader dimension reads
  "protect the lead" and the one move targets the real weakest signal. Verify specifically against the
  Pawlak/Artful account before merge.

---

## How these cards reach Chancellor quality on PUBLIC data (the standard, restated for this data source)

The zero-upload card runs on public signals only, the sampled Google Maps `search_position`, the GBP
review count/rating/recency, competitor review counts, the lowest weighted ranking factor. That is
enough to clear the bar without fabrication:
- **Specific (Clause A):** name the one competitor above them, or the one factor dragging their rank,
  with its real number. (Not "get more reviews", "the three practices ranked above you each added
  reviews last month; yours has been quiet since [month].")
- **Caught-unseen:** cross-reference two public signals (rank vs. review recency; leader is a
  generalist vs. this specialist) so the finding feels private, the Oz discipline
  (ozMoment.ts:214-231), not something the owner sees on their own profile.
- **One move (Clause B):** one verb + object + this week, sized to be doable, never a project. The move
  stays specific (Clause A). For the BUILT in-lane rails it is a **command Alloro executes on approval**,
  not homework, e.g. *"Alloro drafted replies to the [N] reviews left since [month], approve"*
  (review-reply is built + wired). Where the rail is unbuilt (photos, category), the card stays a
  **read-only observation**, *"the competitor ranked above you shows [service] photos you don't"*, never
  "go add photos", and never a claim Alloro will do it. Attribute the catch either way (*"Alloro
  spotted…"*), and never ship generic homework like "add photos" or "post weekly".
- **Relief-first (Clause D):** lead by placing the owner (leading, holding, or one thing to watch),
  then the move.
- **No fabrication (rejection rule 8):** every number traces to a ranking input; referral/dollar
  figures are Stage-3/PMS-only and never appear on a zero-upload card.

The PMS-gated Chancellor card (Summary v2) already meets this on richer data; this slice brings the
zero-upload card to the same bar on the data it legitimately has.

---

## The staking gates (the humans own the truth)
- **Corey** stakes that the bar is right (this is the vision's "the recommendation is the product") and
  that the reframed voice lands as relief, not softened failure.
- **Dave / his Claude** implements the prompt + copy diffs and **verifies each card against a real
  practice's live public data before merge**, the card on screen must be specific, caught-unseen,
  one-move, coherent, and relief-first for Garrison, Artful/Pawlak, and One Endo. TypeScript compiling
  is not proof a card passes the bar; walk it as the owner with a screenshot (the truth-gate a
  Claude-to-Claude wire cannot skip).

## Scope boundary (what this slice is NOT)
- **The "AND do it" done-for-you half is AUTHORED-FOR here; execution ships next (not a permanent non-goal).**
  This slice does not wire the execution rail into these cards, but every card is *authored to become* the
  owned rail, not a permanent read-only tip. For the two BUILT in-lane rails (GBP posts, review replies)
  the card is already written to end in "Alloro drafted this, approve" → "Alloro did it," so the
  approve-and-publish flow (built + wired in `gbp-write.service.ts`, behind the human approve-gate) drops
  in behind these specific cards as the next increment, NS2's owned execution rail, not a track that may
  never come. This slice closes the **specific-vs-generic** half (Gap 1): name the right one move, and
  shape the card so execution snaps in behind it. For unbuilt rails (photo-refresh, category, booking,
  PMS), the card stays a read-only observation until those rails exist.
- **The specific Pawlak-screen instance walkthrough is owned by Chapter 5.** This slice provides the
  coherence *principle* and the source-level guard (FIX 4, Gap 4b coherence half); Chapter 5 owns
  proving the specific Pawlak screen renders correctly end-to-end.
- **The relief PRINCIPLE (fourth-signal framing that generates relief) is defined here (Gap 2);** the
  specific Pawlak-screen relief instance, and the concrete `WebsiteOverview.tsx:238` rewrite (FIX 5.1),
  are Chapter 5's. This slice defines only the Clause D bar that rewrite must clear (FIX 3).
- **Data truth is Slice 1.** This slice assumes every displayed number is already true and consistent
  (rank #1-vs-#3, review-count, "not connected yet"). A specific card on a false number is worse than a
  generic one, land Slice 1 first.

---

## Anchors used
*Code anchors (`src/…`, `frontend/…`) verified on `origin/dev/dave`. The `*-lattice.md` citations
tagged `(substrate)` are alloro-brain local substrate (design intent), NOT in `origin/dev/dave`.*
- `src/agents/monthlyAgents/Summary.md:41-44, :171`, PMS-gated Chancellor generator; "one thing," ONE
  subject, `referral.top_dropping_source`.
- `src/controllers/agents/types/agent-output-schemas.ts:358, :410-415`, `TopActionSchema`,
  `SummaryV2OutputSchema` (`top_actions` min 1).
- `frontend/src/hooks/queries/useTopAction.ts`, frontend `TopAction`/`DomainSummary` shape (referral
  domain).
- `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts:109, :127-140, :212, :222`:
  zero-upload card generator (`SYSTEM_PROMPT`, rules, `top_recommendations` = 1 item).
- `frontend/src/components/dashboard/RankingsDashboard/NextMoves.tsx:9, :49, :53`, renders
  `top_recommendations` title/description verbatim (maps up to 3 slots via `slice(0, 3)`; the prompt
  emits exactly 1, so this is the primary "one move" card).
- `frontend/src/components/dashboard/rankings-hub/RankingsHubSurface.tsx:96`, top action =
  `top_recommendations[0]`.
- `frontend/src/components/dashboard/rankingsDashboard.utils.ts:105-133`, `getOverviewRecommendedAction`
  generic keyword flatten (:117, :130 hardcoded "Start posting…"); `:110-111` defines
  `isLocalSearchLeader`, `:120-123` its review branch.
- `frontend/src/components/website/overview/WebsiteOverview.tsx:238, :437`, discouraging "turned N
  visitors into 0 leads"; honest "No leads yet" empty state to mirror.
- `src/services/ozMoment.ts:206-241` (esp. :207, :214, :232-234, :241), the reusable Chancellor-grade
  public-data discipline: name the competitor, cross-reference a hidden number, ban commodity findings,
  one move THIS WEEK.
- Lattices: journey-lattice.md (substrate):32, :52-54, :159-182, :190-213, :243-256, :260-272;
  knowledge-lattice.md (substrate):358 (Guidara), :368 (Fogg); sentiment-lattice.md (substrate) (Stage-1 Facts-Only boundary,
  Watchline/relief).

---

## Revision Log

### Rev 1 - 2026-07-07
- **Change:** Frame-sharpening pass against the 2026-07-07 strategic stake (Value #2 split + done-for-you
  definition + NS1-attribution + two-altitude), per `strategy/inversion-frame-validation.md`. Four edits, no
  wholesale rewrite, Chancellor quote + Clauses A–E + honesty flags preserved. (1) Clause B now names WHO
  executes the one move: for the two BUILT + WIRED in-lane rails (GBP posts, review replies, behind the human
  approve-gate in `gbp-write.service.ts`) the card ends in "Alloro drafted this, approve" → "Alloro did it,"
  the owner commands and Alloro executes on approval, insight still shown so the owner stays capable; unbuilt
  rails (photo-refresh, category, booking, PMS) stay read-only observation, never homework, never claimed built.
  (2) Clause A gained the NS1-attribution thread (*"Alloro spotted…"*). (3) Added the two-seat / two-altitude
  note to the card-standard intro (owner's pushed glance + operator's operable surface, icp-spine §8.8). (4)
  Scope boundary reframed from "done-for-you is a MAP-LEVEL NON-GOAL" to "authored-for; execution ships next"
  (NS2 owned rail). Also aligned the "Chancellor quality on PUBLIC data" one-move example to the built/unbuilt
  split so it no longer casts an unbuilt-rail photo action as owner homework.
- **Reason:** Execution deviation / scope alignment: the specs were written 2026-07-06, before the 7/07 frame
  was staked; the FLIP corrects "the recommendation is the product / owner does it" to "owner commands, Alloro
  executes on approval" for in-lane built rails, and welds in the two universal threads (attribution +
  two-altitude) that were absent across Ch2–7.
- **Updated Done criteria:** In addition to the existing FIX 1–4 done bars: a passing card for a BUILT in-lane
  move (GBP post, review reply) must end in the approve-then-executed command form (not owner homework) and
  attribute the catch to Alloro; a card for an unbuilt rail must remain read-only observation with no
  execution claim; every card must serve both altitudes (owner glance + operator operable surface).

