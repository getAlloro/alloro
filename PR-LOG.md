# PR Log

**Generated — do not edit.** Run `./scripts/pr-log.sh`. Every column is read from the thing it
describes: GitHub for the PR, git for the branch, the PR's own file list for the plan folder,
the migration source for the enable state.

> **Why generated:** `ASSET-MAP.md` (2026-06-12) was a hand-written *"verified inventory of
> what's already built, to stop rebuilding."* Five weeks later three finished features sat with
> no PR and an eighth duplicate spec got written. **A typed ledger rots the day after it's typed.**
> This one can't — it's regenerated from the source.

`origin/dev/dave` @ `4cdb0eaf` · 49 feature PRs (promotion PRs excluded) · showing the most recent 60

## ⛔ Merged but DARK — landed, and doing nothing

These shipped with a flag defaulted **off**. They are in the codebase and invisible to every
customer until someone enables them. *"Building it is maybe 40% of the job. Getting adoption is
the other 60%."* — **this section is the 60%, and nothing else tracks it.**

| PR | What it is | Where it lives | Plan | Does it DO anything? |
|---|---|---|---|---|
| [#168](https://github.com/getAlloro/alloro/pull/168) | feat(funnel-engine): A6 — GBP write-back (owner-approved bu… | `claude/a6-gbp-writeback` | `plans/07152026-gbp-writeback` | ⛔ **merged, ships DISABLED** |
| [#167](https://github.com/getAlloro/alloro/pull/167) | A5 slice 1 — the findability sensor (honest geo-grid SoLV) | `claude/a5-findability-sensor` | `plans/07142026-alloro-funnel-engine` | ⛔ **merged, ships DISABLED** |
| [#165](https://github.com/getAlloro/alloro/pull/165) | feat(funnel-engine): A3 — AI-answer visibility (AEO) observ… | `claude/a3-aeo-visibility` | `plans/07152026-aeo-visibility-observation` | ⛔ **merged, ships DISABLED** |

## ⏳ Open — waiting on review or merge

| PR | What it is | Where it lives | Plan | Does it DO anything? |
|---|---|---|---|---|
| [#182](https://github.com/getAlloro/alloro/pull/182) | fix(security): rate-limit POST /api/audit/start — the one p… | `claude/audit-start-rate-limit` | — | ⏳ open — not landed |
| [#181](https://github.com/getAlloro/alloro/pull/181) | docs(pr-log): a generated ledger — what every PR is, where … | `claude/pr-log-and-template` | — | ⏳ open — not landed |
| [#180](https://github.com/getAlloro/alloro/pull/180) | feat: add isolated test worktree adapter | `codex/isolated-test-worktree-adapter` | `plans/07172026-isolated-test-worktree-adapter` | ✏️ draft |
| [#179](https://github.com/getAlloro/alloro/pull/179) | docs: the funnel is staked — give it a door an agent can find | `claude/funnel-map-doors` | `plans/07142026-alloro-funnel-engine` | ⏳ open — not landed |
| [#178](https://github.com/getAlloro/alloro/pull/178) | fix(honesty): the audit tells prospects we do 3 things we d… | `claude/audit-honest-capabilities` | — | ⏳ open — not landed |
| [#177](https://github.com/getAlloro/alloro/pull/177) | feat(proof-receipt): Tier-1 backend — the owner-facing 'wha… | `claude/proof-receipt-v1` | — | ⏳ open — not landed |
| [#176](https://github.com/getAlloro/alloro/pull/176) | feat(responder): V1 — instant owner-approved auto-reply to … | `claude/responder-v1` | — | ⏳ open — not landed |
| [#175](https://github.com/getAlloro/alloro/pull/175) | fix(honesty): rank card shows '#15 of 5' — two different un… | `claude/engine-honesty-harness` | — | ⏳ open — not landed |
| [#174](https://github.com/getAlloro/alloro/pull/174) | ci: the repo's first pull_request checks + a pointer-resolv… | `claude/pr-ci` | — | ✏️ draft |
| [#173](https://github.com/getAlloro/alloro/pull/173) | docs: add BUILD-QUESTIONS.md — the agent-to-agent async cha… | `claude/build-questions-channel` | — | ⏳ open — not landed |

## ✅ Merged

| PR | What it is | Where it lives | Plan | Does it DO anything? |
|---|---|---|---|---|
| [#171](https://github.com/getAlloro/alloro/pull/171) | B2 — CRO-lift rewrite: RESEARCH RECORD ONLY (no feature; ex… | `claude/b2-cro-lift-rewrite` | `plans/07152026-cro-lift-rewrite` | ✅ merged |
| [#170](https://github.com/getAlloro/alloro/pull/170) | docs(agents): note repo is public — sanitize outward conten… | `docs/agents-public-repo-note` | — | ✅ merged |
| [#169](https://github.com/getAlloro/alloro/pull/169) | B1 — Provision preview-site analytics (gated, ships disabled) | `claude/b1-instrument-site` | `plans/07142026-alloro-funnel-engine` | ✅ merged |
| [#168](https://github.com/getAlloro/alloro/pull/168) | feat(funnel-engine): A6 — GBP write-back (owner-approved bu… | `claude/a6-gbp-writeback` | `plans/07152026-gbp-writeback` | ⛔ **merged, ships DISABLED** |
| [#167](https://github.com/getAlloro/alloro/pull/167) | A5 slice 1 — the findability sensor (honest geo-grid SoLV) | `claude/a5-findability-sensor` | `plans/07142026-alloro-funnel-engine` | ⛔ **merged, ships DISABLED** |
| [#166](https://github.com/getAlloro/alloro/pull/166) | feat(funnel-engine): A4 — Citations & NAP consistency monit… | `claude/a4-nap-consistency-monitor` | `plans/07152026-nap-consistency-monitor` | ✅ merged |
| [#165](https://github.com/getAlloro/alloro/pull/165) | feat(funnel-engine): A3 — AI-answer visibility (AEO) observ… | `claude/a3-aeo-visibility` | `plans/07152026-aeo-visibility-observation` | ⛔ **merged, ships DISABLED** |
| [#164](https://github.com/getAlloro/alloro/pull/164) | feat(funnel-engine): A2 — GBP own-completeness scoring (get… | `claude/a2-gbp-completeness` | `plans/07152026-gbp-own-completeness-scoring` | ✅ merged |
| [#163](https://github.com/getAlloro/alloro/pull/163) | Retire legacy Action Items Hub and task generators | `codex/remove-action-items-hub` | `plans/07152026-remove-action-items-hub` | ✅ merged |
| [#161](https://github.com/getAlloro/alloro/pull/161) | fix: keep rankings refresh modal above map | `codex/hotfix-local-rankings-map-refresh` | `plans/07152026-local-rankings-refresh-map-hotfix` | ✅ merged |
| [#160](https://github.com/getAlloro/alloro/pull/160) | feat(taste-profile): the true-voice spine — compose + persi… | `claude/taste-profile-spine` | `plans/07152026-cro-lift-rewrite` | ✅ merged |
| [#159](https://github.com/getAlloro/alloro/pull/159) | feat(funnel-engine): Slice 1b — get-found write path (schem… | `claude/slice-1b-get-found-write` | `plans/07142026-alloro-funnel-engine` | ✅ merged |
| [#158](https://github.com/getAlloro/alloro/pull/158) | feat(funnel-engine): Slice 1a — get-found read-only analysi… | `claude/slice-1a-get-found` | `plans/07142026-alloro-funnel-engine` | ✅ merged |
| [#157](https://github.com/getAlloro/alloro/pull/157) | fix(data-truth): show verified form-submission counts, not … | `claude/honest-submission-counts` | — | ✅ merged |
| [#156](https://github.com/getAlloro/alloro/pull/156) | feat(attribution): capture form-submission source — Slice 4… | `claude/slice-4-connection-measurement` | `plans/07152026-m0-submission-source-capture` | ✅ merged |
| [#155](https://github.com/getAlloro/alloro/pull/155) | fix(honesty): stop implying GBP posts improve findability/rank | `claude/honesty-posts-not-rank` | `plans/07172026-ranking-copy-honesty-guardrail` | ✅ merged |
| [#154](https://github.com/getAlloro/alloro/pull/154) | fix: isolate Patient Journey reply enrichment failures | `codex/patient-journey-timeout-hotfix` | — | ✅ merged |
| [#153](https://github.com/getAlloro/alloro/pull/153) | Inversion Ch3-7 + honesty-layer fixes (verify + merge) | `claude/inversion-foundation` | `plans/07142026-pr-153-merge-conflict-fixes` | ✅ merged |
| [#152](https://github.com/getAlloro/alloro/pull/152) | feat(receipts): read-only receipts-report service — honest … | `claude/receipts-report` | `plans/07142026-receipts-report-integrity-fixes` | ✅ merged |
| [#151](https://github.com/getAlloro/alloro/pull/151) | feat: GSC -> content loop (feed real Search Console demand … | `claude/gsc-content-loop` | `plans/07142026-gsc-content-loop-hardening` | ✅ merged |
| [#150](https://github.com/getAlloro/alloro/pull/150) | feat(inversion): Ch4 Choosable READ (competitor comparison … | `claude/inversion-04-choosable` | `plans/07142026-choosable-summary-hardening` | ✅ merged |
| [#149](https://github.com/getAlloro/alloro/pull/149) | feat(inversion): Ch3 Findable card to Chancellor quality (+… | `claude/inversion-03-findable` | `plans/07132026-pr149-findable-hardening` | ✅ merged |
| [#148](https://github.com/getAlloro/alloro/pull/148) | feat(inversion): Foundation, Ch2 unified card-type + Ch7 FIX 1 | `claude/inversion-foundation` | — | ✅ merged |
| [#147](https://github.com/getAlloro/alloro/pull/147) | Promote dev/dave → main: dashboard rank consistency + inver… | `dev/dave` | — | ✅ merged |
| [#145](https://github.com/getAlloro/alloro/pull/145) | Slice 1 — honest dashboard numbers (4 fixes; FIX 1 relates … | `claude/slice-1-data-truth` | — | ✅ merged |
| [#144](https://github.com/getAlloro/alloro/pull/144) | Ship dev/dave → main: OS admin port, multi-location billing… | `dev/dave` | — | ✅ merged |
| [#143](https://github.com/getAlloro/alloro/pull/143) | fix: support help desk — pill above title (no wrap) + mask … | `fix/support-help-desk-pill-author` | `plans/07052026-support-help-desk-pill-and-author-mask` | ✅ merged |
| [#137](https://github.com/getAlloro/alloro/pull/137) | fix(audit): correct letter grades + resilient GBP stage + f… | `fix/audit-grades-pipeline-event` | `plans/06292026-audit-grade-scale-deterministic` | ✅ merged |
| [#135](https://github.com/getAlloro/alloro/pull/135) | Promote dev/dave → main (production) | `dev/dave` | — | ✅ merged |
| [#134](https://github.com/getAlloro/alloro/pull/134) | Refactor | `dev/dave` | `plans/06142026-alloro-conventions-skill-improvements` | ✅ merged |
| [#132](https://github.com/getAlloro/alloro/pull/132) | Dave/website editor | `dave/website-editor` | `plans/06112026-website-editor-direct-editing-and-versioning` | ✅ merged |
| [#131](https://github.com/getAlloro/alloro/pull/131) | feat: website editor — direct editing, undo/redo, manual sa… | `dave/website-editor` | `plans/06112026-website-editor-direct-editing-and-versioning` | ✅ merged |
| [#126](https://github.com/getAlloro/alloro/pull/126) | fix: inline website header phone CTAs | `dev/dave` | `plans/04212026-no-ticket-dental-seo-template-visual-refresh` | ✅ merged |
| [#125](https://github.com/getAlloro/alloro/pull/125) | feat: add website header phone CTAs | `dev/dave` | `plans/04212026-no-ticket-dental-seo-template-visual-refresh` | ✅ merged |
| [#124](https://github.com/getAlloro/alloro/pull/124) | feat: Clarity integration installation validation + complet… | `dev/dave` | `plans/06052026-clarity-integration-validation` | ✅ merged |

## ❌ Closed without landing

Work that exists on a branch and never shipped. Before building anything new, check here — the
thing may already be written.

| PR | What it is | Where it lives | Plan | Does it DO anything? |
|---|---|---|---|---|
| [#146](https://github.com/getAlloro/alloro/pull/146) | Inversion engine, build handoff for Dave (docs + mission + … | `claude/inversion-engine-handoff-docs` | `plans/inversion-engine-handoff` | ❌ closed, never landed |
| [#129](https://github.com/getAlloro/alloro/pull/129) | Specialty-filter the audit competitor cohort (Oz-moment acc… | `sandbox-audit-specialty-filter` | `plans/06072026-no-ticket-audit-competitor-specialty-filter` | ❌ closed, never landed |
| [#128](https://github.com/getAlloro/alloro/pull/128) | Rate-limit /api/audit/start (stop uncapped spend) | `sandbox-audit-start-rate-limit` | `plans/06072026-no-ticket-audit-start-rate-limit` | ❌ closed, never landed |
| [#127](https://github.com/getAlloro/alloro/pull/127) | Default competitor comparison sort: review count -> maps po… | `sandbox-competitor-default-sort` | `plans/06062026-no-ticket-competitor-comparison-default-sort` | ❌ closed, never landed |
