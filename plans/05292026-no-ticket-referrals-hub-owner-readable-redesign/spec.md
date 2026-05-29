# Referrals Hub — Owner-Readable Redesign (Layout, Contrast & Rename)

> **Spec #1 of 2.** This spec covers the **layout / contrast / rename** workstream only.
> The **post-parse AI validation gate** (garbage referral-source flagging + grounded suggestions + top-10 reference list) is **spec #2** — a separate backend build, intentionally out of scope here.

## Why
The Referrals Hub (`/pmsStatistics`) is an over-stacked flat scroll of 10 same-weight cards with no hierarchy, three copies of the doctor/self split, two charts of the same data, an "Executive Summary" that fails contrast, and the one genuinely actionable section ("Top actions to grow referrals") buried 9th below the fold. We just shipped the Local Rankings redesign (commit `d7fb5f34`) that solved the exact same problem — lead-with-meaning, demote detail behind clicks, plain-language labels, one cream hero + white detail cards. We port that proven recipe to make this page readable for a non-technical practice owner.

## What
A restructured `PmsDashboardSurface` that opens with a **plain-English meaning hero** (the renamed, contrast-fixed executive summary) and the **promoted "Best next actions"**, collapses redundant cards, moves secondary detail (full source ranking, monthly pace) behind **modals**, and migrates all cards to the Rankings token system (cream `#FCFAED` hero, `border-line-soft` white cards, `rounded-[14px]`, dot + `SectionTitle` + `InfoTip` headers, `CogitatingLoader`).

**Done when:** the page renders as one cream hero + actions + a small set of white detail cards with click-to-detail modals; `/rankings` is visually unchanged; `tsc`/lint clean; all four states (populated / empty / processing / wizard-demo) and the onboarding wizard steps still work.

## Context

### The page (verified routing — the brief's file reference is wrong)
- `/pmsStatistics` → `Dashboard.tsx:69` tab `"PMS Statistics"` → `Dashboard.tsx:343` renders **`PMSVisualPillars`** → **`PmsDashboardSurface.tsx`**. This is the target.
- `ReferralEngineDashboard.tsx` is a **separate legacy page** on `/referralEngine` (`Dashboard.tsx:381-382`). **Do not touch it** (out of scope — see Constraints). It fabricates trend/6-month data (`:434-490`) — never copy those fakes.
- The page is **LIGHT**: `PMSVisualPillars.tsx:1245` wraps everything in `pm-light min-h-screen bg-[var(--color-pm-bg-primary)]`; `.pm-light` (`index.css:380-397`) overrides `--color-pm-bg-primary` → `#F7F5F3`. The cream/line-soft port works on this surface — **not a dark-theme reskin**.

