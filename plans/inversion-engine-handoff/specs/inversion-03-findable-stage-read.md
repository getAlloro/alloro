# Inversion, Chapter 3: Findable (Stage 2)

*Draft spec for Dave's Claude (`alloro-engineer`). Staged for Corey's review; not yet on Jo's board.
Written to be executed from the repo. Code anchors are real `origin/dev/dave` file:lines
(re-verified 2026-07-07). Voice/journey rules are cited to alloro-brain substrate (local), NOT to
dev/dave; those substrate line numbers are not repo-verifiable. 2026-07-06.*

**The One Law:** the recommendation is the product; everything else is supporting evidence. On the
Findable stage the owner opens the surface and, in 30 seconds, knows they are in the top set of
options when patients search, where their public presence is leaking, and the ONE move this week,
caught from public data they cannot read themselves. No generic homework, no fabricated number, no
"you're failing" framing.

**Chapter scope (the lane, and only this lane).** This chapter owns the Findable-stage READ on
**public data**: local rank / Google Maps position, Google Business Profile completeness, reviews,
photos, and NAP/citations. It turns that read into the stage's **single candidate card** and hands
that card up to Chapter 7 for cross-stage selection. It does **not** define the card standard (that
is Chapter 2), it does **not** pick the winning card across stages (Chapter 7), and it does **not**
own the fabricated-rank number itself (Chapter 1 kills the `|| 1` fallback; this chapter *depends on*
that fix and corrects the Findable read once it lands).

---

## Why this exists (read first: the owner, not the code)

Across the three live pilots the Findable surface (Local Rankings) is thin in exactly the ways the
Journey Lattice forbids:

- **Garrison, One Endo:** the "next action" is generic homework: "keep review momentum moving,"
  "post to Google every week," "add fresh photos." Any tool says that. It is not the specific #1 move
  caught from something the owner couldn't see, and it is not done for them.
- **Artful (Pawlak):** the card contradicts itself: the practice is shown as a dominant "#1"
  (a fabricated fallback, Chapter 1) while simultaneously being told to "close the gap" against
  competitors carrying many hundreds of reviews (illustrative: roughly 441 to 1026 in Artful's
  competitor set; confirm against live data before merge). A specialist cannot out-count a
  generalist's decade of reviews, so the card reads as both wrong and discouraging.
- **All three:** when a practice sits at #2 or #3, the card frames that as a deficit ("currently #N,
  improve the position") instead of the truth the Journey Lattice locks: **being in the top set is
  what matters; #1-vs-#2 is a distraction owners over-optimize** (journey-lattice.md:94, substrate:
  alloro-brain, local).

The gold-standard exemplar (owned by Chapter 2's Card Standard, drawn from the PMS-gated referral
surface) is the Chancellor Crossing card: *"Call Dental Care at Chancellor Crossing, your single
largest referral source, dropped from 26 referrals to 21 this period. Call them this week."* Specific,
caught-something-unseen, one move. Every zero-upload Findable card must reach that quality **on public
data**, which is entirely possible, because the pipeline already fetches the raw material (competitor
review velocity, photo counts, post freshness, the live Maps top-5). The gap is **content**: the
advice, the framing, the truth, not chrome. The visual UI (NextMoves, overview card, engagement card)
is already clean and stays untouched.

## The frame for Dave (what OUGHT to be there)

This is **not a rebuild.** The Findable engine (`service.ranking-llm.ts`) already produces a single
top recommendation, an overview card, and an engagement card from public GBP + competitor + live-Maps
data, with strong guardrails. These are **prompt-and-fallback diffs** plus one small hand-up-quality
flag, so the one card the owner sees is: (1) top-set-framed, not #1-anxious; (2) non-contradictory
about competitor review counts; (3) specific and caught-unseen rather than generic homework. **Minimum
rework, maximum reuse**: the Chancellor-bar discipline already exists in `ozMoment.ts` (the Checkup's
public-data card generator) and is imported into the ranking `SYSTEM_PROMPT` by **Chapter 2 (FIX 1)**,
which owns that base prompt edit; this chapter builds on top of it with the Findable-SPECIFIC framing
rules (top-set bands, specialist-vs-generalist reframe) and does not re-spec the base rule. No surface
is redesigned.

