# Work Order — CTR Loop Brick 2: Educated‑Hypothesis Rewrite

*Handoff for a fresh session. Overwatch: the current session (compacted). Author: Claude, 2026‑07‑21. Hardened after an independent adversary pass that verified every anchor against the #205 branch and `origin/dev/dave`. Where this WO makes a scope decision, it is because the adversary proved the naive path was unimplementable or dishonest — do not reopen those decisions without telling overwatch.*

---

## The one‑line goal

Turn Alloro's meta‑title/description rewrite from a blind generator into an **educated hypothesis**: grounded in *fetched, citable* CTR frameworks, aimed at a diagnosed opportunity, carrying a rationale + a **baseline‑derived** prediction that a later brick can grade. This is the **10th slot in Dave's current batch of 10** — additive, one clean PR off `origin/dev/dave`. (PR number isn't reservable; don't hardcode one.)

## Where this sits (don't re‑derive)

The CTR self‑optimization loop is 4 bricks: (1) ✅ **Diagnose** — `findCtrOpportunities()`, shipped as PR #205, *OPEN/unmerged*; (2) ⏳ **this** — educated hypothesis; (3) recorded experiment (before/after CTR, a table = a migration) — *later*; (4) fleet learning — *later*.

**Brick 2 stops at:** a framework‑grounded rewrite + a returned hypothesis object. **It builds no table and persists nothing** — that's brick 3.

## ⚠️ THREE decisions the adversary forced — read before building

### A. The opportunity shape — use the REAL one; `topQuery` does not exist

