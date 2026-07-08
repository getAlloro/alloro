# Inversion, Chapter 5: Bookable (Stage 4) + owner of the Pawlak leads screen

*Draft spec for Dave's Claude (`alloro-engineer`). Staged for Corey's review; not yet on Jo's board.
Written to be executed from the repo. Code citations are real `origin/dev/dave` file:lines (verified against the branch); citations to `*-lattice.md` are alloro-brain local substrate (NOT in dev/dave), tagged `[substrate: alloro-brain, local]`. 2026-07-06.*

**The one law for this chapter:** *The recommendation is the product. Everything else is supporting
evidence.* The owner opens the leads screen and in 30 seconds knows they are healthy, where they are
leaking, and the ONE move this week, caught from data they cannot read themselves. No generic advice,
no fabricated number, no discouraging framing.

**This chapter SPLITS (sized on `origin/dev/dave` 2026-07-07, per `strategy/inversion-frame-validation.md`
"Ch5 rail sizing (RESOLVED)").** The honest floor below (FIX 5.1–5.3) is correct and stays as-is: it
makes the leads screen honest, relief-framed, and produces the Bookable candidate card. On top of that
floor, Ch5 now names two increments of the *owned response rail* and sizes them honestly:

- **Ch5a, RESPONDER (achievable, in-lane, mostly-built): the first owned-response increment.** When a
  lead is submitted to Alloro's OWN hosted form, send an instant transactional auto-acknowledgement to
  the lead. This is the research-verified speed-to-lead lever (~21× more likely to qualify at a 5-minute
  response). It is a small, in-lane build (a per-form toggle + a template on the send path Alloro already
  owns) and it is Alloro *doing* the move (done-for-you, attributed), not the owner. **Specced below as
  FIX 5.4.**
- **Ch5b, ATTRIBUTION (visitor→booking, first-party): a NAMED BIG BUILD, sequenced later, NOT this
  slice.** First-party "this booking came through Alloro" does not exist and is not buildable now, no
  booking entity, no visitor id on submissions, only aggregate funnel math. It is the deep moat, sequenced
  *after* Ch5a. **Named below as "Ch5b, Attribution (named, deferred)," not specced as buildable-now.**

The in-lane line holds throughout: an instant transactional ack on Alloro's own form (a lead the owner
already earned) is in-lane; any nurture, drip, or follow-up outbound AS the practice to a human is
out-of-lane and forbidden. The responder is a single transactional auto-ack, never a drip.

---

## Why this exists (read first, the owner, not the code)

Stage 4 of the Journey Lattice is **Be Bookable** (journey-lattice.md:115-132 [substrate: alloro-brain, local]): the customer has
decided, and now converts intent into an appointment. The lattice calls it plainly: *"This is the most
fixable stage. A broken booking flow is solved in a week... But owners rarely notice it because the
symptom is 'fewer patients' rather than 'broken booking link.' Alloro's job is to make it noticeable."*

