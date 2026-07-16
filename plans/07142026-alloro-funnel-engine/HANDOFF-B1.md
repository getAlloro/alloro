# Handoff → next session: continue the Alloro funnel at B1

*Written 2026-07-15 at the A6 clean-handoff checkpoint. The filesystem is the source of truth — this session's transcript does NOT carry over. Restate the goal from THIS file + the tracker before writing any code.*

## First job (restate-to-prove)
Before touching code, restate the goal in your own words from **this file + `funnel-feature-sequence.md`** (same folder) ALONE. Then rebuild your task list from the tracker's THE SEQUENCE section — the in-session task tracker does NOT persist. If you can't reconstruct the goal from these files alone, say so plainly (that's a lossy-handoff finding about this template, not something to paper over).

## The goal (one line)
Build **Driver 2 (Alloro Connect / the presence funnel)** — the levers that make a local business get found, considered, and chosen — one feature at a time, in the tracker's order, each spec→build→adversary→PR'd to `dev/dave` for Dave to review+merge. The one metric we count is the **form submission (the raised hand)**, not a booked dollar.

## Where things stand (verify live — don't trust this list)
- **Get-found stage A1–A6 all PR'd** to `dev/dave`, awaiting Dave: A2 #164, A3 #165, A4 #166, A5 #167, A6 #168 (A1 already merged). Also open: taste-profile #160, get-found 1a/1b #158/#159.
- **Verify live first:** `gh pr list --state open` and `git log origin/dev/dave --oneline` — the tracker is a convenience map; git is truth. (Re-verify each "PR'd" mark before relying on it — pushed ≠ landed.)
- **A6 note:** it's the first lever that WRITES to a customer's live Google presence. It ships DISABLED (`business_info_writeback_enabled` default false) and no live Google write has been exercised — that's Dave's runtime gate after merge+enable.

## NEXT FEATURE: B1 — Instrument the hosted/preview site
**Scope (from the tracker):** the preview/hosted sites (`*.sites.getalloro.com`) currently have **NO analytics tracker** — instrumentation only happens after a custom domain + manual step. B1 attaches the **existing Rybbit tracker** to preview sites so "get-considered" becomes measurable (the prerequisite for ever judging whether B2/B3 rewrites worked). Near-free, independent, file-disjoint from A6.
- **Reuse-first:** find the existing Rybbit integration (`grep -ri rybbit src/ frontend/`) and the preview-site render path; attach the tracker there. Do NOT build a new analytics system.
- **Honesty cap (Value #6):** instrumentation measures visits/behavior; it does not promise rank or visibility.
- Re-verify the "ABSENT on preview" claim against live code at the spec step (the audit is 7/8 reliable — check, don't assume).

## Disciplines to hold ALL session (non-negotiable)
- **`sequential-build`** — ONE feature at a time, in order; spec→build→fresh adversary→PR; verify each artifact with its receipt in the SAME message before the next. Never report from memory. Source of truth = git/filesystem.
- **`alloro-engineer`** per feature; **Code Constitution** — read `code-constitution.html` (repo root; the skill isn't installed locally) and cite `§N.M`. Backend reference analog: `§6.1 src/controllers/gbp-automation/`.
- **CD SOP** — branch OFF `dev/dave`, build+adversary-verify, open a PR for Dave. **NEVER push to dev/dave or main directly.**
- **`sandbox-safety`** on any migration (additive + reversible); seed any schedule DISABLED; flag it for Dave in the PR. No Stripe/email/webhook side-effects. Do NOT run an unmerged migration against the shared dev DB.
- **Node 22** (`PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` — the default `node`/`npx` here is v20 and vitest throws `ERR_REQUIRE_ESM` under 20). `npx tsc --noEmit`, `npm test`, `npm run check:conventions --strict` all green before each PR.
- **Different-model adversary** — never let the same model grade its own work. Run the `alloro-proof` adversary on a model ≠ your builder; for a heavy/adversary-critical build run TWO diverse adversaries. (Honest limit: Fable/Sonnet/Opus are all Claude — intra-family decorrelation only; true cross-provider isn't wired yet. See memory `project_verification_hardening_cross_model_adversary`.)
- **AI drafts, human stakes** — don't alter enforcement-layer hooks/skills; draft and present.
- **Clean-handoff checkpoint** — after each PR and before any large/adversary-critical build, check context; if long AND the next build is heavy, recommend a fresh session and hand off clean.

## Negative knowledge — settled/killed this session (verdict · reasoning · re-open condition)
- **A6 revert kept in slice 1, hardened (not deferred).** *Reasoning:* the user framed the capture-before-write snapshot as the rollback's whole point, so shipping capture without a usable revert is a half-loop. *Re-open if:* Dave's review says the revert surface is too much for one PR.
- **A6 dropped `storefrontAddress` from writable fields.** *Reasoning:* it's the field Google most often meets with re-verification/suspension, and it was beyond the spec's field list; an adversary flagged it. *Re-open if:* a future slice designs address writes with the re-verification flow handled.
- **A6 master switch is NOT client-toggleable.** *Reasoning:* an adversary showed a viewer-role member could flip it via `PUT /settings` and do a live write; "Dave enables per account" requires it be server/DB-only. *Re-open if:* proper RBAC role-gating lands (see below) — then a manager toggle could be reconsidered.
- **RBAC role-gating on gbp-automation mutating routes = FLAGGED TO DAVE, not fixed in A6.** *Reasoning:* the gap is pre-existing and subsystem-wide (posts/replies write to Google under the same authenticated-org-member auth); fixing it in A6 would be scope creep across shared routes. *Re-open:* it's Dave's call in the #168 review; if he wants it, it's a separate cross-cutting PR.
- **Measurement-rail sequencing (pull E1/attribution earlier?) = PENDING COREY'S STAKE.** *Reasoning:* canon (NS1 "attributed" + moat = owned channel) argues to pull the measurement rail earlier than strict found→considered→chosen; but measuring an empty funnel measures nothing. Recommendation on the table: pull B1 now (done next) + land the submission source-column early, keep the full E1 loop after the first considered+chosen levers ship. *Re-open:* Corey stakes (a) adopt the "measurement-rail-is-foundational" weighting or (b) hold strict order. Until staked, follow the tracker's written order.

## Handoff hygiene note (fix opportunistically)
This tracker + brief live on the **`claude/a5-findability-sensor`** branch, not on `dev/dave`, so they vanish from a working tree branched off `dev/dave`. Consider relocating the funnel tracker to a stable home on `dev/dave` (or wherever survives the branch cuts) so future sessions branching off `dev/dave` can find it without checking out A5.

## This session received a CLEAN handoff? 
N/A — this session was the one continuing from A5's handoff (which pointed at A6 via a committed start-here file); that handoff was clean (goal reconstructable from the tracker alone). Log for the template: clean.
