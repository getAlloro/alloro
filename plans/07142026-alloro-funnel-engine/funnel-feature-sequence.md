# Alloro Funnel Engine — Identified + Sequenced Feature List

**Produced:** 2026-07-15 · **Re-anchored to live canon:** 2026-07-15 (Rev A) · **Discipline:** `sequential-build` (one at a time, verify each artifact before the next).
**Purpose:** the master build-list for **Driver 2 (Alloro Connect / the presence layer)** — the funnel that makes people find and choose the business — with each feature's TRUE build-state, sequenced in dependency order. This file is the map; specs and PRs come one-at-a-time after it.

## Canon anchor (grounded in the library, the emerging source of truth — not memory, not Notion)
Read live 2026-07-15 from `alloro-artifacts/library/canon/` (per `library/canon/README.md`: "the Library becomes the MAIN source of truth in the Alloro OS," Corey 2026-07-07).
- **The mission is freedom, not findability** (`library/canon/mvv.md`). Alloro gives the owner back the life they built the business for by *translating* the business (Cesar Millan). This funnel is **Driver 2 — "make sure people can find them"** (`mvv.md:115`) — the *second* of two drivers, in service of that mission. It is **how Alloro delivers the clarity product, not what the product is** (START HERE: the growth system "DEFERS to the canon for identity").
- **Done = the raised hand, not a booked dollar.** `strategy/canon-to-stake.md:46` — "**The metric is a lead, not a dollar** (form submissions = appointment-requests; attribution to booked revenue isn't built)." The bottom-of-funnel outcome Alloro measures is the **form submission on Alloro's own hosted rail**. *(Value #4's literal "booking within 30 days" wording is a pending Corey-stake, `canon-to-stake.md:18` — the principle is resolved, the canon text isn't yet edited.)*
- **The moat is channel-ownership** (✅ STAKED Corey 2026-07-12, `canon-to-stake.md:55–63`): "owning the **CHANNEL** the work flows through is the moat; the work you do on someone else's rail is the wedge." Hosting the site so leads flow through Alloro's own intake (`formSubmissionController`, `*.sites.getalloro.com`) is un-removable = the escape-velocity path; GBP posts / review replies on Google's rail = the wedge that gets in the door. **This weights the sequence** (see Reconciliation notes at the end).
- **Every feature must clear the canon bar:**
  - **NS1 — Undeniable + ATTRIBUTED** ("how did they know that?"; "attributed" added by Corey 2026-07-07, `canon-to-stake.md:8`) — the owner must know the value came from Alloro. This is *why the measurement rail is foundational, not last.*
  - **Value #2 — owner is the hero** (`mvv.md:77`; toggle / preview / approval on every lever; capable on understanding, done-for-you on execution).
  - **Value #6 — intentions, not promises** ("designed to," never "will"; no rank/visibility/guarantee claim anywhere).
  - **Value #3 — truth in plain English**, specific to *this* business.

## Definition of done — per feature (canon bar + Dave's CD SOP)
A feature is done only when all of these hold, in order:
1. **Spec names behavior + edge cases precisely** — Dave's bar ("AI augments vision, and so augments vagueness"; Slack 2026-07). Cites the reused analogs + `§N.M` Articles. No vague spec reaches build.
2. **Built in the sandbox test kitchen, in Dave's style** — study his code in the files the feature touches first (match structure/naming/conventions so the diff reads familiar); additive + reversible; `npm run check:all` clean; behavior verified by *running* it, not by reasoning.
3. **A fresh adversary (`alloro-proof`) told to break it** → bugs fixed → re-verified.
4. **Clears the canon bar** — NS1 undeniable+attributed, owner-is-hero controls, Value #6, plain-English truth.
5. **A PR to `dev/dave` with its context** for Dave to review + merge. **Never push to dev/dave or main directly.** Post-merge smoke/stress test is a separate step, run on Corey's/Dave's go.