Right now Alloro makes it noticeable in the cruelest possible way. On Artful Orthodontics (Pawlak) the
leads screen says **"Your website turned 80 visitors into 0 leads this month"** (80 and 0 are Pawlak's live audit-time figures, illustrative of the pattern) and the funnel dead-ends
at **"Website Leads, Not connected yet."** Both are the same failure of craft: a scared owner opens the
one stage they could actually fix this week and reads *"you are failing"* with no move to make. The
lattice's Watchline principle (sentiment-lattice.md:366-374 [substrate: alloro-brain, local]) is the opposite: the first line should tell
them whether to relax or lean in, then name what was found, *felt presence before data.* And the
Bookable stage is where relief is most earned, because it is the stage most within reach.

This chapter is the **sole owner of the leads screen end-to-end**, both the "80 → 0" framing and the
"Not connected yet" dead-end, so the same UI is never fixed two different ways in two different
chapters. It turns the invisible booking leak into **one honest, relief-framed, fixable move**, and it
produces the Bookable stage's candidate card (to the Chapter 2 standard) so Chapter 7 can select the
week's single recommendation.

## The frame for Dave (what OUGHT to be there)

This is **not a rebuild.** The leads screen and the funnel are already built and already Apple-clean;
the gap is **content, framing, honest empty-states, and the missing Bookable recommendation**, not
chrome. Three of the four fixes below are copy/logic diffs to strings that already exist. The fourth
adds one pure function that reads the funnel Alloro *already assembles.* **Minimum rework, maximum
reuse.**

## Dependencies and boundaries (misinterpretation-proof)

- **Depends on Chapter 1 (data truth).** Chapter 1 makes the *connection state* honest at the backend:
  `readLeads` must return an `unavailableReason` (`not_connected` when there is no website project or no
  form integration; `no_data` when the project exists but has zero verified submissions this month)
  instead of a reason-less `emptyRead()`. This chapter renders that reason; it does **not** re-own the
  backend read. If Chapter 1 has not yet landed the reason code, FIX 5.2 degrades safely (see its
  done-check), but the leads-appropriate copy still ships.
- **Depends on Chapter 2 (relief framing + card standard).** Chapter 2 owns the *shape* of a candidate
  card and the relief-voice canon. This chapter applies that voice to the leads screen and emits a
  Bookable candidate in Chapter 2's shape.
- **This chapter OWNS all leads-stage owner-facing copy**, in both surfaces it appears:
  `WebsiteOverview.tsx` (the "visitors → leads" insight) and the Patient Journey funnel leads card
  (`stageEmptyStateCopy`). No other chapter edits leads-stage copy. (This resolves the overlap with
  Chapter 1's FIX 2, whose "add matching copy in `patientJourney.utils.ts`" line is **superseded by
  FIX 5.2 here**, Chapter 1 sets the reason code, Chapter 5 writes the words.)
- **Cites Chapter 4 (Findable/Choosable) only as a possible upstream cause.** If the leak is that few
  visitors arrive at all, that is an upstream (Findable) problem; the Bookable card names its own gate
  and points upstream, but does not fix reviews/rankings/photos here. The self-contradicting review
  recommendation on Pawlak ("#1 yet told to close the gap with competitors who have 441–1026 reviews (illustrative; verify against the account before quoting)")
  is a **Findable-stage** rec generated in `getOverviewRecommendedAction`
  (rankingsDashboard.utils.ts:105) and the `ozMoment` template fallback (ozMoment.ts:283-296), it is
  **out of scope for this chapter** and belongs to the Findable-stage chapter. This chapter must simply
  never reproduce it.

## What Alloro can and cannot see at the Bookable stage (the honesty guardrail)

The Journey Lattice lists Bookable mechanisms as *phone answering, form response time, online booking,
decisive CTA* (journey-lattice.md:121 [substrate: alloro-brain, local]). **Alloro cannot see most of these on public/zero-upload data.**
Grounded in the code, here is exactly what is and is not available:

- **Available on a connected leads screen (Artful/Pawlak):** website visitors (Rybbit) and verified
  form leads (form submissions) for the month, this is what `computeWebsiteMetrics` returns as
  `monthVisitors` and `monthLeads` (websiteMetrics.ts:207, :248 and :257). The **visitors → leads
  conversion** is the real Bookable read.
- **Available on public/checkup data (GBP):** whether the profile lists a **website** (`websiteUri`), a
  **phone** (`nationalPhoneNumber`), and **hours** (`regularOpeningHours.weekdayDescriptions`),
  captured at service.audit-apify.ts:209-221 and PlaceDataTransformService.ts:92-93.
- **NOT available (do not fabricate, do not imply):** phone-answer rate, form response time, and
  online-booking-link presence. There is no code that measures these. A Bookable card must **never**
  claim them.
- **What Alloro can honestly DO (the "and do it" half of the moat):** build/repair the **website lead
  form** and sharpen the **on-page CTA** (both are the sites+forms capability that is in production);
  and **instantly acknowledge a new lead on Alloro's own hosted form** (the Ch5a responder, FIX 5.4,
  form-capture and a submitter-email primitive both already exist on `origin/dev/dave`). Per the
  built-vs-unbuilt guardrail, Alloro must **not** promise an online-booking/scheduling product or
  GBP-completeness, those are unbuilt. The Bookable move is framed around the form, the CTA on the site,
  and the instant transactional ack (all built or near-built), never a scheduler Alloro does not have,
  and never a nurture/drip sequence AS the practice.

