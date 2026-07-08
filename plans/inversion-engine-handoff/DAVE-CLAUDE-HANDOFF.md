# Alloro Inversion Build, Handoff for Dave's Claude

*You (Dave's Claude) are about to build the Alloro dashboard engine. This is your start-here. Corey and the strategy-side Claude built and validated the whole plan; your job is to build it, fast and safe, in whatever order Dave judges best. This doc transfers HOW WE WORK so you operate the same way without us in the room. Read §1 first, it is the difference between building it right and building it plausible-but-wrong.*

---

## PURPOSE (the one line that survives if you forget everything else)
The owner is an expert in their craft, not in business. When they can't see where their growth is failing, it gets overwhelming fast. Alloro gives them an honest, done-for-you picture of it, so they trust it without being told and stay free to focus on the calling they trained for. And it connects them to the people in their community who need exactly what they do. Each owner wins against the handful of competitors in their service area. It's a loop of service: the owner serves their patients, Alloro frees and connects the owner, the community finds the one who can help. Every chapter serves that. If a spec detail turns out impossible, this line tells you what to do instead.

---

## 0. TL;DR
- The WHOLE engine is designed + validated (7 chapters). Slice 1 (Ch1) is built, ground-tested through 4 adversarial passes, and in PR #145, ready to merge. Ch2-7 are validated specs, not yet built as code.
- You have everything. Dave decides the build order. Recommended sequence + non-negotiable guardrails are below.
- **Routing note:** work normally reaches Dave via the Visionary → Integrator → Jo's board → Dave chain. This engine handoff routes DIRECTLY to Dave as a one-time whole-engine transfer Corey is directing. (Jo is ACTIVE until her leave on **Sept 25, 2026**, this direct route is a deliberate one-off Corey chose for the whole-engine handoff, NOT a bypass because she's out.) Corey holds the approval on this handoff.

---

## 0.5 VERIFY THIS DOC, DO NOT TRUST IT (the rule that prevents the recurring failure)
This document is a SNAPSHOT dated 2026-07-07. **The live codebase (`origin/dev/dave`) is the only source of truth.** Alloro's single most expensive failure has been stale, drifted, or over-claiming docs trusted without checking (features written as done that were not; an audit recommending capabilities that did not exist; 57% of "built" work never shipped). It does NOT repeat here. Before you build on any load-bearing claim below:
- **Verify code-facts against the live source:** `git grep -n <symbol> origin/dev/dave`, `git show origin/dev/dave:<path>`. If the doc and the code disagree, **THE CODE WINS**, and flag the drift.
- **Verify it compiles + the honesty net passes:** `npx tsc --noEmit` (backend and frontend), `npx vitest run src/__tests__/engine-harness`.
- **Verify built-vs-unbuilt before claiming any capability** (§1). Never build a card that implies an unbuilt capability.
- **Confirm the numbers on real data** before anything customer-facing merges, the one check no doc can do for you.
Every file:line receipt here was verified on 2026-07-07; they drift as the branch moves. This doc is a map to verify against the territory, never a substitute for it.

---

