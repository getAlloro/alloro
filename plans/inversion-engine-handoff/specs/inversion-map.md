# The Alloro Inversion Build Map
### The misinterpretation-proof manual

*Purpose: make the vision impossible to misunderstand, so Dave's Claude builds each chapter correctly
from THIS, with no interpretation loop. Grounded on `origin/dev/dave` (the live base). Source framework:
the Journey Lattice (Business Clarity). Built and proven ONE chapter at a time, merged to dev/dave at a
steady cadence, never build-then-orphan. 2026-07-06.*

> ⚠️ Dated snapshot. Where a code-fact or state here differs from `origin/dev/dave` or the live branch, the CODE wins, verify before building. (This map went stale once on the push-state, the exact failure it exists to prevent.)

## The one law (from the Journey Lattice)
"The recommendation is the product. Everything else is supporting evidence." Every chapter serves it: the
owner opens a surface and in 30 seconds knows they're healthy, where they're leaking, and the ONE move
this week, caught from data they couldn't read themselves. **And the recommendation carries the FLIP: for BUILT, in-lane moves (GBP posts, review replies) the card ends in "Alloro drafted this, approve" then "Alloro did it, here's the result" (attributed), never owner-homework; for UNBUILT rails it stays honest read-only observation. The owner stays the hero; Alloro is the guide that does the work on approval.** No generic advice. No fabricated number. No
discouraging framing. That is the poka-yoke: misunderstanding is designed out.

