# PR Log

**Generated — do not edit.** Run `./scripts/pr-log.sh`. Every column is read from the thing it
describes: GitHub for the PR, git for the branch and the base tree, the PR's own file list for
the plan folder and for reachability.

> **Why generated:** a hand-typed inventory rots the day after it is typed, and nobody notices,
> because nothing regenerates it. This one is rebuilt from the source every time it runs.

> **Regenerated on `dev/dave` only** — by schedule or by hand
> (`.github/workflows/pr-log-refresh.yml`). Never on a pull request: this document is a function
> of the set of *all* open PRs, so a staleness gate on `pull_request` has no fixed point — going
> green on one PR would stale every other one.

`origin/dev/dave` @ `c2b18a37e` · 47 feature PRs (13 promotion PRs excluded) ·
showing the most recent 60 of **193** PRs · 2 of
**18** closed-without-landing PRs are inside this window — raise it with
`--limit N`.

## ⛔ Merged but UNREACHABLE — landed with no caller

Every app file these PRs touch is **new**. Nothing on `origin/dev/dave` imports them, so the code sits
in the repository and cannot execute. That is a statement about reachability and nothing else —
this table makes **no claim** about feature flags or switches. Whether something is additionally
gated behind an env var, a seed row, or a config value is declared by the author in the PR
template; it is not inferred here.