---

## FIX 5.1, Reframe "turned 80 visitors into 0 leads" (Gap 2 instance)

- **Owner sees (Artful/Pawlak):** *"Your website turned 80 visitors into 0 leads this month."* It reads
  as a verdict of failure, the exact opposite of relief, and names no move.
- **Root cause:** `frontend/src/components/website/overview/WebsiteOverview.tsx:237-239`. The `insight`
  string states a raw ratio as an accomplishment gone wrong. It leads with the shortfall, not with what
  is working, and offers no next step. It violates the Watchline (feel-first) and Narrator (what's
  happening → what to do) principles (sentiment-lattice.md:326-374 [substrate: alloro-brain, local]).
- **The fix (rewrite the string, reuse the same data):** rewrite `insight` (and its zero branch) to
  relief-first framing that (a) opens by acknowledging what IS working, people are finding and reaching
  the site, and (b) names the Bookable gate as the *most fixable* stage, not a failure. Reuse the
  existing `m.monthVisitors` / `m.monthLeads` / `m.hasAnalytics` values already computed at
  WebsiteOverview.tsx:237-247, no new data. Branch on the zero case explicitly, because zero leads is
  the sensitive one:
  - **Visitors present, ≥1 lead:** `"${visitors} people reached your site this month and ${leads} asked
    to book. The visitor-to-booking step is the most recoverable stage in your funnel."`
  - **Visitors present, 0 leads:** `"${visitors} people reached your site this month, the audience is
    there. Turning those visits into booking requests is the single most fixable step, and it's the one
    Alloro is working on for you."` (Relief + a real, in-capability move, never "you failed.")
  - **No analytics yet:** keep the existing honest fallback at :239 (it already reads well and does not
    over-claim), but align its tone to the above.
- **Voice guardrail:** no discouraging verb ("turned ... into 0"), no jargon, no fabricated number, and
  no action-verb homework directed at the owner ("you should", "go fix") per sentiment-lattice.md:211-218 [substrate: alloro-brain, local],
  Alloro reports what's happening and what *it* is doing.
- **Done when:** on a real connected account with 0 leads (e.g. Artful), the leads screen opens with a
  relief-first sentence that names the Bookable step as fixable, and the literal phrase "turned N
  visitors into 0 leads" appears nowhere. Verify by rendering the surface with `monthLeads = 0,
  monthVisitors > 0` and reading it as the owner.

## FIX 5.2, "Website Leads: Not connected yet" is a dead-end (Gap 4a instance)

- **Owner sees (Artful/Pawlak):** the Patient Journey funnel's Website Leads card renders **"Not
  connected yet"** on a site that is connected, a dead-end that reads as broken, with no move.
- **Root cause:** `frontend/src/components/dashboard/patient-journey/patientJourney.utils.ts:31-40`
  (`stageEmptyStateCopy`). The copy is keyed **only** to `unavailableReason`, ignoring which stage it
  is: `no_data` → *"No Google data for this month"* and the default → *"Not connected yet"* are both
  **Google-flavored and wrong for a leads (forms) stage**, and neither points to a fixable move. It
  renders from PatientJourneyStageCard.tsx:157 whenever the leads stage is `available: false`.
- **The fix (make the copy stage-aware; reuse the existing switch):** branch `stageEmptyStateCopy` on
  `stage.key` first, then `unavailableReason`. For `stage.key === "leads"`, return Bookable-appropriate,
  relief-framed, non-dead-end copy:
  - `not_connected` → `"Your website's booking form isn't sending leads to Alloro yet, connecting it is
    this stage's one fixable move."`
  - `no_data` → `"No booking requests came in through your forms this month yet."` (an honest zero, not
    a failure, matches the FIX 5.1 zero voice).
  - `pending` → keep a neutral "Still counting this month's booking requests."
  Leave the existing Google (impressions) copy paths untouched, this is additive, not a rewrite of the
  working cases. Do **not** add a `not_connected`→"Google" string to the leads stage.
