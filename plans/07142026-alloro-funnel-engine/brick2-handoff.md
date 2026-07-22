# Work Order — CTR Loop Brick 2: Educated‑Hypothesis Rewrite

*Handoff for a fresh session. Overwatch: the current session (compacted). Author: Claude, 2026‑07‑21. Every code anchor below was verified against the tree this turn.*

---

## The one‑line goal

Turn Alloro's meta‑title/description rewrite from a blind generator into an **educated hypothesis**: grounded in real CTR frameworks, aimed at a *specific* diagnosed opportunity, and it **records the rationale + the prediction** so brick 3 can later check whether click‑through actually moved.

This is **PR #206 — the 10th PR in Dave's current batch of 10.** Additive, off `dev/dave`, one clean PR.

## Where this sits (don't re‑derive)

The CTR self‑optimization loop is 4 bricks:
1. ✅ **Diagnose** — `findCtrOpportunities()` finds pages seen‑a‑lot‑but‑under‑clicked. **Shipped as PR #205 (not yet merged).**
2. ⏳ **Educated hypothesis** — *this Work Order.*
3. ⏳ Recorded experiment — before/after CTR (a small table = a migration). *Later.*
4. ⏳ Fleet learning — learned expected‑CTR replaces the static baseline (the data moat). *Later.*

**Brick 2 is NOT the experiment table.** Do not build the migration here — that's brick 3. Brick 2 stops at: framework‑grounded rewrite + a returned hypothesis object (rationale + predicted lift). Keep the slice tight.

## ⚠️ Sequencing — brick 1 isn't merged yet (read this before branching)

`src/controllers/admin-websites/feature-utils/ctrOpportunity.ts` (brick 1) exists **only on the #205 branch** — it is NOT on `dev/dave` until Dave merges #205. So:

- **Do NOT hard‑`import` #205's file into the core engine.** Build the hypothesis engine **decoupled**: it takes a *diagnosed opportunity* (`{ page, position, impressions, ctr, expectedCtr, gap, missedClicks, topQuery }`) and a *current title/description* as **input**. That way it compiles + tests standalone against `dev/dave`, with no dependency on the unmerged #205.
- The thin **controller wiring** that actually calls `findCtrOpportunities()` → feeds the hypothesis engine is the *only* part that needs #205. Land it as a small follow‑up once both are on `dev/dave`, or stack it explicitly (see `[[feedback_stacked_merge_order]]` — base merges to trunk first, child retargets). Recommended: keep #206 decoupled + independently mergeable; wire in a #207 after #205 lands. Confirm with overwatch which you're doing.

## Ground first — read these before writing anything (all verified present this turn unless noted)

- `service.seo-generation.ts` → **`generateAllSeoSections()` at line 234** (`src/controllers/admin-websites/feature-services/`). Confirmed: it already fetches real GSC top queries via `getTopQueriesByProject(projectId)` (line 249) and returns `{ results: Array<{ section, generated, insight }> }`. **This is the proven GSC‑aware path you extend — do NOT build a parallel generator (§4.3, §6.1).**
  - ⚠️ **Side effect:** unless `apply_geo_content: false`, it auto‑applies GEO body‑content recommendations to the entity's visible content (lines 229–233, 272–273). Brick 2 is **metadata‑only** (title/description) — pass `apply_geo_content: false` on any path you trigger, or stay out of that call entirely and operate on the title/description layer, so you never trigger an unapproved body rewrite. Owner approval gates outward changes.
