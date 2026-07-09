# READ ME FIRST — Alloro strategy artifacts (handoff for Dave, 2026-07-06)

> ⚠️ **SUPERSEDED as the front door.** This 2026-07-06 index covers only a prior slice of the repo (the two `.html` maps + early specs); it predates the inversion engine and the MAGIC levers. **Start at [`START-HERE.md`](START-HERE.md)** — it maps the whole current corpus and the read order. This file remains valid for the `.html` maps and the guardrails it lists below.

Open the `.html` files in any browser (self-contained, no setup). This index says what's authoritative, what's context, and — important — **what NOT to build from.** Read this before feeding the artifacts to your agent.

## Start here (strategy)
- **skill-opportunity-map.html** — what to build next, proof-gated. Authoritative.
- **gold-map.html** — ranked value / opportunity map. Directional.

## For your Claude — build context (`specs/` + `guardrails/`)
- **`specs/`** — ship-ready build specs: `reviews-dose-calculator.md` (greenfield, buildable now), `audit-pillar-overclaims-spec.md` (SHIP-stamped prompt edits that stop the audit over-claiming).
- **`guardrails/`** — load these before your agent writes any customer-facing spec or copy: `built-vs-unbuilt-capabilities.md` (the code-verified list of what Alloro has and hasn't built), `honesty-scan-for-dave.md` (the fabrication-class scan pass, runnable on your tree), `honesty-code-gate-spec.md` (the durable auto-firing version), `scan-findings-070626.md` (the F1–F9 dashboard-number findings), `claude-capabilities-calibration.md` (honest coding-agent success rates).

## The attraction manual (why the product works — 12 chapters; education, NOT build specs)
primary-category · gbp-localseo · reviews · technical-seo · backlinks-offpage · aeo-geo · heatmapping · cro-testing · programmatic-local-pages · conversion · foundations · lever-map.

Read these for the *mechanism* behind the product direction. Each carries **evidence grades** — a `[practitioner]` or `[lore]` claim is weaker than a `[Google-confirmed]` / `[tested]` one. Don't spec a weak-grade claim as if it's settled.

## ⛔ DEAD BY DECISION — do not build or spec these
(From Corey, 2026-07-06 call.)
- **Generate Instant Website** — dead by decision.
- **Welcome Intelligence** — dead by decision (specced, never built, no worker).

## ⛔ NOT BUILT — don't let a spec claim these exist
review-generation (soliciting reviews) · PMS live-integration connectors (manual import exists; connectors don't) · booking flow · GBP photo-refresh · GBP category / completeness write-back. Every GBP **write** Alloro actually has is review-replies + local-posts only.

## ⚠️ FABRICATED / PROXY NUMBERS — real-looking but not measured; don't build to them
Full list + fixes are in the **Dashboard Accuracy & Trust** doc (your Notion). Examples: `score_gap` = `100 − score` mislabeled "gap to #1"; competitor review-velocity pinned to `0`; referral deltas (drop / growth %) hardcoded to `0`; an unweighted multi-location rating shown as real stars. If a feature idea depends on one of these being real, stop.

## Reality check before you spec
The recent land-rate audit found the *ticketed* infra mostly shipped, but several *no-ticket* specs never landed (including the audit-funnel rate-limit — a live cost exposure on the public `/api/audit/start` endpoint; the limiter middleware already exists at `src/middleware/publicRateLimiter.ts`, just unwired, so the fix is one line of wiring, not a new limiter). Don't assume something's built — check `origin/main`, or ask Corey for the land-rate map.

---
**Bottom line:** the manual is the *why*; the skill-map is *what's next*; and do NOT spec off the dead features or the fabricated numbers. That filtering is the exact part that got dropped last handoff — so it's called out here, explicitly, on purpose.