- **Dependency note:** the distinct reasons (`not_connected` vs `no_data`) only reach the frontend once
  Chapter 1 sets them on `readLeads` (stageReaders.ts:311-345 currently returns a reason-less
  `emptyRead()`). If Chapter 1 has not landed, the leads stage falls to the default branch, so make the
  leads-stage **default** (no reason) also return the `not_connected` copy above, never "Not connected
  yet". That way the dead-end is gone even before Chapter 1's reason code arrives.
- **Done when:** the leads card never shows "Not connected yet" or "No Google data" for the leads stage;
  a connected site with zero submissions reads the honest-zero copy, and an unconnected form reads the
  one-fixable-move copy. Verify by rendering the leads stage with `available:false` and each
  `unavailableReason` (and with none).

## FIX 5.3, Produce the Bookable candidate card (Chancellor quality) for Chapter 7

- **Owner sees today:** nothing for this stage. Every "one move" Alloro currently emits is Findable-stage,
  `getOverviewRecommendedAction` only ever returns *"Start posting to Google Business Profile weekly"*
  / *"Reply to unanswered Google reviews"* / *"Add fresh photos"* (rankingsDashboard.utils.ts:105-131),
  and the checkup `ozMoment` cards are all reviews/photos/rating/rank (ozMoment.ts:264-334). **There is
  no Bookable recommendation at all.** This is Gap 1 (generic advice) at the Bookable stage.
- **Root cause:** no producer exists for a Stage-4 candidate. The funnel is assembled
  (`assemblePatientJourney`, PatientJourneyService.ts:122) and the pure descriptive headline is built
  (`buildHeadline`, funnelMath.ts:80-119), but nothing turns the visits→leads step into a *card with a
  move.*
- **The fix (add ONE pure function; reuse the funnel Alloro already builds):** add
  `buildBookableCandidate(stages, conversions, leakStageKey, context)` to
  `src/controllers/patient-journey/feature-utils/funnelMath.ts` (sibling of `buildHeadline`, same pure,
  no-DB contract at funnelMath.ts:80). It returns a candidate card in **Chapter 2's card shape** (hook /
  implication / action, matching the `OzMoment` interface at ozMoment.ts:91-97) or `null` when the data
  does not support an honest Bookable card. Selection across stages is Chapter 7's job; this function
  only produces the Bookable candidate. Logic, grounded strictly in available data:
  - **Trigger only when the Bookable step is real and it is the leak:** the visits→leads conversion is
    non-null (both stages `available`, `visits.value > 0`) AND `leakStageKey === "leads"`. Use the
    existing `buildConversions` output (funnelMath.ts:35-79), do not recompute.
  - **Hook (specific, caught-unseen):** name the real numbers Alloro read that the owner did not,
    e.g. `"${visits} people reached your site last month and ${leads} asked to book, the visit-to-
    booking step is where you're losing the most."` (When `leads === 0`: `"...and none reached the
    booking step yet."`)
  - **Action (ONE move, in-capability):** the fixable move on the site Alloro builds,
    e.g. `"Alloro is making the booking form the first thing a visitor sees and tightening the call-to-
    action from 'Learn more' to 'Book now.'"` (Reuse the decisive-CTA leak named at
    journey-lattice.md:130 [substrate: alloro-brain, local].) **Never** recommend online-booking scheduling, reviews, or GBP-completeness.
  - **Upstream honesty:** if visitors themselves are low (visits below a floor), return `null` for the
    Bookable card and let the Findable-stage chapter's candidate win, do not blame the booking step for
    an Awareness/Findable shortfall.
  - **Never fabricate:** if the visits→leads step is null/unavailable, return `null`. No phone-answer or
    response-time claims, that data does not exist (see the honesty guardrail above).
