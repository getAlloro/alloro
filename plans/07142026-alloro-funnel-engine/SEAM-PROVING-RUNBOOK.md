# Seam-Proving Runbook — get-found funnel

A **procedure**, not a state snapshot. Live PR/merge state comes from the generated
`PR-LOG.md` (regenerate with `scripts/pr-log.sh`) and the staked seam map
`plans/07142026-alloro-funnel-engine/build-checklist.md`. This file only tells you the
**order to prove the seams in** and the **real data each one needs** in a stocked sandbox.

## Before you start

1. Read live state from `PR-LOG.md` — do not trust this file for merge/draft status.
2. Clone dev/dave data into the sandbox so the seams have real rows to exercise
   (GBP, GSC/Google data-store, patient-journey, ranking, and NAP-consistency rows).
   The seams are **build-and-hold**: their Layer-1 tests pass, but every acceptance
   item below is `pending` because there is no real data locally yet.
3. Each seam ships a Layer-2 acceptance artifact (`test.html` viewer +
   `test-results.json` source-of-truth) in its plan folder. Drive the JSON with a
   computer-use agent, or open `test.html` to tick items by hand.

## Run order

Prove the seams in this sequence — each later seam composes on the earlier detect/write
path, so a failure upstream invalidates the ones after it.

`#183 -> #184 -> #185 -> #186 -> #187`

| # | Branch | Plan folder + acceptance artifact | Real-data precondition (stocked sandbox) |
|---|--------|-----------------------------------|-------------------------------------------|
| **#183** | `claude/gate1-impressions` | `plans/07172026-gate1-impressions-search-maps/` — `test-results.json` (+`test.html`) | A location with whole-practice Google **Search + Maps** impression rows for the target month: `google_data_store` `run_type='daily'` rows in-window (GSC impressions + GBP Search/Maps views). |
| **#184** | `claude/seam-detect-to-writeback-invoke` | `plans/07182026-gbp-completeness-detect-to-fix/` — `test-results.json` (+`test.html`) | An authed operator on a location whose **GBP is missing a fillable field** (e.g. website) AND for which Alloro holds an independent value source (e.g. the domain), with the write-back master switch **on** for that account. A no-gap location covers the negative path. |
| **#185** | `claude/seam-completeness-to-owner` | `plans/07152026-journey-insights-alloro-actions/` — `test-results.json` items **T7–T9** (+`test.html`) | The location has patient-journey **impressions** rows for the month AND one Alloro-**published** completeness fill recorded on the MetricAction rail (`gbp_completeness_fill`). A manual owner-edit-only location covers the "never claim Alloro credit" path. (T1–T6 in this file are the base SEO-meta rail, not this seam.) |
| **#186** | `claude/ranking-owner-surface` | `plans/07182026-ranking-owner-surface/` — `test-results.json` (+`test.html`) | Ranking output present for the location, plus an org whose type resolves to a **non-healthcare vocabulary** (to prove owner-vocabulary) and an org with output that could trigger a generic recommendation (to prove the honesty guard). |
| **#187** | `claude/seam-nap-enable` | `plans/07152026-nap-consistency-monitor/` — `test-results.json` items **T30–T33** (+`test.html`) | The caller's scoped location has `nap_consistency_observation` rows (from a monitor run), plus a never-measured location and a second org for the tenant-isolation check. Endpoint: `GET /api/nap-consistency`. (T1–T29 in this file are the monitor seam, not the reader.) |

## Recording results

- A seam is proven when its `test-results.json` rolls up to **Passed** — every item
  `pass`, or each `fail` carries a written `waiver` (Constitution §20.5).
- Write evidence back into the JSON (`status`/`evidence`/`notes`); the `test.html`
  viewer only reflects it.
- #185 and #187 share their plan folder with an earlier seam, so their acceptance
  items were **appended** (T7–T9 and T30–T33) — do not overwrite the prior seam's
  recorded results.

## Notes / open gaps

- **#187 reader is unspecced.** PR #187 added the `GET /api/nap-consistency` endpoint
  but modified no `spec.html`; T30–T33 are grounded in the reader's code/test contract
  (`nap-consistency-reader.test.ts` + `routes/napConsistency.ts`), not a spec Done
  section. If the reader gets a spec later, reconcile the items to it.
