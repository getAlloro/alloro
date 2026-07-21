> # ⛔ CANONICAL END-TO-END FUNNEL PLAN (A–E, staged). NOT retired.
> **Two complementary views, both live:** this file = the **staged BUILD PLAN** (A Get Found → B Get Considered → C Get Chosen → D Cohesion → E Measurement/Moat; build order, per-feature DoD, reuse analysis). `docs/capability-ledger.md` = the **current build-STATE** (one row per capability). Update *state* in the ledger; update the *plan/sequence* here. Gap reconciliation (2026-07-21, 9-analysis) draft: `gap-reconciliation-2026-07-21.md`. *(An earlier 2026-07-21 banner wrongly marked this "retired" in favor of the ledger — corrected: the ledger is state, this is the plan; neither replaces the other.)*
>
> ---
>
> ## ⛔ START HERE — THE FUNNEL IS STAKED. THIS FILE IS A BUILD LIST, NOT THE MAP.
>
> **You probably landed here from `grep funnel`. This file will not tell you what the funnel is.** A fresh agent that stopped here spent 25 tool calls, found **six** conflicting answers, and reported it would have been *"fluent and wrong."* Read this box, then go to the map.
>
> **Three gates. Each gate IS a metric. Staked by Corey 2026-07-17. Never re-derive, never rename.**
>
> | Gate | The question | The metric |
> |---|---|---|
> | **GET FOUND** | do you appear at all? | **impressions** |
> | **GET CONSIDERED** | of everyone who saw you, who opened you? | **visits (CTR)** |
> | **GET CHOSEN** | of everyone who opened you, who raised their hand? | **form submissions (CRO)** |
>
> `submissions = impressions × CTR × CRO` — then they book an appointment, which is **the practice's operation, outside Alloro's lane**.
>
> **Where to look when a number is low:** impressions → the map · organic · AI answers. CTR → the map card · the blue-link snippet · the AI answer. CRO → the website.
> **Sorting rule for any lever: which of the three numbers does it move?** None → it's a chore. Some move two (reviews, hours, the page title all affect appearing *and* being clicked) — **name both or you drop one.**
>
> **THE MAP:** the definition lives in **`AGENTS.md` → "⛔ THE FUNNEL"** · implementation: `src/controllers/patient-journey/feature-utils/types.ts` (a compiler-enforced union — the one place this never drifted). The deeper research (levels, evidence grades, per-lever sourcing) is **external material held outside this repository** — ask the owner; it is not a path you can grep.
>
> ⛔ **Retired — never write these:** "get converted" · "booked" as a stage · Findable/Choosable/Bookable/Memorable. *(A written rule. Nothing in this repo blocks them mechanically.)*

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
3. **A fresh adversary (`alloro-proof`) told to break it** → bugs fixed → re-verified. **Run it on a STRONGER/different model than the build** (never same-model self-review; adversary ≥ builder — a same-or-weaker model tends to bless). *Receipt this worked: B1 built on Opus 4.8, Fable-5 adversary caught 3 real contract bugs Sonnet/same-model would more likely have missed.*
4. **Clears the canon bar** — NS1 undeniable+attributed, owner-is-hero controls, Value #6, plain-English truth.
5. **Clears the coherence gate — the three questions (added 2026-07-15 after the funnel coherence + parity assessment; these catch the failures a lever-by-lever build hides):**
   - **① Pioneer check** — name the lever's pioneer (see [[project_funnel_lever_pioneer_benchmark]]); state *at/above on the specific mechanic, OR the named gap + why it's an honest v1.* Makes parity a build-time gate, not a post-hoc audit. *(Would have flagged "A2 = 6 fields vs Blumenthal's dozens" at spec time.)*
   - **② Wire check** — answer *what feeds this feature, and what does its output feed?* "Nothing" is a flag: either it's genuinely standalone, or the wire is a missing feature nobody owns. *(Would have flagged the A2→A6 detect→fix loop that fell between two bricks.)*
   - **③ Proof check** — *once this ships, is its effect attributable?* NS1 = attributed, so the proof/measurement hook is part of *done*, not a later stage. *(Would have flagged the finish-line-with-no-track: FormSubmission has no source column.)*
