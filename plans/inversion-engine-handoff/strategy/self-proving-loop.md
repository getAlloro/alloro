# The Self-Proving Loop
### Alloro's competitive advantage, and the engine that delivers it

*Determination log, 2026-07-06. The canonical home for the moat is Notion "What Alloro Owns." This
doc is the determination + the who's-in-front backing, staged toward that canon, not a replacement
for it. Amend it; when the fold below is staked into the moat doc, this becomes the trail behind it.*

> The metric is unicorn-level, not the goal. The goal is value so impactful it draws in the people
> who need it and appreciate it; the money follows. Everything below serves that.

## What we're building (the thing, named)
A **self-proving loop**: the owner watches their *own* number move, in their *own* account, week over
week. No claim to believe, no guarantee, no pitch. The result talks. Birdeye reached $100M ARR on
a guarantee-free self-proving loop like this, which is why Birdeye, not Owner, is the model for the proof mechanism:
Owner used a performance *guarantee*, and Value #6 forbids guarantees. The self-proving loop is the
guarantee-free substitute.

## The competitive advantage, two pillars welded by one thing
- **Value pillar:** a productized, attribution-owned, undeniable result that lands *near-identically
  for anyone introduced*. Productized (not bespoke) is the sourced line between the firm that scales
  and the agency that dies under $5M ARR. Attribution-owned, the result is natively Alloro's, seen in
  the owner's own data, is what the players in front point to as the *actual* moat; "we do it for you"
  is not a moat, every agency claims it.