**The flip (BUILT rail only): read -> owned action -> attribution.** The freshness/presence gap this
stage surfaces does not have to terminate in advice the owner must go do. For the two moves that ride
Alloro's BUILT + WIRED GBP write-path, a Google post Alloro publishes, and a reply Alloro drafts to a
review, the Findable card ends in done-for-you execution, gated behind the owner's one-tap approval,
then attributes the result back: "Alloro drafted a Google post about [signal] and, on your approval,
published it to your profile." This flips the card from recommendation to owned action, and threads
NS1-attribution (the caught insight is credited to Alloro, not left as anonymous advice) and Value #2
(no homework). **Honesty floor (frame-validation guide, 2026-07-07):** this flip is truthful ONLY for
those two built rails (post publish + review reply, each human-approve-gated). GBP photo-refresh,
category write-back, and review-generation are NOT built; they stay read-only observation the card may
surface, never an owner to-do and never claimed as something Alloro does.

**Two altitudes (§8.8, icp-spine).** This card serves two surfaces, not one, and the spec must name
both. The owner's altitude is the **pushed glance**, the monthly digest they actually read, where the
attributed "Alloro posted X to your Google profile" line lands (the owner rarely logs in, so this is
their real touchpoint). The operator's altitude is the **operable dashboard**, the Local Rankings
surface the front-desk/operator opens and where the one-tap approval happens. "The owner opens the
surface" in the One Law above is shorthand; in practice the operator touches the dashboard and the
owner sees the attributed glance.

---

## dev/dave verification (2026-07-06)

Every anchor below was read on `origin/dev/dave` (the live base) before it was cited.

- **Findable recommendation engine + prompt:** `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`
  `SYSTEM_PROMPT` at `:109`; overview_card #1/#N format rules at `:135–138`; competitor compaction
  (carries `primary_category`, `photos_count`, `posts_last_90d`, `reviews_last_30d`) at `:326–339`;
  `top_recommendations` schema at `:191–201`; "exactly 1 item" constraint at `:212`.
- **Findable READ / payload assembly:** `src/controllers/practice-ranking/feature-services/service.ranking-stage-llm.ts`
  `rank_position: clientRankResult?.rankPosition || 1` at `:197` (**Chapter 1's fix, not this
  chapter's**); `competitors: rawData.competitors.slice(0, 5)` at `:210` (the large-review-base
  competitor context enters here); `engagement_summary` at `:212`; `search_position` (real Maps
  position + top-5) at `:213`.
- **Generic-homework source:** `src/controllers/practice-ranking/feature-services/service.ranking-output-guardrails.ts`
  `SAFE_RECOMMENDATION_BACKFILL` at `:26–54`; `backfillRecommendations` (pads/caps to 1) at
  `:178–198`; `normalizeLeadProtectionLanguage` (keys "protect the lead" off `searchPosition === 1`)
  at `:117–131`.
- **Proven public-data discipline to reuse:** `src/services/ozMoment.ts`: Oz rules at `:206–230`;
  the "AVOID commodity findings" list ("you should get more reviews," "rating lower than average") at
  `:231–234`; the specialist-vs-generalist reframe ("outshown by a louder one") at `:218`.
- **Hand-up seam to Chapter 7 (Summary v2):** `src/controllers/agents/feature-services/service.ranking-recommendations.ts:29–62`
  (`fetchLatestRankingRecommendations` reads `llm_analysis.top_recommendations[]`);
  `service.agent-input-builder.ts:205–226` (passes it as `ranking_recommendations`);
  `service.monthly-agent-processor.ts:344–368`; `src/agents/monthlyAgents/Summary.md:196–204` (Summary
  v2 merges it as one interpretive candidate and selects the single top action).
- **What the owner sees:** `frontend/src/components/dashboard/RankingsDashboard/NextMoves.tsx:9`
  (renders `top_recommendations` as "Best next actions"); `frontend/src/components/dashboard/RankingsDashboard.tsx:525`
  (renders `overview_card.text`) and `:592` (renders `engagement_card`).