| PR | What it is | Where it lives | Plan | Reachable? |
|---|---|---|---|---|
| [#167](https://github.com/getAlloro/alloro/pull/167) | A5 slice 1 — the findability sensor (honest geo-grid SoLV) | `claude/a5-findability-sensor` | `plans/07142026-alloro-funnel-engine`, `plans/07152026-findability-sensor` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>UNREACHABLE — adds no caller |
| [#165](https://github.com/getAlloro/alloro/pull/165) | feat(funnel-engine): A3 — AI-answer visibility (AEO) observ… | `claude/a3-aeo-visibility` | `plans/07152026-aeo-visibility-observation` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>UNREACHABLE — adds no caller |
| [#160](https://github.com/getAlloro/alloro/pull/160) | feat(taste-profile): the true-voice spine — compose + persi… | `claude/taste-profile-spine` | `plans/07152026-cro-lift-rewrite`, `plans/07162026-taste-profile-spine` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>UNREACHABLE — adds no caller |

## ⏳ Open — waiting on review or merge

| PR | What it is | Where it lives | Plan | Reachable? |
|---|---|---|---|---|
| [#193](https://github.com/getAlloro/alloro/pull/193) | feat: category value-source — owner-approved GBP primary-ca… | `claude/category-value-source` | `plans/07202026-category-value-source` | ⏳ open — not landed<br>UNREACHABLE — adds no caller |
| [#192](https://github.com/getAlloro/alloro/pull/192) | Diagnostic (logging-only) to confirm the zero-Maps cause — … | `claude/zero-maps-diagnostic` | `plans/07202026-zero-maps-fix` | ⏳ open — not landed<br>wired — edits running code |
| [#189](https://github.com/getAlloro/alloro/pull/189) | ci: deterministic spec-status↔PR-state parity gate | `claude/ci-spec-parity-gate` | `plans/07192026-handoff-enforcement-system` | ⏳ open — not landed<br>no app code |
| [#187](https://github.com/getAlloro/alloro/pull/187) | feat(gbp): name/address/phone consistency read endpoint | `claude/seam-nap-enable` | `plans/07152026-nap-consistency-monitor` | ✏️ draft<br>wired — mounts a door |
| [#186](https://github.com/getAlloro/alloro/pull/186) | feat(ranking): owner-vocabulary ranking card + honesty guards | `claude/ranking-owner-surface` | `plans/07182026-ranking-owner-surface` | ✏️ draft<br>wired — edits running code |
| [#185](https://github.com/getAlloro/alloro/pull/185) | feat(funnel): surface a published profile-fix on the owner … | `claude/seam-completeness-to-owner` | `plans/07152026-journey-insights-alloro-actions` | ✏️ draft<br>wired — edits running code |
| [#184](https://github.com/getAlloro/alloro/pull/184) | feat(gbp): completeness gap -> owner-approved profile-fix d… | `claude/seam-detect-to-writeback-invoke` | `plans/07182026-gbp-completeness-detect-to-fix` | ✏️ draft<br>wired — mounts a door |
| [#183](https://github.com/getAlloro/alloro/pull/183) | feat(patient-journey): Get Found impressions = whole-practi… | `claude/gate1-impressions` | `plans/07172026-gate1-impressions-search-maps` | ⏳ open — not landed<br>wired — edits running code |
| [#182](https://github.com/getAlloro/alloro/pull/182) | fix(security): rate-limit POST /api/audit/start — the one p… | `claude/audit-start-rate-limit` | — | ⏳ open — not landed<br>wired — mounts a door |
| [#181](https://github.com/getAlloro/alloro/pull/181) | docs(pr-log): a generated ledger — what every PR is, where … | `claude/pr-log-and-template` | — | ⏳ open — not landed<br>no app code |
| [#180](https://github.com/getAlloro/alloro/pull/180) | feat: add isolated test worktree adapter | `codex/isolated-test-worktree-adapter` | `plans/07172026-isolated-test-worktree-adapter` | ✏️ draft<br>wired — mounts a door |
| [#179](https://github.com/getAlloro/alloro/pull/179) | docs: the funnel is staked — give it a door an agent can find | `claude/funnel-map-doors` | `plans/07142026-alloro-funnel-engine` | ⏳ open — not landed<br>no app code |
| [#178](https://github.com/getAlloro/alloro/pull/178) | fix(honesty): the audit tells prospects we do 3 things we d… | `claude/audit-honest-capabilities` | — | ⏳ open — not landed<br>wired — edits running code |
| [#177](https://github.com/getAlloro/alloro/pull/177) | feat(proof-receipt): Tier-1 backend — the owner-facing 'wha… | `claude/proof-receipt-v1` | — | ⏳ open — not landed<br>wired — mounts a door |
| [#176](https://github.com/getAlloro/alloro/pull/176) | feat(responder): V1 — instant owner-approved auto-reply to … | `claude/responder-v1` | — | ✏️ draft<br>wired — mounts a door |
| [#175](https://github.com/getAlloro/alloro/pull/175) | fix(honesty): rank card shows '#15 of 5' — two different un… | `claude/engine-honesty-harness` | — | ⏳ open — not landed<br>wired — edits running code |
| [#174](https://github.com/getAlloro/alloro/pull/174) | ci: the repo's first pull_request checks + a pointer-resolv… | `claude/pr-ci` | — | ✏️ draft<br>no app code |
| [#173](https://github.com/getAlloro/alloro/pull/173) | docs: add BUILD-QUESTIONS.md — the agent-to-agent async cha… | `claude/build-questions-channel` | — | ⏳ open — not landed<br>no app code |

## ✅ Merged

Merged to `dev/dave` means **on dev, not on production**. Production requires a promotion PR
(`dev/dave` → `main`) to merge afterwards; where one has, it is named in the row.

| PR | What it is | Where it lives | Plan | Reachable? |
|---|---|---|---|---|
| [#191](https://github.com/getAlloro/alloro/pull/191) | fix(security): derive tenant scope from server context on P… | `codex/tenant-scope-hardening` | — | 🟡 merged → `dev/dave` — **on dev only, not on production**<br>wired — mounts a door |
| [#171](https://github.com/getAlloro/alloro/pull/171) | B2 — CRO-lift rewrite: RESEARCH RECORD ONLY (no feature; ex… | `claude/b2-cro-lift-rewrite` | `plans/07152026-cro-lift-rewrite` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>tests only — no runtime surface |
| [#170](https://github.com/getAlloro/alloro/pull/170) | docs(agents): note repo is public — sanitize outward conten… | `docs/agents-public-repo-note` | — | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>no app code |
| [#169](https://github.com/getAlloro/alloro/pull/169) | B1 — Provision preview-site analytics (gated, ships disabled) | `claude/b1-instrument-site` | `plans/07142026-alloro-funnel-engine`, `plans/07152026-instrument-site` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — mounts a door |
| [#168](https://github.com/getAlloro/alloro/pull/168) | feat(funnel-engine): A6 — GBP write-back (owner-approved bu… | `claude/a6-gbp-writeback` | `plans/07152026-gbp-writeback` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — mounts a door |
| [#167](https://github.com/getAlloro/alloro/pull/167) | A5 slice 1 — the findability sensor (honest geo-grid SoLV) | `claude/a5-findability-sensor` | `plans/07142026-alloro-funnel-engine`, `plans/07152026-findability-sensor` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>UNREACHABLE — adds no caller |
| [#166](https://github.com/getAlloro/alloro/pull/166) | feat(funnel-engine): A4 — Citations & NAP consistency monit… | `claude/a4-nap-consistency-monitor` | `plans/07152026-nap-consistency-monitor` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — mounts a door |
| [#165](https://github.com/getAlloro/alloro/pull/165) | feat(funnel-engine): A3 — AI-answer visibility (AEO) observ… | `claude/a3-aeo-visibility` | `plans/07152026-aeo-visibility-observation` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>UNREACHABLE — adds no caller |
| [#164](https://github.com/getAlloro/alloro/pull/164) | feat(funnel-engine): A2 — GBP own-completeness scoring (get… | `claude/a2-gbp-completeness` | `plans/07152026-gbp-own-completeness-scoring` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#163](https://github.com/getAlloro/alloro/pull/163) | Retire legacy Action Items Hub and task generators | `codex/remove-action-items-hub` | `plans/07152026-remove-action-items-hub` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — mounts a door |
| [#161](https://github.com/getAlloro/alloro/pull/161) | fix: keep rankings refresh modal above map | `codex/hotfix-local-rankings-map-refresh` | `plans/07152026-local-rankings-refresh-map-hotfix` | ✅ merged → **main** (production) 2026-07-15<br>wired — edits running code |
| [#160](https://github.com/getAlloro/alloro/pull/160) | feat(taste-profile): the true-voice spine — compose + persi… | `claude/taste-profile-spine` | `plans/07152026-cro-lift-rewrite`, `plans/07162026-taste-profile-spine` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>UNREACHABLE — adds no caller |
| [#159](https://github.com/getAlloro/alloro/pull/159) | feat(funnel-engine): Slice 1b — get-found write path (schem… | `claude/slice-1b-get-found-write` | `plans/07142026-alloro-funnel-engine`, `plans/07162026-funnel-engine-slice-1b-get-found-write` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#158](https://github.com/getAlloro/alloro/pull/158) | feat(funnel-engine): Slice 1a — get-found read-only analysi… | `claude/slice-1a-get-found` | `plans/07142026-alloro-funnel-engine`, `plans/07152026-gbp-own-completeness-scoring`, `plans/07162026-funnel-engine-slice-1b-get-found-write` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#157](https://github.com/getAlloro/alloro/pull/157) | fix(data-truth): show verified form-submission counts, not … | `claude/honest-submission-counts` | — | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#156](https://github.com/getAlloro/alloro/pull/156) | feat(attribution): capture form-submission source — Slice 4… | `claude/slice-4-connection-measurement` | `plans/07152026-m0-submission-source-capture` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — mounts a door |
| [#155](https://github.com/getAlloro/alloro/pull/155) | fix(honesty): stop implying GBP posts improve findability/rank | `claude/honesty-posts-not-rank` | `plans/07172026-ranking-copy-honesty-guardrail` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#154](https://github.com/getAlloro/alloro/pull/154) | fix: isolate Patient Journey reply enrichment failures | `codex/patient-journey-timeout-hotfix` | — | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#153](https://github.com/getAlloro/alloro/pull/153) | Inversion Ch3-7 + honesty-layer fixes (verify + merge) | `claude/inversion-foundation` | `plans/07142026-pr-153-merge-conflict-fixes` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#152](https://github.com/getAlloro/alloro/pull/152) | feat(receipts): read-only receipts-report service — honest … | `claude/receipts-report` | `plans/07142026-receipts-report-integrity-fixes` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — mounts a door |
| [#151](https://github.com/getAlloro/alloro/pull/151) | feat: GSC -> content loop (feed real Search Console demand … | `claude/gsc-content-loop` | `plans/07142026-gsc-content-loop-hardening` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#150](https://github.com/getAlloro/alloro/pull/150) | feat(inversion): Ch4 Choosable READ (competitor comparison … | `claude/inversion-04-choosable` | `plans/07142026-choosable-summary-hardening` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — mounts a door |
| [#149](https://github.com/getAlloro/alloro/pull/149) | feat(inversion): Ch3 Findable card to Chancellor quality (+… | `claude/inversion-03-findable` | `plans/07132026-pr149-findable-hardening` | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#148](https://github.com/getAlloro/alloro/pull/148) | feat(inversion): Foundation, Ch2 unified card-type + Ch7 FIX 1 | `claude/inversion-foundation` | — | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#145](https://github.com/getAlloro/alloro/pull/145) | Slice 1 — honest dashboard numbers (4 fixes; FIX 1 relates … | `claude/slice-1-data-truth` | — | ✅ merged → `dev/dave`, carried to production by [#188](https://github.com/getAlloro/alloro/pull/188)<br>wired — edits running code |
| [#143](https://github.com/getAlloro/alloro/pull/143) | fix: support help desk — pill above title (no wrap) + mask … | `fix/support-help-desk-pill-author` | `plans/07052026-support-help-desk-pill-and-author-mask` | ✅ merged → **main** (production) 2026-07-05<br>wired — edits running code |
| [#137](https://github.com/getAlloro/alloro/pull/137) | fix(audit): correct letter grades + resilient GBP stage + f… | `fix/audit-grades-pipeline-event` | `plans/06292026-audit-grade-scale-deterministic`, `plans/06292026-audit-pipeline-reliability-scan-honesty`, `plans/06292026-leadgen-event-400-and-audit-id-hang` | ✅ merged → **main** (production) 2026-06-29<br>wired — mounts a door |

## ❌ Closed without landing

Work that exists on a branch and never shipped. Before building anything new, check here — the
thing may already be written. **This section shows 2 of 18**
closed-without-landing PRs; the rest are outside the 60-PR window. Run
`./scripts/pr-log.sh --limit 193` for the complete list.

| PR | What it is | Where it lives | Plan | Reachable? |
|---|---|---|---|---|
| [#190](https://github.com/getAlloro/alloro/pull/190) | TEST FIXTURE — parity gate residual proof (do not merge) | `test/parity-fixture-head` | `plans/00000000-parity-gate-fixture` | ❌ closed, never landed |
| [#146](https://github.com/getAlloro/alloro/pull/146) | Inversion engine, build handoff for Dave (docs + mission + … | `claude/inversion-engine-handoff-docs` | `plans/inversion-engine-handoff` | ❌ closed, never landed |