- **Done when:** `buildBookableCandidate` returns a card that passes the Chancellor test (below) on a
  real account where leads is the leak, and returns `null` (not a generic filler) whenever the Bookable
  data is absent or the leak is upstream. Add a unit test mirroring `patient-journey.service.test.ts`
  (the funnel test harness already exists) that asserts: a card on a `visits>0, leads` leak; `null` when
  `leads` is unavailable; `null` when the leak is `visits`.

---

## FIX 5.4, Ch5a RESPONDER, instant transactional auto-ack on Alloro's own lead form (the first owned-response increment)

*This is the achievable, in-lane, mostly-built increment of the owned-response rail. It sits ON TOP of the
honest floor above (FIX 5.1–5.3): those make the leads screen honest; this one turns a captured lead into
Alloro actually **doing** the Bookable move, instantly acknowledging the lead, so the card can say
"Alloro did this," attributed, not "you should follow up."*

- **Owner sees today:** a lead submits the form, the owner gets a notify email, and the lead hears
  *nothing* until a human at the practice happens to reply. The single highest-leverage Bookable action,
  responding fast, is left to chance, and the leads screen can only ever report a gap, never that Alloro
  closed it.
- **Why this is the right move (the lever):** speed-to-lead is the research-verified conversion lever, a
  lead contacted within ~5 minutes is roughly **21× more likely to qualify** than one contacted later. An
  instant transactional acknowledgement is the smallest honest version of that lever, and it is a move
  **Alloro does for the owner** (done-for-you, attributed to NS1), curing the operator's
  reconcile-two-systems nightmare (`library/canon/icp-spine.md` §8.3): the response happens on Alloro's
  own rail, so there is no second system to check and no gap to reconcile.
- **Grounding (verified on `origin/dev/dave`, per the frame-validation guide, this is mostly built):**
  - **Form-capture is BUILT.** Submissions to Alloro-hosted forms persist to
    `website_builder.form_submissions` via `POST /api/websites/form-submission`. Owner-notify email is
    already live on this path.
  - **The submitter-email send primitive EXISTS.** The newsletter double-opt-in flow already sends
    transactional email to a form submitter's address, so emailing the lead is not new plumbing.
  - **Therefore Ch5a = a per-form toggle + a lead-facing template on the existing send path**, fired on
    the same submission event that already sends the owner-notify. Small, in-lane.
