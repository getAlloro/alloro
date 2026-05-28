# Referrals Hub Layout Redesign

## Why
The `/pmsStatistics` page reads like a data dump — 10+ sections stacked with no narrative hierarchy. The local rankings page proved that a "meaning card → actions → detail behind modals" pattern makes complex data pages intuitive and scannable. Applying the same pattern here turns the referrals hub from a wall of charts into a story: here's what matters, here's what to do, click for evidence.

## What
Restructure the PMS dashboard surface to follow the Rankings redesign pattern: a hero meaning card with key metrics and AI insight, growth opportunities promoted to second position, and detail content (top sources, charts, velocity) moved behind expandable modal views. Rename "Executive Summary" to a plain label with white background. No new API endpoints — pure frontend layout reshuffling of existing components.

Done when: the landing view shows the meaning card + growth opportunities + summary cards that expand to detail, matching the visual hierarchy of the local rankings page.

## Context

**Relevant files:**
- `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx` — layout composition, the main file being restructured
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — orchestrator, passes data down; light touch for prop threading
- `frontend/src/components/PMS/dashboard/PmsExecutiveSummary.tsx` — being absorbed into the meaning card
- `frontend/src/components/PMS/dashboard/PmsVitalsRow.tsx` — metrics moving into the meaning card inline display
- `frontend/src/components/PMS/dashboard/PmsAttentionCards.tsx` — being absorbed into the meaning card
- `frontend/src/components/PMS/dashboard/PmsTopSourcesCard.tsx` — moving behind a modal
- `frontend/src/components/PMS/dashboard/PmsProductionChart.tsx` — moving behind a modal
- `frontend/src/components/PMS/dashboard/PmsReferralMixCard.tsx` — moving behind a modal
- `frontend/src/components/PMS/dashboard/PmsVelocityCard.tsx` — moving behind a modal
- `frontend/src/components/PMS/dashboard/PmsGrowthOpportunities.tsx` — promoted higher in layout
- `frontend/src/components/dashboard/rankings/RankingDetailsModal.tsx` — reused for expand-to-detail
- `frontend/src/components/dashboard/rankings/RankingMeaningCard.tsx` — reference analog for hero card structure

**Patterns to follow:**
- Hero meaning card: warm background (`bg-[#FCFAED]`, `border-[#EDE5C0]`), AI insight sentence + key metrics + CTA buttons (see `RankingMeaningCard.tsx`)
- Card → modal expand: `RankingDetailsModal` with eyebrow + title + scrollable content
- Section headers: colored dot + `SectionTitle` (Fraunces) + `InfoTip` (see `RankingsDashboard.tsx:1067`)
- Card shell: `shadow-premium` + `rounded-[14px]` + `border-line-soft`
- Eyebrow labels: `font-mono-display text-[10px] font-bold uppercase tracking-[0.18em]`
- NextMoves card grid for actionable items (see `RankingsDashboard.tsx:1818`)

**Reference file:** `frontend/src/components/dashboard/RankingsDashboard.tsx` — the `PerformanceDashboard` function (line 1947) is the closest structural analog for how the PMS surface should compose.

## Constraints

**Must:**
- Reuse `RankingDetailsModal` from `rankings/` — do not create a PMS-specific modal
- Keep all existing data visible (nothing lost, just reorganized behind clicks)
- Preserve `isProcessingInsights` and `isWizardActive` behavior in all new/modified components
- Preserve `data-wizard-target` attributes for onboarding tour targeting
- Match the rankings page visual language (warm hero, white detail cards, mono eyebrows)
- Keep PmsIngestionCard at the bottom (unchanged)
- Keep PmsProcessingStatusCard conditional display (unchanged)
- Keep PmsEmptyDashboardState unified empty state (unchanged)

**Must not:**
- Add new API endpoints or backend changes
- Modify individual card component internals (TopSources, charts, velocity) — only re-slot them
- Touch PMSVisualPillars data fetching or state management beyond minimal prop threading
- Create new shared abstractions (no "GenericMeaningCard" — PMS gets its own concrete component)

**Out of scope:**
- AI validation gate (separate plan)
- Referral source reference list research
- ReferralEngineDashboard consolidation
- Mobile-specific breakpoint overhaul
- New chart types or data transformations

## Risk

**Level:** 2

**Risks identified:**
- Key metrics currently visible on the landing view (production chart, top sources table) will be hidden behind modals — users lose at-a-glance detail → **Mitigation:** The hero meaning card surfaces the 4 vital metrics inline (production this month, total referrals, doctor %, unique sources), plus the AI insight sentence. The modal CTAs are clearly labeled so users know detail is one click away.
- Wizard demo mode (`isWizardActive`) touches every conditional in the surface — layout changes could break the onboarding tour → **Mitigation:** T1 preserves all `data-wizard-target` attributes. T5 includes explicit wizard-mode verification.
- Importing `RankingDetailsModal` from `rankings/` creates a cross-feature dependency → **Mitigation:** The modal is a pure presentational component (props: open, title, eyebrow, children, onClose) with zero rankings-specific logic. Acceptable coupling — if it later needs to move to a shared directory, that's a one-file move.

**Blast radius:** Changes are contained to `frontend/src/components/PMS/dashboard/`. The only cross-directory import is `RankingDetailsModal` from `rankings/`. No backend files touched. No routes changed. No API contracts modified.

**Pushback:** None. This is a straightforward application of a proven pattern.

## Tasks

