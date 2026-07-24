# Alloro Capability Ledger

**The single source of truth for what is built, what is wired, and what moves which number.** One row per capability. If you want to know "is X real yet?", this file answers it in 30 seconds — and if it can't, that's a bug in this file.

## Two rules keep this alive (without them it becomes stale like everything before it)
1. **Grounded, not asserted.** Every State cell is checked against the code and dated. A claim we can't verify is marked `UNVERIFIED`, never guessed.
2. **Self-maintaining via the PR flow.** No capability PR merges until its ledger row is updated — this is the enforcement half of protocol v1.2 (the PR "metric line"). Without that rule, this file dies in a month.

## This replaces
- `plans/07142026-alloro-funnel-engine/build-checklist.md` and the chat "coverage-map" artifacts — **retired; point here instead.** **`funnel-feature-sequence.md` is NOT retired** — it's the staged BUILD PLAN; this ledger is the build-STATE. Two complementary views, neither replaces the other (see that file's header). *(Corrected 2026-07-21 — an earlier line wrongly retired it.)*
- The **overwatch register** does NOT move here — it lives in **Notion** (cross-team open issues, not capability state). Do not recreate a repo mirror.
- The **roadmap** (`docs/roadmap-impressions.md`) stays — it's the forward plan and points at these rows. The **risk register** stays private (`~/alloro-private/`).

**State legend:** `LIVE` = live & wired · `BUILT–NOT-WIRED` = code exists, nothing calls it · `FROM-SCRATCH` = not built · `GATED-OFF` = built, master switch default-off · `SHIPPED–VERIFY` = shipped, confirm it still runs · `BLOCKED` = live but blocked upstream · `DEFECT` = built wrong · `STRANDED` = merged to the wrong branch, not on trunk.

