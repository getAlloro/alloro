# Inversion: Chapter 6: Memorable (Stage 5)

*Draft spec for Dave's Claude (`alloro-engineer`). Staged for Corey's review; not yet on Jo's board.
Written to be executed from the repo. CODE file:lines are anchored to `origin/dev/dave` (re-verified
2026-07-07). Heuristic/voice citations point to the alloro-brain lattices, which are LOCAL substrate
(NOT present in dev/dave), and are labeled as such inline. 2026-07-06.*

## Why this exists (read first: the owner, not the code)
The Memorable stage is where the business compounds. A happy patient who reviews, returns, and refers
feeds every earlier stage: more demand, more findability, more credibility, warmer bookings (journey-lattice.md,
"This stage compounds," ~line 151; substrate, alloro-brain, local). So the owner's Memorable read has to
do more than *state facts*: it has to catch the one thing slipping that they can't see, and hand them one move this week.

Right now it doesn't. On the live Admin Hub the Memorable surface **describes** (rating, review count,
"12 new this month," "Replied to 74%") and stops. The only thing resembling a *recommendation* the owner
gets on public data is the generic backfill line **"Ask every completed patient for a Google review"**:
homework any tool gives, not the specific #1 move, not caught from data they couldn't read. And the
numbers contradict each other: One Endodontics reads roughly **186 reviews** on one surface and **184** on
another (illustrative figures for the two-source split; verify the exact live counts before merge). One
number the owner can catch as wrong poisons the whole product.

The gold standard already lives one door over (One Endo, PMS-gated): *"Call Dental Care at Chancellor
Crossing, your single largest referral source, dropped from 26 referrals to 21 this period. Call them
this week."* Specific. Caught something they couldn't see. One move. **This chapter's job: make the
Memorable candidate card reach that quality on PUBLIC review data, and kill the count contradiction so
every number is true.**

## The frame for Dave (what OUGHT to be there)
This is **not a rebuild.** The reviews reader (`readReviews`), the summary model
(`getReviewSummaryForLocation`), the reply-list model (`findReplyableForLocation`), and the context card
already exist and are correct. What's missing is a thin **pure builder** that turns the read into ONE
caught-unseen card, plus one honest count fix. Mirror the existing Patient-Journey shape: a pure
function in `feature-utils` (like `buildHeadline` / `buildConversions` in `funnelMath.ts`), fed by the
readers, no new DB access inside it. **Minimum rework, maximum reuse.** The visual card shell already
exists (`PatientJourneyContextCards.tsx`); this chapter changes CONTENT (a caught insight + one move),
not chrome.

### What this chapter owns vs. what it consumes
- **Owns:** the Memorable-stage read (reply gap, review velocity) and the single Memorable
  **candidate card** it produces for Ch7 to select among stages. (No "follow-up" read: no follow-up card
  is built, and follow-up outbound AS the practice to a patient is out-of-lane, it is not in this chapter's read.)
- **Consumes (does not re-open):** the referral "1 thing that matters" insight (the Chancellor Crossing
  exemplar) is **PMS-gated** and its trace is owned by **Ch2** (single owner). This chapter does not
  regenerate it and does not try to fake a "highest-LTV referral ask" on public data (see Honest gap 5).
- **Depends on (not yet built):** the shared **candidate-card type** and the Chancellor copy template are
  **Ch2's** to define; the cross-stage **selector** (which stage's candidate wins the week) is **Ch7's**.
  This chapter emits ONE Memorable candidate into that shape. Until Ch2 locks the type, build the
  Memorable builder to return the fields below and let Ch2 rename/wrap them; the *inputs and trigger
  logic* are the load-bearing part and are fully specified here.
- **⛔ STAGE STAMP (reviews=Choosable stake, Corey 2026-07-07, do NOT skip):** "Memorable" is this chapter's OWNERSHIP bucket (Ch6 owns the review WORK), NOT the owner-facing stage. When the emitted card is a REVIEW action, its authored **`stage = choosable`** (the leak it addresses), so Ch7's eyebrow reads "Choosable" and matches the verdict, never two stage words on one screen. Do NOT stamp `stage = memorable` on a review card. Mirrors Ch2 (the `stage` field def) and Ch7 FIX 3.

---