**Relevant files (target — `frontend/src/components/PMS/dashboard/`):**
- `PmsDashboardSurface.tsx` — the pure presenter we restructure. Props `PmsDashboardSurfaceProps = PmsDashboardData & { onJumpToIngestion, onOpenManualEntry, onOpenSettings }` (`:17-21`). Populated render order `:74-128`; empty/processing gates `:40-45,:59-61`. Note `doctorReferralCount` is in the contract but **unused** today (`:23-39`) — free for new cards.
- `PmsExecutiveSummary.tsx` — contrast fail: eyebrow `text-slate-400` (`:18-20`), bullets `text-slate-600` on `bg-slate-50` (`:33-37`); label "Executive Summary" / "What the data is saying" (`:18-23`). `slice(0,4)`.
- `PmsVitalsRow.tsx` — 4 stats; "Unique sources" = `sourceCount` (`:110-115`, surface passes `topSources.length` at `:80`); "Total referrals" doctor/self sub (`:104-106`).
- `PmsAttentionCards.tsx` — "Top source" (`:54-65`, dup of TopSources #1), "Data coverage", "Referral balance" (`:82-95`, dup doctor/self). All redundant.
- `PmsTopSourcesCard.tsx` — ranked-by-production list, header "{n} sources" (`:26-28`), `slice(0,8)`.
- `PmsReferralMixCard.tsx` — doctor/self split; **computes `doctorPct` from latest month** (`:17-18`) — disagrees with all-time prop (R1).
- `PmsProductionChart.tsx` — Recharts production + referrals lines, hover (the richer chart — keep).
- `PmsVelocityCard.tsx` — last-6 referral bars of the **same** `monthlyData`; carries `data-wizard-target="pms-velocity"` (`:20`).
- `PmsGrowthOpportunities.tsx` — dark navy, `top_three_fixes` already `slice(0,3)` (`:40`); buried 9th.
- `PmsIngestionCard.tsx` — bottom CTA, `id="data-ingestion-hub"` + `data-wizard-target="pms-upload"` (`:24`), three permission states.
- `PmsEmptyDashboardState.tsx` — empty branch; `id="data-ingestion-hub"` + `pms-upload` target + `isHighlighted` ring.
- `PmsDashboardHero.tsx` — eyebrow "Revenue Attribution" / H1 "Referral Intelligence" / conditional "Update data" CTA (`:24-42`).
- `PmsSectionHeader.tsx` — clean section-divider atom (title + rule + meta); used once today.
- `PmsProcessingStatusCard.tsx` — stateful typewriter banner; **do not break its timer**.
- `PmsTrendPill.tsx` — up/down/flat % pill (keep).
- `types.ts` — `PmsDashboardData`, `PmsDashboardMonth`.
- `PMSVisualPillars.tsx` — container (data source). `scrollToIngestionHub` (`:1090`). Holds a **hand-copied `CogitatingText` (`:57-97`) + loader (`:1116-1131`)** duplicating the shared loader.

**Relevant files (source of the recipe — to extract/reuse):**
- `frontend/src/components/dashboard/rankings/RankingMeaningCard.tsx` — cream hero (`#FCFAED`/`#EDE5C0`, `:24`); all-`ReactNode` slot API; one hardcoded label "Local Search Score" (`:42`).
- `frontend/src/components/dashboard/rankings/RankingDetailsModal.tsx` — framer modal; props `{ open, title, eyebrow, children, onClose }`; **hardcoded aria id** `ranking-details-modal-title` (`:37,:51`), no Escape/focus-trap.
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — holds **PRIVATE** `SectionTitle` (`:1067`, 6 sites: `:976,1323,1544,1750,1832,1906`) and `InfoTip` (`:1080`, 7 sites: `:979,1324,1545,1751,1774,1833,1907`). Also private ranking-specific `normalizeNarrativeScoreText`/`getOverviewFallbackInsight` (`:1438-1484`) — **not reusable**.
- `frontend/src/components/ui/CogitatingLoader.tsx` — already shared (`export`). `bg-[#F7F5F3]`.
- `frontend/src/components/dashboard/focus/HighlightedText.tsx` — pure default export used by `MeaningHero`.
- `frontend/src/components/dashboard/gbp-automation/GbpEngagementInfoTip.tsx` — a live duplicate of `InfoTip` to fold into the shared one.
- `frontend/src/index.css` — tokens: `--color-cream #FCFAED` (`:260`), `--color-cream-line #EDE5C0` (`:261`), `--color-line-soft` (`:262`), `.pm-light` light vars `--color-pm-text-secondary #7A746D` (`:389`, the accessible eyebrow color), `.shadow-premium` (`:31`), `--font-display` Fraunces (`:273`).

**Reference file:** `plans/05272026-no-ticket-local-rankings-owner-readable-redesign/spec.md` and `RankingMeaningCard.tsx` / `RankingDetailsModal.tsx` — the closest analog for structure, tokens, and the "lead-with-meaning + demote-behind-modal" pattern. New PMS cards match these.

**Patterns to follow:**
- Lead-with-meaning cream hero (`RankingMeaningCard.tsx`).
- Demote-not-delete behind a modal (`RankingDetailsModal.tsx` + `embedded`-style nested panels).
- Card-header primitive: dot + `SectionTitle` + `(i)` `InfoTip` (`RankingsDashboard.tsx:1067-1128`).
- Cream-hero / white-detail surfaces; accessible eyebrows via `--color-pm-text-secondary`, not `slate-400`.

## Constraints

**Must:**
- All new data comes from the **existing** `PmsDashboardData` contract already reaching the surface — **no new container wiring, no new backend calls** (mirror the Rankings redesign, which added zero).
- Preserve scroll/wizard hooks verbatim: `id="data-ingestion-hub"` (`scrollToIngestionHub` at `PMSVisualPillars.tsx:1090`) and every `data-wizard-target` (`pms-vitals`, `pms-insights`, `pms-velocity`, `pms-upload`) reachable for `wizardConfig.ts`.
- Preserve `PmsIngestionCard` three-state permission logic and `PmsEmptyDashboardState` behavior — keep both empty and populated branches working.
- Keep `PmsProcessingStatusCard`'s typewriter timer intact.
- Generalized shared primitives must be drop-in for `/rankings` — extraction is mechanical; `/rankings` renders identically after.

**Must not:**
- Touch `ReferralEngineDashboard.tsx` / `/referralEngine` (separate legacy page; retirement is a deferred product decision).
- Add new dependencies.
- Lift the ranking-specific copy processors (`normalizeNarrativeScoreText`, `getOverviewFallbackInsight`) — PMS gets its own.
- Invent a 0-100 "referral score" just to reuse the gauge (no such concept exists here). The hero's score slot shows a headline figure, not a gauge.
- Do any Rankings refactor beyond the primitive extraction these tasks require.

**Out of scope:**
- The AI validation gate, garbage-source flagging, top-10 reference list (spec #2).
- `/referralEngine` retirement.
- Any change to PMS data derivation in `PMSVisualPillars` beyond the optional `CogitatingLoader` dedup (T1).

## Risk

**Level:** 3 (cross-file primitive extraction touching the live `/rankings` page; otherwise presenter-only Level 2).

**Risks identified:**
- **R1 — doctor/self number disagreement (L2).** `PmsReferralMixCard` computes the split from the latest month (`:17-18`); `VitalsRow`/`AttentionCards` use the all-time `doctorPercentage` prop. Deduping changes the displayed number. → **Mitigation (recommended):** make `ReferralMixCard` consume the all-time `doctorPercentage` prop as the single source of truth and label the period explicitly. *Dave to confirm all-time vs latest-month during review/execution.*
- **R2 — `pms-velocity` wizard target (L2).** Moving Velocity into a modal can break the wizard step. → **Mitigation:** mount `data-wizard-target="pms-velocity"` on the modal trigger button; verify the onboarding step highlights correctly. If infeasible, update `wizardConfig.ts`.
- **R3 — primitive extraction blast radius on `/rankings` (L3).** `SectionTitle` (6 sites) + `InfoTip` (7 sites) leave the monolith; `Info` icon import (`RankingsDashboard.tsx:12`) becomes unused; `MeaningHero` (1 site), `DetailsModal` (2 sites) repoint. → **Mitigation:** swap every site in one task, delete the dead import, `tsc` + Playwright visual pass on `/rankings` before integrating PMS.
- **R4 — shared modal a11y / multi-instance id (L2).** Hardcoded aria id is already shared by 2 instances on `/rankings` (latent bug); no Escape/focus-trap; PMS adds 2 more instances. → **Mitigation:** generalize `DetailsModal` with `useId()`-derived id + Escape-to-close during T1.
- **R5 — empty hero insight (L1).** `referralData.executive_summary` can be empty/processing; the hero lead must never be blank. → **Mitigation:** write a PMS `getReferralFallbackInsight()` (deterministic, from `doctorPercentage`/`topSources`/`totalProduction`), analogous to `getOverviewFallbackInsight`.
- **R6 — dark-navy GrowthOpportunities treatment (L1).** Keep as a deliberate single accent vs restyle to cream/line-soft. → **Mitigation:** keep ONE dark accent for hierarchy; align radius to `rounded-[14px]`, fix the `white/45` eyebrow.

**Blast radius (consumers of files being modified):**
- `RankingsDashboard.tsx` (SectionTitle/InfoTip/MeaningHero/DetailsModal) — consumed only by itself + `pages/Dashboard.tsx:159` (CogitatingLoader). `GbpEngagementInfoTip.tsx` + `GbpEngagementSummaryCard.tsx` are the only external InfoTip-adjacent consumers. Verified: no other file imports the rankings primitives.
- `PmsDashboardSurface` + child cards — consumed only by `PMSVisualPillars`. Container untouched.
- `wizardConfig.ts` — depends on `data-wizard-target` attributes (R2).

**Pushback:** None blocking. The big forks (scope split, modal drill-in, legacy out-of-scope, I draft top-10 in spec #2) were decided with Dave. R1 is the one item that changes a user-visible number — flagged for his confirm, defaulting to all-time.

## Tasks

### T1: Extract shared dashboard primitives (foundation)
**Do:** Create `frontend/src/components/dashboard/shared/`:
- `SectionTitle.tsx` (lift verbatim from `RankingsDashboard.tsx:1067-1073`, export).
- `InfoTip.tsx` (lift verbatim from `:1080-1128`, export).
- `MeaningHero.tsx` (generalize `RankingMeaningCard`: add `scoreLabel?: string` default `"Local Search Score"`; keep cream; import `HighlightedText` from `../focus/HighlightedText`).
- `DetailsModal.tsx` (generalize `RankingDetailsModal`: replace hardcoded aria id with `useId()`; add Escape-to-close; keep `{ open, title, eyebrow, children, onClose }`).
Then update `RankingsDashboard.tsx`: delete local `SectionTitle`/`InfoTip`, import from `shared/`, repoint all 13 sites; repoint `RankingMeaningCard`→`MeaningHero` (`:1982`) and `RankingDetailsModal`→`DetailsModal` (`:2005,:2016`); remove now-unused `Info` import (`:12`). Refactor `GbpEngagementInfoTip.tsx` to wrap shared `InfoTip`. Optionally replace `PMSVisualPillars` inline `CogitatingText`/loader (`:57-97,:1116-1131`) with shared `CogitatingLoader`.
**Files:** `dashboard/shared/{SectionTitle,InfoTip,MeaningHero,DetailsModal}.tsx`, `RankingsDashboard.tsx`, `gbp-automation/GbpEngagementInfoTip.tsx`, (opt) `PMSVisualPillars.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`; Playwright visual pass on `/rankings` — score-details + gaps modals open/close (incl. Escape), tooltips and section titles render identically.

### T2: PMS card primitives + token base
**Do:** Create `frontend/src/components/PMS/dashboard/primitives.tsx`: `PmsCardShell` (`rounded-[14px] border border-line-soft bg-white shadow-premium`, optional `eyebrow`/`title`/`action`/`highlighted`/`padding`), `PmsEyebrow` (accessible `text-[color:var(--color-pm-text-secondary)]`, replaces every `text-slate-400` eyebrow). Move `PmsTrendPill` here. No call-site changes yet.
**Files:** `PMS/dashboard/primitives.tsx`, `PMS/dashboard/PmsTrendPill.tsx`
**Depends on:** none (parallel with T1)
**Verify:** `npx tsc --noEmit`; imports resolve.

### T3: Referral Meaning Hero (promote + rename + fix contrast)
**Do:** Create `PMS/dashboard/referralInsightCopy.ts`: `getReferralFallbackInsight(data)` + a light copy normalizer. Rebuild `PmsExecutiveSummary` to compose shared `MeaningHero` (cream): left = insight prose from `referralData.executive_summary` (or fallback), right = a **headline figure** node (`totalProduction` or `totalReferrals`, not a gauge) with `scoreLabel`/tooltip, plus `estimateSummary`. Rename away from "Executive Summary"/"What the data is saying" → owner language (e.g. "What your referrals are telling you"). Contrast: navy ink on cream/white tiles. Keep `slice(0,4)` + processing/empty states.
**Files:** `PMS/dashboard/PmsExecutiveSummary.tsx`, `PMS/dashboard/referralInsightCopy.ts`
**Depends on:** T1 (MeaningHero), T2 (eyebrow)
**Verify:** `tsc`; renders with real, empty, and processing `executive_summary`.

### T4: Sources consolidation + "See all sources" modal
**Do:** `PmsTopSourcesCard` becomes the canonical sources surface: landing shows count + top 3 by production + "See all sources" → shared `DetailsModal` with the full ranked-by-production breakdown (move current `slice(0,8)` list into the modal). Receive the merged sources count into the header. Restyle to `PmsCardShell`/`PmsEyebrow`. Remove the "Unique sources" tile from `PmsVitalsRow` (`:110-115`).
**Files:** `PMS/dashboard/PmsTopSourcesCard.tsx`, `PMS/dashboard/PmsVitalsRow.tsx`
**Depends on:** T1 (DetailsModal), T2
**Verify:** `tsc`; count matches modal list length; modal opens/closes (Escape).

### T5: Chart dedup — keep Production Trend, demote Velocity behind a modal
**Do:** Keep `PmsProductionChart` as the one primary monthly chart; restyle. Add a "View monthly pace" trigger → shared `DetailsModal` rendering `PmsVelocityCard`'s content. Convert `PmsVelocityCard` body into modal content. **Mount `data-wizard-target="pms-velocity"` on the trigger** so the wizard step survives (R2).
**Files:** `PMS/dashboard/PmsProductionChart.tsx`, `PMS/dashboard/PmsVelocityCard.tsx`
**Depends on:** T1 (DetailsModal), T2
**Verify:** `tsc`; wizard `pms-velocity` step still highlights; modal shows pace.

### T6: Dedupe doctor/self + remove AttentionCards
**Do:** Delete `PmsAttentionCards` (Top source = TopSources #1; Referral balance = 3rd doctor/self copy; Data coverage → fold into a header meta if wanted). Make `PmsReferralMixCard` the single doctor/self visual; **switch it to the all-time `doctorPercentage` prop** (R1) and label the period. Trim `PmsVitalsRow` to non-duplicative stats (Production this month / Total referrals / YTD production); restyle to `PmsCardShell`. Remove the `PmsAttentionCards` import/usage from the surface.
**Files:** `PMS/dashboard/PmsReferralMixCard.tsx`, `PMS/dashboard/PmsVitalsRow.tsx`, `PMS/dashboard/PmsAttentionCards.tsx` (delete), `PmsDashboardSurface.tsx` (remove usage)
**Depends on:** T2
**Verify:** `tsc`; doctor/self appears once; number is consistent (all-time).

### T7: Promote Best-next-actions + consolidate ingestion CTA
**Do:** Restyle `PmsGrowthOpportunities` (keep one dark accent, align radius, fix `white/45` eyebrow); it moves up in T8. Consolidate ingestion: make the Hero "Update data" the single primary CTA; restyle `PmsIngestionCard` (keep `id`, `data-wizard-target`, three permission states) as the canonical full ingestion surface lower on the page; restyle `PmsEmptyDashboardState` to the new tokens (keep `id`, wizard target, `isHighlighted` ring).
**Files:** `PMS/dashboard/PmsGrowthOpportunities.tsx`, `PMS/dashboard/PmsIngestionCard.tsx`, `PMS/dashboard/PmsEmptyDashboardState.tsx`, `PMS/dashboard/PmsDashboardHero.tsx`
**Depends on:** T2
**Verify:** `tsc`; one upload CTA path; permission + empty + highlight states intact.

### T8: Restructure PmsDashboardSurface layout (integration)
**Do:** Rewrite the populated branch (`:74-128`) into the new hierarchy: Hero → `[ProcessingStatusCard]` → **Meaning Hero** → **Best next actions** (GrowthOpportunities) → `SectionHeader("Your referral numbers")` → trimmed Vitals → grid `[Production Trend | Referral Mix]` → **Top Sources** → `SectionHeader("Update your data")` → Ingestion. Use `doctorReferralCount` where helpful. Keep the empty/processing gates (`:40-45,:59-61`). Use `PmsSectionHeader` for multiple sections. Ensure the `max-w-[1320px] pm-light` wrapper and motion stay.
**Files:** `PMS/dashboard/PmsDashboardSurface.tsx`
**Depends on:** T3, T4, T5, T6, T7
**Verify:** `tsc`; visual pass on `/pmsStatistics`.

### T9: Full verification
**Do:** `npx tsc --noEmit`, lint, and Playwright visual passes.
**Files:** —
**Depends on:** T8
**Verify:** populated / empty / processing / wizard-demo states on `/pmsStatistics`; onboarding wizard steps (`pms-vitals`, `pms-insights` gone or relocated, `pms-velocity`, `pms-upload`); `/rankings` regression unchanged.

## Done
- [ ] `npx tsc --noEmit` — zero new errors
- [ ] `npm run lint` (frontend) — no new failures
- [ ] `/pmsStatistics` renders as cream meaning-hero + best-actions + white detail cards; no flat 10-card scroll
- [ ] Doctor/self split shown **once**, single consistent number (R1 resolved)
- [ ] Sources count + top 3 on landing; "See all sources" opens full ranked modal
- [ ] Production Trend on landing; Velocity reachable via modal; `pms-velocity` wizard step works (R2)
- [ ] Executive-summary section renamed + contrast fixed (navy ink, no `slate-400`/`slate-600`-on-`slate-50`)
- [ ] Best-next-actions promoted above the fold
- [ ] Single ingestion CTA path; `id="data-ingestion-hub"` + all `data-wizard-target`s preserved; permission + empty + highlight states intact
- [ ] Hero insight never blank (fallback works) — R5
- [ ] `DetailsModal` closes via backdrop + X + Escape; unique aria ids (R4)
- [ ] Manual: `/rankings` visually unchanged after primitive extraction (R3)
- [ ] No regressions on the legacy `/referralEngine` page (untouched)