**Verified against `dev/dave` @ `e0790396a`, 2026-07-23 (after the #208–#218 batch).** *(This pass re-grounded H5, I2, GF1, GF9, P4 against trunk code and added H6/H7 for capabilities that merged without a row. Rows not named here still carry their earlier grounding — H1–H4 and I1/I3 remain at 2026-07-21 / `66f1bf7af`; GF2 and CH3 at #216's 2026-07-23 pass, re-confirmed today.)*

⛔ **`LIVE` means live on `dev/dave`, not in production.** The whole #208–#218 batch is dev-only — `origin/dev/dave` is **13 commits ahead of `origin/main`** (last promotion: #207). Nothing in that batch reaches a real client until Dave rides dev → main. Check before quoting any row to a customer: `git rev-list --count origin/main..origin/dev/dave`.

> **The test for any work item: "does this change what happens to account fifty?"** If it doesn't change what a real client experiences, question whether it belongs in the mission.

---

## ⚡ ACTIVATION QUEUE — what's BUILT but not LIVE, and who flips it

**Derived view, not a second catalog.** Every row below is BUILT (code exists) and OFF. Fully-live capabilities are not here — they're in the sections below. Each row carries a receipt (ledger label · `file:line` · PR# · branch).

**Swept 2026-07-23** across four independent surfaces: code flags (`src/` + `frontend/`), git branches + open/merged PRs, plan specs + `BUILD-QUESTIONS.md`, this ledger + memory. **"Complete" = these four surfaces on this date — not "everything."** Blind spots are listed at the end; re-run the four-surface sweep to refresh, and update the date. **Adversary-refuted 2026-07-23 (BROKE-IT, then repaired):** one bad row removed (GBP completeness auto-fill-at-audit — its receipt proved it's a deliberate owner-OFF non-build, and the manual path is already live), a receipt line corrected; one claimed "missed switch" was checked against the code and found to be a per-org opt-in with a wired UI, so correctly excluded.

⛔ **CP7 cleared — and prod has since moved AHEAD.** `#220` rode dev→main (20:37Z). As of a fetch just now, `origin/main` is **7 commits ahead** of `origin/dev/dave`, and dev/dave is **0** ahead of main — which **inverts** this file's old "dev/dave is 13 ahead / batch is dev-only" premise. The #208–#219 batch is on prod. ⚠️ **dev/dave being *behind* main needs reconciliation** (normal flow is dev→main; main-ahead means direct-to-main commits or an un-back-merged state — flag to Dave). The ledger head + **GF1** still say "dev-only" and are now **wrong** — pending a refresh pass.

### The chokepoints — one action each, many features behind it

| CP | The one action | Owner | Unblocks | Receipt |
|---|---|---|---|---|
| **CP1** | Flip the A6 write-back master switch `business_info_writeback_enabled` (per account) | **Dave** | GBP business-info write-back (GF5), GBP completeness detect-to-fix, better-category publish (GF2) | migration `20260716000000`; PR #168; specs `07152026-gbp-writeback`, `07182026-gbp-completeness-detect-to-fix`, `07202026-category-value-source` |
| **CP2** | Clone dev/dave DB into sandbox (or grant read-only) | **Dave** | Attributed-lift calibration (H5/#209) → the whole proving-simulation verdict surface | `BUILD-QUESTIONS.md` Q2 |
| **CP3** | Fix Clarity capture + name "snippet vs mapping" | **Dave** | #215 CRO signals (rage-click / scroll-depth wired into the diagnosis) | `BUILD-QUESTIONS.md` Q3; PR #215 |
| **CP4** | Open a PR from `origin/checkup-upgrade` and land it | **Dave** | Review REQUESTS engine (CH2), SMS infra (S2), plus a checkup-report upgrade bundle (recognition scoring + report generators) | branch `origin/checkup-upgrade` |
| **CP5** | Review + land the two re-applied seam PRs (#229, #230); the 3rd branch is HELD | **Dave** (review/merge) | GBP scheduled-post drafts, review-reply auto-draft, verified-leads-by-source (attribution). *Note: scheduled-post generation ALSO needs the per-org `local_post_generation_enabled` opt-in on — a normal wired-UI toggle, not a build gate.* | Updated 2026-07-23: `seam-source-to-reader`→**#229** (CH5), `seam-review-reply-autodraft`→**#230** (CH4) — both re-applied to trunk + verified; the stale 161-behind branches are retired. `origin/claude/seam-scheduled-post-unneuter` still stranded + **HELD** (the scheduled-post neuter looks intentional — posts need a per-post image). |
| **CP6** | Grant `website-renderer` repo access | **Dave/Corey** | B1 preview-snippet verify, B1-R form/contact events, M0 first-touch source sender | specs `07152026-instrument-site`, `07152026-m0-submission-source-capture` |
| **CP7** | ✅ CLEARED — prod promotion (#220) | Dave | Maps gauge reads true (GF1/#211), diagnostic-gait abstention confirm (#214) — **now: first prod daily run + Dave Step-1/2 check** | #220 (20:37Z); spec `07202026-zero-maps-fix` |

**The bottleneck is activation, not build.** Most of the queue sits behind **Dave** — a per-account switch (CP1), a DB clone (CP2), a capture fix (CP3), and four "open the PR" lands (CP4/CP5).

### BUILT-BUT-OFF — standalone rows (own switch, not behind a shared chokepoint)

| Capability | State | The one step | Receipt |
|---|---|---|---|
| Preview Analytics env gate | GATED-OFF | set `PREVIEW_ANALYTICS_ENABLED=true` after renderer PII check | `src/config/rybbit.ts:23` |
| Service-token enforcement | GATED-OFF | set `ALLORO_SERVICE_TOKEN_ENFORCE=true` after observation window | `src/config/serviceToken.ts:46` |
| Findability Sensor (geo-grid rank) | GATED-OFF | set a location keyword config `enabled=true` | migration `20260715000000` |
| Local Rankings period toggle | BUILT-DARK | `PERIOD_TOGGLE_ENABLED=true` + wire `useRankingHistory` | `frontend/.../rankingPeriod.ts:20` |
| Client Taste Profile | BUILT–NOT-WIRED | add a prod caller to `composeTasteProfile()` | `service.taste-profile.ts:30` |
| CRM sync-log pruning | BUILT–NOT-WIRED | schedule `CrmSyncLogModel.pruneOlderThan` on cron | `CrmSyncLogModel.ts:88` |
| Patient-Journey velocity rung | GATED-OFF | provide real `review_created_at` reliability signal | `PatientJourneyService.ts:243` |
| Freshness guard reach (I2) | PARTIAL | point `isMonthStale/withFreshness` at Rankings Hub + PJ | `#210`; `statusRules.ts:138` |
| Rank-tone age-gate (I2 facet) | BUILT-DARK | add created-at to ranking projection + `as_of` field | `#210 body` |
| Page-title / meta edits (GC1) | BUILT–NOT-WIRED | build draft-approve flow over `meta_title/meta_description` | migration `20260308000001` |
| Vocabulary — frontend half | BUILT–NOT-WIRED | wire `useVocabulary()` into post-login components | `project_vocabulary_system` |
| Routes API drive-time market | GATED-OFF (ext) | Dave enables Routes API in Cloud Console + wire consumer | `driveTimeMarket.ts:125` |
| Email delivered/opened metrics | BUILT–NOT-WIRED | set Mailgun webhook key + configure event/open tracking | spec `07062026-email-logs-dashboard:259` |
| AEO visibility observation | BUILT-DARK | build executor slice + pre-enable smoke tests | spec `07152026-aeo-visibility-observation:147` |
| Responder V1 (lead auto-reply, OFF) | HELD-PR | promote draft, open PR, merge | `#176` (`claude/responder-v1`) |
| Test-worktree adapter | HELD-PR | review + merge draft | `#180` |
| Proof-receipt rollup | BUILT-DARK | land the frontend follow-up (backend is fetch-only) | `#177` |
| Lattice residual bindings | BUILT-DARK | land 2 fragments (Schwartz→SeoGeneration, Sheridan→WebsiteAnalysis) | `#213 body` |
| Alloro-OS admin SSE flush | TODO | Dave adds Apache SSE flush block on both vhosts | spec `07042026-alloro-os-admin-port:266` |
| Dark detectors → owner surface | BUILT-DARK | build the follow-on slice wiring 3 detectors to the surface | spec `07182026-ranking-owner-surface:113` |
| Ranking-owner-surface slice | STRANDED | Dave reviews held branch + merges | branch `claude/ranking-owner-surface` |
| Practice-Hub Hero (Path D F1) | STRANDED | open PR + merge | `origin/feature/practice-hub-hero` |
| Growth-Opportunities filter (Path D F2) | STRANDED | open PR + merge | `origin/feature/caroline-empty-state` |
| Fireflies→Substrate pipeline | STRANDED | open PR + merge | `origin/fireflies-pipeline-build` |
| Sandbox "Wave" cards (specialty competitors, referrals rescope) | STRANDED | promote via dev/dave batch | `origin/sandbox`, `origin/lattice-load-wave2` |
| Marketing-loop dormant agents (~46) | BUILT–NOT-WIRED (low-conf) | wire diagnose→write→publish→measure on one client | `project_marketing_loop_state` (re-verify vs trunk) |

### NOT-BUILT — identified, deliberately not started (separate roadmap — do not confuse with the above)

Sikka PMS bridge (gates CH2's trigger) · Welcome-Intelligence processor · CRO v2 LLM honesty judge (gates Taste-rewrite B2) · Taste-profile producer slice · M0 hosted-form source sender (needs renderer access) · Findability scientist agents · Diagnostic exam-gate · Audit cohort-cap fix (owner decision) · GBP auto-fill-at-audit trigger (deliberate owner-OFF; the manual fill path is already LIVE at `GbpAutomationController.ts:142`) · Reviews "this month" calendar metric (owner decision) · Page-label rename persistence · `checkup.ts` refactor-or-delete · Handoff-enforcement remaining gates · BUILD-QUESTIONS Q1 (review agents → `.claude/`), Q4 (credential rotation — ⛔ Corey).

### Blind spots this sweep flagged (where a missed item could still hide)
- The **~46 dormant `websiteAgents/` agents** — no per-agent itemization; a single stranded agent could be uncounted.
- **Per-row/per-org DB column defaults** (`enabled`/`is_enabled` defaulting false, filtered by a worker) — not named flags. Checked to ground: `local_post_generation_enabled` / `review_reply_enabled` (`GbpAutomationSettingsModel.ts:105`) are per-org **opt-ins with a wired admin UI** (`OrgGbpAutomationTab.tsx:180,200`) — customer choices, not activation gates, so excluded by design (an adversary flagged these as "missed"; the wired toggle proves they're not). Findability Sensor's `enabled` is the one true build-gate of this shape found.
- **Pre-June `plans/**/*.md`** with looser "feature flag off" language — grep-covered, not read line-by-line for activation status.
- **Sandbox-lineage Wave cards** possibly already promoted to main under reworded commit hashes — needs a per-file `git diff origin/main` on each sandbox tip to rule out.

### Hardening path — make this queue self-checking, not self-asserting (adversary partner-rebuild, 2026-07-23)

The three defects the adversary found share one root: **a row stores a conclusion, not a re-runnable check** — so it rots silently the moment code or git state moves (the same disease P3 spec-parity already mechanizes). To fix the *method*, not just this pass, build a PR-gated `verify-ledger.sh`:
- **A. Derive `State` from two greps** — does a non-test *definition* exist? does a non-test *caller* exist? → `!built` = NOT-BUILT, `built && !caller` = BUILT-NOT-WIRED, `built && caller` = LIVE. A deliberate non-build has no symbol to cite; a comment-receipt yields a real caller — both self-contradict and fail the check. *(Grep is a backstop, not proof — same caveat as §11.7.)*
- **B. Receipts become typed predicates** the script re-runs (e.g. `callers(stageFillForLocation, exclude=__tests__) == 0`); a receipt pointing at prose fails its own predicate.
- **C. Add an `Off-reason` column** with a closed vocabulary `{no-caller, off-trunk, env-flag, per-org-optin, master-switch}` — separates a real build-gate from a customer opt-in (the `review_reply_enabled` confusion this pass).
- **D. Store git facts as `command = value @timestamp`**; the preflight recomputes and FAILs when stored ≠ live (what would have caught the inverted head).

---

## Honesty / instrument (fix first — a lying gauge is worse than a missing one)

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| H1 | **Multi-location rank display shows one location as the whole story, omitting the rest** | Trust | **DEFECT** | Client Local Rankings / "#1 locally" card | Verified 2026-07-21: a multi-location org shows one location #1 of 11 to the client and omits its other four locations. The defect is the **omission** (5 summarized as 1) — same class as a false healthy verdict — and stands regardless of a hidden location's rank. NB: one omitted location is **brand-new** (0 reviews; prod rank #4 of 20 per Dave's 2026-07-21 query — dev showed #11/11, a dev/prod gap to check), so its low rank is the expected from-zero start, not a problem. Violates invariant **I1**. |
| H2 | **Rank display shows every location, incl. the worst** *(the fix for H1)* | Trust | **FROM-SCRATCH** | Local Rankings | Honest-narrator rule; not built |
| H3 | **Named-competitor visibility for the operator** (who are they, where does a named rival rank) | Trust | **GAP (confirmed)** | admin practice-ranking shows counts/ranks (`#N of 11`) but **no names** | Confirmed 2026-07-21 (Dave prod query): a client's defining rival **is absent from their market's top-20** — the rival is invisible to the map instrument. Points to the referral surface (Reflect + Sikka), not the map. |
| H4 | **Ranking data shows wrong values for the client's OWN location** (0/0 where the live GBP is 5.0 / 4 reviews) | Trust | **DEFECT** | admin practice-ranking / client Local Rankings | Confirmed 2026-07-21 (CW, live Google Maps): the client's new location is claimed + actively managed, **5.0 / 4 reviews**; our data holds **0 / 0**. A fetch/mapping bug on the client's own listing — likely a wrong-place record. Corrects the earlier "0 reviews" baseline. Symptom of missing **I3** set-integrity. |
| H5 | **Attributed-lift measurement — did our change actually move CTR?** (DiD + ITS, ordinal verdict, abstains rather than guesses) | Trust (the instrument itself) | **BUILT–DARK, PURE** (on trunk since #209; no caller by design) | nothing yet — dark until real-data calibration | Updated 2026-07-23: **#209 merged** (`6e988d3d5`), so this is no longer off-trunk. `ctrAttributionMath.ts` + 37-case month simulation. Emits an ordinal rung only (`not_enough_data` / `no_detectable_change` / `trending_up` / `trending_down`) — the verdict type carries **no numeric field**, so no caller can render a causal "+N". Survived 8 adversary rounds. ⛔ **Wiring gates (spec Rev 5):** measures **CTR only** — never point it at an impressions-targeted action (a get-found win reads `trending_down`); never feed org-wide impressions to score a single-location change (dilution, the #183 constraint); thresholds are **uncalibrated against real GSC data** — that is the enable gate. |
| H6 | **Local Rankings gauge values are measured, never invented** *(fabrication class — distinct from H1's omission class)* | Trust | **LIVE** (dev) | Client Local Rankings | Added 2026-07-23: **#212 merged** (`08ef9523f`) fixed three live fabrications on `RankingsHubSurface` — a hardcoded `4.5` rendered as a measured market rating, a `#N of M` pairing a SerpApi position with a curated competitor count (two different universes), and `0 reviews last 30 days` printed on absent scrape data. Derivation extracted to pure `rankingsHubDerivation.ts`; the scoring stage now persists `null`, not `0`, for absent GBP review data (`service.ranking-stage-scoring.ts`), which is what made the frontend null-checks real. **Do not re-fix this** — but note it does **not** touch H1: the surface still renders one `locationId` at a time. |
| H7 | **Leak selector names the binding constraint, not the smallest percentage** | Trust (what the owner is told to fix) | **LIVE** (dev) | Patient Journey Insights — the "one thing" | Added 2026-07-23: **#214 merged** (`f2abced0b`) replaced the smallest-percentage leak pick with a diagnostic gait (`src/controllers/patient-journey/feature-utils/util.diagnostic-gait.ts` + `funnelMath.ts`). The old selector could point an owner at the arithmetically-smallest conversion step while a bigger, earlier gate was the actual constraint. |

## Product invariants (system rules — a violation is a defect anywhere it appears; fix the path, not the instance)

| # | Invariant | State | Enforced where | Note |
|---|---|---|---|---|
| I1 | **Completeness** — any surface summarizing multiple locations, keywords, or competitors renders **every member, or states what it omits**, with honest framing for new locations | **VIOLATED** (see H1) | rank displays, journey summaries, competitor cards | H1 is a live violation. The fix (H2) is one shared render rule, not a per-surface patch. |
| I2 | **Freshness** — the stale-data guard is **one shared code path** product-wide (not re-implemented per surface) | **PARTIAL** (was UNVERIFIED) | focus dashboard only — verdict + stat tiles | Verified 2026-07-23 against trunk: **#210 merged** (`85877ca6c`) built the guard as one shared module — `isMonthStale` / `withFreshness` in `frontend/src/components/dashboard/focus/statusRules.ts:138,160`, consumed by `useStageTones.ts` and `StatCardRow.tsx`, so the verdict and the tile dots can't disagree. But its reach is the **focus surface's monthly PMS data only**. Rankings Hub and Patient Journey do not call it, and it has no backend counterpart. The invariant is satisfied where it runs and unenforced everywhere else. |
| I3 | **Set-integrity** — competitor lists **validate against org specialty at write time** and **alarm on mismatch** | **FROM-SCRATCH** | practice-ranking write path | Rival-absent (H3) is the symptom of no set-integrity check: nothing catches a missing defining rival or an off-specialty entry. |

## Get Found — impressions

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| GF1 | **Impressions gauge** (Google Visibility) | Impressions | **FIX MERGED (dev) — still reads 0 in prod** | Patient Journey Insights | Updated 2026-07-23: the root cause is **found and fixed**, correcting this row's earlier "root-cause is Dave's". **#211 merged** (`95ec708a2`): the daily agent asked Google for exactly yesterday and the day before, but the GBP Performance API trails ~3–4 days, so `datedValues` came back empty and summing an empty array reported `0` — which is why the Maps term was 0 in ALL 1,229 daily rows across 7 orgs / 9 months (Dave's 07-20 prod-clone check). The fix reads a trailing window and picks the most-recent day Google actually published, and omits the visibility object entirely when the window published nothing, so "no data" can never again be stored as a real zero. **Three things still stand between this and a true number:** the batch is dev-only (see the ⛔ note above), the fix must ride to prod, and one daily run must land after that deploy. **Until then the gauge still reads 0 for every client, and the baseline freeze must not run** — freezing now captures the fabricated 0 and makes any later lift an artifact of the instrument starting to work. Backfill of the 9 months of bad rows is separate and unbuilt. **This is the top-of-funnel blocker to the July-31 mission.** |
| GF2 | **GBP primary category** (specialty, most-specific) — strongest lever | Impressions | **WIRED–MANUAL ONLY** | GBP Automation approvals (via API, no UI) | Updated 2026-07-23: #202 added the caller this row said did not exist — `POST /business-info/category-proposal` (`src/routes/gbpAutomation.ts:116`) → `GbpAutomationController.createCategoryProposalDraft` → `CategoryValueSourceService.proposeCategoryDraftForLocation`. It stages an owner-approval A6 draft; it does **not** publish. Two things still gate real impact: no UI calls the route (zero hits in `frontend/`), and the publish path is GF5, default-off. So: a human can trigger it, nothing runs it on a schedule. |
| GF3 | **GBP completeness fill — website URL** | Impressions (≈no-op) | **LIVE** | GBP Automation drafts | `gbpCompletenessFill.ts:106` — only field it fills; profiles already have websites |
| GF4 | **GBP completeness fill — phone / hours** | Impressions | **FROM-SCRATCH** | — | `gbpCompletenessFill.ts:115` empty stubs; comment L20 "no-value-source" |
| GF5 | **GBP business-info write-back (A6)** — the publish path | Impressions (when fed) | **GATED-OFF** | GBP Automation approvals | `gbpBusinessInfo.ts`; migration `20260716000000` `business_info_writeback_enabled defaultTo(false)` |
| GF6 | **NAP consistency read** (floor / hygiene, not a climb lever) | — (table-stakes) | **LIVE** | GBP / NAP surface | nap-consistency controller (#187 merged) |
| GF7 | **Organic content — GSC→content loop (A1)** | Impressions (organic) | **SHIPPED–VERIFY** | new/updated site pages | `util.keyword-selection.ts:11` "A1's shipped GSC→content loop" + `service.gsc-performance` + `dataHarvest` worker; confirm schedule on |
| GF8 | **AEO — FAQ / schema (JSON-LD) on hosted pages** | AI-answer visibility | **PARTLY BUILT** | hosted pages / site audit | detect: `service.website-audit.ts hasFaqSchema`; insert+verify: `admin-websites/util.ai-command-verify.ts` |
| GF9 | **Completeness fill → owner's get-found surface** (the publish trigger — owner sees "Alloro did this") | — (reports the work; claims no lift) | **LIVE** (dev) — was "OPEN PR" | Patient Journey Insights, get-found stage | Updated 2026-07-23: **#208 merged** (`580b605fa`). `MetricActionService.recordGbpCompletenessFill` had zero callers on trunk since #184 — dead code; #208 added the only one, at the publish choke point `GbpBusinessInfoReconcileService.ts:232`, plus the revert half that closes the note when a fill is undone. Fires only after the write lands on Google, and only for Alloro-staged drafts (manual owner edits carry no origin marker, so Alloro never claims their credit). **Practical reach today = GF3 only:** `websiteUri` is the sole field with a value source, and the publish path itself is GF5, default-off. |

## Get Considered — CTR

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| GC1 | **Page title / meta description edits** on Alloro-hosted sites | CTR | **MACHINERY EXISTS, flow FROM-SCRATCH** | Google search result snippet | `website_builder.pages.meta_title/meta_description/seo_data` (migration `20260308000001`); draft-and-approve flow not built; **which clients are hosted = `/admin/websites` roster (confirm)** |

## Get Chosen / prominence

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| CH1 | **Review REPLIES** (respond to existing reviews) | Prominence | **LIVE** | Reviews & Posts | `GbpReviewReplyService` + siblings (merged) |
| CH2 | **Review REQUESTS / velocity** (get more, fresher reviews) — top competitive lever | Prominence → impressions | **STRANDED + Sikka-gated** | — | `ReviewRequestModel.ts` + `ReviewRequestEmail.ts` exist **stranded on `origin/checkup-upgrade`** (not on trunk) — NOT greenfield; PMS-trigger substrate = Sikka ([[project_sikka_integration]]); sandbox free-to-start, paid trigger = cash |
| CH3 | **Form-submission confirmation email** (lead reassurance) | Submissions (trust) | **LIVE — conditional** | hosted lead forms | Updated 2026-07-23: built by #204, contrary to this row's "none". `formSubmissionController.ts` `buildConfirmationReceiptBody` sends *"We received your message"* to the submitter on the **form** path (distinct from the newsletter double-opt-in). Two conditions must hold or nothing sends: the form carries an email-like field, and the submission is not spam-flagged. |
| CH4 | **Review-reply auto-draft** (draft a reply when a new review is ingested) | Prominence | **PR #230 open (dev/dave)** — was STRANDED (161-behind) | Reviews & Posts (a staged draft work item) | Added 2026-07-23: **PR #230** re-applies `seam-review-reply-autodraft` onto current trunk (`923f35440`). `GbpReviewReplyAutoDraftService.enqueueForIngestedReviews` (called from the review-sync processor) stages a review-reply **draft** work item — owner-approval pending; it never sends (the existing CH1 human-approval gate is unchanged). Idempotent (skips already-drafted reviews), readiness-gated, degrades to 0 on failure (§3.1). Verified: tsc 0 · 9 tests · `check:conventions` 0 structural · full unit suite (2,300) green. Awaiting Dave review+merge. |
| CH5 | **Verified leads by source** (which channel a raised hand came from — the attribution read) | Submissions (attribution) | **PR #229 open (dev/dave)** — was BUILT-STRANDED (161-behind) | Patient Journey leads stage (`bySource` on the leads metadata) | Added 2026-07-23: **PR #229** re-applies `seam-source-to-reader` onto trunk (`923f35440`). `FormSubmissionModel.getVerifiedStatsBySource` + `readLeadsBySource` read the captured `source`/`source_method` into the leads stage — closes the source→measurement seam (source was persisted on the write side but read by no consumer, so attribution was inert). Honest: per-source counts sum to the headline verified total (shared month-bucket SQL, session-TZ aligned); `source: null` is its own unknown bucket (Value #6); a client claim reads *reported as*, not *verified*. Verified: tsc 0 · 9 tests · `check:conventions` 0 structural · full unit suite (2,300) green. Awaiting Dave review+merge. |

## Send infrastructure

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| S1 | **Email (Mailgun)** | — | **LIVE** (prod only; non-prod intercept) | Email Logs | `src/emails/transport/mailgunTransport.ts`; hotfix merged main+dev |
| S2 | **SMS** | — | **STRANDED** | — | `src/sms/smsService.ts` exists **stranded on `origin/checkup-upgrade`** (not on trunk) — no wired provider *on trunk*, but not from-scratch |

## Process / security gates

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| P1 | **Proof-receipt tenant scoping** (#177) | Security | **LIVE** (401 verified; 403 needs T3) | `/api/proof-receipt` | `ProofReceiptController`; 401 confirmed 2026-07-21 |
| P2 | **Audit rate limiter** (#182) | Security | **LIVE** | `/api/audit/start` | verified 2026-07-21: 10× 400 then 11th → 429 |
| P3 | **Spec-parity CI gate** (#189) | Process | **LIVE** | PR Checks | `check-spec-parity.sh` — 22/22 self-test 2026-07-21 |
| P4 | **PR legibility gate + template + protocol v1.1** (#195 → #199 → #217) | Process | **LIVE** — was STRANDED | PR Checks (hard fail) + `.github/pull_request_template.md` | Updated 2026-07-23: **#199 re-landed it on trunk** after the inverted stacked-merge left it on `claude/pr-pipeline-protocol`. Verified on trunk: the five-section body check hard-fails in `.github/workflows/pr-checks.yml:58`, reading the body straight off the event so it fails in seconds before any install; `.github/pull_request_template.md` and `docs/pr-pipeline-protocol.md` both present. **#217** then added the `edited` trigger — before it, a job that reads only the PR body could never re-run after someone fixed the body, which stranded three PRs on 2026-07-22. |
| P5 | **PR-LOG.md** (generated ledger) | Visibility | **STALE** | repo root | `pr-log.sh` regenerates only on cron/manual; shows today's merges as "draft" until a run |
| P6 | **Validated master rubrics wired into agent prompts** (lattice loadout) | Output quality | **LIVE** (dev) | agent prompt assembly | Added 2026-07-23: **#213 merged** (lattice loadout, `src/agents/lattice/` → `loadAgentPrompt`), **#218 merged** (`e0790396a`) closed the hole where a wired-in framework could still be silently ignored, and completed the wiring recipe with the missing step — switching the call site, without which the next agent loads the base prompt only. |

---

_First created 2026-07-21. Update rule: every capability PR updates its row in the same PR (protocol v1.2). A row older than the code is a bug — fix it here._
