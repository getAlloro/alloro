# Get-found chain — review & merge brief (A2–A5 · PRs #164–167)

**Audience:** the reviewer/merger (Corey's pre-pass + Dave's merge). **Purpose:** the one thing the
individual PRs can't say — **how they interact.** Each PR carries its own receipts (tests, adversary
findings, sandbox proof); this is the cross-PR map only.

**Provenance:** the interaction claims below are **verified from the actual PR diffs** on 2026-07-15
(`gh pr diff <n> --name-only`) **and survived an independent refutation pass** (a fresh adversary that
re-derived the file lists and returned SURVIVED). The base-branch caveat below is a correction that
pass surfaced.

## The four PRs

| PR | Feature | Adds | Size |
|----|---------|------|------|
| #164 A2 | GBP own-completeness scoring | (read-only, no DB) | 4 files |
| #165 A3 | AEO / AI-answer visibility (Gemini) | `ai_visibility_observation` table | 12 files |
| #166 A4 | Citations/NAP consistency **monitor** | `nap_consistency_observation` table + registers the agent; **schedule seeded DISABLED** | 7 files |
| #167 A5 | Findability geo-grid sensor (SoLV) | `findability_sensor_readings` + `findability_sensor_keyword_configs` tables; **schedule seeded DISABLED** | 13 files |

## Interactions (verified from diffs)

- **File-disjoint (independently verified).** All 36 changed files across the four appear in exactly
  one PR → no textual conflict between them.
- **Only A4 (#166) touches `src/services/agentRegistry.ts`** — no cross-PR collision there.
- **Migrations: 3 files adding 4 distinct tables** — #165 `ai_visibility_observation`, #166
  `nap_consistency_observation`, #167 `findability_sensor_readings` + `findability_sensor_keyword_configs`,
  #164 none. Additive + reversible; knex runs them by timestamp, so order doesn't matter.
- **⚠️ Base-branch caveat — they do NOT all sit on dev/dave.** #165/#166/#167 target `dev/dave`
  (independent, merge in any order). **#164 (A2) targets `claude/slice-1a-get-found`** — it's stacked on
  the #158 chain, so #158 must merge to dev/dave first (or #164 be rebased onto dev/dave) before #164 can
  land. #164 is still file-disjoint from the other three; it just carries a base dependency.
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
*fully* file-disjoint and could have run as a 4-wide concurrent **build** fleet (the base-branch stacking
of #164 affects merge *order*, not build-time file-disjointness). This is exactly the
"verify per feature before staking a fan-out" the proposal calls for. Feed this correction in rather
than re-deriving it.
