# A5 Findability Sensor — Session Handoff

**This file is the start-here for the next session.** It is the continuation pointer, not the
design — the design is `spec.html` in this folder. Read this first, then the spec.

## The goal (one line)
Build **A5 slice 1 — the findability sensor**: extend the single-point rank check into a multi-point
geo-grid that yields an owner-legible **SoLV** (Share of Local Voice), honest and status-only. It is
the first brick of the scientist loop (Sensor → Reader → Hypothesizer → Actor → Watcher → Learner).

## First actions (do these before writing any code — they also prove the handoff was lossless)
1. `git checkout claude/a5-findability-sensor` (off dev/dave; the spec + funnel map are already here).
2. Read the durable tracker: `plans/07142026-alloro-funnel-engine/funnel-feature-sequence.md`
   (A1–A4 ✅ with PR links; A5 is next). **Rebuild the in-session task list from it** — the task
   tracker does NOT persist across sessions; that file is the source of truth for progress.
3. **Restate the goal back in your own words** before building. If you can't reconstruct it from
   this file + the spec alone, the handoff was lossy — say so, don't paper over it.
4. Run `sequential-build` and hold the no-phantom receipt rule for the whole build.

## Ground first (read, don't recall)
- `plans/07152026-findability-sensor/spec.html` — the design + the full scientist-loop architecture.
- `alloro-artifacts/research/rank-geo-grid-mechanism.md` — why single-point flickers; the grid math.
- `alloro-artifacts/research/rank-findability-voc-and-fuel-gauge.md` — VoC (Saif/Garrison) + the
  fuel-gauge/minivan owner persona + why the raw grid is distrusted.
- `alloro-artifacts/strategy/self-proving-loop.md` — the map moving IS the proof (no guarantee).

## Reuse first (do NOT rebuild these)
- `src/controllers/practice-ranking/feature-services/service.serpapi-maps.ts`
  (`getSearchPositionViaSerpApiMaps`, `clientVantage {lat,lng}`) — the single-point sensor. Extend
  single → grid; do not write a twin.
- `util.competitor-geo` / `radius` helpers for the grid points.
- A1's GSC demand signal for which queries to sample.

## Spec Rev FIRST (before code), folding three dimensions
1. Fleet-moat can't learn cross-customer yet at N≈3–4 — copy says "learns **your** practice," not the
   fleet, until N is large enough to generalize honestly.
2. A false attribution poisons the whole moat — the Watcher's honesty is load-bearing; the moat is the
   learning **rate**, not a static playbook.
3. The gauge must **reduce** daily rank-checking, not relocate it. Success = the owner checks less.

## Build order (reuse-first, one artifact at a time, verify each)
Pure core first (grid generator + SoLV/ARP/ATRP aggregator — fully unit-testable, no network) →
injectable runner → migration + model (`sandbox-safety`: additive + reversible; **this slice ships no
`schedules` row at all** — see the guardrail below) → tests → **fresh adversary** (`alloro-proof`, told
to break it) → fix → PR to `dev/dave`.

## Honesty caps (Value #6 — do not violate)
Real data only. SoLV is the owner-legible number. **No #1 / rank / visibility promise. No guarantee.**
Estimate-labeled where it's an estimate. No fabrication — an unseen pin is "not observed," never "not
ranking."

## Already decided / already killed (negative knowledge — do NOT re-derive or re-open)
- The raw NxN grid as an **owner-facing** UI is REJECTED (Corey distrusts it; it's confusing). The grid
  is the internal mechanism; SoLV + a fuel-gauge is what the owner sees.
- The single-point sensor already exists (above) — this is an EXTENSION, not a new sensor.
- Speed-to-lead / the auto-responder / booking write-back are OUT of Alloro's lane (matchmaker frame;
  the measured value is the raised hand / form submission), not part of A5.
- ChatGPT / Perplexity are out of API reach (that's A3's AEO constraint) — irrelevant to A5's rank grid.

## Guardrails (non-negotiable)
- **CD SOP:** branch off dev/dave, build + adversary-verify in sandbox, open a PR for Dave to review.
  **NEVER push to dev/dave or main directly.**
- **sandbox-safety** on the migration: additive + reversible.
- **Do NOT seed a `schedules` row in this slice.** The earlier "seed it disabled" instruction was
  removed in review: the row had no `next_run_at` and `agentRegistry` has no `findability_sensor`
  handler, so enabling it alone could never produce a due, dispatchable run — it was un-runnable
  scaffolding, not a safety measure. A schedule lands with the **executor slice**, and only when it is
  actually runnable (a real handler **and** a `next_run_at`). `src/__tests__/findability-sensor-model.test.ts`
  guards this (T6): it asserts the migration seeds no `schedules` row and that every registered agent
  key resolves to a callable handler. Keep that guard passing.
- Node 22 (`nvm use 22`); `npm test` + `npm run check:conventions` green before the PR.
- AI drafts, human stakes — especially any skill/enforcement-layer change (don't).

## When done: close the loop
Update `funnel-feature-sequence.md` (mark A5 with its PR), then run the closeout
(`alloro-harvest` → committed handoff file → confirm ready). Note in the harvest **whether this handoff
was clean or lossy**, so the handoff template itself compounds.