## 0.6 BACK-BRIEF BEFORE YOU BUILD (the gap that actually sank the last two handoffs)
The single most expensive failure was NOT dishonest or stale docs. It was that the vision and intent could not be translated and understood by the people receiving them, who tried in good faith. It has happened twice (the Oct docs; and the first sandbox attempt, where the building got out of hand and the vision was lost in the volume, leaving Dave grasping). So before you build any chapter, PROVE the intent landed, do not parrot it back:
- Restate, in YOUR OWN words, the PURPOSE of the chapter and of the whole engine (the effect/why, not the task list).
- Name what you will explicitly NOT do (the out-of-bounds).
- Name the one place you think it could go wrong.
Surface that read-back for a yes (Dave, and it can go to Corey) BEFORE the build, not after. A restatement that flattens or inverts the intent is the tell the transfer failed (e.g. "most never shipped" heard as "only two gaps left"). And guard the other half of the failure: **if the build starts sprawling past what the PURPOSE needs, that is the vision getting lost in volume, stop and re-anchor to the one line above.** Restraint keeps the vision leading. **The approver for the back-brief (since Corey and the strategy-Claude are not in the room and this handoff routes direct (not through Jo's board)): send the read-back to Corey async before building a chapter; if he's unreachable, self-verify it against the PURPOSE line with a written diff, never self-approve silently.** A gate with no approver either stalls you or gets rubber-stamped; name the yes.

---

## 1. HOW WE WORK (operate like this, it IS the product)

**Honesty is the product, not a constraint on it.** Alloro serves a local-business owner who is an expert in their craft, not in business; growth feels overwhelming when you cannot see where it is failing, and Alloro gives them an honest picture of it. A number we cannot back is malpractice on their livelihood, and it does not ship.

- **Every displayed number is true, or it does not ship.** No fabricated or proxy numbers, ever. Slice 1 killed a fake "#1" rank, a `100 - score` proxy, and a false "not connected." Then the pre-flight caught THREE MORE fabrications hiding inside the fix. Assume more are hiding in yours.
- **Value #6: no guarantees.** "designed to," never "will." No results promises to owners.
- **Verify, don't assert.** Never say done / works / clean on a feeling. Run it, paste the receipt (tsc output, the render, a file:line). Before "done," split what you VERIFIED vs ASSUMED vs the single MOST-LIKELY-WRONG thing. When asked "is it ready," answer "is it ground-tested?": every removable risk removed, the one remaining residual named and owned. Never give a confidence number.
- **Run the adversary on your OWN confident work.** Before anything customer-facing ships, spawn a fresh agent told to REFUTE that it is safe to merge, not confirm it. We ran four on Slice 1; each of the first three found a real owner-facing defect the author missed, all the SAME class: **a null/value with multiple meanings, paired with copy that asserts one specific meaning.** Compile-green does NOT catch this; tsc cannot see a semantic lie. Hunt that class hardest.
- **Land incrementally.** Each piece ships validated AND reaches customers. Do not big-batch-that-never-lands, that is the exact pattern being broken (476 features built, near-zero shipped).
- **Stay in lane.** Presence-side only. AI drafts; a human approves before anything publishes. NEVER outbound-to-a-human (review REQUESTS, marketing/nurture emails, referral comms).
- **Built vs unbuilt, never claim unbuilt-as-built.** BUILT + WIRED (approve-gated, verified on origin/dev/dave): GBP local-post publish + review-reply (`src/controllers/gbp/gbp-services/gbp-write.service.ts`). NOT built (stay read-only, never owner-homework): GBP photo-refresh, category write-back, review-generation, booking connectors, PMS live connectors.
- **Research-backed honesty guardrails** (`research/lever-outcome-evidence-map.md`): **GBP posts CONVERT, they do NOT rank** (measured null), never imply posting improves ranking. Most lever->outcome numbers are population-average priors, valid only as labeled estimates/ranges, never per-practice guarantees.

---

## 2. THE PRODUCT DIRECTION (staked, do not re-litigate)
- **Value #2 = the SPLIT:** the owner stays CAPABLE (understands + in command; owns the clarity and the decisions); Alloro is DONE-FOR-YOU on execution (the agency-scope work, SEO/AEO/CRO/presence, they should not have to do). Guardrail: never create dependency by HIDING the understanding, the owner must always end up more in command.
- **The FLIP (every card):** for BUILT in-lane moves (GBP posts, review replies), the card ends in "Alloro drafted this, approve" then "Alloro did it, here is the result" (attributed). For UNBUILT rails, read-only observation, never owner-homework.
- **Two altitudes:** the OWNER wants a pushed glance-and-know verdict; the OPERATOR (office manager) actually touches the surface. Serve both in one motion, the operator's operable surface IS the owner's glance.
- Full frame + per-chapter edits: `strategy/inversion-frame-validation.md`. Who the customer is: `library/canon/icp-spine.md`. The staked decisions: `strategy/canon-to-stake.md`.

---

## 3. BUILD INPUTS (where everything lives)
- **The 7 chapter specs (the misinterpretation-proof manual):** `specs/inversion-01..07-*.md`; overview `specs/inversion-map.md`.
- **The frame-validation guide:** `strategy/inversion-frame-validation.md`, the FLIP, the built/unbuilt facts with file:line receipts, the per-chapter sharpening edits, the Ch5 split, and the two cross-cutting threads (attribution + two-altitude).
- **The lever-evidence map:** `research/lever-outcome-evidence-map.md`.
- **The code:** the `alloro` repo, base branch `origin/dev/dave`.
(These docs live in the `alloro-artifacts` repo; the code is in `alloro`. You need both.) **⚠️ DELIVERY PRECONDITION (the #1 past failure): confirm Dave's Claude can actually `git pull` the `alloro-artifacts` repo BEFORE relying on any spec pointer. If it can't, mirror the 7 specs + this handoff into the `alloro` repo or attach them. Delivery is done when he can OPEN them, not when they're referenced, a pointer to a repo he can't reach re-flattens the whole engine into a paste.**

---

## 4. STATE OF PLAY (honest, this travels WITH the specs, do not build the rosy version)
- **Slice 1 (Ch1, data-truth):** BUILT, ground-tested through 4 adversarial passes (3 defects found + fixed), PR #145 to dev/dave, tsc green both ends, git-merge-clean. **(git-clean is NOT reconciled: before merge, check how Slice 1 sits against your active branch, does it fold in, supersede, or is it independent? "Conflict-free" does not answer that, and the un-stated in-flight relation is the exact miss that caused the PR #145 collision.)** **The one check only Dave can do before merge:** confirm the four numbers on a real practice's LIVE data (the strategy-Claude has no DB access). **Known residual, does NOT block Slice 1:** the focus dashboard's rank card (`StatCardRow.tsx:174` / `sectionBuilders.ts:182`) still reads the old `rank_position` (fabricated `#1` on legacy rows) while Slice 1 fixed only the patient-journey card to read the honest `search_position`. Pre-existing, self-heals as new rankings run, null-guarded, the next honest-numbers gap.
- **Ch2-7:** validated specs, sharpened to the direction, NOT yet built as code.
- **Spec-level gaps the pre-flight found, FIX OR FLAG before those chapters build:**
  - **✅ RESOLVED (2026-07-07 coherence pass + spec-resolution, Corey-staked): the two-selector split-brain + the missing card TYPE.** Ch2 now DEFINES the one unified candidate-card TYPE (`TopActionSchema` + `stage` + `execution_state` + `generic`, additive/backward-compatible); Ch7 now specs ONE selector that reads EVERY generator (SUMMARY, ranking-LLM, Ch5, Ch6) into a single pool, no competing top cards. The CONTRACT is set in the specs; the WIRING (how each generator emits the type, how the selector ingests all sources) is **Dave's** to design. See inversion-02 (the TYPE) + inversion-07 (the selector) + the map's resolved note.
  - MED: review-REPLY has two claimed owners (give it to Ch6; restrict Ch3 to GBP-post/freshness). Ch2's coherence guard must name the rank field (`search_position`, not the fabricated `rank_position`). Ch5a's transactional lead auto-ack is the ONE newly-authorized outbound-to-a-human, needs Corey's explicit stake on the toggle-default + copy before build.
  - **Coherence-pass spec residuals (build-time + Corey-stakes):** (a) the "pushed digest" Ch2/Ch3/Ch7 call the owner's REAL surface is asserted but NEVER built, either scope those fixes honestly to the logged-in surface, or build the digest; don't ship the owner-glance to a surface the owner never visits. (b) Ch6's velocity card ends in a review-ASK the owner performs (unbuilt rail); Corey's Value-#2 stake, is a bounded ask a legitimate owner-capable action, or homework to make pure read-only? (c) the cumulative "Alloro did X" voice across chapters can tip toward Alloro-as-hero, keep the OWNER the hero ("your reviews are answered, approve and it's done in your name"). (d) Ch7 hard-codes `form-submission` as "not yet live", key it off a runtime capability flag once Ch5a ships. (e) reviews stage-label: FIXED, the unified TYPE carries an explicit `stage` field AND Ch7 FIX 3 now reads THAT field instead of the old `domain -> stage` map (was Gap 7; see inversion-07 FIX 3, coherence-pass update).

---

## 5. RECOMMENDED SEQUENCE (Dave decides; this is a read, not an order)
1. **Merge Slice 1** (PR #145) after the live-data number check. Foundation + pipeline proof.
2. **Fix the focus-dashboard residual** (make `StatCardRow` / `sectionBuilders` read `search_position` like the patient-journey card). Small; closes the honest-numbers gap on the other surface.
3. **Build the one card TYPE + the one selector that Ch2/Ch7 now spec** (the two-selector fix, the contract is set, the wiring is yours) before building the stage chapters on top of it.
4. Then build the chapters. Ch2 (Card Standard) + Ch7 (Verdict) are cross-cutting; Ch3/Ch4 feed the selector; Ch5a (responder) is cheap + in-lane; **Ch5b (attribution rail) is a big build AND it is the owned-rail / moat piece (NS2), everything before it is NS2-capped read-only clarity, so deferring Ch5b is a deliberate NS1-first call, not an accident; revisit if a moat-first order is cheaper.** Each ships validated + lands.

**Dave: if your read of the codebase says a different order or batching is faster and safe, take it.** The only non-negotiables are honesty (every number true, no unbuilt-as-built, in-lane) and incremental landing.

---

## 6. STARTING POINTS / COMMANDS
- Slice 1 branch: `claude/slice-1-data-truth` (PR #145). Typecheck: `npx tsc --noEmit` (backend), `cd frontend && npx tsc --noEmit`.
- **Test-harness + fixtures scaffold:** branch `claude/engine-honesty-harness` (off Slice 1), files under `src/__tests__/engine-harness/` (`fixtures.ts`, `honesty-invariants.test.ts`, `contextCopy.ts`, `README.md`). Runs the REAL readers against realistic edge-case fixtures (the null-states) and asserts the honesty invariants, the net compile-green cannot cast. Run: `npx vitest run src/__tests__/engine-harness`. **Honest state:** tsc-clean, but NOT run locally (vitest binding broken on the authoring machine), so run it first; the most-likely failure is a transitive import-time side effect, fix is a one-line `vi.mock`. Two known weak spots (flagged in the harness README): `contextCopy.ts` is a hand-transcribed mirror of the frontend copy (keep it in lockstep), and the weighted-multi-location reviews fixture is synthetic vs. the single-location reader scope. Extend it before each customer-facing change.
- Reproduce the adversarial discipline: for any customer-facing change, spawn a fresh agent told to REFUTE that it is safe to merge; hunt the null-with-multiple-meanings class.

---

## 7. THE ONE DATA ASK (for the test/sim layer)
To make the fixtures and any simulation match reality, one thing: a ONE-TIME anonymized, AGGREGATED snapshot of the real data's SHAPES, what states actually occur and how often (e.g. of completed rankings, how many are `search_status = not_in_top_20` vs `api_error`/`bias_unavailable` vs a real position), NOT raw records. That converts guessed fixtures into realistic ones. No standing DB access for an agent; a human runs the query.

---

## 8. RESIDUALS / OPEN (honesty travels)
- Slice 1: the focus-dashboard residual (§4).
- Ch2-7: the spec gaps (§4), fixed or flagged before build.
- ICP: the cross-vertical (non-dental) profile is forum-sourced, not customer-grounded; needs a live non-dental owner (Corey to source).
- Lever-sim: only ~3-4 levers have honest priors (speed-to-lead, reviews->conversion, site-speed, all labeled estimates); the rest requires Alloro's own measured data, which the attribution rail (Ch5b) generates.
- **Coherence-pass code flags (Dave to pin; mostly pre-existing, NOT Slice 1):**
  - **Funnel conversion may pair two universes.** A customer-facing headline appears to divide all-channel website visits (Rybbit) by search-only impressions (GSC), the #15-of-5 defect class, and can read over 100%. Pre-existing (Slice 1 did not touch it); the exact conversion needs locating in the code. Match the universes or drop the conversion %.
  - **`api_error` renders misleading copy.** When a ranking RAN but the lookup errored, the owner is told "Run a ranking" (implying none ran); the harness fixture even encodes that as "expected honest." Give the "ran but couldn't measure" state its own line ("We couldn't measure your rank this time") and fix the fixture.
  - **The honesty harness has never RUN + guards a MIRROR.** It is tsc-clean but unexecuted (vitest binding broken on the authoring machine, run it in YOUR env), and it tests a hand-transcribed copy of the frontend (`contextCopy.ts`), not the real component, so a frontend-only regression passes green. Extract the copy into a shared module the real component imports, and test that.
  - **Orphan compute:** `readPms` / `revenue` / `formatRevenue` run every request but render nothing, drop from Slice 1 until a real patient/revenue surface exists.

---
*This is the system, not the instance: it is how Dave's Claude gets the same rigor and honesty with no one else in the room. Build it like the quiet professional, few hands, that good.*