- `ctrOpportunity.ts` (brick 1, **on #205 branch only**) — the opportunity shape you consume as input. Read it via `git show origin/<#205 branch>:...` or the #205 diff; don't assume — confirm the exact field names.
- `service.gsc-performance.ts` — `GscDimensionRow` (`{ clicks, impressions, ctr (fraction), position, key }`), `getDashboard()`. The demand data.
- Reference analog: `src/controllers/gbp-automation/` (§6.1) — thin controller → `feature-services/` logic → `feature-utils/` typed errors + `ok()/fail()` builders. Mirror it.
- The plan: `plans/07142026-alloro-funnel-engine/PLAIN-PLAN.md` ("state for Dave" section) + `funnel-feature-sequence.md`.

## What "educated" means (the accuracy‑sensitive core — get this right)

The hypothesis engine needs a **small, defensible knowledge base of CTR title/description principles** — not vibes. Ground them in named, real frameworks (title‑tag CTR research: primary keyword placement, length/pixel truncation limits, front‑loading the differentiator, specificity/number/modifier effects, intent‑match to the ranking query, brand vs non‑brand). Each principle must be:

- **Stated as a rule** an LLM prompt can apply, with a one‑line *why*.
- **Attributable** — from a real, citable source in a `source` field or comment. **Alloro invents nothing; it finds and applies.** If you can't cite it, don't ship it as a principle.
- **Tied to the diagnosed gap** — the rewrite for a page ranking #4 for a high‑impression query it under‑clicks should reference *why* (e.g. the current title buries the exact query the page ranks for).

A wrong framework produces rewrites that *lower* CTR. This is the whole reason it's a fresh session — ground the KB carefully, and stop if a principle can't be cited.

## The hypothesis object (brick 2's output — feeds brick 3 later)

Per page, a structured hypothesis:
- the target page + the diagnosed opportunity (missedClicks, current CTR, expected CTR, ranking query)
- `before` (current title/description) and `proposed` (rewrite)
- `rationale` — which principle(s) applied and why, in plain words
- `predictedCtr` / `predictedLift` — the falsifiable prediction brick 3 will grade
- it does **not** write to the live site or send anything — it's a *proposal* (owner approves outward changes; §5.4 + canon).

## Constraints (do not break)

- **Value #6 — no promises.** "Designed to improve CTR," never "will get more clicks." The hypothesis is a bet, labeled as one.
- **Owner approval gates any outward change.** Brick 2 produces a proposal + prediction; it does not publish.
- **Code Constitution.** Mirror §6.1. DB access through `models/` (§7.4). Typed domain error + `ok()/fail()` (§8.x). Pino, no `console.*` (§9.1). No `any` (§4.5). Run `npm run check:conventions --strict`; cite `§N.M` for any violation; fix must‑fix before done.
- **Additive.** Don't change #205's behavior; consume its output shape. One PR off `dev/dave`. **Never commit to `dev/dave` or `main`** — branch `codex/ctr-brick2-hypothesis`, PR to `dev/dave`, Dave reviews/merges (CD SOP).
- **Repo is public** — sanitize the PR body: describe the CTR mechanics as product behavior, no internal codenames, no attack framing.
- **Attribution:** `coreyw22 <corey@hamiltonwise.com>`.

## Definition of done

- `npx tsc --noEmit` → 0 new errors. Backend‑only slice unless a surface is genuinely needed.
- `npm run check:conventions --strict` → clean (or every finding cited + must‑fix fixed).
- Unit tests: given a diagnosed opportunity + current title, it applies the right principle and returns a rationale + falsifiable prediction. Cover the skip case (no opportunity → no hypothesis) and the "already‑optimal title" case.
- KB principles each carry a real citation — no invented frameworks.
- PR body: what it does, the framework sources, how it consumes #205's shape, the decoupling decision (and whether wiring is #206 or a follow‑up #207), verification output, and that it's brick 2 of 4 (brick 3 = the experiment table, explicitly not in this PR).
- Update the plan's "state for Dave" section with the new PR row + the CTR‑loop stage bump. No blind merge.

## Overwatch contract

Report to the overwatch session at three checkpoints: (1) after grounding — confirm `generateAllSeoSections` is the right extension point, name the framework sources you'll use, and state the decoupling/wiring decision, **before** building the KB; (2) after the engine + tests pass; (3) the final PR. If the framework grounding gets thin or a principle can't be cited, **stop and flag** — don't ship an invented rule.
