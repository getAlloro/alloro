# Build Spec — Reviews Dose Calculator (dashboard feature)

**For Dave + his Claude. Code-grounded, verified against `origin/dev/dave` on 2026-07-05.** A value-ADD feature (not de-fabrication), and **buildable independently of the measurement-honesty fixes**, because it computes from the client's OWN real rating + review count, which are real (not the fabricated competitor data).

**Why:** today the product holds the client's real rating + review count but only ever tells the owner "ask for a Google review" (generic, `Summary.md` / `Opportunity.md`). The manual's signature doctor move, *compute the dose from the practice's own numbers*, is absent from the code. Wiring it in turns generic advice into a specific, owner's-own-data verdict: **"at least 24 five-star reviews to reach 4.5, about 6 months at your current ~4/month, so the honest cadence to reach it is ~10 asks/month."** That specificity is the differentiator (the doctor, not the consultant), and it creates clarity + confidence, not another stat.

---

## The math (deterministic, on data already present)
To move a rating `r` on `n` reviews to a target `t`, the five-star reviews needed:

`k = ceil( n·(t − r) / (5 − t) )`

- Worked: r=4.3, n=60, t=4.5 → k = ceil(60·0.2 / 0.5) = **24**; verify (4.3·60 + 5·24) / (60+24) = **4.50**. ✓
- **Timeline** = k ÷ current monthly review velocity.
- **k is a best-case FLOOR** (assumes every new review is 5★ and none are filtered), present it as "at least k." An all-5★ burst can trip spam detection, so the ask cadence must be steady, not a spike.
- **Target t = 4.5** is the manual's synthesized band (Spiegel's tested peak 4.2–4.7 + the 4.5+ consumer filter). If the practice is already ≥ target, show "you're in the sweet spot, keep it fresh" instead of a dose.

## Backend (needs your compile)
`src/utils/dashboard-metrics/sectionBuilders.ts` — reviews section builds `current_rating`, `rating_change_30d`, `reviews_this_month` (`:84-87`), and already exposes the total count as `total_review_count` (`:85`).
- Add a computed `review_goal` object to the reviews dict:
  `{ target: 4.5, reviews_needed: k, months_at_current_pace, current_velocity_per_month, recommended_ask_per_month }`.
- **`n` (total count) is ALREADY on the dict** as `total_review_count` (`sectionBuilders.ts:85`, typed `types.ts:31`, frontend `dashboardMetrics.ts:26`) — use it. Do NOT add a duplicate `reviews_count`.
- **Velocity:** `reviews_this_month` is a calendar-month count (per the `StatCardRow` comment `:149-153`); prefer a rolling-30d / trailing-average velocity if available, else use it with an honest "recent pace" label.
- **`recommended_ask_per_month`:** `reviews_needed / desired_months / expected_write_rate`, where **`desired_months` is a stated target window** (e.g. 4 — it's an input, define it; the formula is undefined without it). Do NOT hardcode `0.65` as the practice's write-rate — use its own observed ask→write rate if available, else label the assumption as a borrowed benchmark.
- Add `review_goal` (nullable) to **both** `src/utils/dashboard-metrics/types.ts` (interface `:25-34` + Zod `:36-45`) **and** the frontend `frontend/src/types/dashboardMetrics.ts:22-29` — miss the frontend one and `StatCardRow` is a TS error.
- **Null-safe:** if `current_rating` is null or `total_review_count` is 0, emit `review_goal: null` (never fabricate a goal).

## Frontend / UX (the part that creates the clarity — the real build)
`frontend/src/components/dashboard/focus/StatCardRow.tsx` renders the reviews stat card (reads `reviews.current_rating` `:147`, `reviews.reviews_this_month` `:156`). The dose is a NEW visual, either an expansion of that card or a dedicated **"Your review goal"** card:
- **Headline number:** "X reviews to Y★" (e.g. "24 reviews to 4.5") — the single most important line, big.
- **Progress element:** current rating on `n` reviews → target, gap visualized (a bar/dial to target, not a fake "score").
- **Timeline:** "about 6 months at your current ~4/month."
- **The cadence line (honest, gated):** "To reach 4.5, about 10 review-asks/month at your write-rate" — a target *cadence*, not a done-for-you promise. ⚠️ Review-generation (sending review requests) is NOT built; until it ships this is a diagnosis + cadence target only, and the built review lever it can cite is auto-response to *existing* reviews (Value #6).
- **Honest microcopy** (a tooltip, not a scary caveat): "Best case, assuming the new reviews are 5-star." If already at/above target: "You're in the sweet spot — we're auto-responding to keep it current" (names the built lever, not a vague "we keep it fresh").
- **Empty state** (no data): show the current rating + "we're building your review picture," never a fabricated goal.
- Plain, owner-facing, respectful (never patronizing). The feel: a doctor showing you the one number and the plan, not a dashboard stat.

## Gating / effort
- **BUILDABLE NOW, not gated on Layer 2:** the *diagnosis* (compute + show the dose and cadence target) runs on the client's own real rating + count, not fabricated competitor data. **The *done-for-you asking* half is gated on review-generation shipping (not built today),** so ship the diagnosis, don't promise Alloro does the asking.
- Effort: backend = small (deterministic math + 2-3 dict fields + Zod); frontend = a real component (the UX is the work).
- **Docs parity** (AGENTS.md): dashboard UI change → update `alloro-docs` (the reviews card walkthrough) before finalization.

## Honest caveats
- Verified against `origin/dev/dave` (2026-07-05): the reviews dict fields (`sectionBuilders.ts:84-87`, `types.ts:25-45`) and the frontend consumer (`StatCardRow.tsx:147,156`). Not compiled on your branch.
- `k` is a best-case floor; the target band is a synthesis (tested peak + consumer filter), not a promised outcome. Value #6: never "we'll get you to 4.5", it's "here's what reaching 4.5 takes."
- Don't hardcode the `0.65` national write-rate as the practice's own (the measurement-spec lesson).