### T1: Build `PmsReferralsMeaningCard`
**Do:** Create a new component that combines the function of PmsVitalsRow, PmsAttentionCards, and PmsExecutiveSummary into a single hero card following the `RankingMeaningCard` layout pattern:
- Warm background (`bg-[#FCFAED]`, `border-[#EDE5C0]`) matching Rankings hero
- Left column: AI insight sentence from `referralData?.executive_summary` (first bullet, rendered large in Fraunces). Below it, a white inset card with key metrics: production this month (with trend pill), total referrals (with doctor/self breakdown), unique sources count, YTD production
- Right column: top referral source highlight (name + referral count + % of production) in a white inset card. Below it, two CTA buttons: "See all sources ranked" and "View referral trends" — these will open modals (wired in T3)
- Rename the insight section label from "Executive Summary" to "What the data says" with a `Sparkles` icon
- Accept all props currently spread across PmsVitalsRow + PmsAttentionCards + PmsExecutiveSummary
- Preserve `isProcessingInsights` skeleton/placeholder states
- Preserve `data-wizard-target="pms-vitals"` on the outer element
**Files:** `frontend/src/components/PMS/dashboard/PmsReferralsMeaningCard.tsx` (new)
**Depends on:** none
**Verify:** Manual: component renders with mock data matching the Rankings hero layout

### T2: Promote Growth Opportunities
**Do:** Restyle `PmsGrowthOpportunities` to match the `NextMoves` pattern from Rankings — horizontal 3-column card grid on white background with numbered priority badges, instead of the current dark navy full-bleed section. Keep the existing data source (`referralData?.growth_opportunity_summary?.top_three_fixes`). Apply:
- White card with `shadow-premium` + `rounded-[14px]` + `border-line-soft`
- Section header: orange dot + "Best next actions" (SectionTitle) + InfoTip + "N actions" count
- Each opportunity: numbered orange circle badge + title + description + impact line (green)
- Replace the dark navy background with the standard white card pattern
**Files:** `frontend/src/components/PMS/dashboard/PmsGrowthOpportunities.tsx` (modify)
**Depends on:** none
**Verify:** Manual: growth opportunities render as a white card grid matching Rankings NextMoves style

### T3: Wire detail modals in Surface
**Do:** Restructure `PmsDashboardSurface` to compose the new layout:
1. Replace PmsVitalsRow + PmsAttentionCards + PmsExecutiveSummary with `PmsReferralsMeaningCard`
2. Move PmsGrowthOpportunities to directly below the meaning card
3. Remove the two grid sections (ProductionChart + ReferralMix, TopSources + Velocity) from the surface
4. Add three `RankingDetailsModal` instances managed by a `detailModal` state (`"sources" | "trends" | null`):
   - "Sources" modal: contains `PmsTopSourcesCard` (eyebrow: "Referral Sources", title: "All sources ranked by production")
   - "Trends" modal: contains `PmsProductionChart` + `PmsReferralMixCard` + `PmsVelocityCard` stacked vertically with `space-y-5` (eyebrow: "Referral Trends", title: "Production and referral patterns")
5. Wire the meaning card CTA buttons to open these modals
6. Keep PmsSectionHeader removed (the meaning card replaces it)
7. Keep PmsIngestionCard at bottom, unchanged

New section order:
```
PmsDashboardHero
PmsProcessingStatusCard (conditional)
PmsEmptyDashboardState | {
  PmsReferralsMeaningCard
  PmsGrowthOpportunities
  PmsIngestionCard
}
RankingDetailsModal × 2 (sources, trends)
```
**Files:** `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx` (modify)
**Depends on:** T1, T2
**Verify:** Manual: landing view shows meaning card + growth opportunities + ingestion. Clicking CTAs opens modals with full detail content.

### T4: Thread props from orchestrator
**Do:** Update `PMSVisualPillars` to pass any additional props needed by `PmsReferralsMeaningCard` through `PmsDashboardSurface`. The meaning card needs the union of props from PmsVitalsRow + PmsAttentionCards + PmsExecutiveSummary — verify all are already threaded via `PmsDashboardData`. If any are missing from the `PmsDashboardSurfaceProps` type, add them. Remove unused imports for components that are no longer directly rendered by the surface (PmsVitalsRow, PmsAttentionCards, PmsExecutiveSummary, PmsSectionHeader).
**Files:** `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx` (modify — imports/types), `frontend/src/components/PMS/dashboard/types.ts` (modify if needed)
**Depends on:** T3
**Verify:** `npx tsc --noEmit` — zero errors from these changes

### T5: Verify wizard mode and edge states
**Do:** Manually verify:
- `isWizardActive` demo data renders correctly in the new layout (meaning card populates, modals open with demo content)
- `isProcessingInsights` shows placeholder states in meaning card
- Empty state (`shouldShowUnifiedEmptyState`) still renders `PmsEmptyDashboardState`
- Processing status card still appears conditionally
- All `data-wizard-target` attributes are preserved on the correct elements
Fix any issues found.
**Files:** any files from T1-T4 as needed
**Depends on:** T4
**Verify:** Manual: wizard mode tour targets still highlight correctly; processing and empty states behave as before

## Done
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Landing view shows: meaning card (insight + metrics + CTAs) → growth opportunities → ingestion card
- [ ] "See all sources ranked" CTA opens modal with TopSources table
- [ ] "View referral trends" CTA opens modal with production chart + referral mix + velocity
- [ ] Growth opportunities display as white card grid with numbered priority badges
- [ ] No "Executive Summary" label visible — replaced with "What the data says"
- [ ] `isWizardActive` demo mode renders correctly
- [ ] `isProcessingInsights` shows placeholder states
- [ ] Empty state (`PmsEmptyDashboardState`) unchanged
- [ ] No regressions in PMS processing status card display
