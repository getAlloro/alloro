# Design Spec — The Honesty Code-Gate (the durable fix for the fabrication class)

**For Dave + his Claude. Design-seed, not a drop-in** — the components and seed hook-points are grounded on `origin/dev/dave` (2026-07-05); the exact validator implementation + CI wiring is your design.

**Why now:** the honesty-violation class — *a number or claim reaching a customer or the LLM without real, measured backing* — has surfaced **5+ times**: demo data on paying dashboards, `score_gap = 100−score` labeled "gap to #1," competitor review-velocity pinned to `0`, the audit recommending unbuilt capabilities, the hardcoded "synced" Referral chart. Each was caught by a *human* pass (the `alloro-honesty-scan` skill, `alloro-proof`). But a human scan only catches what gets scanned, and the class keeps reappearing because **nothing runs automatically on every change.** The durable fix isn't better detection — it's automated **firing**: a gate wired into the render/send path and CI, not a human remembering to look. This is the automated form of the honesty doc's §2.7 systemic gate + the demand-gen guide's measured/derived/placeholder discipline.

## 1. Built-Capabilities Registry — kills the over-claim class
A single source-of-truth of what Alloro can actually do; copy + audit-output validate against it, and a claim naming a capability not in the registry fails.
- **Seed** (from the verified set): **BUILT** = GBP posts + scheduling · review replies / auto-response · Alloro websites + on-page SEO · lead/contact forms · photo-attach-to-post. **NOT BUILT** = review-generation · PMS live-integrations · booking flow · GBP photo-refresh · GBP completeness write-back.
- **It's code, not a doc** — a typed constant (`BUILT_CAPABILITIES`) a validator checks the audit pillars' `Solution Bias` output (and any generated customer copy) against. Naming a capability not in the set fails CI or gets stripped.
- **Hook:** the audit-pillar output (the same Solution-Bias lines the pillar-over-claims spec edits) + generated copy. **When a capability ships, it's added to the registry in the same PR** — so copy can only ever claim what's been built.

## 2. Provenance-tag validator — kills the fabrication / staleness / proxy classes
Every customer- or LLM-facing number carries a provenance tag + an as-of, enforced.
- **Tag:** `measured` (real, from source) / `derived` (computed — disclose the basis) / `placeholder` (fail if it reaches a customer), each with an `as_of`.
- **Rule:** a `placeholder`, or a value stale past its freshness window, that reaches a customer surface **fails** the validator; a `derived` value must carry its basis; a proxy surfaced under the real thing's name fails. Extend the existing reject pattern (`summaryV2Validators` already rejects some metric mismatches).
- **Seed:** the demand-gen guide already calls for "tag every number measured / derived / placeholder" and "the grounding check must REJECT a proxy-field citation, not certify it." This makes it enforced, not advisory.

## 3. Pre-customer sanity gate — kills the demo-leak / small-sample / wrong-source classes
An automated check before a dashboard or audit renders or sends:
- **No demo/placeholder data** for an org with a real subscription or real uploaded/connected data (the demo-leak fix, generalized to a rule).
- **Referral/production counts within a plausible range** of their inputs; production-basis known (Sig 5, wrong-source).
- **Minimum-sample gate:** no "trend / average / top" below an n threshold — render "not enough data yet" instead (Sig 7).
- **Every headline number's provenance tag present** (component 2), with its `as_of` (Sig 6, staleness).
- **Hook:** the dashboard-metrics response (`service.dashboard-metrics.ts`) + the audit deliverable, before they reach the customer.

## The one structural non-negotiable (from the adversary pass on the honesty skill)
**Detection can be a human skill; reliable firing cannot.** The gate's defining property is that it runs **automatically** — on every PR touching a customer-facing render / email / audit / publish path, and at render/send time — not when someone remembers. That is the exact thing the human `honesty-scan` skill can't guarantee and this must.

## Sequencing / honest scope
- This is the **durable layer** — sequence it AFTER the emergency fixes (the demo-leak, the number bugs) land. It prevents the *next* fire; it doesn't put out the current one.
- **Design-seed, not drop-in:** components + seed hooks are grounded; the validator implementation + CI wiring is your design. Do a grounded pass on the precise hook-points (the render path, the CI config, the existing validator shape) before building.
- The pieces already exist in seed form — §2.7 (honesty doc), the demand-gen guide's grounding-validator + measured/derived/placeholder tagging, the `summaryV2Validators` reject pattern. This unifies them into one *enforced* gate instead of three advisory notes.