## Sources (grounded, not recalled)
- Canon: `alloro-artifacts/library/canon/mvv.md` + `strategy/canon-to-stake.md` (read live 2026-07-15).
- Build-state: `alloro-artifacts/strategy/connect-lever-audit.md` (captured **2026-07-08** — see staleness notes; where it's stale I re-verified live against git/code today).
- Scope: `alloro-artifacts/MENU-2026-07-13.md` (13 in-lane levers on site + GBP + owner-approved outbound; NOT social/ads/retention).
- Landscape + AEO feasibility: `alloro-artifacts/strategy/lever-landscape-and-pioneers.md`.
- Slice plan: `plans/07142026-alloro-funnel-engine/spec.html` (Slice 1 only, to date).
- Live git state verified 2026-07-15 (`gh pr list`, `git log`) — receipts inline below.

## Scope stakes that shape this list
- **AEO IS in scope** (Corey, 2026-07-15): a build target via **Gemini / `@google/genai`** (Google-AI side). ChatGPT/Perplexity are out of reach (no SDK). Build the reachable half.
- **Done = the raised hand** (canon anchor, above): Alloro increases the *number of opportunities* = the funnel; the measured value ends at the **form submission on Alloro's own hosted surface**. **Booking write-back, speed-to-lead, and the Responder are the practice's operations — OUT of Alloro's attraction lane.** "Get chosen" in-lane = making the profile/page compelling + the capture surface good enough that more of the right people raise their hand.
- **Value #6:** no rank/visibility/guarantee promises anywhere; every output improves eligibility/structure/trust only.

---

## What is already built + PR'd (do NOT re-spec — verified live 2026-07-15)
| PR | Branch → base | Feature | State |
|----|---------------|---------|-------|
| **#158** | `claude/slice-1a-get-found` → `dev/dave` | Get-found **1a**: schema-completeness score + GBP↔page consistency flag + answer-first lint + honesty gate (read-only) | OPEN, adversary-tested |
| **#159** | `claude/slice-1b-get-found-write` → 1a (stacked) | Get-found **1b**: schema write path (`seo_data.schema_json`) via approved rail + dogfood | OPEN, adversary-tested |
| **#160** | `claude/taste-profile-spine` → `dev/dave` | **Taste Profile spine**: compose extractors → persisted true-voice profile + honesty gate | OPEN, adversary-tested |
| #156 | `claude/slice-4-connection-measurement` → `dev/dave` | Attribution **capture half** (form-submission source + first-touch referrer contract) | OPEN — **premature / out of order**; parked |
| #157 | `claude/honest-submission-counts` → `dev/dave` | Verified (non-spam) submission counts display | OPEN — cosmetic; parked |
| #155 | `claude/honesty-posts-not-rank` → `dev/dave` | Stop implying GBP posts improve rank | OPEN — honesty hygiene; parked |

**So get-found's schema/answer-first/honesty part is done. Everything below is the remaining funnel.**

---

## STAGE A — GET FOUND (finish the stage) · Alloro's lane

| # | Feature (in-lane) | TRUE build-state (from audit + live re-verify) | Receipt |
|---|---|---|---|
| A0 | Schema completeness + answer-first + honesty write path | **DONE (PR'd)** — #158/#159 | live git |
| A1 | **GSC → content loop** (feed real Google demand into target-query selection) | **✅ DONE — verified 2026-07-15.** Merged to dev/dave (`c23a8c1b`); code drives target-query selection (fetch → thread 3 entry points → geo-layer prompt sets `target_query_primary`); demand labeled UNTRUSTED + relevance guard. Residual = live-dev smoke-test only, NOT a build | 12 tests green: `npx vitest run service.gsc-performance service.seo-generation` |
| A2 | **GBP own-completeness scoring** (score the CLIENT's own profile, read-only) | **✅ BUILT + PR'd 2026-07-15 (#164)** — deterministic grader mirroring 1a; scores the 6 real `client_gbp` fields → missing-field set; adversary caught + fixed a no-listing false-positive | PR #164; spec `plans/07152026-gbp-own-completeness-scoring/` |
| A3 | **AEO / AI-answer visibility — observation system** (Gemini live; Perplexity/SerpApi key-gated) | **✅ BUILT + PR'd 2026-07-15 (#165)** — multi-engine observation log, observe-only, honesty-capped; grounded-Gemini de-risked live; adversary caught + fixed a critical anti-fabrication bug | PR #165; spec `plans/07152026-aeo-visibility-observation/` |
| A4 | **Citations / NAP consistency MONITOR** (measurement existed; the ongoing monitor was the gap) | **✅ BUILT + PR'd 2026-07-15 (#166)** — measurement reused (verified live: catches stale phone/moved address); added the recurring monitor, schedule SEEDED DISABLED (zero cost until enabled); adversary caught + fixed a duplicate-target cost bug | PR #166; spec `plans/07152026-nap-consistency-monitor/` |
| A5 | **Rank tracking → geo-grid** (upgrade single lat/lng to a sampled grid, honest mirror) | **PARTIAL** — audit: "built (SerpApi Maps, every 15 days). Single lat/lng, no geo-grid, sampled estimate" | connect-lever-audit.md §discovery |
| A6 | **GBP write-back** (categories/completeness patch to Google) | **ABSENT** — only 2 write paths exist (posts + replies); no category/schema write API. Net-new Google `patch`/`updateMask` integration — heavier | connect-lever-audit.md §discovery |

**Out-of-lane / deferred in get-found:** web-SERP (non-Maps) organic rank tracking (needs a web-SERP source; low priority, status-only); keyword *volume* via a paid provider (DataForSEO removed 6/30 — **use GSC demand instead**, which A1 already does).

## STAGE B — GET CONSIDERED (trust; the profile/page that makes them choose) · Alloro's lane
*Reads the Taste Profile spine (#160, done). Website is BUILT + hosted but UNMEASURED — audit: "NO CRO/A-B testing (absent). Preview sites have NO analytics tracker."*

| # | Feature (in-lane) | TRUE build-state | Receipt |
|---|---|---|---|
| B1 | **Instrument the hosted/preview site** (attach the existing Rybbit tracker to preview sites so "considered" is measurable) | **ABSENT on preview** — audit: "Preview sites (*.sites.getalloro.com) have NO analytics tracker; instrumentation only AFTER a custom domain + manual" | connect-lever-audit.md §conversion |
| B2 | **CRO-lift rewrite** (Taste-Profile-driven page copy; the get-considered rewrite = spec Slice 2) | **ABSENT (CRO)** — audit: CRO/A-B "absent"; website is a THIN scrapbook. Spine exists (#160) | connect-lever-audit.md §conversion; MENU §5 |
| B3 | **Get-considered structured-trust depth** (named-provider identity block + E-E-A-T/YMYL lint + anxiety-reduction content; spec Slice 3) | **ABSENT** — new lever (MENU §5c); DIRECTIONAL. Guardrail: E-E-A-T lint must never be framed as improving rank | MENU §5c |
| B4 | **Review replies — auto-draft for incoming** (extend the built human-approved reply path) | **PARTIAL** — audit: "Replies: built (human-approved); NO auto-draft for incoming; Apify-sourced reviews unreplyable" | connect-lever-audit.md §discovery |
| B5 | **GBP posts — un-neuter the scheduled auto-gen** (get-considered/engagement, NOT rank) | **PARTIAL** — audit: "built+deploy but scheduled auto-gen NEUTERED (skips locations w/ per_post_image_required; human-initiated)". Honesty: posts ≠ rank (#155) | connect-lever-audit.md §discovery; MENU §5b |
| B6 | **Site photos/visuals in the page** (owner-supplied, approved; site surface only) | **PARTIAL** — audit: "Photos: post-attach only, NO profile/gallery upload." Site-side buildable; GBP gallery upload = net-new write (defer with A6) | connect-lever-audit.md §discovery |

## STAGE C — GET CHOSEN (the raised hand = form submission) · Alloro's lane
*In-lane = the capture surface + owner-approved outbound that earns the raised hand. NOT booking write-back / speed-to-lead / Responder (practice's operations).*

| # | Feature (in-lane) | TRUE build-state | Receipt |
|---|---|---|---|
| C1 | **Lead-capture hardening** (re-enable the disabled security pipeline; make the form the reliable raised-hand surface) | **PARTIAL** — audit: form BUILT (`formSubmissionController.ts:426`) but "13-step security pipeline mostly COMMENTED OUT … rate limiter commented out" | connect-lever-audit.md §conversion |
| C2 | **Request-a-time as a submission** (V1: after-hours "when do you want to come in" captured as a form submission — NO PMS write-back) | **ABSENT** — audit: booking "CONFIRMED ABSENT"; CTAs forced to /contact. V1 request = a raised hand, in-lane; V2 write-back = out | connect-lever-audit.md §conversion; MENU lever 12 |
| C3 | **Review requests** (owner-approved outbound ask; Option B) | **ABSENT** — audit: review *collection* built, but review *requests* absent. Now Option-B allowed (owner confirms every send) | connect-lever-audit.md §menu; MENU lever 5 |

**Explicitly OUT of get-chosen (practice's operations, not Alloro's lane):** speed-to-lead / the Responder (lever 11); booking write-back to a PMS (lever 12 V2); call-tracking→booked-$ join (lever 13's downstream).

## STAGE D — COHESION (cross-cutting; spec Slice 5)
| # | Feature | TRUE build-state | Receipt |
|---|---|---|---|
| D1 | **Cohesion / handoff layer** (unbroken information scent search→page→form: message-match + handoff checks) | **ABSENT** — new lever (MENU §5c); DIRECTIONAL (Pirolli & Card foraging). Needs the pages/forms above to exist first | MENU §5c |

## STAGE E — MEASUREMENT / THE MOAT (cross-cutting; spec Slice 6)
| # | Feature | TRUE build-state | Receipt |
|---|---|---|---|
| E1 | **Visitor→submission attribution + fleet A/B loop** (the moat brick: source column + the learning loop on Alloro's hosted surface) | **ABSENT (journey)** — audit: "ATTRIBUTION: UNBUILT for the customer journey. Form stores NO source. `firstPatientAttribution.ts` = ORPHANED DEAD CODE." **Capture half exists on-branch (#156)** | connect-lever-audit.md §conversion; PR #156 |
| E2 | **Proving-simulation** (Monte Carlo pre-launch forecast + CausalImpact post-launch per-practice lift = the "honesty spine") | **ABSENT** | MENU §4-finding-6 |

---

## THE SEQUENCE (build order — strictly one at a time, verify each before the next)

Ordering logic: **funnel order (found → considered → chosen → cohesion → measurement)**, and within each stage, **cheapest/foundational-and-in-lane first, net-new-integration heavy items last.** Instrumentation (B1) and the attribution capture (E1) are pulled as early as their stage allows because later measurement depends on them.

**Get-found (finish the current stage):**
1. **A1 verify** — ✅ **DONE 2026-07-15.** Verified merged to dev/dave + drives target-query selection + 12 tests green (`service.gsc-performance`, `service.seo-generation`). No build needed; only a live-dev smoke-test remains (post-merge). → proceed to A2.
2. **A2 — GBP own-completeness scoring** — ✅ **BUILT + PR'd (#164) 2026-07-15.** Spec Rev 2; tsc 0, A2 10/10, full suite 488, conventions 0; adversary caught + fixed a real no-listing bug. → proceed to A3.
3. **A3 — AEO observation system** — ✅ **BUILT + PR'd (#165) 2026-07-15.** Multi-engine (Gemini live+tested; Perplexity/SerpApi key-gated); Rev 2; tsc 0, 16/16, full suite 472, conventions 0; adversary caught + fixed a critical anti-fabrication bug; migration runs on Dave's merge. → proceed to A4.
4. **A4 — Citations/NAP consistency MONITOR** — ✅ **BUILT + PR'd (#166) 2026-07-15.** Verified the measurement already exists (EMT vitals); built the ongoing monitor (hospital monitor), schedule SEEDED DISABLED (zero cost until enabled); Rev 2; tsc 0, 6/6, full suite 462, conventions 0; adversary caught + fixed a duplicate-target cost bug. → proceed to A5.
5. **A5 — Rank tracking geo-grid** (enhancement of the built SerpApi path; independent, status-only, honest mirror).
6. **A6 — GBP write-back** *(net-new Google patch integration; heavier — do after the read/measure get-found bricks; carries its own rollback design).* 

**Get-considered (Taste Profile spine done):**
7. **B1 — Instrument the hosted/preview site** (near-free; makes "considered" measurable — prerequisite for judging B2/B3).
8. **B2 — CRO-lift rewrite** (spec Slice 2; Taste-Profile-driven).
9. **B3 — Get-considered trust depth** (spec Slice 3).
10. **B4 — Review replies auto-draft** (extend the built path).
11. **B5 — GBP posts un-neuter** (engagement, not rank).
12. **B6 — Site photos in-page** (site surface; GBP-gallery half defers with A6).

**Get-chosen (the raised hand):**
13. **C1 — Lead-capture hardening** (re-enable security; the reliable capture surface underpins E1).
14. **C2 — Request-a-time as a submission** (V1, no PMS write-back).
15. **C3 — Review requests** (owner-approved outbound, Option B).

**Cohesion:**
16. **D1 — Cohesion/handoff layer** (needs the pages + forms above to exist).

**Measurement / moat:**
17. **E1 — Visitor→submission attribution + fleet A/B loop** (#156's capture half re-sequenced in properly; the moat).
18. **E2 — Proving-simulation** (measures what every shipped lever moved; the honesty spine; last because it needs shipped levers to measure).

## Verification items carried into speccing (audit is 7/8 — re-verify at each feature's spec, per sequential-build)
- **A1:** is the GSC→content loop actually driving selection on dev, or only merged? (commit `c23a8c1b`).
- **A3:** confirm `@google/genai` supports search-grounding before building the AEO checker (lever-landscape flags this).
- **E1:** what exactly does #156 already capture vs. what the full loop needs (avoid re-building the capture half).
- Every "built/partial" mark above is the 7/8 audit unless re-verified live today; each gets re-checked against code at its spec step, never assumed.

---

## Reconciliation notes — 2026-07-15 (Rev A: re-anchored to live library canon)

**What changed and why.** The first cut framed the funnel as the "matchmaker" attraction lane. Grounding live in `library/canon/mvv.md` corrected the frame: this is **Driver 2 (Alloro Connect / presence), in service of the freedom mission** — findability is the *second* driver, not the identity. Added: the Canon anchor, the per-feature Definition of Done (canon bar + Dave's CD SOP), and library-canon sources. No feature was added or removed; the *frame, the bar, and the sequence weighting* changed.

**⚑ One sequencing recommendation for Corey to stake (I did not reorder unilaterally).**
The canon pulls the **measurement/attribution rail earlier than a strict found→considered→chosen order puts it**, for two staked reasons:
1. **NS1 now includes ATTRIBUTED** (`canon-to-stake.md:8`) — a feature is "undeniable" only when the owner *knows it came from Alloro*. Without the rail that shows "this raised hand came from Alloro's page," no lever below can fully clear NS1.
2. **The moat IS the owned channel/rail** (STAKED, `canon-to-stake.md:55–63`) — hosting + capturing the submission on Alloro's own intake is the escape-velocity asset; the levers on Google's rail are the wedge.

- **The counter-argument (why the strict order put it last):** measuring an empty funnel measures nothing — you need levers shipped and traffic flowing before there's a raised hand to attribute.
- **My recommendation (a middle, not a full reorder):**
  - **Pull B1 (instrument the hosted site) to run now, in parallel** — near-free, no dependencies, and it's the prerequisite for ever proving a considered/chosen lever worked.
  - **Treat the submission *source-capture column* (the #156 half) as a foundational brick that lands early**, so no lever ships without source captured — but keep the **full E1 attribution→A/B learning loop after the first considered + chosen levers ship**, so there's real flow to measure.
  - Net: the *lever* build still walks found→considered→chosen (the task's mandate); the *measurement rail* becomes an early foundational track rather than a final stage.
- **Decision for Corey:** (a) adopt this "measurement rail is foundational" weighting, or (b) hold strict found→considered→chosen with measurement last? This reorders what I spec after get-found, so it's worth staking before I get there.

**Other pending canon items that touch the build lightly (Corey-stake, not blockers):**
- **Value #2 "capable vs dependent"** (`canon-to-stake.md:9,14`) — resolved in draft as capable-on-understanding + done-for-you-on-execution. Bears on how owner-facing each lever's *clarity* is (the owner ends more in command, never in-the-dark-and-hooked). I'll build to the drafted resolution unless you redirect.
- **"PatientPath → Connect" naming** (`canon-to-stake.md:17`) — use **Connect** in all new surfaces; treat "PatientPath" as legacy.

## The real goal + TTFV — keep in mind while building (Corey, 2026-07-15)
**Project definition of done (the whole point):** after Dave merges the levers, **merge → turn on → Alloro's customers AND the business see real improvement** — Alloro functioning **at or above competitors in the narrow funnel scope** (Merchynt/Paige, Birdeye, Podium, Owner). Not "become Merchynt" — reach parity-or-better on the specific mechanics, in our lane, at our honesty bar. A lever only counts if flipping it on moves the needle.

**Build guidance from the Merchynt/Paige onboarding + TTFV videos (2 transcripts, 2026-06/07; full feature detail → fold into `alloro-artifacts/research/teardown-merchynt.md`):**
- **TTFV — the "magic window."** The gap between the owner paying and seeing first *visible* value must be as SHORT as possible ("first post live ~30 min after onboarding"). Every lever should produce quick, owner-visible value. Serves NS1 (undeniable) + Value #5 (earn it before asking).
- **Attribution = NS1.** "Make sure they're attributing their new customers to what you're doing." The owner must SEE the result and know it came from Alloro. Reinforces the measurement rail (E1/B1) being foundational, not last.
- **Onboarding-intake → Taste Profile.** Merchynt's method (record the onboarding call → transcript → AI → training/company notes) IS the Taste Profile spine (#160). Validates it and points to an onboarding-voice-intake feature feeding it. *Flag: is that intake a gap to add to the map? (see `project_welcome_intelligence`.)*
- **Value #6 timeline honesty.** Under-promise/over-deliver; never "everything #1 by month 3." The honest 90/180/270-day Google-recalibration framing sets expectations without promising rank.
- **Fastest-acting levers:** old-customer-list review requests (C3) + regular image upload (B6) — Merchynt calls these the kickstart.