- **Trust pillar:** integrity, service, community, in a lemons market (Corey's strategic thesis) that has preyed on these owners
  for years while they built a life and served their community with a real skill. The costly signal
  is doing what the exploiters won't: showing the real number even when it's unflattering, never
  promising what can't be guaranteed, never fabricating a win. A predator cannot copy this without
  ceasing to be a predator. That is what makes it defensible.
- **The weld, clinical honesty:** showing the owner the real result in their own data is
  simultaneously the value proof AND the trust signal. One act does both. You cannot fake the number
  and keep the trust; you cannot earn the trust without the real number. Not two advantages, one.

## The posture, quiet professional
The predators are loud because the claim is all they have. Loud is the tell of the con; quiet is the
tell of the competent. Alloro says less and lets the owner's own numbers talk. Everywhere the copy
would explain why Alloro is great, it shows the work and stops. (This is the *source* of the existing
copy canon: relief not hype, surface the true, never boast.)

## The proven pathway (backing, who is already in front)
Sourced across Owner, PatientPop/Tebra, Scorpion, Weave, Podium, Birdeye, ServiceTitan, Thryv:
1. ONE concrete self-proving outcome, never "a platform." 2. Proof the owner SEES fast, in their own
numbers. 3. Narrow ICP, go deep, refuse off-ICP revenue. 4. The wedge installs the rail later
products ride at ~0 marginal CAC. 5. Repeatable acquisition, then the flywheel (word-of-mouth +
expansion outrun churn + CAC). The escape from the agency ceiling (80% never pass $5M ARR):
productize + narrow + self-evident ROI. The anti-pattern that stays small: a custom service (linear
labor, founder-bottleneck) selling an unprovable outcome (leads/traffic they can't attribute) to any
client who'll pay (no ICP, so churn and thrash).

## The closest analog, and the honest open question
PatientPop is Alloro's closest true analog: done-for-you *presence* for local practices (website,
SEO, reviews, booking; no PMS at the core), reached >$1B. **But it merged with a PMS (Kareo) to get
there durably.** No source states presence-alone stalled, so this is inference, not proof, but it is
real evidence sitting against the assumption that presence-only scales without touching the
system-of-record. **This boundary deserves a dedicated pressure-test before it is treated as settled
strategy.** Flagged here, not buried.

## Canon reconciliation (what to stake, and where)
The live moat doc carries the value/attribution half honestly but does **not** yet name the **trust
pillar** as a defensible, named part of the moat. **Proposed fold, for Corey's stake into Notion:**
add the trust pillar + the clinical-honesty weld + the quiet-professional posture + Birdeye-not-Owner
as the guarantee-free proof mechanism. This doc does not edit locked canon; it drafts the fold.

## The bridge (current state → target, the build sequence)
**Where Alloro stands:** the real data sources are live (GBP API, Google Search Console, Rybbit/Clarity
for website + heatmapping, rankings, reviews); the current dashboard mixes real, recently-fixed, and
possibly-residual-proxy numbers; no unified self-proving loop is delivered to owners, and there is no
systematic honesty gate.
**Where it needs to be:** the whole loop, every lever improving, validity-gated, delivered (pushed) to
the owner, culminating in the lead metric, appointment requests via form submissions (a request/lead, NOT booked revenue).

The bridge, three sequenced build steps (aim small per step, whole loop overall):
1. **Data-Validity Gate (the system, first).** Every owner-facing number passes a real-source /
   attributable / not-proxy check before display; a failure degrades to "not measured," never faked.
   Built first so the loop is honest by construction. Surfaces: `src/utils/dashboard-metrics/sectionBuilders.ts`,
   `frontend/src/types/dashboardMetrics.ts`, the monthly-agents summary assembly.
2. **Wire the value chain to the dollar metric.** Each real, validity-gated lever (GBP, GSC, Rybbit,
   rankings, reviews) connected to the final metric, appointment requests via form submissions. Rides
   step 1. Grounding for the engineer: confirm form-submission / appointment-request capture + attribution.
3. **Delivery (push).** The whole moving picture delivered to the owner on a cadence, not behind a
   login. Absorbs the un-built 7/2 delivery fix (re-enable ranking notification + un-gate attribution).
   Rides steps 1-2.

These three are carded for Jo's board (the pipeline to Dave); this section is the plan Dave's Claude
can analyze directly. Note the honest open dependency: step 2 assumes form-submission attribution is
real in the repo; the engineer confirms it first (it gates the dollar metric).

## Reconciliation to canon (the cards map here, read before building)
The self-proving loop is NOT a new system. It is the **build of things already in the canonical
Master Recipe** (do not treat it as a fresh strategy):
- The loop (Activate + Wire + Delivery cards) = **Machine 2, Step 6 "Activate"**, "deliver value the
  customer actually feels... push value to them, never make them log in to find it." The self-proving
  loop is the productized, always-on version of that step.
- The Data-Validity Gate card = the canon's **"Data accuracy is a HARD GATE on Prove (Step 7)"** +
  "VERIFIED-SOURCE ONLY." Building it as code EXTENDS that Step-7 rule (proof-note numbers) to the Activate/display layer (every owner-facing number). A deliberate widening of a locked principle, not just coding an existing lock.
- The downstream (capture → testimonial → referral) = **Machine 2 Steps 7-8 (Prove → Multiply)**, run
  by the existing **Customer Proof Engine** SOP. The loop *feeds* it; it is not rebuilt here.

The 2026-07-06 research battery **validated** this recipe externally (Owner / Weave / Podium / Birdeye /
ServiceTitan converge on Machine 2); the evidence is in `research/`. It did not replace canon.

## Sharpenings to fold into canon (drafted for Corey's stake, Notion edits)
1. **Birdeye = the guarantee-free proof model** → moat + Proof Engine: Activate/Prove use the
   self-proving loop (owner watches the number), never a guarantee (confirms Value #6).
2. **The lead metric = appointment requests via form submissions** → Activate's tracker as the felt-value
   number. It is a lead/request, NOT booked revenue; attribution to a booked dollar needs the PMS Alloro
   doesn't own, so don't call it a "dollar."
3. **Agency-ceiling economics** (80% never $5M; services 1-3x vs SaaS 6-15x) → the Governor / NS2
   rationale: the loop must be a productized system, not agency labor.
4. **Association / peer-community channel** (~50% of ServiceTitan customers) → Machine 1 Touch, a
   channel beside the Core Four for local-service verticals.
5. **PatientPop boundary question** (presence-only merged with a PMS to scale) → pressure-test the
   expansion thesis (payments-not-PMS) before it is load-bearing.

## Verified vs. assumed
- **Grounded:** the moat line + empty-seat frame (live moat doc, fetched 2026-07-06); Value #6
  no-guarantees (locked canon); the agency-ceiling economics, the winners' pathway, and Birdeye's
  guarantee-free $100M ARR (sourced research, self-graded PROVEN with URLs in the session trail).
- **Assumed / thesis:** the lemons-market framing (Corey's strategic thesis, conclusion-level);
  attribution-ownership as *the* moat (strong across sources, but a synthesis, not one sourced claim).
- **Most likely wrong:** the loop's headline number can only ever be a lead-count, not revenue, because
  Alloro doesn't own the system-of-record (the PMS) where a request becomes a booked dollar, the same
  reason PatientPop merged with one. Canon already answers the substrate question with PAYMENTS (not
  PMS), so the real open question is TIMING: can the presence-only beachhead sustain long enough before
  the payments substrate is built? (Verified 2026-07-06: form-submission capture exists in the repo;
  per-lead channel attribution does NOT.)
