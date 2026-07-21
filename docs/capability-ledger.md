# Alloro Capability Ledger

**The single source of truth for what is built, what is wired, and what moves which number.** One row per capability. If you want to know "is X real yet?", this file answers it in 30 seconds — and if it can't, that's a bug in this file.

## Two rules keep this alive (without them it becomes stale like everything before it)
1. **Grounded, not asserted.** Every State cell is checked against the code and dated. A claim we can't verify is marked `UNVERIFIED`, never guessed.
2. **Self-maintaining via the PR flow.** No capability PR merges until its ledger row is updated — this is the enforcement half of protocol v1.2 (the PR "metric line"). Without that rule, this file dies in a month.

## This replaces
- `plans/07142026-alloro-funnel-engine/build-checklist.md`, `funnel-feature-sequence.md`, and the chat "coverage-map" artifacts — **retired; point here instead.**
- The **overwatch register** does NOT move here — it lives in **Notion** (cross-team open issues, not capability state). Do not recreate a repo mirror.
- The **roadmap** (`docs/roadmap-impressions.md`) stays — it's the forward plan and points at these rows. The **risk register** stays private (`~/alloro-private/`).

**State legend:** `LIVE` = live & wired · `BUILT–NOT-WIRED` = code exists, nothing calls it · `FROM-SCRATCH` = not built · `GATED-OFF` = built, master switch default-off · `SHIPPED–VERIFY` = shipped, confirm it still runs · `BLOCKED` = live but blocked upstream · `DEFECT` = built wrong · `STRANDED` = merged to the wrong branch, not on trunk.

**Verified against `dev/dave` @ `66f1bf7af`, 2026-07-21.**

---

## Honesty / instrument (fix first — a lying gauge is worse than a missing one)

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| H1 | **Multi-location rank display shows one location as the whole story, omitting the rest** | Trust | **DEFECT** | Client Local Rankings / "#1 locally" card | Verified 2026-07-21: org 39 shows Falls Church #1 of 11 to the client and omits its other four locations. The defect is the **omission** (5 summarized as 1) — same class as a false healthy verdict — and stands regardless of a hidden location's rank. NB: one omitted location, Woodbridge, is **brand-new**, so its #11 of 11 is the expected from-zero start, not a problem. |
| H2 | **Rank display shows every location, incl. the worst** *(the fix for H1)* | Trust | **FROM-SCRATCH** | Local Rankings | Honest-narrator rule; not built |
| H3 | **Named-competitor visibility for the operator** (who are they, where does a named rival rank) | Trust | **GAP** | admin practice-ranking shows counts/ranks (`#N of 11`) but **no names** | Dominion-by-name unresolved → Dave DB query (Woodbridge set) |

## Get Found — impressions

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| GF1 | **Impressions gauge** (Google Visibility) | Impressions | **BLOCKED** — reads 0 (zero-Maps) | Patient Journey Insights | `service.daily-agent-processor` / `dateHelpers`; #192 diagnostic merged; Dave's DB query + offset fix pending |
| GF2 | **GBP primary category** (specialty, most-specific) — strongest lever | Impressions | **BUILT–NOT-WIRED** | (would be) GBP Automation | `gbpCategoryTaxonomy.ts` (#193) imported only by its own services; no running caller |
| GF3 | **GBP completeness fill — website URL** | Impressions (≈no-op) | **LIVE** | GBP Automation drafts | `gbpCompletenessFill.ts:106` — only field it fills; profiles already have websites |
| GF4 | **GBP completeness fill — phone / hours** | Impressions | **FROM-SCRATCH** | — | `gbpCompletenessFill.ts:115` empty stubs; comment L20 "no-value-source" |
| GF5 | **GBP business-info write-back (A6)** — the publish path | Impressions (when fed) | **GATED-OFF** | GBP Automation approvals | `gbpBusinessInfo.ts`; migration `20260716000000` `business_info_writeback_enabled defaultTo(false)` |
| GF6 | **NAP consistency read** (floor / hygiene, not a climb lever) | — (table-stakes) | **LIVE** | GBP / NAP surface | nap-consistency controller (#187 merged) |
| GF7 | **Organic content — GSC→content loop (A1)** | Impressions (organic) | **SHIPPED–VERIFY** | new/updated site pages | `util.keyword-selection.ts:11` "A1's shipped GSC→content loop" + `service.gsc-performance` + `dataHarvest` worker; confirm schedule on |
| GF8 | **AEO — FAQ / schema (JSON-LD) on hosted pages** | AI-answer visibility | **PARTLY BUILT** | hosted pages / site audit | detect: `service.website-audit.ts hasFaqSchema`; insert+verify: `admin-websites/util.ai-command-verify.ts` |

## Get Considered — CTR

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| GC1 | **Page title / meta description edits** on Alloro-hosted sites | CTR | **MACHINERY EXISTS, flow FROM-SCRATCH** | Google search result snippet | `website_builder.pages.meta_title/meta_description/seo_data` (migration `20260308000001`); draft-and-approve flow not built; **which clients are hosted = `/admin/websites` roster (confirm)** |

## Get Chosen / prominence

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| CH1 | **Review REPLIES** (respond to existing reviews) | Prominence | **LIVE** | Reviews & Posts | `GbpReviewReplyService` + siblings (merged) |
| CH2 | **Review REQUESTS / velocity** (get more, fresher reviews) — top competitive lever | Prominence → impressions | **GREENFIELD, Sikka-gated** | — | none built; substrate = Sikka ([[project_sikka_integration]]); sandbox free-to-start, paid trigger = cash |
| CH3 | **Form-submission confirmation email** (lead reassurance) | Submissions (trust) | **FROM-SCRATCH** | hosted lead forms | none — verified missing on Alloro's own site (M6) |

## Send infrastructure

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| S1 | **Email (Mailgun)** | — | **LIVE** (prod only; non-prod intercept) | Email Logs | `src/emails/transport/mailgunTransport.ts`; hotfix merged main+dev |
| S2 | **SMS** | — | **FROM-SCRATCH** | — | zero providers across all branches |

## Process / security gates

| # | Capability | Moves | State | Where you see it | Lives (receipt) |
|---|---|---|---|---|---|
| P1 | **Proof-receipt tenant scoping** (#177) | Security | **LIVE** (401 verified; 403 needs T3) | `/api/proof-receipt` | `ProofReceiptController`; 401 confirmed 2026-07-21 |
| P2 | **Audit rate limiter** (#182) | Security | **LIVE** | `/api/audit/start` | verified 2026-07-21: 10× 400 then 11th → 429 |
| P3 | **Spec-parity CI gate** (#189) | Process | **LIVE** | PR Checks | `check-spec-parity.sh` — 22/22 self-test 2026-07-21 |
| P4 | **PR legibility gate + template + protocol v1.1** (#195) | Process | **STRANDED** — not on dev/dave | — | inverted stacked-merge; on `claude/pr-pipeline-protocol`; **#199 re-lands** |
| P5 | **PR-LOG.md** (generated ledger) | Visibility | **STALE** | repo root | `pr-log.sh` regenerates only on cron/manual; shows today's merges as "draft" until a run |

---

_First created 2026-07-21. Update rule: every capability PR updates its row in the same PR (protocol v1.2). A row older than the code is a bug — fix it here._
