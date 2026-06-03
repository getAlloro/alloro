# Strip Referrals Hub (/pmsStatistics) Redesign from main

## Why
The referral hub redesign was accidentally promoted to `main` via the `FF-01` PR merge of `dev/dave → main` (`5727f26a`, 2026-05-30 00:35 +0800). It is supposed to live only on `dev/dave` until ready. We need it off `main` while leaving `dev/dave` untouched.

## What
A revert branch off `main` that restores the `/pmsStatistics` page (the `frontend/src/components/PMS/dashboard/` directory) to its pre-redesign state (`d7fb5f34`) and deletes the two referral-hub plan docs. Delivered as a PR into `main`. `dev/dave` keeps the full redesign.

**Done when:** `main` (via merged PR) renders the pre-redesign PMS dashboard, `npx tsc -b` passes, and `dev/dave`'s tree is byte-for-byte unchanged.

## Context

**The redesign reached main as one branch merge, not a targeted push:**
- `5727f26a` "FF-01" = merge(`d676c58f` old main, `95045286` dev/dave tip). Pulled down locally as fast-forward.
- Referral hub commits now in main: `9db78af7` (layout), `f3c053d6` (owner-readable), `2ff12582` (merge of `referral-updates-opus-4-6`), `95045286` (PMS build fix).

**Why a file-scoped revert of `PMS/dashboard/` is clean (verified):**
- Nothing outside `src/components/PMS/` imports any `PMS/dashboard/` file. The page is a self-contained consumer.
- The redesign's shared "meaning-card" system (`dashboard/shared/InfoTip`, `SectionTitle`, `MeaningHero`, `DetailsModal`) lives **outside** `PMS/dashboard/`, in `dashboard/shared/`, and is consumed by the **kept** `RankingsDashboard.tsx`. It is out of revert scope → stays intact.
- `DetailsModal` was renamed from `dashboard/rankings/RankingDetailsModal.tsx` → `dashboard/shared/DetailsModal.tsx` during the redesign (`f3c053d6`) — also outside `PMS/dashboard/`, untouched.
- Pre-redesign PMS files (`d7fb5f34`) only import siblings (e.g. `PmsAttentionCards`), which the restore brings back together. No dangling refs.
- `App.tsx` routing (`/pmsStatistics → <Dashboard/>`) was never touched by the referral commits.

**Reference commit for the pre-redesign state:** `d7fb5f34` ("feat: redesign local rankings and support workflows") — the common base just before both referral branches diverged.

## Constraints