- **The fix (in-capability, done-for-you, attributed):**
  - On a lead submitted to an Alloro-hosted form, when the form's responder toggle is on, send **one**
    instant transactional auto-acknowledgement to the lead (branded as the practice, on Alloro's rail),
    confirming their request landed and setting the expectation of a reply. This is the practice's own
    earned lead being acknowledged, in-lane.
  - Make it **attributed** back to the leads screen: the Bookable surface can now honestly say Alloro is
    responding to new leads instantly on the owner's behalf (NS1-attributed done-for-you), turning the
    screen from "here's your gap" toward "Alloro is working this for you."
- **Hard in-lane boundary (do NOT cross):** exactly **one** transactional acknowledgement per submission.
  **No** second message, **no** nurture sequence, **no** drip, **no** scheduled follow-up, **no** outbound
  AS the practice to a human beyond that single instant ack. A drip/nurture/follow-up sequence is
  **out-of-lane and forbidden** (it is the practice speaking to a human, which Alloro does not do). If a
  requirement implies more than one message, it belongs to a different, un-staked lane, stop and flag it.
- **Optional, NOT required for the basic ack (do not let it block Ch5a):** a speed-to-lead **timer /
  escalation** (e.g. "if no human replied within N minutes, escalate/re-notify") is a **MODERATE** add,
  it needs a queued job + SLA state on the submission, not the small toggle-plus-template of the basic
  auto-ack. Ship the instant auto-ack first; treat the timer/SLA as a later, optional increment.
- **Never fabricate / never over-claim (Value #6):** the ack confirms only what is true (the request was
  received). It must not promise a booking, a specific response time the practice hasn't committed to, or
  any scheduling capability Alloro does not have.
- **Done when:** a lead submitted to an Alloro-hosted form with the responder on receives exactly one
  instant transactional acknowledgement at their address, off the existing submission-send path; the
  owner-notify still fires unchanged; the toggle default and copy are staked by Corey; and no second/drip
  message is possible from this path. Verify by submitting a real test lead on a connected Alloro form on
  dev and confirming exactly one lead-facing email arrives.

## Ch5b, Attribution (visitor→booking, first-party): NAMED here, NOT specced as buildable-now

*Stated honestly so the sequence is explicit and no one mistakes it for this slice. This is the deep moat.
It is sequenced AFTER Ch5a. It is **not** buildable now and must not be specced as a task in this chapter.*

- **What it would be:** first-party, per-record attribution, "this specific booking came through Alloro,"
  the visitor→booking chain owned end-to-end, so the leads screen can attribute real bookings (not just an
  aggregate ratio) to Alloro's work.
- **Why it is a BIG BUILD, not a slice (verified on `origin/dev/dave`):**
  - **No booking/appointment entity exists** anywhere in the codebase, there is nothing to attribute a
    booking *to*.
  - **Submissions carry no visitor/session id.** `form_submissions` records only `sender_ip`; there is no
    stable visitor id linking a site session to a submission.
  - **Only aggregate funnel math exists** (`monthVisitors ÷ monthLeads`, `websiteMetrics.ts:286`), not
    per-record attribution.
  - So first-party attribution needs **three new pieces**: (1) a booking/outcome record, (2) a visitor id
    stamped on each submission, and (3) the join (Rybbit session → submission → booking). That is a
    deliberate build, not a copy/logic diff.
- **Do NOT** confuse this with `leadgen_sessions`, that is Alloro's OWN audit-tool acquisition funnel
  (audit visitor → Alloro account), not the customer's patients or bookings.
- **Sequence:** Ch5a first (the cheap owned-response increment that delivers real value now), Ch5b as a
  deliberate, later big build. This chapter does not spec Ch5b; it names it so the roadmap is honest.

---

## How this chapter's card reaches Chancellor quality

The gold standard already live (One Endo, PMS-gated): *"Call Dental Care at Chancellor Crossing, your
single largest referral source, dropped from 26 referrals to 21 this period. Call them this week."*
Specific, caught-something-they-could-not-see, ONE move. The Bookable card reaches the same bar on
**public/connected funnel data** by meeting all three tests:

1. **Specific**, it uses the owner's *own* real numbers (`monthVisitors`, `monthLeads` from
   websiteMetrics.ts:248-257; the visits→leads conversion from funnelMath.ts:35-79), never a benchmark
   or a fabricated figure.