6. **A PR to `dev/dave` with its context** for Dave to review + merge. **Never push to dev/dave or main directly.** Post-merge smoke/stress test is a separate step, run on Corey's/Dave's go.

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
| A5 | **Rank tracking → geo-grid** (upgrade single lat/lng to a sampled grid, honest mirror) | **✅ BUILT + PR'd 2026-07-15 (#167)** — findability sensor slice 1 (honest geo-grid SoLV/ARP/ATRP; unknown≠0). Branch `claude/a5-findability-sensor` | PR #167 |
| A6 | **GBP write-back** (categories/completeness patch to Google) | **✅ BUILT + PR'd 2026-07-15 (#168)** — owner-approved `businessInformation` v1 PATCH; new `business_info` work-item type; capture-before-write rollback (capture-once) + snapshot-merge; ships DISABLED; 2 cross-model adversaries (Fable+Sonnet) caught+fixed a critical retry-clobber. tsc 0, conv 0, 476 suite, 20 A6 tests. Branch `claude/a6-gbp-writeback`. Spec `plans/07152026-gbp-writeback/spec.html` | PR #168 |

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
5. **A5 — Rank tracking geo-grid** — ✅ **BUILT + PR'd (#167) 2026-07-15.** Findability sensor slice 1 (honest geo-grid SoLV/ARP/ATRP; unknown≠0). → proceed to A6.
6. **A6 — GBP write-back** — ✅ **BUILT + PR'd (#168) 2026-07-15.** Owner-approved `businessInformation` v1 PATCH; new `business_info` work-item type; capture-before-write rollback (capture-once) + snapshot-merge over the snapshot; ships DISABLED (Dave/DB-enable per account); 2 cross-model adversaries (Fable+Sonnet) caught+fixed a critical retry-snapshot-clobber. tsc 0, conv 0, full suite 476, 20 A6 tests. Spec `plans/07152026-gbp-writeback/spec.html`. **Get-found stage COMPLETE (A1–A6 all PR'd, #164–168).** → proceed to B1.

**Get-considered (Taste Profile spine done) — ⬅ NEXT: B1:**
7. **B1 — Instrument the hosted/preview site** — ✅ **BUILT + PR'd 2026-07-15.** Re-scoped after serve-path trace (inject point lives in a separate `website-renderer` repo; not `publicRoutes.ts`/`instantWebsiteGenerator.ts` as the task premise assumed). B1 = gated on-demand Rybbit provisioning for preview projects (`provisionPreviewAnalytics`, reuses `provisionRybbitSite`); ships DISABLED (`PREVIEW_ANALYTICS_ENABLED` off — the gate is tied to a NAMED renderer-snippet PII verification B1 can't do itself); per-project siteId isolation; no migration. Fable adversary (stronger than the Opus build) FIX-FIRST → 3 contract must-fixes fixed (custom-domain exclusion, active-row invariant/no-revoke-undo, org-archived guard); PII/cross-tenant/no-beacon guardrails held under attack. tsc 0, conv 0, full suite 472, 16 B1 tests. Spec `plans/07152026-instrument-site/spec.html` (Rev 2). **Post-merge residual (the true finish line): after Dave enables the flag for one project, walk its `*.sites.getalloro.com` URL and confirm the snippet is live — the renderer inject-for-preview condition is unverifiable in this repo.** Follow-on **B1-R** (form-view/contact-click custom events + renderer-snippet PII audit) needs `website-renderer` access. → **proceed to the CONNECT + PROVE track (below), NOT straight to B2.**

