# Inversion, Chapter 7: The 30-Second Verdict + The One Thing (cross-stage capstone)

*Draft spec for Dave's Claude (`alloro-engineer`). Staged for Corey's review; not yet on Jo's board.
Code citations (`src/…`, `frontend/…`) are real `origin/dev/dave` file:lines, verified to exist on that
branch. Citations prefixed `substrate:` (the `*-lattice.md` files) are alloro-brain LOCAL design canon,
NOT files in `origin/dev/dave`, do not go looking for them in the repo. 2026-07-06.*

*This is the CAPSTONE chapter. It sits above the five stage chapters (Findable / Choosable /
Bookable / Memorable). Build it AFTER at least Chapters 1–2, but its contract is what stops the
stage chapters from each shipping their own competing top-of-dashboard card. Read the whole thing
before touching code, the surprising part is how much of the selector already exists.*

## The one law for this chapter (from the Journey Lattice)
"The recommendation is the product. Everything else is supporting evidence." (`substrate: journey-lattice.md:213`.)
The owner opens the Practice Hub and in 30 seconds knows two things, on ONE screen
(the 30-Second Test, `substrate: journey-lattice.md:223`): **(a) is my business healthy, and where is it
leaking**, and **(b) the ONE move this week**, caught from data they can't read themselves, with
no generic advice, no fabricated number, and no discouraging framing.

## Why this exists (read first: the owner, not the code)
A scared owner does not want five cards, four scores, and a funnel diagram to interpret. They want
the fourth signal that resolves the disagreement between their schedule, their bank balance, and
their last agency report (`substrate: journey-lattice.md:52-54`). Two failures on the live Practice Hub break
that promise:

1. **There is no "am I healthy" glance.** The hub shows a top action and four stat tiles, but nothing
   answers the question the whole Business-Clarity category is defined by (`substrate: journey-lattice.md:25`):
   *is my business healthy, and where is it leaking?* The owner has to assemble that himself from four
   dots, which is exactly the second job Alloro exists to remove.