## The chapters
Each chapter = "what OUGHT to be there," anchored to dev/dave file:lines, built as a slice, proven on the
sandbox deploy (Corey's eyes) + real data (Dave), merged to dev/dave.

1. **Data Truth (foundation).** Every number true and consistent, or nothing else can be trusted. Spec: `inversion-01-data-truth.md`, re-verified on dev/dave. STATUS: locked, ready to build.
2. **The Card Standard (the Chancellor template + the Translation-Layer voice).** Every card = specific, caught-something-you-couldn't-see, one move this week, written in the owner's plain, relief-first, trend-focused voice. **The Voice / Translation Layer lives HERE**, as Clause C of the one card standard (folded in from the old cross-cutting Ch7); every chapter's cards conform to it. The Action Layer made real. The referral "1 thing that matters" trace resolved to two generators (the PMS-gated Summary v2 agent + the zero-upload ranking LLM); this chapter lifts the zero-upload card to the same bar. Canonical Chancellor exemplar (verbatim everywhere): *"Call Dental Care at Chancellor Crossing, your single largest referral source, dropped from 26 referrals to 21 this period. Call them this week."* Spec: `inversion-02-card-standard.md`. STATUS: spec drafted.
3. **Findable (Stage 2).** What the owner ought to see about showing up when patients search. All public data. STATUS: to spec.
4. **Choosable (Stage 3).** The stage where the most revenue leaks (per the lattice), all public. STATUS: to spec.
5. **Bookable (Stage 4).** The most fixable stage: phone, forms, online booking. STATUS: to spec.
6. **Memorable (Stage 5).** Reviews, referrals, follow-up. The compounding stage. STATUS: to spec.
7. **The 30-Second Verdict + The One Thing (capstone).** The cross-stage capstone above Stages 2–5: one honest health/leak VERDICT ("am I healthy, where am I leaking?"), then the ONE move, single-card discipline (never two competing top-of-dashboard cards), spoken in the four-stage vocabulary. Its acceptance law is the **30-Second glance** (heal-or-lean-in in one screen); it installs the single-card poka-yoke the stage chapters must FEED (as SUMMARY candidates) rather than bypass with their own top-of-dashboard card. Five fixes (Rev 1 added two): kill the competing leak headline, add the missing health/leak verdict, speak the four-stage vocabulary (verdict via the stat→stage map, eyebrow via the card's authored `stage` field), weld in Alloro attribution, and the done-for-you domain-branch. (Voice / Translation Layer moved OUT of this chapter into Ch2's Card Standard.) Spec: `inversion-07-verdict-and-one-thing.md`. STATUS: spec drafted.

## Proof status (2026-07-07): Ch1 + Slice 1 built; Ch2-7 fix-passed, 3 residuals resolved
- **Ch1 (Data Truth):** proof-clean, dev/dave-verified. **Slice 1 (the 4 fixes) is BUILT and compiles GREEN** on branch `claude/slice-1-data-truth` (off dev/dave), pushed, and open as **PR #145 to dev/dave** (verified open 2026-07-07). Ground-tested through 4 adversarial passes (3 defects found + fixed). Not yet run against the test suite or a live practice's data; those are Dave's truth-gates. (Verify state against the live branch, not this line.)
- **Map structure:** reconciled (single ownership assigned; Voice into Ch2; the capstone verdict + single-card discipline in Ch7; one canonical Chancellor quote, byte-identical everywhere).
- **Ch2-7:** a 9-agent fix pass ran and applied per-chapter corrections (em-dashes stripped, Chancellor quote normalized, lattice cites relabeled as substrate not dev/dave, false code claims corrected, illustrative numbers labeled). A follow-up consistency pass (2026-07-07) then **resolved the 3 residual defects** and re-verified the code claims against `origin/dev/dave`:
  1. **Ch7 map over-claim (fixed):** the Ch7 line no longer folds a "30-Second / 30-Day / Saif-to-Chris Undeniable-tests" battery into Ch7 (Ch7 specs no such battery); it now describes Ch7's actual content, the 30-Second glance law + single-card discipline + Ch7's five fixes.
  2. **SYSTEM_PROMPT double-ownership (fixed):** the `service.ranking-llm.ts` SYSTEM_PROMPT Chancellor-bar (ozMoment-discipline) lift is owned by **Ch2 FIX 1**; Ch3 FIX 4 now REFERENCES that owner and confirms the Findable payload satisfies it, rather than re-speccing the identical prompt rule. Ch3 still owns its Findable-specific prompt rules (top-set bands, specialist-vs-generalist reframe, backfill flag).
  3. **Reviews-stage ownership (fixed):** Ch6 (Memorable) owns the review ASK/velocity/reply action; Ch4 (Choosable) references review quality only as a choose-signal (no review-ask card); Ch7 uses reviews only as verdict-tone and owns no review action. Ch7's two internal stage maps were reconciled (reviews → Choosable in both) and an explicit ownership note added.
- Also verified this pass: zero em-dashes (U+2014) in the 7 SPEC files (imported reference docs like icp-spine, the profiles, canon-to-stake, and frame-validation may carry them; the em-dash rule targets customer-facing copy, not reference material); the Chancellor quote is byte-identical across all 7 spec files; every lattice cite is labeled substrate (alloro-brain, local), never a dev/dave anchor. One false anchor corrected: Ch7's `Summary.md:69` for `priority_score` is actually `:68`.
- Still open (needs Dave / live data, not a doc defect): each chapter's per-chapter `remaining` item, "confirm the illustrative numbers against live account data before merge."

**Build-ready: Ch1 / Slice 1. Ch2-7 are consistency-clean; they still need live-data confirmation of illustrative numbers before merge (Dave's truth-gate), per each chapter's staking gates.**

**⚠️ Coherence pass (2026-07-07, AFTER the fix-pass above):** a system-wide audit found deeper gaps the per-chapter fix-pass missed. These, not the fix-pass residuals, are the real blockers before building past Ch2, and they are being resolved in the spec-resolution pass:
- **The engine is TWO selectors, not one.** Ch7's single-card verdict governs only the SUMMARY / OneThingBanner surface; the ranking-LLM surface (Ch2/Ch3) and the Ch5/Ch6 candidates are NOT wired into it. So "feed as SUMMARY candidates" and "reconciled" above are design-INTENT, not yet delivered. Fix: define ONE candidate-card TYPE + ONE selector that reads every engine. **✅ RESOLVED (2026-07-07 spec-resolution, Corey-staked): Ch2 now defines the unified candidate-card TYPE (`TopActionSchema` + `stage` + `execution_state` + `generic`, additive); Ch7 now specs ONE selector reading every generator via it. Wiring is Dave's.**
- **✅ RESOLVED , a fabricated cross-chapter attribution.** Ch4 attributed a review-COUNT rise to Alloro's reply/post (which cannot create reviews), contradicting Ch7's "attribute the CATCH, never the CAUSE." FIXED (inversion-04 body + Rev 2): attributes only what the rail causes; the review-count move is reported as the owner's own context.
- **✅ RESOLVED , a false premise.** Ch2 stated SUMMARY "only runs when PMS is present"; the code runs it unconditionally. FIXED (inversion-02: corrected inline with the `service.monthly-agent-processor.ts` receipt; the per-data-state selection is handled by the one unified type + one selector).

## The build loop (per chapter, the poka-yoke against orphaning)
1. Spec the chapter here, misinterpretation-proof, dev/dave-anchored.
2. Build the slice on a branch off `origin/dev/dave`.
3. Push to the `sandbox` branch, deploys to sandbox.getalloro.com, Corey verifies visually.
4. Dave reviews the code + checks real data.
5. Merge the chunk to dev/dave. Next chapter. Never let the branch drift far from dev/dave.
