# Get-found chain — review & merge brief (A2–A5 · PRs #164–167)

**Audience:** the reviewer/merger (Corey's pre-pass + Dave's merge). **Purpose:** the one thing the
individual PRs can't say — **how they interact.** Each PR carries its own receipts (tests, adversary
findings, sandbox proof); this is the cross-PR map only.

**Provenance:** the interaction claims below are **verified from the actual PR diffs** on 2026-07-15
(`gh pr diff <n> --name-only`), not inferred from memory.

## The four PRs

| PR | Feature | Adds | Size |
|----|---------|------|------|
| #164 A2 | GBP own-completeness scoring | (read-only, no DB) | 4 files |
| #165 A3 | AEO / AI-answer visibility (Gemini) | `ai_visibility_observation` table | 12 files |
| #166 A4 | Citations/NAP consistency **monitor** | `nap_consistency_observation` table + registers the agent; **schedule seeded DISABLED** | 7 files |
| #167 A5 | Findability geo-grid sensor (SoLV) | `findability_sensor_tables`; **schedule seeded DISABLED** | 13 files |

## Interactions (verified from diffs)

- **File-disjoint.** No file is touched by more than one of the four → they **do not conflict with
  each other; merge in any order.**
- **Only A4 (#166) touches `src/services/agentRegistry.ts`** — no cross-PR collision there.
- **Migrations are three independent `CREATE TABLE`s** (different tables: `ai_visibility_observation`,
  `nap_consistency_observation`, `findability_sensor_tables`). Additive + reversible; knex runs them by
  timestamp, so merge order doesn't matter.
- **Two schedules seeded DISABLED (A4, A5):** zero cost, zero side-effects until someone enables them.
  Nothing runs on merge except the additive migrations.
- **Suggested review order is ease, not necessity:** A2 first (smallest, read-only) blesses the
  funnel-engine pattern the other three reuse — then A3 → A4 → A5 review faster. Nothing forces it.

## After merge — post-merge smoke tests (run by a claude on dev, now that dev↔prod DB is sync-ready)

Run before any schedule is enabled:
- **A3:** migration applied + one live Gemini observation lands honestly.
- **A4:** the disabled-seed row inserts on dev — the sandbox lacked the `schedules` table, so this is
  the **one path never exercised locally** (the builder's #1 flagged check).
- **A5:** one real SerpApi scan lands an honest SoLV snapshot + its disabled-seed insert.

## Assumptions the builders flagged for review

- A5's `-1` COALESCE unique-index sentinel assumes location ids are always positive (true for this schema).
- Every honesty invariant is proven against a **fake** provider + unit tests; the live end-to-end is the
  post-merge smoke test, not yet done.

## Cross-session note (feeds the parallelism work)

The file-disjoint result above is **verified evidence** for the shared-surface flag proposal
(`memory/project_parallelism_shared_surface_flag.md`, handoff-system session) — and it **corrects that
proposal's first cut.** That draft lists A5 as a likely `agentRegistry` cluster member ("serialize
these"), but the diffs show **A5 does not touch `agentRegistry` — only A4 does** — so #164–167 are
*fully* file-disjoint and could have run as a 4-wide concurrent fleet. This is exactly the
"verify per feature before staking a fan-out" the proposal calls for. Feed this correction in rather
than re-deriving it.