2. **The dashboard shows TWO competing "top" statements, not one.** Directly under the "1 thing that
   matters" banner, a second recommendation-shaped line ("Your largest opportunity is moving people
   from X to Y…") renders from a different engine. Two things claiming to be the priority is cognitive
   overload, the exact anti-pattern the lattice forbids (`substrate: journey-lattice.md:207`, "Never show more
   than one recommendation at a time").

This chapter delivers the single 30-second glance: one honest health/leak **verdict**, then one
**move**. Everything else on the surface becomes supporting evidence.

## What ALREADY exists on dev/dave (do NOT rebuild: reuse it)
The one-thing SELECTOR is real and wired. Trace it before you write a line:

- **The candidate pool + scorer.** The SUMMARY (v2) agent is the "sole writer of practice-facing
  tasks" (`src/controllers/agents/feature-services/service.task-creator.ts:8`). It picks "the one
  thing that matters most" and emits a `top_actions[]` array, each carrying a `priority_score`
  (0.0–1.0 float, "higher = more urgent and impactful") and a `domain`
  (`src/agents/monthlyAgents/Summary.md:42`, `:49`, `:68`).
- **The schema.** `TopActionSchema` (`src/controllers/agents/types/agent-output-schemas.ts:358-394`):
  `priority_score` at `:361`, `domain` enum {review, gbp, ranking, form-submission, pms-data-quality,
  referral} at `:362-369`. `SummaryV2OutputSchema` (`:410-425`) allows `top_actions` min 1 / max 5.
- **The reduction to ONE (backend).** `createTasksFromSummaryV2Output` persists **only the single
  highest-priority action**, sorts by `priority_score` desc and `.slice(0, 1)`
  (`service.task-creator.ts:304-309`). "Never more than one" is already enforced server-side.
- **The reduction to ONE (frontend).** `useTopAction` filters to `agent_type === "SUMMARY"`, sorts by
  `priority_score`, returns `parsed[0]` (`frontend/src/hooks/queries/useTopAction.ts:156`, `:165-166`).
- **The render.** `OneThingBanner` shows that single action, or a calm "You're all caught up." state
  when there is none (`frontend/src/components/dashboard/focus/OneThingBanner.tsx:50-54`, `:62-65`).

So the SELECTOR is NOT missing. What is missing is (1) a health/leak **verdict** above it, (2) the
removal of the **competing second recommendation** on the same screen, (3) making both speak the
**four-stage vocabulary** the lattice mandates, and (4) **welding Alloro's attribution and the
done-for-you default into both** (FIX 4 / FIX 5), so the owner sees WHO caught the drift and WHO does
the move, the catch-22 break this capstone exists to deliver. Those are this chapter's fixes.

## The frame for Dave (what OUGHT to be there)
Not a rebuild. Three surgical diffs on top of an existing, working selector. The poka-yoke this
chapter installs: **the stage chapters (3–6) feed the SUMMARY candidate pool as inputs; they must
NEVER render their own top-of-dashboard card.** The Practice Hub home shows exactly one verdict line
and one action banner as its recommendation layer. Everything below (`PatientJourneyCard`,
`StatCardRow`, `ProductionPanel`) is supporting evidence, not a second opinion.

**⚠️ Coherence-pass resolution (2026-07-07, Corey-staked): make that poka-yoke REAL.** Today it is NOT: the ranking-LLM's `top_recommendations` renders its OWN top-of-dashboard card (`NextMoves` / `RankingsHubSurface`) that does not feed the SUMMARY pool, and Ch5/Ch6 candidates route to a third pipeline the selector never reads; `useTopAction` filters to `agent_type === "SUMMARY"` only. So there are really TWO selectors (the split-brain). The fix: **ONE candidate-card TYPE (defined in Ch2, `TopActionSchema` + `stage` + `execution_state` + `generic`) that EVERY generator emits, SUMMARY, the ranking-LLM, Ch5, Ch6, and ONE selector that reads them ALL into a single pool and picks the single highest-priority winner.** `NextMoves` / `RankingsHub` either feed that pool or are demoted to supporting evidence; they never render a competing top card. The WIRING (how each generator emits the type, how the selector ingests all sources) is **Dave's**, the spec fixes the contract, not his plumbing.

---

## FIX 1: One recommendation on screen, not two (kill the competing leak headline)
- **Owner sees:** the "1 thing that matters" banner, and immediately below it a second
  recommendation-shaped line (illustrative render of the live `buildHeadline` template; the specific
  stages and the "3%" are whatever that practice's data produces): *"Your largest opportunity is moving
  people from Website Visitors to Website Leads. Only 3% moved through."* Two "top priorities," side by side.
- **Root cause:** `DashboardOverview` mounts `<OneThingBanner />` and `<PatientJourneyCard />` as
  adjacent siblings (`frontend/src/components/dashboard/DashboardOverview.tsx:156-157`).
  `PatientJourneyCard` renders "the biggest-leak headline one-liner"
  (`frontend/src/components/dashboard/focus/PatientJourneyCard.tsx:15-19`), which comes from
  `buildHeadline` (`src/controllers/patient-journey/feature-utils/funnelMath.ts:80-108`). That
  headline (a) is a SECOND recommendation competing with the SUMMARY one-thing, (b) names the single
  biggest leak across the whole six-stage patient-journey funnel (`buildHeadline` picks
  `conversions.find(c => c.isLeak)`, so it can name a DIFFERENT stage than the SUMMARY one-thing, not
  just the website steps), and (c) names a problem with **no action**,
  "your largest opportunity is X" with nothing to do, which violates `substrate: journey-lattice.md:211`
  ("Never frame a problem without naming the action").
- **The fix (minimum diff, reuse):** on the Practice Hub home, `PatientJourneyCard` renders as
  **supporting evidence only**, the two stage-number tiles + the "view full journey" link, and
  **drops the `headline` line**. Do NOT delete `buildHeadline` or the `/patientJourneyInsights`
  screen; the headline stays valid THERE (a detail screen the owner opened on purpose, where a leak
  callout is context, not a competing priority). Only the home-surface instance loses the headline
  line. Net: exactly one recommendation-shaped element above the fold, the `OneThingBanner`.
- **Done when:** on the Practice Hub home, the only recommendation-voiced line is the SUMMARY
  one-thing. `PatientJourneyCard` shows numbers + link, no "your largest opportunity…" sentence. The
  `/patientJourneyInsights` detail screen is unchanged.

## FIX 2: Add the missing HEALTH/LEAK VERDICT glance (new; reuse-heavy; NO new data)
- **Owner sees today:** no answer to "am I healthy?" Just an action (or "all caught up") and four
  raw stat tiles. He has to infer his own health from four colored dots.
- **What OUGHT to be there:** one sentence, feel-first, at the very top of the recommendation layer,
  that answers *healthy / where leaking* before the action, the Watchline pattern
  (`substrate: sentiment-lattice.md:366-374`, "the first line tells me whether to relax or pay attention").
  Examples of the two shapes (attribution welded in, see FIX 4; attribute the CATCH, never the CAUSE):
  - Healthy: *"Your practice is healthy this month. Nothing slipped where we can see it."*
  - Leaking: *"Alloro spotted one gap this month: your reviews stage started slipping. Here's the move."*
  Then the existing `OneThingBanner` action follows as the "here's the move."
- **This capability does NOT exist yet, it is new.** Build it, do not pretend it's there. But build
  it from signals ALREADY on the screen, so it needs zero new fetch:
  - The four stat tones already computed for `StatCardRow`, `referralStatus`, `localRankStatus`,
    `reviewTone`, `formSubsTone` (`frontend/src/components/dashboard/focus/statusRules.ts`), each
    returning `positive | warn | critical | neutral`. These four map to stages (same mapping the
    `DOMAIN_TO_STAGE` constant in FIX 3 uses, so the verdict and the eyebrow never disagree):
    Local rank → **Findable**, Reviews → **Choosable**, Form Submissions → **Bookable**,
    Referrals → **Memorable**. (The review signal feeds the verdict only as TONE; Ch7 authors no
    review action, see the reviews-ownership note under FIX 3.)
  - The presence/absence + `urgency` of the SUMMARY `topAction` (`useTopAction`).
- **The fix (a pure synthesizer + one line of UI):**
  1. Add a pure helper (mirror the style of `statusRules.ts`; put it beside it, e.g.
     `focus/verdict.ts`) `buildHealthVerdict(tones, topAction)` that returns `{ text, leakStage }`:
     - If **any** stat tone is `critical` → verdict names that stage as the leak (critical wins).
     - Else if **any** tone is `warn` → "Healthy overall, with one gap: {weakest stage}."
     - Else if all measured tones are `positive` → the healthy/clean-week line
       (`substrate: sentiment-lattice.md:316-323`, The Clean Week Exhale).
     - **`neutral` (unknown) is NOT "healthy."** A neutral stat means "we can't see this yet," so the
       verdict must scope its claim to what is visible: *"Based on what we can see, …"*, never assert
       health over a signal Alloro doesn't have (`substrate: sentiment-lattice.md:296-304`, Stage-1 Facts-Only;
       Theranos, `substrate: knowledge-lattice.md:211-221`). If every tone is neutral, verdict = an honest
       "connect more of your data to see your health picture," never a fabricated all-clear.
  2. Render it as one line at the top of `OneThingBanner` (above the eyebrow), reuse the existing
     `ActionBannerShell` / `ActionBannerEyebrow` primitives; no new component shell.
- **Honesty guardrails (non-negotiable):** the verdict is a **sentence, never a composite score**,
  no "73/100," no rings (`substrate: sentiment-lattice.md:286-294`, Score Rings Removed). Every claim in it is
  traceable to a real tone or a real `topAction` field; nothing is invented.
- **Done when:** the Practice Hub home opens with one honest verdict line that (a) says healthy or
  names exactly one leaking stage, (b) never claims health over an unknown/neutral signal, (c) is a
  sentence not a number, followed by the one-thing action. Verify against all three pilots: a clean
  practice reads the exhale line; a practice with a warn/critical stat reads the named-leak line; a
  data-desert practice reads the honest "connect more data" line.

## FIX 3: Make the verdict + one-thing speak the four-stage vocabulary (domain → stage)
- **Owner sees:** the one-thing is anchored in an internal `domain` taxonomy
  (review / gbp / ranking / form-submission / pms-data-quality / referral), not the customer-journey
  stages the whole lattice is built on (Findable / Choosable / Bookable / Memorable). The lattice law
  is that the one thing is "anchored in the weakest stage" and "names one stage explicitly"
  (`substrate: journey-lattice.md:188`, `:192`). Today it names a domain, and there's no code that maps the two.
- **Root cause:** no `domain → stage` map exists. `domain` is the enum at
  `agent-output-schemas.ts:362-369`; nothing translates it to a stage. FIX 2's verdict also needs
  this map to name its leaking stage.
- **The fix (one tiny pure map, shared by FIX 2):** add a single source-of-truth constant
  `DOMAIN_TO_STAGE`:
  - `ranking`, `gbp` → **Findable**
  - `review` → **Choosable** (reviews win the comparison; `substrate: journey-lattice.md:102`)
  - `form-submission` → **Bookable**
  - `referral`, `pms-data-quality` → **Memorable**
  Use it in two places: (1) the verdict (FIX 2) names the leaking stage via this map; (2)
  `OneThingBanner`'s eyebrow reads "This month · {Stage} · 1 thing that matters" so the single move is
  visibly stage-anchored. No LLM change, no new data, a presentation-layer map.
- **Reviews single-ownership (so the map is not soft):** `review → Choosable` labels the *stage the
  review action addresses*, not the chapter that authors it. Ch7 **owns no review action** and generates
  no review card. The review ASK / velocity / reply top-action is owned end-to-end by **Ch6 (Memorable)**;
  the review-quality *choose-signal comparison* is owned by **Ch4 (Choosable)** as a domain-summary read,
  not a top-action. Ch7 only (a) uses the `reviewTone` stat as a verdict-TONE input and (b) applies this
  map to label whatever action the SUMMARY selector already surfaced. It never emits, re-scores, or
  competes with Ch4's or Ch6's review work.
- **Deeper flag (separate, larger, recommend, do NOT bundle into this slice):** `priority_score` is
  a free-form LLM float (`Summary.md:68`); nothing *proves* the selected action is the weakest stage
  or the biggest drift, only that the model judged it most urgent. Truly enforcing "anchored in the
  weakest stage or biggest drift" would mean deriving weakness deterministically (from the stage reads
  Chapters 3–6 produce) and using it as the scorer's tie-break or floor. That is a scoring-architecture
  change with its own spec, flag it, don't sneak it in here. This chapter enforces the *vocabulary*
  and the *single-card* discipline; the deterministic re-basing is a follow-on.
