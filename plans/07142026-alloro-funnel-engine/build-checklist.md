# The Build Checklist — the funnel, one line at a time

The followable form of the map. The information is settled; this is the list I run while
building so I don't jump. Reasoning lives in the anchor memory `project_funnel_three_gates`;
the visual is `the-map.html`. This supersedes the "order we go in" feature list in
`PLAIN-PLAN.md`, which predates this map.

## ⛔ Before you build anything — two things this list is FOR
- **The WHO (why this exists):** these three numbers are the **owner's vitals**, not Alloro's
  scorecard. The job is to take load off an overwhelmed owner — more clarity, more confidence,
  their time back. **Doctor, not coach:** every fix must end in *"we fixed it,"* never *"here's
  your homework."* Any lever whose output is a task dumped on the owner is a coach lever —
  redesign it. A doctor can also say *"you're healthy, go home."*
- **⛔ Gate-1 is currently DEFECTIVE — do not build GET FOUND levers on it yet.** Impressions
  counts organic only; it omits the Maps/local impressions already ingested but not wired in.
  The whole equation rides on this number, so understating it mis-points the "which term is
  low" diagnostic. **Fix it in code first (sum Maps + organic), then build.**

## How to use it — the discipline
- **One gate at a time, one item at a time.** Move on only when the item is done — the same
  checklist, in the same order, every time.
- **Three phases, in order:** 1) **Identify** every item (this list) → 2) **Perfect** each
  (its best version + how you check it) → 3) **Test** and iterate. Never perfect or test
  before the list is complete.
- **Only Corey stakes** a gate complete.

## The scope (the boundary)
- **On the map — the search path:** Get found → Get considered → Get chosen.
- **Off (different machines):** Referrals — observe-only via Reflect (parked, value
  unproven). Paid ads — out (muddies pricing/ops; a local business wins without them).

## Feasibility tag (filled in the Perfect phase)
Each item gets one: `built` · `buildable` · `observe-only` · `don't-touch` · `to-verify`.
Right now almost everything is `to-verify` — the feasibility pass (which levers Alloro can
actually pull) has not run yet.

---

## 1 · GET FOUND — Research — *impressions* — "do you come up at all?"
- [ ] GBP primary category (strongest single found lever)
- [ ] GBP secondary categories (relevant ones only)
- [ ] NAP consistency — name/address/phone match everywhere
- [ ] Citations / directory listings — consistent listings across the directories Google cross-checks
- [ ] Profile completeness — services, attributes, description
- [ ] Reviews as a ranking signal (count + rating feed prominence)
- [ ] Open hours (open-now eligibility)
- [ ] Business-name keywords — legit only; stuffing = suspension
- [ ] Proximity — cannot control (observe only)
- [ ] Organic: on-page content for the search terms
- [ ] Organic: crawlability / indexability
- [ ] Organic: backlinks + internal links
- [ ] Organic: a page per service and per town
- [ ] AI answers (AEO): crawler access, presence in the sources AI reads, schema

