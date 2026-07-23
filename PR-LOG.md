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

`origin/dev/dave` @ `b33f65ec` · 55 feature PRs (5 promotion PRs excluded) ·
showing the most recent 60 of **217** PRs · 2 of
**19** closed-without-landing PRs are inside this window — raise it with
`--limit N`.

## ⛔ Merged but UNREACHABLE — landed with no caller

Every app file these PRs touch is **new**. Nothing on `origin/dev/dave` imports them, so the code sits
in the repository and cannot execute. That is a statement about reachability and nothing else —
this table makes **no claim** about feature flags or switches. Whether something is additionally
gated behind an env var, a seed row, or a config value is declared by the author in the PR
template; it is not inferred here.

| PR | What it is | Where it lives | Plan | Reachable? |
|---|---|---|---|---|
| [#193](https://github.com/getAlloro/alloro/pull/193) | feat: category value-source — owner-approved GBP primary-ca… | `claude/category-value-source` | `plans/07202026-category-value-source` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>UNREACHABLE — adds no caller |
| [#167](https://github.com/getAlloro/alloro/pull/167) | A5 slice 1 — the findability sensor (honest geo-grid SoLV) | `claude/a5-findability-sensor` | `plans/07142026-alloro-funnel-engine`, `plans/07152026-findability-sensor` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>UNREACHABLE — adds no caller |
| [#165](https://github.com/getAlloro/alloro/pull/165) | feat(funnel-engine): A3 — AI-answer visibility (AEO) observ… | `claude/a3-aeo-visibility` | `plans/07152026-aeo-visibility-observation` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>UNREACHABLE — adds no caller |
| [#160](https://github.com/getAlloro/alloro/pull/160) | feat(taste-profile): the true-voice spine — compose + persi… | `claude/taste-profile-spine` | `plans/07152026-cro-lift-rewrite`, `plans/07162026-taste-profile-spine` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>UNREACHABLE — adds no caller |

## ⏳ Open — waiting on review or merge

| PR | What it is | Where it lives | Plan | Reachable? |
|---|---|---|---|---|
| [#217](https://github.com/getAlloro/alloro/pull/217) | fix(ci): let the PR-body gate re-run when the PR body is ed… | `claude/pr-checks-edited-trigger` | — | ⏳ open — not landed<br>no app code |
| [#216](https://github.com/getAlloro/alloro/pull/216) | docs(ledger): correct two capability rows that trunk had ou… | `claude/ledger-drift-0723` | — | ⏳ open — not landed<br>no app code |
| [#215](https://github.com/getAlloro/alloro/pull/215) | feat(clarity): extract rage clicks and scroll depth [HELD —… | `claude/clarity-cro-signals` | `plans/07222026-clarity-cro-signals` | ✏️ draft<br>wired — edits running code |
| [#214](https://github.com/getAlloro/alloro/pull/214) | feat(patient-journey): diagnostic gait replaces the smalles… | `claude/diagnostic-gait-brick1` | `plans/07222026-diagnostic-coordination-layer` | ⏳ open — not landed<br>wired — edits running code |
| [#213](https://github.com/getAlloro/alloro/pull/213) | feat(agents): wire validated master rubrics into agent prom… | `claude/lattice-agent-wiring` | `plans/07222026-lattice-agent-wiring` | ⏳ open — not landed<br>wired — mounts a door |
| [#212](https://github.com/getAlloro/alloro/pull/212) | Local Rankings shows honest numbers instead of invented ones | `claude/gauge-accuracy-rankings` | — | ⏳ open — not landed<br>wired — edits running code |
| [#211](https://github.com/getAlloro/alloro/pull/211) | Clients can see their real Google impressions instead of zero | `claude/zero-maps-window` | `plans/07202026-zero-maps-fix` | ⏳ open — not landed<br>wired — edits running code |
| [#210](https://github.com/getAlloro/alloro/pull/210) | fix(dashboard): never call a practice healthy on stale data | `claude/stale-data-guard` | — | ⏳ open — not landed<br>wired — edits running code |
| [#209](https://github.com/getAlloro/alloro/pull/209) | feat(funnel): honest attributed-lift measurement — pure, da… | `claude/proving-simulation-recovery` | `plans/07172026-proving-simulation` | ⏳ open — not landed<br>wired — edits running code |
| [#208](https://github.com/getAlloro/alloro/pull/208) | feat(gbp): completeness fill → owner's get-found surface (t… | `claude/seam-completeness-recovery` | — | ⏳ open — not landed<br>wired — edits running code |
| [#180](https://github.com/getAlloro/alloro/pull/180) | feat: add isolated test worktree adapter | `codex/isolated-test-worktree-adapter` | `plans/07172026-isolated-test-worktree-adapter` | ✏️ draft<br>wired — mounts a door |
| [#176](https://github.com/getAlloro/alloro/pull/176) | feat(responder): V1 — instant owner-approved auto-reply to … | `claude/responder-v1` | — | ✏️ draft<br>wired — mounts a door |

## ✅ Merged

Merged to `dev/dave` means **on dev, not on production**. Production requires a promotion PR
(`dev/dave` → `main`) to merge afterwards; where one has, it is named in the row.

| PR | What it is | Where it lives | Plan | Reachable? |
|---|---|---|---|---|
| [#206](https://github.com/getAlloro/alloro/pull/206) | feat(seo): educated-hypothesis CTR rewrite — brick 2 of the… | `claude/ctr-brick2-hypothesis` | `plans/07142026-alloro-funnel-engine` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#205](https://github.com/getAlloro/alloro/pull/205) | feat(seo): CTR-opportunity diagnosis — brick 1 of the CTR s… | `claude/ctr-opportunity-diagnosis` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#204](https://github.com/getAlloro/alloro/pull/204) | feat(forms): confirmation receipt to the submitter + rate-l… | `claude/form-confirmation-receipt` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#203](https://github.com/getAlloro/alloro/pull/203) | feat(dashboard): show 'what Alloro did for you' in the calm… | `claude/proof-receipt-owner-report` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — edits running code |
| [#202](https://github.com/getAlloro/alloro/pull/202) | feat(gbp): wire the category value-source — owner-approved … | `claude/gf2-category-proposal-caller` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#201](https://github.com/getAlloro/alloro/pull/201) | docs: capability ledger — one grounded source of what's bui… | `claude/capability-ledger` | `plans/07142026-alloro-funnel-engine` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#200](https://github.com/getAlloro/alloro/pull/200) | test(acceptance): batch acceptance suite + credential-free … | `claude/acceptance-results-0721` | `plans/07202026-pr-merge-remediation` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#199](https://github.com/getAlloro/alloro/pull/199) | docs: re-land #195 — legibility template, CI check, protoco… | `claude/pr-pipeline-protocol` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#198](https://github.com/getAlloro/alloro/pull/198) | docs: plain impressions roadmap + protocol v1.2 (PR metric … | `claude/docs-roadmap-metric-line` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#195](https://github.com/getAlloro/alloro/pull/195) | docs: PR legibility template, protocol v1.1, overwatch regi… | `claude/pr-legibility` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#194](https://github.com/getAlloro/alloro/pull/194) | docs: PR pipeline protocol v1 | `claude/pr-pipeline-protocol` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#193](https://github.com/getAlloro/alloro/pull/193) | feat: category value-source — owner-approved GBP primary-ca… | `claude/category-value-source` | `plans/07202026-category-value-source` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>UNREACHABLE — adds no caller |
| [#192](https://github.com/getAlloro/alloro/pull/192) | Diagnostic (logging-only) to confirm the zero-Maps cause — … | `claude/zero-maps-diagnostic` | `plans/07202026-zero-maps-fix` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — edits running code |
| [#191](https://github.com/getAlloro/alloro/pull/191) | fix(security): derive tenant scope from server context on P… | `codex/tenant-scope-hardening` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#189](https://github.com/getAlloro/alloro/pull/189) | ci: spec-status self-consistency check for plan specs | `claude/ci-spec-parity-gate` | `plans/07192026-handoff-enforcement-system` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#187](https://github.com/getAlloro/alloro/pull/187) | feat(gbp): name/address/phone consistency read endpoint | `claude/seam-nap-enable` | `plans/07152026-nap-consistency-monitor` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#186](https://github.com/getAlloro/alloro/pull/186) | feat(ranking): owner-vocabulary ranking card + honesty guards | `claude/ranking-owner-surface` | `plans/07182026-ranking-owner-surface` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — edits running code |
| [#185](https://github.com/getAlloro/alloro/pull/185) | feat(funnel): surface a published profile-fix on the owner … | `claude/seam-completeness-to-owner` | `plans/07152026-journey-insights-alloro-actions` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — edits running code |
| [#184](https://github.com/getAlloro/alloro/pull/184) | feat(gbp): completeness gap -> owner-approved profile-fix d… | `claude/seam-detect-to-writeback-invoke` | `plans/07182026-gbp-completeness-detect-to-fix` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#183](https://github.com/getAlloro/alloro/pull/183) | feat(patient-journey): Get Found impressions = whole-practi… | `claude/gate1-impressions` | `plans/07172026-gate1-impressions-search-maps` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — edits running code |
| [#182](https://github.com/getAlloro/alloro/pull/182) | fix(security): rate-limit POST /api/audit/start — the one p… | `claude/audit-start-rate-limit` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#181](https://github.com/getAlloro/alloro/pull/181) | docs(pr-log): a generated ledger — what every PR is, where … | `claude/pr-log-and-template` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#179](https://github.com/getAlloro/alloro/pull/179) | docs: the funnel is staked — give it a door an agent can find | `claude/funnel-map-doors` | `plans/07142026-alloro-funnel-engine` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#178](https://github.com/getAlloro/alloro/pull/178) | fix(honesty): the audit tells prospects we do 3 things we d… | `claude/audit-honest-capabilities` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — edits running code |
| [#177](https://github.com/getAlloro/alloro/pull/177) | feat(proof-receipt): Tier-1 backend — the owner-facing 'wha… | `claude/proof-receipt-v1` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#175](https://github.com/getAlloro/alloro/pull/175) | fix(honesty): rank card shows '#15 of 5' — two different un… | `claude/engine-honesty-harness` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — edits running code |
| [#174](https://github.com/getAlloro/alloro/pull/174) | ci: the repo's first pull_request checks + a pointer-resolv… | `claude/pr-ci` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#173](https://github.com/getAlloro/alloro/pull/173) | docs: add BUILD-QUESTIONS.md — the agent-to-agent async cha… | `claude/build-questions-channel` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#171](https://github.com/getAlloro/alloro/pull/171) | B2 — CRO-lift rewrite: RESEARCH RECORD ONLY (no feature; ex… | `claude/b2-cro-lift-rewrite` | `plans/07152026-cro-lift-rewrite` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>tests only — no runtime surface |
| [#170](https://github.com/getAlloro/alloro/pull/170) | docs(agents): note repo is public — sanitize outward conten… | `docs/agents-public-repo-note` | — | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>no app code |
| [#169](https://github.com/getAlloro/alloro/pull/169) | B1 — Provision preview-site analytics (gated, ships disabled) | `claude/b1-instrument-site` | `plans/07142026-alloro-funnel-engine`, `plans/07152026-instrument-site` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#168](https://github.com/getAlloro/alloro/pull/168) | feat(funnel-engine): A6 — GBP write-back (owner-approved bu… | `claude/a6-gbp-writeback` | `plans/07152026-gbp-writeback` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#167](https://github.com/getAlloro/alloro/pull/167) | A5 slice 1 — the findability sensor (honest geo-grid SoLV) | `claude/a5-findability-sensor` | `plans/07142026-alloro-funnel-engine`, `plans/07152026-findability-sensor` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>UNREACHABLE — adds no caller |
| [#166](https://github.com/getAlloro/alloro/pull/166) | feat(funnel-engine): A4 — Citations & NAP consistency monit… | `claude/a4-nap-consistency-monitor` | `plans/07152026-nap-consistency-monitor` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#165](https://github.com/getAlloro/alloro/pull/165) | feat(funnel-engine): A3 — AI-answer visibility (AEO) observ… | `claude/a3-aeo-visibility` | `plans/07152026-aeo-visibility-observation` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>UNREACHABLE — adds no caller |
| [#164](https://github.com/getAlloro/alloro/pull/164) | feat(funnel-engine): A2 — GBP own-completeness scoring (get… | `claude/a2-gbp-completeness` | `plans/07152026-gbp-own-completeness-scoring` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — edits running code |
| [#163](https://github.com/getAlloro/alloro/pull/163) | Retire legacy Action Items Hub and task generators | `codex/remove-action-items-hub` | `plans/07152026-remove-action-items-hub` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — mounts a door |
| [#161](https://github.com/getAlloro/alloro/pull/161) | fix: keep rankings refresh modal above map | `codex/hotfix-local-rankings-map-refresh` | `plans/07152026-local-rankings-refresh-map-hotfix` | ✅ merged → **main** (production) 2026-07-15<br>wired — edits running code |
| [#160](https://github.com/getAlloro/alloro/pull/160) | feat(taste-profile): the true-voice spine — compose + persi… | `claude/taste-profile-spine` | `plans/07152026-cro-lift-rewrite`, `plans/07162026-taste-profile-spine` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>UNREACHABLE — adds no caller |
| [#159](https://github.com/getAlloro/alloro/pull/159) | feat(funnel-engine): Slice 1b — get-found write path (schem… | `claude/slice-1b-get-found-write` | `plans/07142026-alloro-funnel-engine`, `plans/07162026-funnel-engine-slice-1b-get-found-write` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — edits running code |
| [#158](https://github.com/getAlloro/alloro/pull/158) | feat(funnel-engine): Slice 1a — get-found read-only analysi… | `claude/slice-1a-get-found` | `plans/07142026-alloro-funnel-engine`, `plans/07152026-gbp-own-completeness-scoring`, `plans/07162026-funnel-engine-slice-1b-get-found-write` | ✅ merged → `dev/dave`, carried to production by [#207](https://github.com/getAlloro/alloro/pull/207)<br>wired — edits running code |

## ❌ Closed without landing

Work that exists on a branch and never shipped. Before building anything new, check here — the
thing may already be written. **This section shows 2 of 19**
closed-without-landing PRs; the rest are outside the 60-PR window. Run
`./scripts/pr-log.sh --limit 217` for the complete list.

| PR | What it is | Where it lives | Plan | Reachable? |
|---|---|---|---|---|
| [#196](https://github.com/getAlloro/alloro/pull/196) | test: deliberate type error — CI gate proof (close immediat… | `test/ci-gate-proof` | — | ❌ closed, never landed |
| [#190](https://github.com/getAlloro/alloro/pull/190) | TEST FIXTURE — parity gate residual proof (do not merge) | `test/parity-fixture-head` | `plans/00000000-parity-gate-fixture` | ❌ closed, never landed |