---

## Voice rules (locked; apply to every Findable card)

From journey-lattice.md:160–213 and sentiment-lattice.md (substrate: alloro-brain, local; NOT
dev/dave, and not repo-verifiable). Every rule here is enforced in the `service.ranking-llm.ts`
`SYSTEM_PROMPT`, not in code, so the diffs in this chapter are prompt edits.

- **Relief-first, never fear.** Open by acknowledging what is protected or healthy before naming the
  gap (The Watchline, sentiment-lattice.md:366, substrate: alloro-brain, local). Never "you turned up
  empty" / "you're failing."
- **Plain language, owner's voice.** No SEO/GBP/SERP/NAP jargon without translation
  (journey-lattice.md:162–166, substrate: alloro-brain, local). Write for an 18-year-old on first read.
- **Trend-focused.** "Up from #4 last month" beats "23% above benchmark" (journey-lattice.md:166,
  substrate: alloro-brain, local).
- **Top set, not #1.** Being in the top three is the win; do not frame a #2/#3 practice as deficient
  (journey-lattice.md:94 and knowledge-lattice.md, Owner.com "top set vs not," Adam Guild; substrate:
  alloro-brain, local).
- **One move only.** Exactly one action, doable this week, measurable in 30 days
  (journey-lattice.md:206–211, substrate: alloro-brain, local).
- **No em dashes** in owner-facing copy (U+2014); the existing guardrail and prompt already enforce
  this.

### How a Findable card reaches Chancellor quality on public data

The Chancellor card is (a) **specific**: names the actual entity and a real number; (b)
**caught-unseen**: a signal the owner cannot get by looking at their own Google profile; (c) **one
move**. On public data that maps to:

