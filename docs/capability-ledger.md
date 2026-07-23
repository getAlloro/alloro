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