## dev/dave grounding (2026-07-06)
Every code fact below re-verified present on `origin/dev/dave` (2026-07-07):
- The Memorable read is `readReviews` at `src/controllers/patient-journey/feature-services/stageReaders.ts:412`
  (interface `ReviewsRead` at `:403`), returning `{ rating, count, newThisMonth, replyRatePct, available }`.
- It reads `ReviewModel.getReviewSummaryForLocation` (`src/models/website-builder/ReviewModel.ts:420`),
  a COUNT over stored rows `where hidden=false`: `count` at `:446`, `newThisMonth` at `:457`,
  `replyRatePct` (replied/total) at `:458`.
- It's assembled once, current month only, at `src/controllers/patient-journey/feature-services/PatientJourneyService.ts:152`,
  and surfaced as `context.reviews` at `:214`.
- The owner-facing Memorable card is `frontend/src/components/dashboard/patient-journey/PatientJourneyContextCards.tsx:61-77`,
  **descriptive only**, no action line.
- The only public-data "recommendation" is the generic backfill `SAFE_RECOMMENDATION_BACKFILL` at
  `src/controllers/practice-ranking/feature-services/service.ranking-output-guardrails.ts:26`
  ("Keep review momentum moving" / "Ask every completed patient for a Google review"), padded in at `:189`.
- The competing count (186) is Google's live all-time total: `GbpController.ts:164` (`allTimeCount`) →
  `:189` (`totalReviewCount`), also `LocationsController.ts:66/88` (`g.reviewsCount ?? g.reviewCount`).

---

## FIX 1: Give the Memorable stage a real candidate card (kill the generic default)
- **Owner sees:** on zero-upload, the Memorable "move" is the generic backfill line *"Ask every completed
  patient for a Google review."* It's true, it's harmless, and it's worthless: every tool says it.
- **Root cause:** there is **no Memorable-stage recommendation generator**. `buildHeadline`
  (`feature-utils/funnelMath.ts:80`) only covers the three-stage funnel (impressions → visits → leads);
  reviews are carried as *context* (`PatientJourneyService.ts:214`) and rendered as **facts**
  (`PatientJourneyContextCards.tsx:61-77`). With nothing specific to say, the Local-Rankings banner
  falls back to `SAFE_RECOMMENDATION_BACKFILL[0]` (`service.ranking-output-guardrails.ts:26`).
- **The fix (minimum diff, reuse the pure-function pattern):**
  1. Add `buildMemorableCard(...)`, a **pure** function in a new
     `feature-utils/memorableCard.ts`, styled exactly like `funnelMath.ts` (no DB access inside; takes
     the read, returns the card or `null`). It runs a **priority ladder** and emits at most one card:
     **(A) reply gap** (FIX 3) → **(B) velocity drop** (FIX 2) → **(C) healthy/yield** (return a
     low-priority "strong stage" candidate, or `null`, so Ch7 can pick a leakier stage, never invent a
     problem). The ladder leads with the **reply-gap** rung ON PURPOSE: it is the only rung Alloro can
     actually **do in-lane**, Alloro drafts the reply and, on the owner's approval, posts it (built +
     wired GBP review-reply rail), so the card ends in an *attributed done-for-you action*, not homework.
     The velocity-drop rung sits second because the doing it prescribes (getting more reviews) is
     **out-of-lane**, Alloro is forbidden to solicit reviews or send outbound to a patient, so that rung
     is a **caught-insight the owner acts on**, capable-side-only by design (see FIX 2). Ordering by "what
     Alloro can execute" is what makes the primary Memorable card an owned NS2 rail rather than advice.
  2. Call it in `assemblePatientJourney` after the reads resolve
     (`PatientJourneyService.ts:154`, right after the `Promise.all`), and attach the result to the
     response as the Memorable candidate (field name to align with Ch2's type; until then, e.g.
     `context.reviews.card`).
  3. When a real Memorable card exists, the Local-Rankings banner must **prefer it over**
     `SAFE_RECOMMENDATION_BACKFILL[0]`. Do **not** delete the backfill (it still guards a truly empty
     LLM result): the ladder simply produces something specific first, so the generic line is the last
     resort, not the default. (Selection across stages is Ch7; here, only ensure the Memorable candidate
     is emitted and is preferred over the generic review line.)
- **Done when:** for a location with stored reviews, the owner sees a Memorable card that names a
  specific number and one bounded move (FIX 3 reply-gap first, else FIX 2 velocity), and the generic "Ask every completed patient…"
  line only appears when there is genuinely nothing specific to say.