- **Done when:** the verdict names a journey **stage** (not a domain) as the leak, and the one-thing
  banner's eyebrow shows the stage it belongs to, both driven by the one `DOMAIN_TO_STAGE` constant.

## FIX 4: Weld Alloro's attribution into the verdict + one-thing (the catch-22 break)
- **Owner sees today:** the verdict and the action read like weather, *"reviews are slipping, here's
  a move"*, with no fingerprints. Nothing tells the owner that **Alloro** is the thing watching,
  catching, and (for in-lane built moves) doing. That silence is why the ROI stays invisible: an owner
  can't credit a system they never see act. Attribution is the missing catch-22 break, the whole
  reason the capstone is the first surface the owner sees.
- **What OUGHT to be there, two welds:**
  1. **Attribute the CATCH (both health states, always honest).** The verdict names Alloro as the
     watcher that spotted the drift the owner couldn't read: *"Alloro spotted your reviews stage
     slipping before it cost you a booking."* This is truthful for **every** domain, Alloro's SUMMARY
     agent DID select it from data the owner can't see. **Attribute the CATCH, never the CAUSE:** Alloro
     caught the drift; Alloro did not *make* the practice healthy. Never write "Alloro kept you healthy"
    , that is an unearned causal claim. The healthy line stays scoped to what Alloro can see (FIX 2),
     with no false Alloro-caused-it credit.
  2. **Close the loop AFTER a done-for-you move (in-lane BUILT only).** When the previous one-thing was
     an in-lane BUILT action Alloro executed on approval (a GBP post, a review reply), the NEXT verdict
     cycle closes the loop with the real result: *"Alloro published the review reply you approved; your
     reviews stage is back in the green."* Every number in that loop-back is a real logged outcome from
     the owned rail (`gbp-write.service.ts`, verified built), **never a projected or fabricated lift.**
     For UNBUILT/read-only domains (`ranking`, `pms-data-quality`, a review-VELOCITY ask) and the
     owner-move (`referral`), there is NO Alloro-did-it loop-back, only the catch attribution. Do not
     fabricate an execution Alloro never ran (`project_alloro_built_vs_unbuilt_capabilities`).
