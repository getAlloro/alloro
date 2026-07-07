# Patient-Journey Engine — Honesty Harness

A semantic test net for the patient-journey engine's reader layer. It catches
the defect class that `tsc` and a green compile **cannot** see: **one `null`
with several possible meanings**, resolved into the wrong customer-facing claim.
That class bit Slice 1 three times (a fabricated `#15 of 5`, a null-position
being read as "not in top 20", and `notInTop20` firing on a bare null instead
of a confirmed status). This harness pins the fixes so a future change that
re-introduces any of them fails loudly.

## What's here

| File | What it is |
| --- | --- |
| `fixtures.ts` | Synthetic edge-case fixtures for RANK, LEADS, REVIEWS. Each pins the exact DB-row/summary a reader receives, the honest reader output it must produce, and the honest copy the frontend then renders. Every state is cited to the source line it's grounded in. |
| `contextCopy.ts` | A node-runnable **mirror** of the frontend render strings (the harness runs in the backend vitest env — no React/jsdom). Faithfully transcribes `PatientJourneyContextCards.tsx` and `patientJourney.utils.ts`. **Maintenance coupling: if that frontend copy changes, update this mirror in the same commit.** |
| `honesty-invariants.test.ts` | The harness. Mocks the three models the readers touch (no Postgres, no network), runs the **real** `readRank` / `readLeads` / `readReviews` against every fixture, and asserts the honesty invariants. |

## How to run it

From the repo root:

```bash
# just this harness
npx vitest run src/__tests__/engine-harness

# or the whole backend suite (this harness is picked up by the include glob)
npm test
```

> Note (why it's shipped as ready-to-run, not run-here): the authoring env's
> local `vitest` binary is broken (a `rolldown` `MODULE_NOT_FOUND`), so the
> harness was **type-checked** (`npx tsc --noEmit`, clean) but **not executed**
> here. It is written to the repo's existing test convention and should run
> as-is in a working env.

## The honesty invariants it guards

- **(a) No fabricated number ever surfaces.** No fake `#1` (the Practice-Health
  default rank when the practice isn't matched), no `#N of M` pairing a SerpApi
  Maps position with the curated competitor set (two different universes), and
  no naive simple-mean review rating in place of the count-weighted mean.
- **(b) Every empty state renders the correct honest copy.** Each fixture's
  rendered string is asserted against an expected literal.
- **(c) A null never becomes a definite negative claim.** A lookup failure
  (`api_error` / `bias_unavailable`), a half-written `ok` row with a null
  position, or a never-run location degrade to **"Rank not available yet"** —
  never **"Not in the local top 20 yet"**.
- **(d) `notInTop20` is true ONLY for `search_status === "not_in_top_20"`.**
  Asserted directly against the reader output for every rank fixture.

## Ground truth (where each state comes from)

Every fixture state is grounded in code, not invented behaviour:

- Rank status union — `src/models/PracticeRankingModel.ts:5-9`
- `readRank` / `readLeads` / `readReviews` — `src/controllers/patient-journey/feature-services/stageReaders.ts:390-425` / `:311-347` / `:436-454`
- Leads `not_connected` (service level, reader bypassed) — `src/controllers/patient-journey/feature-services/PatientJourneyService.ts:148-152`
- Model returns — `FormSubmissionModel.ts:376-410`, `ReviewModel.ts:420-460`
- Card + stage copy — `frontend/.../PatientJourneyContextCards.tsx:54-83`, `frontend/.../patientJourney.utils.ts:31-45`

## How to extend it

Add a new object to the relevant array in `fixtures.ts` with its expected
reader output and expected copy — the harness iterates the arrays, so a new
fixture is automatically exercised by every invariant. Keep every new state
grounded: cite the reader line or model line it exercises, and never invent a
`search_status` value outside the `SearchPositionStatus` union.

## The one data ask

The fixtures encode the real **shapes** and the honest outputs, but the
**distributions** are invented. To make them match production reality (and to
surface any edge state we haven't modelled), one anonymized data-shape snapshot
would help: for a handful of live locations, the reader-input rows only — no PII
—

- `practice_rankings`: `search_position`, `search_status`, `rank_position`,
  `total_competitors` for the latest completed row per location;
- form-submission monthly stats: `month`, `verified`, `total` per project;
- review summary: `rating`, `count`, `newThisMonth`, `replyRatePct` per location.

That lets us confirm the fixtures span the states that actually occur (e.g. how
often `search_status` is `bias_unavailable` vs `api_error`) and add any missing
one before it becomes the fourth Slice-1-style surprise.