**⬅ NEXT — CONNECT + PROVE (do before B2+; the 2026-07-15 coherence learning: the gap to "undeniable" is connection + proof, not more/deeper levers). Sequence by leverage, not funnel-position — pull these forward:**
- **M0 — Submission source-capture** (see Measurement rail below). Prove first: without attribution every later lever is invisible. **⚠ VALIDATED 2026-07-15: M0 is largely ALREADY BUILT in PR #156** (`claude/slice-4-connection-measurement`, OPEN, +387/−0): a clean nullable `source VARCHAR(100)` migration (additive/reversible/idempotent, no backfill, unknown=null per Value #6) + `sourceAttribution.ts` util + capture in `formSubmissionController.ts` + `FormSubmissionModel.ts` + tests. So M0 = **review + reconcile #156 against current dev/dave → apply the 3-question DoD → fresh stronger-model adversary → un-park/merge**, NOT a fresh build. **Do NOT retire `firstPatientAttribution.ts`** — validation refuted the "orphaned dead code" claim: it's referenced by `BehavioralEventModel.ts:83,100` (`attributeCheckupToOrg`), a *different* concern (checkup→org attribution), not visitor→submission source. **Highest leverage per hour on the board.**
- **A7 — GBP detect→fix loop (wire A2 completeness → A6 write-back).** *First-class connective feature (was nobody's job — it fell between A2 and A6; verified: 0 completeness refs in A6 services/controllers/routes).* Scope A2's field coverage **by A6's write surface** (the GBP API fields A6 already PATCHes — categories/services/attributes/hours/products), so "thicken A2" and "wire A2→A6" are ONE bounded project, not open research. Output = the marquee story: "we found these gaps → approve → fixed on Google." Depends on A2 (#164) + A6 (#168) merging first.
- **B1-R — unblock, don't research.** The conversion events (form-view/contact-click) are a bounded build; the only blocker is `website-renderer` repo access. Action = get access, then build.
- *Explicitly DEFER (do NOT chase now): A4 monitor→citation-engine (widest gap, lowest leverage, net-new integration/buy-vs-build); A1 SEO breadth (honest as-is); and anything already AT/ABOVE its pioneer — A3/A5/A6-mechanic (polishing parity work is wasted motion).*

**Get-considered levers resume AFTER connect+prove:**
8. **B2 — CRO-lift rewrite** (spec Slice 2; Taste-Profile-driven). **Validated 2026-07-15 (reuse-first): compose-and-wire, NOT from-scratch** — reads the approved Taste Profile (#160, OPEN → branch off it) via `TasteProfileModel.findLatestByOrgAndLocation` → a new `AiCommandRecommendation` target_type → `service.ai-command-execute.ts` (approved + auto-publish rail, on dev/dave) → `PageModel.updateSectionsById`; honesty via `enforceHonesty()` (#160). Do NOT touch `instantWebsiteGenerator.ts` (one-shot static generator). Ready to scope in a fresh session. **Proof = DEFERRED on a NAMED chain** (not indefinite): M0 merged (#156, done) → **M0-SENDER wired** (measurement rail) → B1 enabled (#169). Until that chain closes, a B2 rewrite's lift is only partially attributable — build the wire, write Proof honestly as deferred-on-that-chain.
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

**Measurement rail — parallel foundational track (STAKED 2026-07-15: option (a), middle version; application of already-staked canon, no canon-doc edit):**
- **M0 — Submission source-capture** — ✅ **DONE + PR'd 2026-07-15 (PR #156 refreshed, OPEN, MERGEABLE, head `8fb2396e`; verified live).** Adopted #156 (rebased, not rebuilt): nullable `source VARCHAR(100)`, additive/reversible, unknown=null (Value #6). Fable adversary caught + fixed a **critical PII-injection bug** (client-supplied source/utm stored unvalidated on a public endpoint → closed vocabulary → null); public-repo disclosure sanitized (Option 1). tsc 0, 495 full + 39 targeted tests, conv 0. `firstPatientAttribution.ts` left untouched (live, different concern). Awaiting Dave's merge. **⚠ REMAINING for population — M0-SENDER (own work item):** M0 captures the *column*, but it stays mostly null until a **site-side sender forwards `source`/`utm` from the hosted forms** — that lives in the renderer / hosted templates *outside this repo* (same cross-repo seam as B1-R). Full E1 attribution needs M0-SENDER wired. **Contract now captured** (M0 spec `plans/07152026-m0-submission-source-capture/spec.html` Rev 4): endpoint `POST /api/websites/form-submission`; the sender forwards `source`/`utm_source`/`first_touch_referrer`; server-side precedence + recognized-vocabulary already built. So M0-SENDER is a **bounded wire against a written contract** — blocked only on hosted-template access (same seam as B1-R), not on design.
- The lever build-order (found→considered→chosen) is **unchanged**; this adds measurement as a parallel track, not a reorder of the levers.

**Measurement / moat:**
17. **E1 — Visitor→submission attribution + fleet A/B loop** (M0's source-capture is its early-landed foundation; E1 keeps the full attribution→A/B **learning loop** at this late slot because it needs real flow to measure; the moat).
18. **E2 — Proving-simulation** (measures what every shipped lever moved; the honesty spine; last because it needs shipped levers to measure).

## Backlog — fresh-context-only follow-ons (carried by the tracker; DO NOT execute mid-feature or from a long-context tail)

### BL-1 — Collapse the built-vs-unbuilt twin (fleet-substrate surgery)
- **Why:** the built-vs-unbuilt inventory is duplicated across the `alloro-artifacts` guardrail, the `project_alloro_built_vs_unbuilt_capabilities` memory, and (stale, downstream) several specs. All three live homes were made consistent 2026-07-15 (no active drift), but two full copies remain = a latent drift source. Not urgent — no fire; nothing stale right now.
- **Decision already staked** (per SessionStart three-laws "memory is a POINTER, never the content" — not a new architecture call): canonical = `alloro-artifacts/guardrails/built-vs-unbuilt-capabilities.md`; the memory becomes a pointer.
- **Routing rule:** execute in a **FRESH session only** (loss-bearing; not from a long-context tail, not mid-feature). B1 carried this into the tracker; B1 does **not** execute it.
- **Steps:**
  1. Read the memory + `alloro-artifacts/guardrails/built-vs-unbuilt-capabilities.md` in full; confirm the artifact is a complete superset of the memory's built/unbuilt inventory + `file:line` receipts. Only strip after that check passes.
  2. Mark the artifact ⭐ CANONICAL (header: "single home for built-vs-unbuilt — point here, never copy").
  3. Rewrite the memory body → a pointer: keep the frontmatter description (the ⛔ recall-warning + churn stakes) + a FETCH-the-artifact pointer; remove the duplicated inventory. Keep the file (its `[[links]]` must stay resolvable).
  4. Repoint the `alloro-engineer` skill's Hard-Boundaries line at the artifact as canonical (it currently names the memory); fix the `MEMORY.md` index hook to read "pointer to the guardrail artifact."
  5. Leave `audit-pillar-overclaims-spec.md` / inversion specs / `research/raw/*` / `_archive/*` (point-in-time/reference) — but note: when the audit-overclaims spec is next executed, it re-grounds against the canonical artifact, not its inline copy.
  6. Commit the artifact change in `alloro-artifacts` (separate repo); memory + skill are non-git (saved).

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
- **Decision — ✅ STAKED (Corey-delegated, 2026-07-15): option (a), middle version.** Adopt the "measurement rail is foundational" weighting: un-park #156's submission source-capture half as an early foundational brick (**M0** in THE SEQUENCE — land near B1 / before B2+, "no lever ships without source captured"); keep the full E1 attribution→A/B loop at its late slot (#17, needs real flow). Lever build-order (found→considered→chosen) unchanged — measurement is a parallel track. Application of already-staked canon (NS1-attributed + owned-channel moat); **no canon-doc edit.**

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

---

## ⛔ AMENDMENT — 2026-07-16 · TWO FINISHED BUILDS THIS LIST DOESN'T KNOW ABOUT

**Corey, 2026-07-16, naming the root cause:** *"It keeps getting built in rooms with no doors because you're not following one single build list. So shit gets abandoned and no one knows it's there."*

**This file proves it.** `grep` on this document before this amendment: `WO18` → **0** · `checkup-upgrade` → **0** · `proof-receipt` → **0** · `gbp_work_events` → **0**. Two finished builds and a 24-writer production table are invisible to the one document whose job is knowing what's built. **A list cannot route you to what it does not contain — so work gets built twice, or never reaches anyone.**

**And this file is the clearest case of all.** It lived only on `origin/claude/b1-instrument-site` — an unrelated feature branch. Not on `dev/dave`, not on `main`. **The master build-list had no door.** Its own gate ② would have caught it: *what feeds this, and what does its output feed?* Nothing fed it; its output reached nobody. Copied to a branch off `dev/dave` on 2026-07-16 to fix exactly that.

### (a) STRANDED BUILD #1 — the review-request engine: built March, abandoned April

Lever 5 is graded **ABSENT** across this library. It is **STRANDED**. Commit `4c037e01` — *"feat: WO18 — review request system for post-appointment review generation"*, **2026-03-24**, on `origin/checkup-upgrade`:
- Wired at `src/index.ts:339` → `app.use("/api/review-requests", reviewRequestRoutes)`
- Migrations `20260325000001_create_review_requests`, `20260325000002_add_phone_to_review_requests`
- `ReviewRequestModel.ts` · `ReviewRequestEmail.ts` · **`src/sms/smsService.ts`**
- Frontend: `ReviewRequestCard.tsx` · `pages/dashboard/ReviewRequests.tsx` · `OrgReviewRequestsTab.tsx` · `api/reviewRequests.ts`
- **Ancestor of `main`: NO. Ancestor of `dev/dave`: NO. Last commit 2026-04-21.**

⚠️ **Every "review-gen is unbuilt / `review_requests` is a ghost / no SMS anywhere" receipt in this library is true of the SHIPPING LINE ONLY.** Nobody checked the branches. **Triage WO18 before building fresh** — the review-generation build spec (+ its 2026-07-16 amendment) is the design, held in the owner's external spec library, not in this repo; the parts that *are* in this repo are the WO18 commits named above. WO18 may be most of them. Also the **kickstart lever**, per the Merchynt note directly above.

### (b) STRANDED BUILD #2 — the proof receipt: built 2026-07-12, no PR ever opened

`origin/claude/proof-receipt-v1` @ `5267183e` — **four commits, on the remote, adversary-tested, never offered to Dave:**
```
5267183e  fix(proof-receipt): location grain — tag each item + optional location scope
1cc629b4  fix(proof-receipt): cap listPublishedForOrgInRange at MAX_WORK_ITEM_LIST_LIMIT (adversary finding)
f04c4fe4  feat(proof-receipt): owner-facing endpoint — GET /api/proof-receipt (Tier 1)
bd592bb2  feat(proof-receipt): Tier-1 backend read layer — owner-facing "what Alloro did" rollup
```
187 lines: `proofReceiptService.ts`, `ProofReceiptController.ts`, `routes/proofReceipt.ts`, `GbpWorkItemModel` +28, wired in `app.ts`. Reads **published `gbp_work_items`** → dated `{type: "review_reply" | "local_post", at, workItemId, locationId}` + a count summary; tenant-scoped; location-grained *"so a multi-location practice's feed stays de-blendable"*. Its header states the Tier-1 discipline verbatim: *"no causal arrow, nothing modeled, nothing to fabricate — that honesty is what makes it a rail-record and not an agency activity report."* Its type carries **`at: Date; // published_at — when Alloro did it`** — the past-tense sentence **no competitor in this category publishes** (11 vendor pages fetched 2026-07-16: every one is present-tense capability or future-tense promise; **not one shows an owner what it did**).

**Backend done and honest. No frontend. No PR. Nobody can see it.** Spec: the proof-receipt build spec (2026-07-12), held in the owner's external spec library rather than this repo — also absent from this list. **The proof receipt is a LAYER, not a lever; add it to the board as such.** Carry its adversarial correction with it: *"a receipt of activity is not an ownership lane — it is the failure pattern with better UI"* (Angi/Thumbtack already print owned, dated activity records and churn anyway). **Tier 1 is the wedge; channel-ownership is the lane** — which agrees with this list's own canon anchor. **Tier 4 — the unattributed bucket ("8 we can trace, 15 we can't") — is the line no competitor can copy**: every vendor checked publishes outcome numbers with no denominator anywhere.

### (c) THE WORK LOG — 24 writers, no owner read

`gbp_work_events` is written from **24 sites in production since 2026-05-24**: `GbpReviewReplyService` ×7 · `GbpLocalPostDraftService` ×6 · `GbpLocalPostDeploymentService` ×4 · `GbpPublishedLocalPostService` ×3 · `GbpLocalPostScheduleService` ×2 · `GbpReviewDraftSlotService` ×2. Vocabulary already rich: `draft_created`, `draft_updated`, `draft_regenerated`, `approved`, `deployment_queued`, `local_post_approved`, `local_post_generation_completed`, `local_post_generation_failed`…

**`GbpWorkEventModel` has exactly two methods — `create` and `listByWorkItem` — and `organization_id` appears nowhere in it.** You cannot ask *"what did Alloro do for this practice."* (b) solves this at the **item** grain; the **event**-grain read (drafts, regenerations, failures — the fuller story) still has no door. The join is trivial and already exists: `gbp_work_events.work_item_id → gbp_work_items.id`, which carries `organization_id`, `location_id`, `content_type`.

Separate and adjacent: `metric_action_events` (migration `20260715000000`) is a well-designed, fully general ledger — `action_type`, `stage_key`, `metric_key`, `source_type`, `affected_count`, `occurred_at`, `active_until`, tenant-scoped to org/location/project — with **one entry in each of its four dictionaries** (`config/metricActions.ts`: `SEO_META_UPDATE` / `SEO_BULK_GENERATION_JOB` / `IMPRESSIONS` / `CTR`) and `METRIC_ACTION_DISPLAY_LIMIT = 1`. One producer feeds it. **It shipped and is announced in this week's Friyay ("See the work Alloro completed").** The foundation is right; the vocabulary is one word wide. `metric_key` + `active_until` mean it was designed to say *what we did*, *what it should move*, and *for how long* — it says one of the three.

### (d) THE FOUR BLOCKERS — 18 things to BUILD, nothing that BLOCKS them

Every owner- or patient-facing lever is gated on a precondition that appears nowhere on this board, so each reads "buildable" and none is.

| | Blocker | Gates | State (verified 2026-07-16) |
|---|---|---|---|
| **P1** | **The PMS pipe** | ALL of Reflect + C3's real trigger | Manual upload → dead. **Sikka $35/loc (Appointments ✓ on every tier) + $350/mo base, self-serve, HIPAA/SOC2, Podium on their logo wall.** ⛔ **"Ortho2 unproven on Sikka" is REVERSED** — `Ortho2 ViewPoint, Ortho2Edge` are named on `sikkasoft.com/V3/developers/oneapi.html`; the old claim read a 6-partner *marketing* page as a census. Open: is the $350 per-developer or per-practice? *That* decides viability, not the $35. |
| **P2** | **Sender identity** | ANY outbound | Nonexistent — grep `sending_domain`/`dkim`/`spf`/`dmarc` in `src/` → **0**; every email leaves as `info@getalloro.com`. **Answer: OAuth her mailbox (Podium ships it; their page names no DNS because it needs none).** Floor: our domain + her display name + her Reply-To = what the entire category does; the cost is a "via" label — recognition, not deliverability. ⛔ Never build the branded-sender-domain path (Birdeye's 4 customer-installed DNS records). **Hosting buys nothing** — A record only, `dns.resolve4` is a read, zero DNS writes anywhere. |
| **P3** | **The approval token** | ANY owner-approved anything = every lever | Nonexistent — grep magic-link/approval-token/signed-url → **0**. Approval is in-app behind a login. *"The happiest payer has never opened the product."* |
| **P4** | **The owner read on the work log** | Making any lever's work visible | See (c). **Item-grain already built in (b) and never PR'd.** |

**⭐ The pattern, and it generalises past this board:** *the 10DLC chore is a **FORM** — facts she reads off her own paperwork. The DNS chore is a **CONFIG** — a system she doesn't understand and can't access. The login is a **VISIT** — and she does not visit.* **Make her task data-entry. Never configuration. Never a visit.** Every *"she just has to…"* on this list is a lever that will not fire.

### (e) ⛔ ESCALATE: Corey — this list contradicts itself and the menu about its own moat

- **This file:** *"#156 Attribution capture half — OPEN — **premature / out of order; parked**"*
- **This file, gate ③:** *"NS1 = attributed, so the proof/measurement hook is **part of done, not a later stage**."*
- **This file's tail:** *"**Attribution = NS1.** The owner must SEE the result and know it came from Alloro. Reinforces the measurement rail being **foundational, not last**."*
- **The 2026-07-13 menu doc, MOAT REFRAME (staked with Corey 2026-07-14) — external, not in this repo:** *"the moat-brick is **Slice 4 = visitor→submission measurement**… **That measurement is the moat.** Without it, Alloro is an honest website builder, not a moated platform."*

**Three say foundational. One parks it.** #156 is the only PR in the batch that could ever answer *"is this customer getting $2k/location of value."* **Parked, or the moat? It cannot be both, and the answer changes the sequence.**

### (f) What this changes

- **Lever 5: ABSENT → STRANDED.** Triage WO18 first.
- **The proof receipt joins the board as a LAYER** — backend on `claude/proof-receipt-v1`; needs a frontend + a PR.
- **P1–P4 go on the board as blockers, and they come FIRST.** Cheap — one signup, one OAuth flow, one token, one query — but first. **A lever mounted on a dead edge is instrumentation, not a lever.**
- **Gate ② applies to documents too.** *What feeds this, and what does its output feed?* **Nothing goes on this list without a door — including this list.**

*Method note: on 2026-07-16 a review-request spec was written without reading the existing review-generation build spec, six days old and better. Deleted, not merged; its four original findings became that spec's amendment. Its author was ~30 seconds from writing a third copy of the proof receipt before spotting `claude/proof-receipt-v1` in a `git worktree list` printed six hours earlier. **The duplication is not carelessness — it is the predicted output of building without one list.***