2. **Caught something they could not see**, the owner feels "fewer patients," not "my visitor-to-
   booking step is leaking." Naming the exact stage from data they cannot read themselves is the Oz
   moment (Cialdini's proof-first authority, knowledge-lattice.md:416-426 [substrate: alloro-brain, local]; Guidara's "one thing nobody
   else would notice," knowledge-lattice.md:355-362 [substrate: alloro-brain, local]).
3. **ONE move, this week, that Alloro does**, a single in-capability action on the site (the form + the
   decisive CTA), not a menu, not homework. This is the most fixable stage (journey-lattice.md:132 [substrate: alloro-brain, local]), so
   the move is real and near, and Alloro is doing it, inverting the moat (tell the #1 move AND do it).

## Voice rules (apply to every string in this chapter)

- **Relief-first / feel-first.** Open by acknowledging what is working (people are reaching the site)
  before naming the gap. The Watchline before the data (sentiment-lattice.md:366-374 [substrate: alloro-brain, local]).
- **Plain language, no jargon.** No "conversion rate," "funnel," "CTA" in owner-facing copy without a
  plain gloss. Write for an owner who never trained in marketing (journey-lattice.md:160-166 [substrate: alloro-brain, local]).
- **Trend / opportunity, never verdict.** "The most recoverable step" beats "0 leads." Never a
  discouraging frame, never a composite score (sentiment-lattice.md:286-293 [substrate: alloro-brain, local]).
- **No homework verbs directed at the owner.** No "you should / go fix / connect your." Alloro reports
  what's happening and what *it* is doing; any human action is a one-tap option, not a to-do
  (sentiment-lattice.md:211-218 [substrate: alloro-brain, local]).
- **Never fabricate, never over-claim (Value #6).** Only numbers Alloro actually read; only capabilities
  Alloro actually has. No guarantees.

## The staking gates (the humans own the truth)

- **Corey** stakes that the framing is right, that the leads screen now delivers relief and a real move,
  not a failure verdict.
- **Dave / his Claude** implements the diffs and **verifies each against a real practice's live data
  before merge**, renders the Artful/Pawlak leads screen and reads it as the owner, confirms the card's
  numbers match reality, and confirms `null` is returned (not filler) when the data is absent.

## Scope boundary

This chapter is **the Bookable stage read + the leads screen + the Bookable candidate card + Ch5a, the
instant transactional lead auto-ack on Alloro's own form (FIX 5.4)**. It **names but does not build**
Ch5b (first-party visitor→booking attribution, a later big build, not this slice). It does **not** fix
Findable/Choosable recommendations (reviews, rankings, photos, the self-contradicting Pawlak rec lives
there), it does not build an online-booking/scheduling product (unbuilt), it does not send any
nurture/drip/follow-up outbound AS the practice (out-of-lane, the responder is a single transactional
ack only), and it does not own the cross-stage selection of the week's single move (Chapter 7). It
depends on Chapter 1 for the honest connection state and Chapter 2 for the card standard, and it hands
one Bookable candidate to Chapter 7.

---

## Revision Log

### Rev 1, 2026-07-07

- **Change:** Reworked Ch5 to reflect the sized Ch5 rail from `strategy/inversion-frame-validation.md`
  ("Ch5 rail sizing (RESOLVED)" + the FLIP). Kept FIX 5.1–5.3 unchanged as the honest floor (the
  copy/reframe/candidate fixes are correct and in-lane). Added a split banner to the header; added the
  responder as an in-lane "can honestly DO" in the honesty guardrail; added **FIX 5.4, Ch5a RESPONDER**
  (an instant transactional auto-acknowledgement to a lead on Alloro's own hosted form: the
  speed-to-lead lever, ~21× at 5 min, sized as a per-form toggle + a template on the existing
  submission-send path, grounded on `origin/dev/dave`, `website_builder.form_submissions`,
  `POST /api/websites/form-submission`, plus the newsletter double-opt-in submitter-email primitive;
  timer/SLA escalation noted as an optional MODERATE add, not required); added **Ch5b, Attribution**
  as a NAMED big build sequenced later (no booking entity, no visitor id on submissions, only aggregate
  funnel math → three new pieces required), explicitly NOT specced as buildable-now; and updated the
  Scope boundary. Held the in-lane line throughout: a single transactional ack on Alloro's own form is
  in-lane; any nurture/drip/follow-up outbound AS the practice is forbidden. No scheduler/booking product
  claimed; all "NOT available / do not fabricate" honesty fences preserved.
- **Reason:** Execution deviation / scope sharpening, the 2026-07-07 frame stake (Value #2 split +
  done-for-you + NS1-attributed) and the on-branch rail sizing landed after the 2026-07-06 draft; Ch5 is
  the keystone chapter and needed to split into the achievable owned-response increment (Ch5a) versus the
  deep attribution moat (Ch5b) so the roadmap is honest and the responder can be built now without
  over-claiming.
- **Updated Done criteria:** FIX 5.1–5.3 done-checks unchanged. New: **FIX 5.4 (Ch5a)**, a lead
  submitted to an Alloro-hosted form with the responder on receives exactly one instant transactional
  acknowledgement at their address off the existing send path; owner-notify still fires unchanged; toggle
  default and copy staked by Corey; no second/drip message possible from this path; verified by a real
  test lead on dev. **Ch5b** carries no build done-check this chapter (named, deferred).