## FIX 2: The velocity-drop card (SECONDARY rung, caught-insight only, capable-side by design)
- **What the owner ought to see:** *"Your new Google reviews slowed to 2 last month, down from 6 the
  month before. Ask a few patients this week to leave one."* This is the
  Chancellor shape on public data: it catches a **drop the owner couldn't see** (they don't track
  month-over-month review velocity) and gives **one bounded move**. It is the journey-lattice
  Action Layer example in spirit (`journey-lattice.md:201`, substrate, alloro-brain, local: *"Ask three
  patients this week to leave a review."*).
- **This rung is caught-insight-only, on purpose (not a skipped execution).** Unlike the reply-gap rung
  (FIX 3, primary), Alloro **cannot and must not DO** the thing this card prescribes: soliciting reviews
  or messaging patients AS the practice is out-of-lane (review-generation is unbuilt; outbound-to-a-human
  is forbidden). So the velocity card is deliberately the **owner's glance**, the caught drop is the
  §8.8 owner-altitude signal; the doing stays the owner's homework by design, never an action Alloro
  logs. That is why it sits **second** on the ladder, below the rung Alloro can actually execute.
- **Root cause it closes:** `readReviews` reads **only the current month's** `newThisMonth`
  (`PatientJourneyService.ts:152` passes `monthStart`/`monthEnd` once). Without last month's number there
  is no trend, so the stage can only state a bare count, never "dropped from X to Y."
- **The fix (reuse the existing method, one more call):**
  1. In `assemblePatientJourney`, add a **second** `readReviews` (or a direct
     `getReviewSummaryForLocation`) call for the **prior** month, using `monthBounds` on the
     previous month key (both already imported: `funnelMath.ts:162`). Add it to the existing
     `Promise.all` (`PatientJourneyService.ts:134`) so there's no extra round-trip cost.
  2. In `buildMemorableCard`, compute `delta = priorNewThisMonth - currentNewThisMonth`. Fire the
     velocity card when the drop is **material and honest**: prior ≥ a small floor (e.g. prior ≥ 3, so
     "6 → 2" fires but "1 → 0" (statistical noise) does not) AND current < prior. Copy states both real
     numbers; never a projection, never a percentage dressed up as a promise (Value #6).
  3. Evaluate this rung only after the reply-gap rung (FIX 3, primary) has declined to fire. If velocity
     is **flat or up**, do not fire this rung; fall through to the yield rung (C). Rising velocity is
     relief, not a problem to manufacture.
- **Heuristics that back this (cite in the builder's doc-comment; these are substrate, alloro-brain,
  local, NOT dev/dave code):** Cialdini social proof, *"surface proof first… reviews"*
  (`knowledge-lattice.md:416-419`, substrate); BJ Fogg tiny habits: the ask must
  be a small, repeatable step, "three patients this week," not "run a review campaign"
  (`knowledge-lattice.md:368`, substrate).
- **Honesty flag (must hold before this ships):** `newThisMonth` is only meaningful if stored rows carry
  a real `review_created_at` (the SQL windows on it, `ReviewModel.ts:440`). If a location's scraped
  rows lack reliable dates, `newThisMonth` is unreliable and the velocity rung must **not** fire for that
  location; fall through to the yield rung (C). Dave verifies `review_created_at` coverage per real practice before
  enabling this rung.
- **Honest limit on the ASK (do not dress generic homework as specific):** what makes this card
  non-generic is the **caught drop** ("slowed to 2, down from 6"), NOT the ask. The ask itself, "ask a
  few patients this week to leave one," is the same small habit any tool prescribes;
  on PUBLIC data Alloro cannot name WHICH patients to ask (that needs PMS, owned by Ch2's referral card).
  The sample copy therefore stays generic, never *"patients who just finished treatment,"* which would
  falsely imply Alloro knows from a PMS who completed care. So the card MUST lead with the caught drop and
  state the ask as the bounded next step, and must never
  imply Alloro hand-picked the patients. If only the ask survives (no real drop to report), the rung does
  not fire, so the generic homework never ships on its own.
- **Done when:** a location whose monthly review count dropped materially shows the two-number velocity
  card with a three-patient ask, and a location with flat/rising velocity never sees a fabricated "drop."

## FIX 3: The reply-gap card (PRIMARY rung, the in-lane done-for-you rail, reaches the moat)
- **What the owner ought to see:** *"11 of your recent Google reviews have no reply. Alloro drafted
  replies to the three newest, review and approve, and Alloro posts them for you."* Concrete count,
  concrete move, and Alloro can **do it** (draft the replies, and on the owner's approval post them via
  the built + wired GBP review-reply rail), which is the moat: tell the #1 move AND do it. **This is why
  it is the PRIMARY Memorable card:** it is the only rung whose *doing* is in-lane and attributable, so it
  ends in an owned NS2 action, not homework.
- **Two altitudes (§8.8).** The **caught insight** ("11 reviews with no reply") is the **owner's glance**,
  the §8.8 signal the owner reads in one look. The **"review + approve" action** is the **operator's
  operable surface**, the person who actually opens Alloro touches the draft-and-approve control; the
  owner won't log in to reply one by one. Name both altitudes; do not collapse them into "the owner
  replies."
- **Root cause it closes:** `replyRatePct` is shown as a bare fact
  (`PatientJourneyContextCards.tsx:72`, "Replied to 74%") with no action and no count of what's actually
  unanswered.
- **The fix (reuse existing reply-list model):**
  1. In `buildMemorableCard`, fire the reply rung **first** (it is the primary rung): if there are
     unreplied recent reviews, emit this card and stop. Only when there are **none** to reply to does the
     ladder fall through to the velocity rung (FIX 2). Get the exact list from
     `ReviewModel.findReplyableForLocation(locationId, { limit })` (`ReviewModel.ts:194`): it already
     returns `source:"oauth", hidden:false, has_reply:false` rows, newest first. The card's number is
     that list's length (bounded, e.g. "recent" = the returned window), and the move is "reply to the
     three newest this week."
  2. Because Alloro's GBP reply capability is built (posts + replies are in the safe-to-claim set), the
     card MUST offer the done-for-you variant when the reply-draft path is wired for that org ("Alloro
     drafted replies to the three newest; review and approve"). Only state the manual move if the
     reply-draft path is **not** wired for that org. Never claim an action Alloro didn't take (receipt rule).
  3. **Make the reply a logged, owned rail (the attribution weld, NS1's "attributed" leg).** When the
     owner approves and Alloro posts a reply, **record it to an accumulating action-log** so the card can
     say, over time, *"Alloro has replied to N reviews for you"* (or *"Alloro replied to 3 reviews this
     week, on your approval"*). This is the in-lane NS2 move made **visible and attributed**: the owner
     sees the rail did work FOR them, closing the catch-22 (invisible ROI). The count MUST come from
     replies Alloro actually posted (a real logged event per approved-and-published reply), never a
     projection or an aspirational total, receipt rule. Until Ch7's shared action-log/attribution field
     lands, emit the per-reply logged event and the running count into the Memorable candidate's fields
     for Ch7 to render; do not fabricate a total if no log exists yet.
- **Heuristics (cite in the doc-comment; substrate, alloro-brain, local, NOT dev/dave code):** Guidara /
  unreasonable hospitality: a reply is the small act
  that makes a patient "feel seen as individuals, not served as customers" (`knowledge-lattice.md:355-357`,
  substrate); Rogers/Cialdini: responsiveness is a trust signal, not a metric.
- **Honesty flag:** `replyRatePct` from `getReviewSummaryForLocation` (`ReviewModel.ts:458`) divides
  `replied / count`, and `count` includes **apify-scraped** rows that can't be replied to, diluting the
  percentage. The reply **card** must compute its number from the oauth-scoped list
  (`findReplyableForLocation` / `findRepliedForLocation`, both `source:"oauth"`), NOT from the diluted
  `replyRatePct`. Do not reuse the context-card percentage for the action.
- **Done when:** a location with unanswered oauth reviews shows the reply card with the true unreplied
  count and a three-review move, and a location that replies to everything never sees it.

## FIX 4: Kill the review-count contradiction (186 vs 184)
- **Owner sees (One Endo, illustrative figures; verify live before merge):** ~**186 reviews** on the
  GBP/rankings surface, ~**184 reviews** on the Patient Journey card. Same practice, same day. Instantly
  reads as broken. (The mechanism below is verified in code; the specific 186/184 are representative.)
- **Root cause:** two different sources of "total reviews," both shown to the owner:
  - **186 = Google's live all-time total**, fetched by OAuth in `GbpController.ts:155-166`
    (`totalReviewCount`, surfaced `:189`); the same Google figure feeds `LocationsController.ts:66/88`
    (`g.reviewsCount`).
  - **184 = COUNT of stored rows**, `getReviewSummaryForLocation` (`ReviewModel.ts:420`,
    `COUNT(*) where hidden=false`), surfaced on the Patient Journey card at
    `PatientJourneyContextCards.tsx:63` as `· ${reviews.count} reviews`.
  They **structurally diverge** (scrape/sync lag, hidden rows excluded, Google counts rating-only reviews
  that may not all be stored). They will never naturally match.
- **The fix (minimum-rework, honest):** the owner-facing **"N reviews" total must trace to ONE source:
  Google's own all-time total** (the number they gut-check against their real listing). Since the stored
  rows power the *derived* Memorable insights (velocity, reply gap) but should **not** publish a competing
  aggregate:
  1. On the Patient Journey card (`PatientJourneyContextCards.tsx:61-63`), **stop printing the stored-row
     count as the review total.** Lead the card with the derived insight (FIX 2/3) and the rating; drop
     the `· 184 reviews` fragment (or replace it with the Google total; see the honest gap below). This
     removes the contradiction at its source: only one surface (GBP) publishes the total, and it's
     Google's real number.
  2. Leave the GBP surface's `totalReviewCount` as the single home of the aggregate.
- **Honest gap (do not fake it):** the *fuller* fix, showing Google's all-time total **on** the Patient
  Journey card so both surfaces agree on a positive number, needs that total available at the assembler.
  **Correction to an earlier draft claim:** the all-time total is **already persisted daily**, not only
  fetched live. Each agent run flattens GBP data and stores it (including `reviews.allTime.count`, i.e.
  `totalReviewCount`) into the `google_data_store` table via `GoogleDataStoreModel.insertRaw`
  (`service.agent-input-builder.ts:160`; `service.agent-orchestrator.ts:164/192`), and
  `service.dashboard-metrics.ts` already reads it back out (`metricsHelpers.extractReviewSummary`,
  `metricsHelpers.ts:144`). The true, narrower gap: the **Patient-Journey assembler does not currently
  read `google_data_store`** (verified: no such read anywhere under `src/controllers/patient-journey/`),
  by its model-only design. So this chapter's shippable fix is **removal of the competing count** (step 1);
  wiring the assembler to read the already-persisted daily `totalReviewCount` snapshot is a **separate,
  smaller change than a new live OAuth call** (no new external call, just one more model read) and is
  flagged, not assumed built.
- **Done when:** the owner never sees two different review totals for one practice on two surfaces: the
  aggregate lives on exactly one surface (Google's real number), and the Patient Journey card leads with
  the caught insight, not a scraped count.

---

## Voice rules (every Memorable card obeys these)
From the alloro-brain lattices (substrate, local, NOT dev/dave code): the journey-lattice Translation
Layer (`journey-lattice.md:155-182`) and the sentiment-lattice:
- **Relief-first, never panic.** Frame as a move, not a failure. *"Your reviews slowed; here's the one
  ask this week,"* never *"your reputation is slipping."* (sentiment-lattice, "anchor the solution in
  relief, not intelligence," `sentiment-lattice.md:159`, substrate; "NEVER create panic," memory canon.)
- **Plain, owner's voice.** No "review velocity," "reply rate %," "reputation signals." Say *"new Google
  reviews,"* *"reviews with no reply yet."* Write for an 18-year-old on first read.
- **Trend-focused, two real numbers.** *"2 last month, down from 6"* beats *"67% below your baseline."*
  Descriptive, never predictive; no guarantee of an outcome (Value #6).
- **One move, bounded, this week, measurable in 30 days.** Verb + object + when: *"Ask three patients…
  this week."* Never more than one card (journey-lattice Action Layer, `journey-lattice.md:205-213`, substrate).
- **Never a fabricated number.** If the count/velocity isn't reliable for this location (Honesty flags in
  FIX 2/3), the card doesn't fire: it does not guess.

## How these cards reach Chancellor quality on THIS data source
The Chancellor exemplar = **specific + caught-something-they-couldn't-see + one move.** Mapped onto public
review data:
- **Specific:** real numbers from the read: *"2 last month, down from 6"* (FIX 2) or *"11 reviews with
  no reply"* (FIX 3). Never "get more reviews."
- **Caught something they couldn't see:** owners don't track month-over-month review velocity or count
  their unanswered reviews. The card surfaces exactly the thing they can't compute in their head, the
  same felt "how did they know?" the Chancellor referral-drop card creates, sourced from public data
  instead of PMS.
- **One move:** a single bounded ask ("three patients this week" / "reply to the three newest"), which
  Alloro can also *do* (reply drafting), reaching the moat: name the #1 move AND perform it.

The priority ladder (reply gap → velocity drop → yield-if-healthy) leads with the rung Alloro can execute
in-lane (the done-for-you reply), then falls to the caught-insight velocity rung, and guarantees the card
is either a real caught-unseen move or **nothing**: it never degrades to the generic default, and it never
manufactures a problem when the Memorable stage is genuinely strong (in which case Ch7 lets a leakier
stage's candidate win the week).

---

## The staking gates (the humans own the truth)
- **Corey** stakes the framing (relief-first, the ladder, "caught-unseen on public data").
- **Dave / his Claude** implements the pure builder + the count-removal, and **verifies each card against
  a real practice's live reviews before merge**: the velocity numbers must match the practice's actual
  month-over-month, the unreplied count must match Google, and no practice shows two different review
  totals across surfaces. This is the truth-gate a Claude-to-Claude wire cannot skip.

## Scope boundary
- This chapter produces the **Memorable candidate card** on **public** data (reviews) and fixes the
  **review-count** trust bug. It does **not** build the shared candidate-card **type**/Chancellor template
  (**Ch2**) or the cross-stage **selector** (**Ch7**); it emits one candidate into that shape.
- It does **not** re-open the **referral** "1 thing that matters" trace; that insight is **PMS-gated**
  and owned by **Ch2**. A public-data referral-ask card cannot name the highest-LTV patients without PMS
  data, so it would collapse back into the generic advice this chapter exists to kill; therefore the
  public Memorable card is built on **review velocity + reply gap**, not referral asks. The referral card
  stays the PMS-gated Chancellor exemplar. (Honest limit, stated rather than faked.)
- Land after Ch1 (Data Truth): FIX 4 assumes the Ch1 discipline that every displayed number is true.

---

## Revision Log

### Rev 1 - 2026-07-07
- **Change:** Applied frame-sharpening from `strategy/inversion-frame-validation.md` (frame staked
  2026-07-07, after this spec was written 2026-07-06). (1) **Flipped the priority ladder** so the
  done-for-you **reply-gap** rung is PRIMARY (FIX 3) and the **velocity-drop** rung is SECONDARY (FIX 2):
  reply-gap is the only rung whose *doing* is in-lane (Alloro drafts + on approval posts via the built +
  wired GBP review-reply rail) and attributable; velocity-drop's doing (soliciting reviews) is out-of-lane,
  so it stays a caught-insight. Updated the ladder definition in FIX 1, both rungs' fire order and
  fall-through targets, and the ladder recap. (2) **Named the velocity rung capable-side-only by design**,
  a §8.8 owner's-glance caught-insight the owner acts on, never a skipped Alloro execution. (3) **Made the
  reply action a logged, accumulating owned rail** ("Alloro has replied to N reviews for you"), the
  NS1-attribution weld and the in-lane NS2 move, counted only from real posted replies (receipt rule).
  (4) Added the **two-altitude split** (§8.8) to the reply card: caught insight = owner's glance; "review +
  approve" = operator's operable surface. (5) **Struck the orphan "follow-up"** from the chapter's read
  list (no follow-up card is built; follow-up outbound is forbidden). (6) **Genericized the velocity-ask
  sample copy** ("ask a few patients this week," never "patients who just finished treatment") so it never
  implies PMS knowledge of which patients completed care.
- **Reason:** Frame validation (`strategy/inversion-frame-validation.md`, Ch6 verdict + the two universal
  threads: NS1-attribution and two-altitude). Ch6 was the most disciplined chapter on out-of-lane risk;
  every out-of-lane refusal and honesty gate was preserved unchanged, only the in-lane BUILT reply rail
  was promoted to primary and welded to attribution.
- **Updated Done criteria:** none changed in substance, the per-FIX "Done when" bars still hold. Added
  expectations: the reply-gap card is emitted first and, where the reply-draft path is wired, states the
  done-for-you variant with an accumulating attributed count sourced only from real posted replies; the
  velocity card's ask copy stays generic (no implied PMS knowledge).