## 2 · GET CONSIDERED — Consideration — *visits* — "is this one right for me?"
- [ ] The card review block — stars / count / recency (earns the click)
- [ ] The blue-link snippet — the meta title (the proven CTR lever; description is theatre)
- [ ] Photos
- [ ] Website copy that answers their questions
- [ ] FAQs
- [ ] Credentials / named providers / trust signals
- [ ] Insurance / network acceptance — often the first filter *(adversary add)*
- [ ] Responding to reviews *(adversary add)*
- [ ] GBP posts — regular updates on the profile (engagement, not ranking — posts don't rank)
- [ ] Review recency / velocity *(adversary add)*
- [ ] Third-party profiles — Healthgrades / Zocdoc / Yelp *(adversary add)*

## 3 · GET CHOSEN — Decision — *submissions* — "do they reach out?"
- [ ] Is the number even real? (strip bots + existing patients before diagnosing)
- [ ] Loads fast, on a phone
- [ ] Trust in the first half-second
- [ ] Answers: cost / insurance / what happens / who they'll see
- [ ] Real reviews shown on the page (the text lives here, not just a profile link)
- [ ] Easy to reach out — the form, low friction
- [ ] Availability shown (on-site — the booking act itself is the practice's job, out of lane)
- [ ] Response speed — faster is better (direction; not the B2B-sales decimals)

## Loyalty → Advocacy (the loop, owner-approved)
- [ ] Ask happy patients for a review — owner confirms, then it sends. The review becomes a
  Research + Consideration signal for the next person. (Word-of-mouth, not repurchase.)
  `[unbuilt — to-verify]`: review-generation isn't built today; owner-approved outbound only.

---

## ✅ STAKED — validated build-state + seam map (Corey, 2026-07-17)

**This level is CLOSED — do not re-derive it.** This stakes the *code and connection* state (what is
actually built, and whether the pieces connect) — a layer below the anchor's lever frame, not a
re-stake of Level 3. Every level's build-state and every seam's connection-state is verified against
`origin/dev/dave` @ `4cdb0eaf` by three grounded code-audits plus **three independent agent passes** —
two adversarial (both BROKE-IT; corrections folded in) and one unbiased verify of this written doc
(**SURVIVED**: every mark matches the code). Confidence is in the method — each mark carries a
file:line receipt. **Poka-yoke — staleness is detectable:** if `origin/dev/dave` has moved past
`4cdb0eaf`, re-verify before trusting these marks. **Two carve-outs** hinge on the external
`website-renderer` repo (not on this machine): the on-page render and the render→form source hop —
marked CAN'T-VERIFY, to close when we get renderer access. Supersedes the `Feasibility tag`
placeholder above.

### Build-state per level (grounded)
**GET FOUND**
- A1 target-query → website content loop — `built`; runtime not independently re-traced
- A2 GBP completeness detect — `built`, internal-only, *gates nothing, never owner-facing*
- A3 AI-answer visibility (AEO) — `scaffolding`, un-runnable (test-only callers; no handler/route/schedule)
- A4 NAP consistency monitor — `built but DARK` (handler registered, **no seeded schedule**)
- A5 findability / proximity sensor — `scaffolding`, un-runnable (test-only callers; no handler)
- A6 GBP business-info write-back — `built + fully wired to Google PATCH`, ships **DISABLED**, per-account, **human-fed (not detector-fed)**
- crawlability / indexability — `built` (two auditors; one runs inside the `ranking` agent) — *corrects an earlier "absent"*
- citations building · backlinks / internal-links — `absent`
- reviews-as-ranking-signal · business-name keywords · proximity — `observe-only`

**GET CONSIDERED**
- Responding to reviews — `LIVE` (human-approved, real Google API)
- GBP posts — manual publish `LIVE`; scheduled generation **neutered** (always skips)
- Meta title / search headline — `built` (admin-triggered generation)
- Website trust copy (B2, Taste Profile #160) — `DORMANT / unwired` → live copy is generic
- FAQ answers — `incomplete` (schema only fires if candidates pre-exist; no generator)
- Credentials / trust block (B3) — `absent`
- Photos gallery upload · insurance fill · fresh-review lever · third-party profiles — `absent` / `observe-only`

**GET CHOSEN**
- Lead form capture + source attribution — `LIVE` (source derived + persisted); **security pipeline COMMENTED OUT** (only AI content analysis active)
- Availability / request-a-time (C2) — `absent`
- Lead → HubSpot CRM push — `wired`
- Loads fast · trust in half-second · deciding answers · reviews-on-page — `CAN'T-VERIFY` (renderer repo)

**LOOP / MEASUREMENT**
- Review generation / request sender — `absent`
- Attribution source (E1) — `captured` backend; **read by no funnel/channel consumer (inert)**
- Proving-simulation (E2) — `absent`
- Funnel math — `built` (assembles impressions × visits × leads, picks the weakest step as the leak); **impressions term is organic-only, excludes Maps/local → under-counts** (= the anchor's 🐛 gate-1 defect)

### Seam map — the connections (CONNECTS / BROKEN / CAN'T-VERIFY)
1. detected gap → Google write — **BROKEN** (write pipeline built + wired but disabled + human-fed, not detector-fed)
2. completeness detect (A2) → write-back (A6) — **BROKEN** (zero references)
3. NAP detect (A4) → any fix/action — **BROKEN** (append-only log; no reader)
4. AEO (A3) / findability (A5) → any consumer — **BROKEN** (orphaned; not even invoked in prod)
5. site visit → counted — **CAN'T-VERIFY** (read side wired; record side = renderer; preview path disabled)
6. form submit → source attributed — **CONNECTS** (derived + persisted); *security pipeline off*
7. persisted source → measurement / funnel consumer — **BROKEN** (written, never read — moat data inert)
8. happy patient → review request — **BROKEN** (no sender)
9. review ingested → display / ranking signal — display data-path **CONNECTS** (render CAN'T-VERIFY); ranking signal reads the **GBP scrape, not ingested reviews**
10. scheduler → runs the levers — **MOSTLY BROKEN** (only proofline + ranking scheduled; NAP no schedule; AEO/findability no handler)
11. any deliverable → owner surface — **BROKEN** (completeness/NAP/AEO/findability never reach the owner)
12. funnel equation assembly — **CONNECTS**; impressions organic-only → materially incomplete
- (+) review-reply signal → Google reply write — **CONNECTS** — the one working detect → action → Google path
- (+) lead → HubSpot CRM — **CONNECTS**

### The 3 principles — RUN 2026-07-17 (not just named); they reorder the build
- **Jidoka (don't pass a defect downstream):** the gate-1 impressions defect is a **PREREQUISITE, not a ranked item.** A wrong first number mis-points the whole diagnostic, and this checklist's own opening rule already says fix it before building GET FOUND. Pulled to the front (below). *(Grounded: Maps impressions are ingested — `service.agent-input-builder.ts:103-110` — but the funnel reads GSC organic only, `stageReaders.ts:225`.)*
- **Musk (question → delete *before* you build):** "wire the AEO + findability/proximity sensors" comes **OFF the build list, not up it.** The anchor's own evidence kills them as levers — proximity is uncontrollable ("you cannot change it"), AI-answer clicks are ~1% ("do NOT build an AI click lever"). They stay `scaffolding` in code; parked as build targets until a value case is staked. Applying existing canon, not a new stake — flag if you disagree.
- **Poka-yoke (mistake-proof):** stake stamped with the verified-against commit (`4cdb0eaf`); staleness is now detectable (see the intro).

### ⛔ PREREQUISITE — before ANY get-found build (Jidoka)
- **Fix gate-1: sum Maps + organic impressions** (seam 12). Data already ingested, not wired. Until done, the funnel's first number is wrong and every get-found diagnosis built on it inherits the error.

### Ranked broken seams to CLOSE — worst-first (fix unblocks the most chain)
1. **detector → write-back** (seams 1-trigger + 2) — severs the whole "found it → fixed it on Google" arc
2. **source written → never read** (seam 7) — attribution captured but inert
3. **nothing reaches the owner** (seam 11) — detectors dead-end server-side
4. **NAP → no action** (seam 3) · **no review-request sender** (seam 8)

### PARKED — do NOT wire without a staked value case (Musk delete-first)
- **AEO observation (A3)** and **findability / proximity sensor (A5)** (seam 4) — orphaned in code; off the build list per the anchor's evidence, not scheduled for wiring.

### On-paper verdict
The parts largely exist; they do **not** yet connect into one working flow. The chain is broken at
the majority of load-bearing seams. Staked as the true, connection-accurate state — the basis for
the build order, **not** a claim that it works together. The build now closes seams, worst-first.

---

## To finish THIS process (before Perfect and Test)
- [x] **Stake the frame + scope into the anchor** — done 2026-07-17; canon, map, and this list agree.
- [x] **Run the whole-checklist dry-run + feasibility pass** — done 2026-07-17. Three grounded
  code-audits + two adversary passes; the true build-state of every item is in the STAKED section above.
- [x] **Run the end-to-end seam trace** — done 2026-07-17. Every connection between stages is marked
  CONNECTS / BROKEN / CAN'T-VERIFY in the STAKED section above.
- [ ] Fix gate-1 in code (sum Maps + organic) — the real unlock for building GET FOUND (= seam 12 /
  ranked broken seam #6; the anchor's 🐛 gate-1 defect)

**This level is closed.** Next is the BUILD: close the broken seams worst-first (ranked list above),
one at a time, each proven and validated before the next.