- **Done when:** every leak verdict attributes the catch to Alloro without claiming Alloro caused the
  health; and after any approved in-lane built move, the following cycle's verdict/one-thing carries a
  real logged loop-back result, with no loop-back ever shown for a domain Alloro cannot execute.

## FIX 5: Default the one-thing to done-for-you, and branch the card on the domain
- **Owner sees today:** the one-thing reads as homework regardless of domain, a thing the owner must
  go do. But the internal `domain` enum (`agent-output-schemas.ts:362-369`) mixes two fundamentally
  different kinds of move, and **the card framing must branch on which**:
  - **In-lane, BUILT-NOW execution domains, `gbp` (posts) and `review` (the REPLY):** Alloro has a
    real, wired, approve-gated write-rail here (`gbp-write.service.ts:121/131` publish, `:71/81` reply;
    verified built). The DEFAULT card shape is **done-for-you, one tap:** *"Alloro drafted a reply to
    your 3 new reviews, approve to publish."* NOT "you should reply." The owner commands; Alloro
    executes on approval (`icp-spine §8` two-seat; AI drafts, human stakes). This is the default, not
    the exception.
  - **In-lane, owned-rail-IN-PROGRESS, `form-submission` (the Bookable response):** the lane is
    Alloro's (it hosts the form, capture is built), but the instant auto-acknowledgement responder is a
    **Ch5a build, not yet live.** Frame it as the in-lane move that BECOMES done-for-you when Ch5a ships
   , do NOT claim a live done-for-you responder today. Until Ch5a lands it stays observation, never a
    fake one-tap.
  - **Owner-relationship domain, `referral`:** the genuinely-owner move (calling the GP, tending the
    referral relationship) has NO rail Alloro can run for them. This is the ONE **done-WITH-you**
    handoff: *"Dental Care at Chancellor dropped from 26 to 21 referrals, call them this week."* It is
    the EXCEPTION to the card shape, not the default.
  - **Read-only / can't-execute domains, `ranking`, `pms-data-quality`, and a review-VELOCITY ask:**
    no write-rail exists; these stay observation only (the verdict's tone + the catch attribution),
    never reframed as a task or a fake done-for-you. Alloro cannot move a ranking, rewrite a PMS record,
    or send review-solicitations for the owner, do not imply it can.
- **The fix (presentation-layer branch, no new data, no new capability claimed):** the one-thing card
  reads its `domain` and picks the frame, done-for-you CTA for the BUILT-NOW in-lane set (`gbp`,
  `review` reply), done-with-you handoff for `referral`, plain observation for the read-only set and for
  the not-yet-built `form-submission` responder. The honesty floor holds: GBP photo-refresh, category
  write-back, review-GENERATION, and booking/PMS connectors are NOT built and are never framed as
  done-for-you (`project_alloro_built_vs_unbuilt_capabilities`).
- **Done when:** an owner whose one-thing is a GBP post or a review REPLY sees a one-tap "Alloro will do
  this, approve" card (not a to-do); an owner whose one-thing is a referral move sees the single
  done-with-you handoff; and a ranking / PMS / review-velocity / not-yet-built-responder one-thing is
  never framed as a task Alloro will perform.

## The two altitudes: the owner's glance and the operator's operable surface
The 30-second verdict is the **owner's** altitude, the glance they take and leave. The detail beneath
it (`PatientJourneyCard`'s stage numbers, the stat tiles, the approve CTA on the one-thing) is NOT
passive "supporting evidence", it is the **operator's operable altitude** (`icp-spine §8.8`: the
operator's surface IS the owner's glance made actionable). The operator, the front-desk / office lead
who actually logs in, works ONE motion from that layer: approve the drafted reply, open the flagged
stage. Name both altitudes in the build: the verdict serves the owner's relax-or-act glance; the layer
below serves the operator's single next motion. Do not collapse them into one "dashboard the owner
reads", the owner glances, the operator operates (`icp-spine §8` two-seat split; the §8.9 fork, now
unblocked by the 2026-07-07 Value #2 stake).

---

## Voice rules (every string this chapter emits)
From the Translation Layer (`substrate: journey-lattice.md:160-166`) and the Sentiment Lattice:
- **Relief-first / feel-first.** The verdict opens by telling the owner whether to relax or pay
  attention, before any data (`substrate: sentiment-lattice.md:366-374`, The Watchline). Lead with acknowledgment,
  never with a score or a metric.
- **Never discouraging.** Never "you turned 80 visitors into 0 leads." Always name the gap AND the
  move in the same breath; a problem without an action is banned (`substrate: journey-lattice.md:211`). Reframe
  leaks as the next move, not a failing grade.
- **Plain, owner's voice, no jargon.** No "conversion rate," "funnel step," "domain," "priority_score."
  Write for an 18-year-old on first read. Stage names in plain terms.
- **Trend-focused.** "Up from last week" beats "23% above benchmark" (`substrate: journey-lattice.md:166`).
- **No homework verbs at the owner.** No "you should," "go to," "open your," "connect your" in the
  verdict or action title; if a human step is needed it's a one-tap CTA, not a to-do
  (`substrate: sentiment-lattice.md:211-218`, No Tasks). (Note: the "connect more data" fallback is a state
  description of what Alloro can see, not a command, phrase it as such.)
- **A sentence, never a number.** No composite health score, ever (`substrate: sentiment-lattice.md:286-294`).

## How the verdict + one-thing reach Chancellor quality
The gold standard (One Endo, PMS-gated): *"Call Dental Care at Chancellor Crossing, your single
largest referral source, dropped from 26 referrals to 21 this period. Call them this week."*
Specific · caught-something-they-couldn't-see · ONE move. This chapter reaches that bar with the
data it has by enforcing:
- **Specific + caught-unseen:** the one-thing is already the SUMMARY action, whose supporting_metrics
  cite real source fields (`agent-output-schemas.ts` `SupportingMetricSchema`, `:351`); the verdict is
  synthesized from real tones, never a template. This is Guidara's "one observation from their own
  data that proves you were paying attention" (`substrate: knowledge-lattice.md:355-362`).
- **One move:** the selector already reduces to one (`service.task-creator.ts:304-309`); this chapter
  makes sure a second recommendation never re-appears beside it (FIX 1). One winnable action
  (BJ Fogg, `substrate: knowledge-lattice.md:368-378`).
- **The full narrator arc across the two parts:** the verdict = *what was happening / where it's
  leaking*; the one-thing = *the move*; the supporting cards = *what changed*
  (`substrate: sentiment-lattice.md:326-334`, The Narrator Principle). Proof sits UNDER the recommendation, never
  above it, evidence-first trust (Cialdini, `substrate: knowledge-lattice.md:416-426`).
- **Never fabricate to reach specificity.** If the data isn't there, the verdict scopes to what's
  visible and the one-thing falls back to the honest calm state, never a plausible-sounding invented
  leak (Stage-1 Facts-Only, `substrate: sentiment-lattice.md:296-304`; Theranos, `substrate: knowledge-lattice.md:211-221`).

## The staking gates (the humans own the truth)
- **Corey** stakes that the verdict framing is right, that the healthy line reads as relief and the
  leak line reads as a move, not a failing grade, by walking the Practice Hub as each of the three
  pilots (Garrison, Artful/Pawlak, One Endo).
- **Dave / his Claude** implements the diffs and **verifies each against a real practice's live data
  before merge**: the verdict's tones must match that practice's actual stat tones, and the named
  leak stage must match the SUMMARY action's domain via the map. A Claude-to-Claude wire cannot skip
  this, the truth-gate is a human looking at one real hub.

## Scope boundary
This chapter is the **capstone contract**: one verdict + one move, single-card discipline, stage
vocabulary, Alloro-attributed, done-for-you by default for the built rails. It does NOT re-architect
`priority_score` (flagged in FIX 3 as a follow-on), and it does NOT build the per-stage reads
themselves, those are Chapters 3–6, which feed the SUMMARY candidate pool as inputs. Build FIX 1
(remove the competing card) and FIX 3 (the map) first; they are pure subtraction and a constant. FIX 2
(the verdict), FIX 4 (attribution weld), and FIX 5 (the done-for-you domain branch) are the genuinely
new surface, build them together, on the reused tones and the existing `domain` enum, claiming no
capability a rail doesn't already have, and walk it as the customer before calling it done.

---

## Revision Log

### Rev 1, 2026-07-07
- **Change:** Frame-sharpening pass against the 2026-07-07 stake (`strategy/inversion-frame-validation.md`),
  applied per the Ch7 chapter edits. Added **FIX 4 (attribution weld)**: the verdict attributes the
  CATCH to Alloro ("Alloro spotted your reviews stage slipping…") and, after an approved in-lane built
  move, closes the loop with the real logged result, attributing the catch, never the cause (never
  "Alloro kept you healthy"), and never a loop-back for a domain Alloro can't execute. Added **FIX 5
  (done-for-you default + domain branch)**: the one-thing card branches on the `domain` enum, `gbp`
  posts and `review` REPLY (BUILT, approve-gated, `gbp-write.service.ts`) default to a one-tap "Alloro
  will do this, approve" card; `form-submission` (Bookable responder) is framed as in-lane but
  not-yet-live (Ch5a build); `referral` is the single done-WITH-you handoff exception; `ranking` /
  `pms-data-quality` / a review-VELOCITY ask stay read-only observation. Added the **two-altitudes**
  section naming the beneath-the-glance layer as the operator's operable surface (`icp-spine §8.8`),
  not passive "supporting evidence." Updated the FIX enumeration (line ~58) and the Scope boundary to
  sequence FIX 4/5. Verdict examples reworded to weld attribution.
- **Reason:** Frame validation (`inversion-frame-validation.md`): attribution was ENTIRELY missing from
  the capstone (the first surface + the designated catch-22-breaker), and the one-thing defaulted to
  owner-homework instead of the done-for-you shape the 7/07 Value #2 stake requires for built in-lane
  rails. Two-altitude (§8 owner-glance + operator-surface) was collapsed.
- **Honesty guardrails held:** the done-for-you flip is claimed ONLY for BUILT rails (GBP posts +
  review replies, approve-gated, verified on `origin/dev/dave`); UNBUILT (photos, category,
  review-generation, booking, PMS) stays read-only and is never framed as done-for-you; the
  `form-submission` responder is honestly marked not-yet-live; no number is fabricated (loop-back
  results are real logged outcomes only). FIX 1 (single-card), FIX 3 (domain→stage map), the
  "sentence not a number" rule, and every `neutral≠healthy` / "based on what we can see" honesty
  citation are preserved unchanged.
- **Updated Done criteria:** every leak verdict attributes the catch to Alloro without claiming Alloro
  caused the health; an approved in-lane built move produces a real logged loop-back the next cycle;
  the one-thing card renders done-for-you for `gbp`/`review`-reply, done-with-you only for `referral`,
  and observation for the read-only / not-yet-built domains; the operator altitude is named as an
  operable surface, not "supporting evidence."