`ctrOpportunity.ts` (brick 1, **on the #205 branch only**, absent from `dev/dave`) exports exactly:

```ts
export interface CtrOpportunity {
  page: string;          // the URL path
  impressions: number;
  clicks: number;
  actualCtr: number;     // NOT "ctr" — the real field name
  expectedCtr: number;   // baseline for its position
  position: number;
  missedClicks: number;  // round(impressions * gap); "gap" is computed internally and NOT returned
}
export function expectedCtrForPosition(position: number): number  // line 41 — you WILL reuse this (see C)
```

There is **no `topQuery` field, and no data path to one.** Verified: stored GSC payloads carry `queries` and `pages` as *separate* dimension arrays; `getTopQueriesByProject` is **site‑level only** — there is no query‑by‑page join in the tree. So:

- **A per‑page ranking‑query is OUT of scope for brick 2.** Do not invent a page↔query link — that is the exact fabrication this loop exists to prevent.
- **Degrade honestly:** use `getTopQueriesByProject` (site‑level top queries) as *directional* context, plus the page's own path/content, and **label any query linkage in the rationale as `inferred`, never as measured.** A per‑page‑query GSC fetch (page+query combined dimensions) is a legitimate *future* slice — name it in the PR body as out‑of‑scope, don't sneak it in.

### B. Build a NEW feature‑service — do NOT modify `generateAllSeoSections`

The engine that produces titles *is* a generator, but the resolution is not "extend the shared path" (blast radius on every SEO call) nor "build a lone parallel generator" (violates §4.3). It is:

- **New `feature-services/service.ctr-hypothesis.ts`**, callable standalone with an **injected `CtrOpportunity` + current title/description**, that **reuses** existing infra rather than reimplementing it:
  - `feature-utils/util.seo-section-runner.ts` — the section/prompt runner (confirmed present).
  - `feature-utils/util.seo-gsc-demand.ts` — the GSC‑demand helper (confirmed present).
  - `feature-utils/util.title-length.ts` — title truncation/length limits (confirmed present — use it, don't hardcode pixel caps).
  - the meta‑layer prompt scaffolding used by `service.seo-generation.ts`.
- `generateAllSeoSections` (in `service.seo-generation.ts`, line 234) is **read as the reference for how it consumes `getTopQueriesByProject` (line 249) and returns `{ results: Array<{ section, generated, insight }> }` — but NOT edited in this PR.**
  - ⚠️ Note why you stay out of it: unless `apply_geo_content: false`, it auto‑applies GEO *body content* to the entity (lines 229–233, 272–273). Your engine is metadata‑only — building separately sidesteps that side effect entirely.

### C. The prediction is baseline‑derived, never model‑generated

`predictedCtr = expectedCtrForPosition(position)` (reuse brick 1's function — "we predict closing the measured gap toward the position baseline"). `predictedLift = predictedCtr − actualCtr`. **The LLM never emits the number.** Label it a "baseline‑derived target," phrased per Value #6 ("designed to move toward…", never "will reach").

## The fabrication guardrail — a MECHANISM, not a hope (the accuracy‑critical core)

"Cite it" is satisfiable from memory with a fake string. It isn't enough. Every CTR principle in the knowledge base must carry:

- a **working URL**, the **specific claim** taken from it (one line), and **`verified via fetch YYYY‑MM‑DD`** — **fetched live this session** with WebSearch/WebFetch, not recalled.
- a **grade**: `measured-finding` (a study with numbers) vs `practitioner-heuristic` (expert advice) — the grade lives in the KB so a heuristic can never masquerade as data.

**Before gathering from scratch, check the existing research library** — invoke the `alloro-research` skill, and read the evidence‑graded get‑found lever material already in memory (`project_getfound_lever_evidence_ranking`). Don't re‑derive what's already sourced; store new briefs back.

**Alloro invents nothing; it finds and applies. If a principle can't be fetched and quoted, it does not ship.**

## The hypothesis object (brick 2's output — what brick 3 will later store)

Per page: the injected opportunity (missedClicks, actualCtr, expectedCtr, position); `before` (current title/description) and `proposed` (rewrite); `rationale` (which graded principle(s) applied, in plain words, with any query linkage marked `inferred`); `predictedCtr` / `predictedLift` (baseline‑derived, per C). It is a **proposal** — it writes nothing to the live site and sends nothing; the owner approves outward changes (canon: owner control at every stage). **"Records" here means the returned object *carries* everything brick 3 will persist — nothing is written to a table in this PR.**

## The consumer (so the engine isn't dead code)

The decoupled engine must not import #205. To satisfy "every export has a consumer" without that import, ship a **thin admin endpoint that accepts a `CtrOpportunity` in the request body** and returns the hypothesis — decoupled *and* consumed. (The real wiring — controller calls `findCtrOpportunities()` → feeds this engine — lands after #205 merges; name it as a follow‑up in the PR body.)

## Process gate — the PR Pipeline Protocol (binding, don't skip)

`docs/pr-pipeline-protocol.md` requires, **before code is written**, a numbered acceptance block (T1..Tn) with **predicted signals** for every data/output claim, in the **plan file** — and the PR body may only claim what a passing item proved.

- **First task, before any code:** add that acceptance block to this plan folder.
- PR body claims map 1:1 to passing acceptance items — nothing more.

## Constraints (don't break)

- **Value #6 — no promises.** "Designed to improve CTR," never "will get more clicks."
- **Code Constitution.** Mirror §6.1 (`src/controllers/gbp-automation/`). DB access through `models/` (§7.4). Thin response builders (§8.2) + typed domain error with centralized status mapping (§8.3). Pino, no `console.*` (§9.1). No `any` (§4.5). Run `npm run check:conventions --strict`; cite the precise `§N.M` for any violation; fix must‑fix before done.
- **Additive & isolated.** Don't change #205's or `generateAllSeoSections`'s behavior. One PR. **Never commit to `dev/dave` or `main`** — branch off `origin/dev/dave` as `claude/ctr-brick2-hypothesis` (match the batch's `claude/` prefix), PR to `dev/dave`, Dave reviews/merges (CD SOP).
- **Repo is public** — sanitize the PR body: product behavior only, no codenames, no attack framing.
- **Attribution:** `coreyw22 <corey@hamiltonwise.com>`.

## Definition of done

- `npx tsc --noEmit` → 0 new errors. Backend‑only.
- `npm run check:conventions --strict` → clean (or every finding cited + must‑fix fixed).
- Unit tests: given an injected `CtrOpportunity` + a current title, it applies the right graded principle and returns a rationale + a baseline‑derived prediction. Cover: the skip case (no meaningful gap → no hypothesis), the already‑optimal‑title case, and that `predictedCtr === expectedCtrForPosition(position)` (prediction is not model‑invented).
- Every KB principle carries URL + quoted claim + fetch date + grade. No un‑fetched citations.
- Acceptance block present in the plan file *before* code (protocol gate).
- PR body: what it does; the fetched framework sources; that it consumes #205's real shape (and that per‑page‑query linkage is inferred/out‑of‑scope); that `generateAllSeoSections` is unmodified; the follow‑up wiring PR; verification output; brick 2 of 4 (brick 3 = the experiment table, explicitly not here).
- Update the plan's "state for Dave" section with the new PR row + CTR‑loop stage bump.

## Overwatch checkpoints — STOP and report before proceeding past each

1. **After grounding, before building the KB:** post the framework **URL + one‑line claim + grade** list. Overwatch will **fetch at least two of them** to confirm they're real before greenlighting. Also confirm the shape/scope decisions (A/B/C) are understood.
2. After the engine + tests pass.
3. The final PR.

If framework grounding gets thin, or any principle can't be fetched and quoted, **stop and flag — do not ship an invented rule.**
