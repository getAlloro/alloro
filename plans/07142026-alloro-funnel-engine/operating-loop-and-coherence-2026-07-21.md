# The CMO operating loop + build-path + coherence findings — 2026-07-21 (DRAFT)

> Captures three things that only existed in chat (compaction risk): (1) the refined operating loop Corey confirmed "accurate," (2) what it takes to build up to it, (3) the coherence pass's fixes. Companion to `gap-reconciliation-2026-07-21.md` + `website-lever-map-2026-07-21.md` + `docs/capability-ledger.md`.

## 1. The refined operating loop (Corey: "the loop looks accurate")
The helping engine runs, per account, continuously:
1. **Know the buyer-journey physics — and keep it current** (found→considered→chosen; website = the hub; referrals = a parallel channel; re-ground vs primary sources, don't recall — SEO/AEO moves monthly). *(entry-grounding)*
2. **Read the data — AND verify the instrument is honest** (a trustworthy number before any diagnosis; zero-Maps/fetch-defect/false-healthy = a lying gauge corrupts the whole loop). *(the best upgrade over the old loop — correctly BEFORE diagnose)*
3. **Diagnose the leak** — which gate.
4. **Prioritize the right MIX of moves** — run the full prioritized *portfolio* internally (never "the one move"); **surface the top move to the owner** so they're not overwhelmed (portfolio strategy, headline communication). Split Alloro-lane vs practice's, and **route out-of-lane moves to the practice / handoff partner** (don't drop them).
5. **Draft → owner approves → execute** — presence-side, owner-approved. **Value-#6 guard: intentions, not promises — no rank/visibility/guarantee claim.**
6. **Measure + ATTRIBUTE the lift** — "Alloro did X → number rose Y" (honest/directional where not causal). **Aspirational until the attribution rail (E1 + M0-SENDER + E2) lands — never report lift you can't attribute.**
7. **Repeat, re-grounding.** *(exit-grounding; steps 1 & 7 are the same act, bracketing the cycle)*

Canon-clean: owner-approval ✓, no-blast ✓, done=raised-hand ✓, + the Value-#6 guard now explicit in step 5.

## 2. What it takes to build up to the loop (dependency-ordered)
- **Layer 0 — Honest data (step 2). The foundation; nothing above is real without it.** zero-Maps fix (Dave), fetch-defect fixes (the 0/0 class of bugs), universal stale-data guard (today PMS-scoped only), renderer access + deploy the honesty logic to prod. **Mostly Dave/access-gated — the critical path.**
- **Layer 1 — Execute rails (steps 4–5). The bulk of Alloro's lane.** Wire the built-but-unwired levers (category via A6) + enable write-back; build from-scratch levers (Big-5 content, off-Google presence, phone/hours); turn "advise + Mark done (localStorage)" into "Alloro executed + reports." Upgrade the SUMMARY agent's top_actions to a portfolio.
- **Layer 2 — Attribution (step 6). The keystone.** E1 + M0-SENDER + E2 + renderer conversion events. Gated on Layer 0 + renderer access. The retention product AND the loop's learning signal.
- **Steps 1 & 7 are light** (knowledge + cadence, mostly built). **DIAGNOSE half (1–3) ~built; DO + PROVE half (4–6) is the work.**
- **The July-31 mission win = the first full pass through this loop on one site** (zero-Maps fixed + one wired lever [category] + directional attribution, on a pilot practice).

## 3. Coherence findings — ONE spine, three maps that disagree at the surface
Shared spine (coheres): the three gates + `submissions = impressions × CTR × CRO` + "which of the 3 numbers does this move?" — every doc references it.
**Fixes to make it fully cohere:**
- ✅ **C1 fixed** (ledger no longer retires `funnel-feature-sequence.md`).
- ✅ **C3 fixed** (ledger CH2/S2 → STRANDED — review-request engine + `smsService.ts` exist on `origin/checkup-upgrade`, not greenfield).
- ⏳ **C2:** the plan says "Get-found COMPLETE (all PR'd)" while the ledger shows impressions=0 + category not-wired. **"PR'd" ≠ "landed/wired/reading-real-data"** — make the plan use the ledger's state vocab (BUILT–NOT-WIRED / GATED-OFF), not "DONE."
- ⏳ **Add ledger rows:** the `website-renderer` black box (the #1 blocker — absent from the "source of truth") and the **referral loop** (`doctor_referral_matrix` data exists; only outbound/delivery rail missing).
- ⏳ **One crosswalk table** mapping sequence A–E ↔ ledger GF/GC/CH ↔ website-map A–F (no crosswalk today).
- ⏳ **C5:** two different `P1–P4` sets (business blockers vs process gates) — rename one.
- ⏳ **C4:** sequence line 76 ("#156 parked") vs its own M0 un-park stake — close it.
- ⏳ **Double-count:** insurance/cost content appears 3× (Big-5 / standalone / FAQ-schema) — it's ONE thing: FAQ = schema container (built), Big-5 = answer content (gap), AEO = ingestion. Say it once.
- ⏳ Fold the honesty-instrument layer (ledger H1–H4 / I1–I3) into the plan + the loop (it's the substrate of loop-step-2, currently ledger-only).
- **False-healthy tension:** ledger H1 carries it LIVE (a multi-location org shows one location, omits four); the owner-path said the verdict-honesty logic is fixed *in code* — reconcile: likely fixed-in-code but not deployed to all client accounts, and/or H1 (multi-location omission) is a distinct defect from single-verdict honesty. Needs a code-vs-prod check.

## Promotion gate + Corey's rulings (received 2026-07-21)
Promotes DRAFT → staked when the ⏳ fixes land + an adversary re-pass + Corey's rulings. Rulings in: (1) directional ROI = yes, **data-backed from Sikka** (not owner-entered); (2) reactivation = yes, consent-gated review/re-engagement only, never rebooking; (3) click-to-call = DoD stays form-submission, add call-volume as an honest gauge (not attributed); (4) paid ads = open, **LSA** is the entry (separate capability, practice funds spend).