**Must:**
- Branch off `origin/main` (verified == local `main` == `5727f26a`).
- Restore the **entire** `frontend/src/components/PMS/dashboard/` directory to `d7fb5f34` (handles add/modify/delete uniformly).
- Delete only the two `referrals-hub` plan folders.
- Pass `npx tsc -b` before committing.
- Reach `main` via PR (main is PR-protected — that's how the redesign got in).
- Commit author `LagDave <laggy80@gmail.com>`.

**Must not:**
- Touch `dev/dave` in any way.
- Touch `dashboard/shared/*`, `RankingsDashboard.tsx`, `GbpEngagementInfoTip.tsx`, `onboarding-wizard/wizardConfig.ts`, or `support/GlobalSupportAction.tsx` (kept work).
- Delete `plans/05292026-no-ticket-local-rankings-copy-cta-updates/` (kept).
- Force-push or rewrite `main` history.
- Stage the unrelated untracked `plans/05302026-…-fix-scheduler-worker-lock-loop/` folder or this plan folder into the PR.

**Out of scope:**
- Re-introducing the redesign later (separate task — see Risk).
- Any change to the shared design system or local-rankings page.

## Risk

**Level:** 3 (alters shared `main`; intentional branch divergence).

**Risks identified:**
- **Branch divergence / future re-merge gotcha** → main will have the PMS page reverted while `dev/dave` keeps the redesign. The current `dev/dave` (`95045286`) is already an ancestor of `main`, so a plain re-merge will **not** silently re-introduce the redesign. **Mitigation:** When the referral hub is ready, ship it to main by reverting *this* revert commit (or cherry-picking fresh redesign commits) — do not rely on a dev/dave→main merge to bring it back.
- **Dangling reference after restore** (the reference check the user asked for) → judged safe by import analysis. **Mitigation:** hard `npx tsc -b` gate before commit; abort/fix if it surfaces anything.
- **Accidental inclusion of unrelated files in the PR** → **Mitigation:** stage only the two explicit pathspecs; verify `git status` before commit.
- **main auto-deploy** → if main deploys to prod on merge, the PMS page changes for users on merge. **Mitigation:** PR review + CI; confirm deploy expectations before merging.

**Blast radius:** `main` only. Affected surface = the `/pmsStatistics` page rendering (reverts to pre-redesign). No API, DB, routing, or shared-component changes. `dev/dave` and all feature branches unaffected.

**Pushback:** Stripping from main while keeping on dev/dave is a deliberately divergent state. It's the right call given the redesign isn't ready, but it is temporary debt — the longer the two branches disagree on these files, the higher the chance of a messy reconciliation when the redesign ships. Keep the gap short.

## Tasks

### T1: Create revert branch off main
**Do:** From a clean tree, `git checkout -b revert/pms-referrals-hub-main origin/main`.
**Files:** none (branch op).
**Depends on:** none.
**Verify:** `git rev-parse HEAD` == `5727f26a`.

### T2: Restore PMS dashboard directory to pre-redesign
**Do:** `git rm -r --quiet frontend/src/components/PMS/dashboard` then `git checkout d7fb5f34 -- frontend/src/components/PMS/dashboard`. Restores `PmsAttentionCards.tsx`; reverts the 13 modified Pms files; removes the 3 new files (`PmsReferralsMeaningCard.tsx`, `primitives.tsx`, `referralInsightCopy.ts`).
**Files:** `frontend/src/components/PMS/dashboard/*`
**Depends on:** T1.
**Verify:** `git diff --stat d7fb5f34 -- frontend/src/components/PMS/dashboard` is empty (dir matches d7fb5f34).

### T3: Delete the two referral-hub plan docs
**Do:** `git rm -r --quiet plans/05292026-no-ticket-referrals-hub-layout-redesign plans/05292026-no-ticket-referrals-hub-owner-readable-redesign`
**Files:** the two referral plan folders.
**Depends on:** T1.
**Verify:** `local-rankings-copy-cta-updates/` still present; both referral folders gone.

### T4: Build gate + commit
**Do:** `cd frontend && npx tsc -b` (hard gate). On pass, commit as `LagDave` with a `revert:` message describing scope and that dev/dave retains the redesign.
**Files:** commit.
**Depends on:** T2, T3.
**Verify:** `tsc -b` exits 0; `git show --stat HEAD` lists only PMS/dashboard files + the 2 plan folders.

### T5: Push + open PR to main
**Do:** `git push -u origin revert/pms-referrals-hub-main`; `gh pr create --base main`. Then `git checkout dev/dave` to restore working context.
**Files:** none.
**Depends on:** T4.
**Verify:** PR shows expected diff; `dev/dave` checked out and unchanged (`git status` clean).

## Done
- [ ] `git diff --stat d7fb5f34 -- frontend/src/components/PMS/dashboard` empty on revert branch
- [ ] `npx tsc -b` — zero errors
- [ ] PR diff contains ONLY `PMS/dashboard/*` + the 2 referral plan folders (no shared/, rankings, gbp, support, or stray plan folders)
- [ ] `local-rankings-copy-cta-updates/` plan retained
- [ ] `dev/dave` tree byte-for-byte unchanged (no commits, clean status)
- [ ] Manual: `/pmsStatistics` on the revert branch renders the pre-redesign dashboard