- **Specific:** name the actual competitor (`competitors[].name`) and cite one real number already in
  the payload: a review-velocity delta (`reviews_last_30d` vs a competitor's `reviews_last_30d`), a
  photo gap (`engagement_summary.photos_count` vs `competitors[].photos_count`), a post-freshness gap
  (`latest_post_age_days`), or the live Maps top-5 (`search_position.top_5`). This is the same set
  `ozMoment.ts` already turns into "how did they know that" cards.
- **Caught-unseen:** cross-reference two of those data points into one private-feeling insight
  (illustrative: "Bledsoe Orthodontics added 9 reviews in the last 30 days while your profile added 1;
  that is why they moved ahead of you on Maps this month"). The owner cannot see a competitor's 30-day
  velocity from their own dashboard. (Numbers here are illustrative of the shape, not live pilot data.)
- **One move (BUILT rail: read -> owned action -> attribution):** a single move Alloro executes on the
  owner's one-tap approval and then attributes back, tied to that signal, drawn from Alloro's BUILT +
  WIRED GBP write-path, a Google post Alloro publishes, or a reply Alloro drafts to a review that just
  landed (illustrative: "Alloro drafted a Google post about the momentum you have this month and, on
  your approval, published it to your profile," or "Alloro drafted a reply to your newest review;
  approve and Alloro posts it"). Done-for-you, attributed, never a menu and never owner-homework. **Honesty scope on the GBP post: it is a CONVERSION move (posts CONVERT, they do NOT rank, per `research/lever-outcome-evidence-map.md`). NEVER offer a GBP post as the fix for a RANK / visibility leak, that implies posting improves rank; for a rank leak the move is the review-velocity ask (handed to Ch6) or an honest read-only observation.**
  **Honesty flag:** a photo gap or category signal is READ-ONLY observation the card may surface, never
  an owner to-do and never presented as something Alloro does, GBP photo-refresh and category
  write-back are NOT built (frame-validation guide, 2026-07-07). Note (single-ownership): when the
  caught signal is review velocity, the review-ASK action that closes it ("ask N patients for a
  review") is owned by **Chapter 6 (Memorable)**; this chapter may cite review velocity as a Findable
  signal but hands the ask itself to Chapter 6 rather than emitting its own review-ask card. (A
  review-REPLY that Alloro drafts and publishes on approval is a different, BUILT GBP move this chapter
  may use; the review-ASK to patients is Chapter 6's.)

---

## FIX 1: Frame the top set, not #1-vs-#2

- **Owner sees (all three pilots at #2/#3):** "You are currently #N in Local Search. Recommended
  Action: improve the position." A practice that is already in the top set is told it is behind,
  steering it toward the #1-vs-#2 distraction the Journey Lattice explicitly warns against.
- **Root cause:** `service.ranking-llm.ts:135–138`: the `overview_card.text` format rules affirm only
  rank **#1** ("dominant #1 ... protect the lead"). Every other rank, including #2 and #3, falls into
  the single "not #1" branch that frames the position as a gap to close.
- **The fix (prompt-only, reuse the existing format switch):** in `SYSTEM_PROMPT`, split the "not #1"
  branch into two bands, keyed off the **real** `search_position.position` (the sampled Maps rank),
  not `rank_position`:
  1. **Top set (position 2 or 3):** affirm first: "[Name] is in the top three when patients search
    for [specialty] near [city], with a X Alloro Health Score." The recommended action **protects or
    widens** the top-set standing; it must **not** tell the owner to "close the gap to #1."
  2. **Outside the top set (position > 3, or `search_position.not_in_top_20` true):** the move is
    "break into the top 20," which is the exact goal the existing not-in-top-20 rule already sets at
    `:125` ("treat breaking into the top 20 as the primary goal"). Do NOT tell an outside-the-top-20
    practice to "break into the top three": that overshoots the code's stated goal and reintroduces the
    #N-anxiety this fix removes. (Once inside the top 20, the top-set band above takes over.)
  3. **Position unknown (`search_position.position` is null / `status` is `bias_unavailable` or
    `api_error`):** say "position pending this month," never fall back to #1 or a fabricated rank
    (this is the honest degrade that Chapter 1's `|| 1` removal makes possible).
- **Reuse note:** `normalizeLeadProtectionLanguage` (`service.ranking-output-guardrails.ts:117–131`)
  already strips "protect the lead" for any `searchPosition !== 1`, so the sanitizer will not
  reintroduce #1 language into a top-set (2–3) card. No guardrail change is required for this fix.
- **Done when:** a practice sampled at #2 or #3 gets a card that names it as in the top set and whose
  one action protects/widens rather than chases #1; a practice outside the top set is told to break
  in; a practice with no sampled position sees "position pending," never "#1."

## FIX 2: Contextualize competitor review counts (kill the self-contradiction, Gap 4b)

- **Owner sees (Artful / Pawlak):** the card presents the practice as a dominant "#1" and, in the same
  breath, tells them to close a review gap against competitors with many hundreds of reviews
  (illustrative: roughly 441 to 1026 in Artful's set; confirm against live data before merge). It is
  internally contradictory and it sets an unwinnable target (a specialist cannot out-count a
  generalist's review base).
- **Root cause (two parts):**
  1. The fabricated "#1" comes from `rank_position || 1` at `service.ranking-stage-llm.ts:197`.
    **This is Chapter 1's fix, not this chapter's**: once it defaults to the real/null rank, the
    "#1" half of the contradiction disappears. This chapter lists it only to make the dependency
    explicit: **FIX 2 is not complete until Chapter 1 has landed.**
  2. The "close the gap" half is this chapter's: the LLM payload passes raw competitor
    `total_reviews` (`competitors: rawData.competitors.slice(0, 5)`,
    `service.ranking-stage-llm.ts:210`; compacted with `primary_category` at
    `service.ranking-llm.ts:326–339`) with **no instruction to reframe a much larger review base as a
    generalist's broad-net count rather than a gap a specialist must close.** The prompt never tells
    the model that a general dentist carrying hundreds of reviews (illustrative) is not the comparison
    set for a specialist.
- **The fix (prompt-only, reuse the competitor `primary_category` already in the payload):** add a
  `SYSTEM_PROMPT` rule under "Rules":
  > When a competitor's total review count is many multiples of the practice's AND that competitor's
  > `primary_category` is a generalist category (e.g. "Dentist," "Dental clinic") while the client is
  > a specialist, do NOT frame the review-count difference as a gap the practice must close. Reframe
  > it honestly: the practice is not losing to a better practice, it is being outshown by a louder,
  > broader one. Choose a winnable move (a comparison against a like-for-like specialist competitor,
  > or a review recency/velocity signal), never "match their review count."
  This mirrors the reframe already proven in `ozMoment.ts:218` (specialist-vs-generalist) and
  Cialdini/Moore (knowledge-lattice.md, substrate: alloro-brain, local).
  Note (single-ownership): if the winnable move is a review recency/velocity signal, the ACTION that
  acts on it (asking patients for reviews) is owned by **Chapter 6 (Memorable)**; this chapter cites
  velocity only as a Findable read-signal and hands any review-ask to Chapter 6.
- **Done when:** a specialist that is top-set locally is never told to close a raw review-count gap
  against a generalist; the card either reframes the count honestly or picks a like-for-like or
  velocity-based move. Verified against Artful's live data after Chapter 1 has landed.

## FIX 3: Retire the generic backfill homework

- **Owner sees (Garrison, One Endo):** "Keep review momentum moving, ask every completed patient for
  a Google review." / "Post to Google every week." / "Add fresh practice photos." Homework any tool
  gives, nothing caught-unseen, and it quietly reads as "you're behind."
- **Root cause:** `SAFE_RECOMMENDATION_BACKFILL` at `service.ranking-output-guardrails.ts:26–54`.
  `backfillRecommendations` (`:178–198`) injects one of these generic entries whenever the LLM returns
  zero recommendations or all its recommendations were filtered out (e.g. as website-action
  recommendations). Because it carries no practice data, it can never be Chancellor-specific.
- **The fix (two small, safe diffs):**
  1. **Reduce how often it fires**: the real fix is upstream in FIX 4 (make the LLM reliably emit one
    specific, caught-unseen action so the backfill is a rare safety net, not the norm).
  2. **When it does fire, be honest about it.** Add a `generic: true` marker to each
    `SAFE_RECOMMENDATION_BACKFILL` entry. The `RankingRecommendation` type at
    `service.ranking-recommendations.ts:14–22` already carries `[key: string]: unknown`, so the flag
    passes through the hand-up untouched. This lets Chapter 7 (Summary v2) **de-prioritize a generic
    Findable candidate** in favor of a specific candidate from another stage, instead of surfacing
    homework as the owner's one move. Also rewrite the three backfill strings to be relief-first (lead
    with what is already working) rather than deficit-framed.
- **Honest limit:** a data-less fallback cannot be made specific; the goal is to make it rare and to
  flag it so it never wins cross-stage selection when a real signal exists elsewhere. Do **not**
  fabricate a number to make the fallback look specific (Value #6, the Theranos row;
  knowledge-lattice.md:211, substrate: alloro-brain, local).
- **Done when:** the backfill fires only when the LLM genuinely produced nothing; every backfilled
  entry carries `generic: true`; and its copy no longer frames the practice as behind.

## FIX 4: Make the single Findable card specific and caught-unseen

- **Owner sees:** "Recommended Action: improve the position." Vague, no named competitor, no number,
  nothing they could not have guessed.
- **Root cause:** `service.ranking-llm.ts:191–201` (the `top_recommendations` schema) and `:212`
  ("exactly 1 item") require one recommendation but **do not require it to name a specific competitor
  or cite a specific number from the input.** The data to be specific is already in the payload
  (`competitors[].reviews_last_30d` / `photos_count`, `engagement_summary.photos_count` /
  `latest_post_age_days`, `search_position.top_5`), but the prompt permits a generic answer.
- **The fix (Chapter 2 owns the prompt edit; this chapter confirms the Findable inputs):** the
  `SYSTEM_PROMPT` Chancellor-bar rule that forces the single `top_recommendations` entry to (1) name a
  specific competitor or profile factor, (2) cite one real number the owner cannot self-discover, (3)
  end in one verb+object+this-week move, and (4) ban the commodity findings ("get more reviews," "your
  rating is lower than average," "post more," "add photos") is **owned and authored ONCE by Chapter 2,
  FIX 1**, which lifts this exact `service.ranking-llm.ts` `SYSTEM_PROMPT` to the bar by importing the
  `ozMoment.ts:206–234` discipline (its AVOID list at `:231–234`). Chapter 2 (Slice 2) lands before
  this chapter, so that rule is already in the prompt when Findable is built. **Do NOT re-add it here**
  (single-ownership of the `SYSTEM_PROMPT`, prevents two chapters editing the same block for the same
  rule). This chapter's residual FIX-4 job is only to CONFIRM the Findable payload already carries the
  fields that rule needs, so it can be satisfied on public Findable data (it does): `competitors[].name`
  and `reviews_last_30d`, `engagement_summary.photos_count` / `latest_post_age_days`, and
  `search_position.top_5`. The Findable-SPECIFIC prompt rules this chapter DOES author are the top-set
  bands (FIX 1) and the specialist-vs-generalist reframe (FIX 2); those are additive to Chapter 2's base
  rule, not a duplicate of it.
- **Boundary:** the machine-checkable definition of "specific enough" (the card-quality gate) and the
  base Chancellor-bar prompt rule are **Chapter 2's Card Standard**, not this chapter's. If Chapter 2
  later adds structured fields (e.g. `caught_signal`, `one_move`, `relief_frame`) to the card, extend the
  `top_recommendations` schema at `service.ranking-llm.ts:191–201` to emit them; until then the existing
  `title` / `description` / `expected_outcome` fields carry the content.
- **Done when:** the Findable card for each of the three pilots names a real competitor and a real
  number from that pilot's data, states one weekly move, and when that move is a BUILT-rail move (a
  GBP post or review reply), it is framed as done-for-you-on-approval and attributed to Alloro, while
  any photo/category signal appears only as read-only observation, never as homework, and opens with
  relief, verified by reading each pilot's live card, not by the prompt alone.

---

## The hand-up to Chapter 7 (the seam this chapter delivers to)

This chapter does not select the winning card. It produces **one** Findable candidate and hands it up
through the seam that already exists:

- The Findable card lives in `llm_analysis.top_recommendations[0]` (written by
  `service.ranking-llm.ts` → `saveLlmAnalysis`).
- `fetchLatestRankingRecommendations` (`service.ranking-recommendations.ts:29–62`) reads
  `top_recommendations[]` from the latest completed ranking.
- It is passed as `ranking_recommendations` (`service.agent-input-builder.ts:205–226`,
  `service.monthly-agent-processor.ts:344–368`).
- Chapter 7 (Summary v2, `src/agents/monthlyAgents/Summary.md:196–204`) merges it as **one
  interpretive candidate** against the other stages and picks the single top action.

**Contract this chapter owes Chapter 7:** exactly one Findable candidate, top-set-framed (FIX 1),
non-contradictory (FIX 2), specific and caught-unseen when data allows (FIX 4), and flagged
`generic: true` when it is only a data-less fallback (FIX 3) so Chapter 7 can down-rank it. This
chapter must **not** change the merge/selection logic in `Summary.md`; that is Chapter 7's.

## What this chapter does NOT own (boundaries, misinterpretation guard)

- **The card standard / "is it specific enough" gate** → Chapter 2. This chapter conforms to it and
  supplies the inputs; it does not define the shape.
- **Picking the winning card across stages** → Chapter 7 (Summary v2). This chapter emits one
  candidate.
- **The fabricated-rank number (`|| 1`)** → Chapter 1 (`service.ranking-stage-llm.ts:197`,
  `service.ranking-stage-scoring.ts:393`, `service.ranking-pipeline.ts:259`; the `:388` occurrence is
  a telemetry log string, not a persisted writer, so it is not a canonical write site). FIX 1's
  "position pending" degrade and FIX 2's de-contradiction both **depend on** Chapter 1 landing first.
- **Website performance / Choosable-stage content** → the existing prompt already forbids
  website-speed actions (`service.ranking-llm.ts:145–146`); that is Choosable (Chapter 4) territory,
  left untouched here.

## The staking gates (the humans own the truth)

- **Corey** stakes that the framing is right (top set over #1, relief over fear, one caught-unseen
  move).
- **Dave / his Claude** implements the prompt + backfill diffs and **verifies each against a real
  pilot's live card before merge**: reads Garrison's, One Endo's, and (post-Chapter-1) Artful's
  actual Findable card and confirms it names a real competitor + real number, is top-set-framed, and
  carries no self-contradiction. TypeScript compiling is not proof; the card on screen must read true.

---

## Unresolved / honest gaps (grounded, not guessed)

- **"Citations" has no countable public signal.** The chapter scope names citations, but on
  `origin/dev/dave` there is no directory-citation count fed to the Findable card. The only
  citation-adjacent signal is the `nap_consistency` factor (`service.ranking-stage-scoring.ts:358`),
  which yields a qualitative factor detail, not a countable "you are missing N citations" number. A
  Findable card therefore cannot cite a specific citation gap without new data plumbing. Honest
  scope: treat citations as represented **only** via the NAP-consistency factor detail; do not have
  the card claim a citation count it does not have.
- **FIX 1/FIX 2 depend on real `search_position`.** The top-set band and the de-contradiction key off
  the sampled Maps position, which can be null (`status: bias_unavailable | api_error`). The spec
  degrades those cases to "position pending," but I did not verify how often each pilot's
  `search_position` is null in production; Dave should confirm on the live data during the
  verify-before-merge step.
- **Chapter 2's Card Standard type is not yet in code.** I anchored FIX 4 to the existing
  `top_recommendations` schema (`service.ranking-llm.ts:191–201`) as the current contract. If Chapter
  2 lands a structured card type first, FIX 4's schema-extension note must be reconciled against it
  before build.
- **The fixes are prompt/behavioral changes with no unit-test harness.** Per the working agreement,
  "tests pass" cannot be claimed; correctness is proven by reading each pilot's live card after the
  diff, which requires running the ranking pipeline for those orgs.

---

## Revision Log

### Rev 1 - 2026-07-07

**Change:** Applied frame-sharpening from the 2026-07-07 inversion frame validation
(`strategy/inversion-frame-validation.md`). (1) Added "The flip (BUILT rail only): read -> owned action
-> attribution" and "Two altitudes (§8.8)" paragraphs to "The frame for Dave," routing a surfaced
presence/freshness gap into Alloro's BUILT + WIRED GBP write-path (a post Alloro publishes on approval,
a review reply Alloro drafts) and attributing the result to Alloro (NS1-attribution), plus naming both
the owner's pushed-glance (digest) and operator's operable (dashboard) altitudes. (2) PURGED FIX-area
illustrative example "add the 4 operatory-and-exterior photos ... before Friday", it was owner-homework
and relied on UNBUILT GBP photo-refresh, and replaced it with a BUILT-rail move (a GBP post Alloro
publishes / a review reply Alloro drafts, both approve-gated and attributed); photos/category are now
explicitly read-only observation, never a to-do, never claimed-as-built. Added a disambiguation that a
review-REPLY (built GBP rail, usable here) is distinct from a review-ASK (Chapter 6). Threaded the same
built-rail/attribution outcome into FIX 4's Done-when.

**Reason:** Frame stake (2026-07-07, Value #2 split + done-for-you definition + NS1-attributed + two
altitudes) landed AFTER this spec was written 2026-07-06; the spec still read as "the recommendation is
the product / owner does it" and was missing attribution and the operator altitude. Honesty guardrail:
the flip is truthful only for the two verified-built rails (GBP post publish + review reply,
human-approve-gated); unbuilt rails (photo-refresh, category write-back, review-generation, booking,
PMS) stay read-only observation.

**Updated Done criteria:** FIX 4 Done-when now additionally requires that a BUILT-rail move be framed as
done-for-you-on-approval and attributed to Alloro, and that any photo/category signal appear only as
read-only observation (never homework). Existing FIX 1/2/3 Done criteria and all honesty flags
unchanged.
