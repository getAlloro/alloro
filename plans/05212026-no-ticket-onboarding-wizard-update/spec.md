# Onboarding Wizard — Full Product Tour Update

## Why
The dashboard was redesigned to the Focus layout, new pages were added (Websites, Support, Patient Journey, Referral Engine, Settings sub-tabs), and multiple components were created/removed/renamed. The wizard's 23-step config points at orphaned targets and misses half the product. Users completing onboarding see a broken or incomplete tour.

## What
Rewrite the onboarding wizard to cover all 11 app pages with 33 guided steps, full mock/demo data, and accurate spotlight targets. Re-enable the wizard so new users get a working full-product tour on first load.

## Context

**Relevant files:**
- `frontend/src/components/onboarding-wizard/wizardConfig.ts` — step definitions, demo data, page types/routes
- `frontend/src/contexts/OnboardingWizardContext.tsx` — wizard state, navigation, enable/disable logic
- `frontend/src/components/onboarding-wizard/WizardController.tsx` — renders overlay + tooltip
- `frontend/src/components/onboarding-wizard/SpotlightOverlay.tsx` — element highlighting via `[data-wizard-target]`
- `frontend/src/components/onboarding-wizard/WizardTooltip.tsx` — tooltip with nav buttons
- `frontend/src/components/onboarding-wizard/WelcomeModal.tsx` — intro modal
- `frontend/src/components/Sidebar.tsx` — nav locked during wizard, conditional "Websites" item
- `frontend/src/pages/Dashboard.tsx` — tab management, routes for PMS/Rankings/Tasks/PatientJourney
- `frontend/src/App.tsx` — route definitions (needs `/referralEngine` added)

**Scout document:** `plans/05172026-no-ticket-onboarding-wizard-update/scout.md` — full component inventory per page

**Patterns to follow:**
- Existing `data-wizard-target` attribute pattern on elements
- Existing `useIsWizardActive()` / `useWizardDemoData()` hook pattern in `RankingsDashboard.tsx` and `PMSVisualPillars.tsx`

**Reference file:** `frontend/src/components/dashboard/RankingsDashboard.tsx` — closest analog for how a page consumes wizard demo data

## Constraints

**Must:**
- All 33 wizard steps must have working spotlight targets
- Every page must render meaningful content during wizard (full demo data, no empty/skeleton states)
- Websites page must render with demo data even if org has no website project
- Sidebar must show all nav items during wizard (including Websites)
- Wizard must auto-navigate between all 11 pages in the correct order
- `/referralEngine` route must be added to App.tsx

**Must not:**
- No backend changes — wizard status is already a boolean flag, that's sufficient
- No modifications to WelcomeModal design
- No mobile-specific wizard changes
- Don't refactor existing component APIs — add wizard hooks alongside existing data paths

**Out of scope:**
- Per-step persistence (resuming mid-tour)
- Section-based progress indicator
- Mobile layout adjustments for wizard
- Redesigning tooltip/overlay visuals

## Risk

**Level:** 2 (Concern)

**Risks identified:**
- Large demo data surface area (11 pages need mock data injection) → **Mitigation:** page-by-page tasks with visual verification per page
- Websites page requires project to exist → **Mitigation:** inject demo project/pages when wizard active, force sidebar nav visibility
- WizardPage type expansion from 5→11 → **Mitigation:** single-file change in wizardConfig.ts
- 33 steps may feel long → **Mitigation:** skip button exists; section progress is future enhancement

**Blast radius:**
- `wizardConfig.ts` — consumed by context, controller, overlay, tooltip
- `OnboardingWizardContext.tsx` — consumed by every page that checks `isWizardActive`
- `Sidebar.tsx` — consumed by the app layout
- Individual page components — each gets `data-wizard-target` attrs and demo data hooks (additive, not destructive)

## Tasks

### T1: Expand wizard infrastructure
**Do:**
- Add new `WizardPage` values: `patientJourneyInsights`, `referralEngine`, `website`, `support`, `settingsUsers`, `settingsBilling`, `settingsAccount`
- Update `getPageRoute()` with routes for each new page
- Update `getPageDisplayName()` with display names
- Add `<Route path="/referralEngine" element={<Dashboard />} />` to App.tsx
- Add `referralEngine` tab mapping in Dashboard.tsx `tabFromPath()`
- Update `OnboardingWizardContext.tsx` navigation logic to handle settings sub-routes (e.g. `/settings/users` should match `settingsUsers` page)
**Files:** `wizardConfig.ts`, `App.tsx`, `Dashboard.tsx`, `OnboardingWizardContext.tsx`
**Depends on:** none
**Verify:** TypeScript compiles. `getPageRoute()` returns correct path for each new page type.

### T2: Rewrite wizard step definitions
**Do:** Replace `WIZARD_STEPS` array with all 33 steps across 11 pages, in tour order:

**Dashboard (7 steps):**
1. `dashboard-overview` — page overview (no target)
2. `dashboard-hero` → Hero — "Your Top Priority"
3. `dashboard-trajectory` → Trajectory — "Practice Trajectory"
4. `dashboard-queue` → ActionQueue — "Action Queue"
5. `dashboard-website` → WebsiteCard — "Website Performance"
6. `dashboard-visibility` → LocalRankingCard — "Local Visibility"
7. `dashboard-pms` → PMSCard — "PMS Summary"

**PMS Statistics (5 steps):**
8. `pms-overview` — page overview
9. `pms-vitals` → PmsVitalsRow — "PMS Vitals" (was `pms-attribution`)
10. `pms-insights` → PmsAttentionCards — "What's Good & What's Risky"
11. `pms-velocity` → PmsVelocityCard — "Referral Velocity"
12. `pms-upload` → PmsIngestionCard — "Upload Your PMS Data"

**Referral Engine (2 steps):**
13. `re-overview` — page overview
14. `re-matrix` → attribution matrix section — "Revenue Attribution"

**Rankings (4 steps):**
15. `rankings-overview` — page overview
16. `rankings-score` → PerformanceDashboard — "Practice Performance"
17. `rankings-factors` → DriversPanel — "Visibility Drivers"
18. `rankings-competitors` → competitor list — "Competitor Landscape"

**Patient Journey (2 steps):**
19. `pji-overview` — page overview
20. `pji-stages` → stage cards — "Patient Journey Stages"

**Tasks (3 steps):**
21. `tasks-overview` — page overview
22. `tasks-team` → team section — "Team Tasks"
23. `tasks-alloro` → alloro section — "Alloro Intelligence"

**Websites (3 steps):**
24. `website-overview` — page overview
25. `website-editor` → editor area — "Visual Website Editor"
26. `website-submissions` → submissions tab — "Form Submissions"

**Support (1 step):**
27. `support-overview` — page overview: "Help Desk"

**Settings: Integrations (2 steps):**
28. `settings-overview` — page overview
29. `settings-integrations` → right column — "Integrations & Locations"

**Settings: Users (1 step):**
30. `settings-users` → users table — "Team Members & Roles"

**Settings: Billing (1 step):**
31. `settings-billing` → plan card — "Subscription & Billing"

**Settings: Account (1 step):**
32. `settings-account` → password card — "Account Security"

**Final CTA (1 step):**
33. `final-pms-upload` → pms-upload target — "Get Started!"

**Files:** `wizardConfig.ts`
**Depends on:** T1
**Verify:** `WIZARD_STEPS.length === 33`. `getStepsForPage()` returns correct steps per page.

### T3: Rewrite WIZARD_DEMO_DATA
**Do:** Expand demo data object to provide mock data for all 11 pages:
- **Dashboard:** `heroAction` (top action shape for Hero), `trajectoryData` (proofline agent shape for Trajectory), `actionQueueItems` (remaining actions for ActionQueue), `websiteCardData` (form submissions + sparkline for WebsiteCard), `localRankingCardData` (rank + factors for LocalRankingCard), `pmsCardData` (production + referral mix for PMSCard)
- **PMS:** Keep existing `referralData`. Add `pmsVitals` (monthly data array for PmsVitalsRow), `pmsAttention` (good/risky items for PmsAttentionCards), `pmsVelocity` (monthly velocity for PmsVelocityCard)
- **Referral Engine:** `referralEngineData` (full `ReferralEngineData` shape: executive_summary, matrices, growth opportunities)
- **Rankings:** Keep existing `rankingData`, expand to match full `RankingResult` shape
- **Patient Journey:** `gbpDemoData` (reviews, rating, call clicks), `clarityDemoData` (sessions, bounce, dead clicks)
- **Tasks:** Keep existing `tasks`
- **Websites:** `demoProject` (hostname, display_name, status: "READY"), `demoPages` (2-3 page objects), `demoSubmissions` (3-4 form submissions)
- **Support:** `demoTickets` (2-3 ticket objects with messages)
- **Settings:** Keep existing; add `demoUsers` (2-3 team member objects)
- Keep `userProfile`

**Files:** `wizardConfig.ts`
**Depends on:** none (data shape design, no component wiring)
**Verify:** TypeScript compiles. Demo data objects match the shapes consumed by target components.

### T4: Wire Dashboard page — targets + demo data
**Do:**
- Add `data-wizard-target` attrs to: `Hero.tsx`, `Trajectory.tsx`, `ActionQueue.tsx`, `WebsiteCard.tsx`, `LocalRankingCard.tsx`, `PMSCard.tsx`
- Import `useIsWizardActive()` and `useWizardDemoData()` in `DashboardOverview.tsx`
- When wizard active, pass demo data into each card component instead of real data hooks
- Ensure no loading/empty states render during wizard — all cards show populated demo content
**Files:** `DashboardOverview.tsx`, `focus/Hero.tsx`, `focus/Trajectory.tsx`, `focus/ActionQueue.tsx`, `focus/WebsiteCard.tsx`, `focus/LocalRankingCard.tsx`, `focus/PMSCard.tsx`
**Depends on:** T3
**Verify:** Manual: navigate to dashboard during wizard, all 7 spotlights hit real elements with demo data.

### T5: Wire PMS Statistics page — targets + demo data
**Do:**
- Add `data-wizard-target="pms-insights"` to `PmsAttentionCards.tsx`
- Add `data-wizard-target="pms-velocity"` to `PmsVelocityCard.tsx`
- Rename existing `pms-attribution` target to `pms-vitals` on `PmsVitalsRow.tsx`
- Update `PMSVisualPillars.tsx` demo data consumption to use new T3 shapes
- Ensure PMS page renders full dashboard (not empty state) during wizard
**Files:** `PMSVisualPillars.tsx`, `PmsDashboardSurface.tsx`, `PmsVitalsRow.tsx`, `PmsAttentionCards.tsx`, `PmsVelocityCard.tsx`
**Depends on:** T3
**Verify:** Manual: PMS page during wizard shows all sections with demo data, all 4 spotlights work.

### T6: Wire Referral Engine page — targets + demo data
**Do:**
- Add `data-wizard-target="re-matrix"` to the Attribution Master Matrix section in `ReferralEngineDashboard.tsx`
- Import wizard hooks, inject `referralEngineData` demo data when wizard active
- Ensure Referral Engine renders full content (not the "upload PMS" alert bar) during wizard
**Files:** `ReferralEngineDashboard.tsx`
**Depends on:** T1 (route), T3 (data)
**Verify:** Manual: navigate to /referralEngine during wizard, overview + matrix spotlight work.

### T7: Wire Rankings page — update copy
**Do:**
- Update step titles/descriptions in T2 step definitions to match current section headings ("What's driving visibility" instead of "Ranking Factors", etc.)
- Rankings already has all 3 targets. Verify `RankingsDashboard.tsx` demo data still works with current component shape. Update if needed.
**Files:** `RankingsDashboard.tsx` (verify only, may need demo data shape update)
**Depends on:** T2, T3
**Verify:** Manual: Rankings page during wizard shows demo data, all 3 spotlights work.

### T8: Wire Patient Journey page — targets + demo data
**Do:**
- Add `data-wizard-target="pji-stages"` to the stage card container in `VitalSignsCards.tsx`
- Import wizard hooks, inject `gbpDemoData` / `clarityDemoData` when wizard active
- Ensure metrics cards render with demo values (not loading/error)
**Files:** `VitalSignsCards.tsx`
**Depends on:** T3
**Verify:** Manual: Patient Journey page during wizard shows Consideration stage with demo metrics.

### T9: Wire Tasks page — update copy
**Do:**
- Tasks already has both targets. Verify demo data injection still works.
- If `TasksView.tsx` doesn't consume `useWizardDemoData()` yet, add it to inject demo tasks when wizard active
**Files:** `TasksView.tsx`
**Depends on:** T3
**Verify:** Manual: Tasks page during wizard shows demo team tasks + alloro tasks.

### T10: Wire Websites page — targets + demo data + sidebar
**Do:**
- Add `data-wizard-target="website-editor"` and `data-wizard-target="website-submissions"` to `DFYWebsite.tsx`
- Import wizard hooks. When wizard active:
  - Set `project` state to demo project (bypass API fetch)
  - Set `pages` state to demo pages array
  - Set `status` to "READY"
  - Render editor view with demo page content in iframe
  - For submissions view, inject demo form submission data
- In `Sidebar.tsx`: show "Websites" nav item when `isWizardActive` is true, regardless of `hasWebsite` state
**Files:** `DFYWebsite.tsx`, `Sidebar.tsx`
**Depends on:** T1 (page type), T3 (data)
**Verify:** Manual: Websites page during wizard shows editor with demo content. Sidebar shows Websites nav during wizard even without a real project.

### T11: Wire Support page — target
**Do:**
- Add `data-wizard-target` wrapper (or use the main content area) in `Help.tsx`
- Import wizard hooks. When wizard active, inject `demoTickets` so the ticket list and detail pane show demo content
**Files:** `Help.tsx`, potentially `SupportTicketList.tsx`
**Depends on:** T3
**Verify:** Manual: Support page during wizard shows demo tickets.

### T12: Wire Settings sub-tabs — targets
**Do:**
- Add `data-wizard-target="settings-users"` to `UsersTab.tsx` wrapper
- Add `data-wizard-target="settings-billing"` to `BillingTab.tsx` wrapper
- Add `data-wizard-target="settings-account"` to `ProfileTab.tsx` wrapper
- When wizard active on Users tab, inject demo team members so the table isn't empty
- Billing/Account can use their natural state (subscription card / password form) — no demo data needed
**Files:** `UsersTab.tsx`, `BillingTab.tsx`, `ProfileTab.tsx`
**Depends on:** T1, T3
**Verify:** Manual: navigate through all 4 settings tabs during wizard, spotlights work.

### T13: Re-enable wizard + integration test
**Do:**
- Remove the early-return disable block in `OnboardingWizardContext.tsx` (lines 80-85)
- Restore the original `useEffect` status check logic (uncomment lines 87-121)
- Restore the original `recheckWizardStatus` (uncomment lines 215-250ish)
- Verify the full 33-step flow end-to-end: welcome modal → all pages in order → final CTA → wizard completes → flag set in DB
**Files:** `OnboardingWizardContext.tsx`
**Depends on:** T1-T12 (all wiring must be complete)
**Verify:** `npx tsc --noEmit` passes. Manual: full wizard flow from start to finish.

## Done
- [ ] `npx tsc --noEmit` — zero errors
- [ ] All 33 wizard steps have working `data-wizard-target` elements
- [ ] Every page renders meaningful demo data during wizard (no empty/skeleton states)
- [ ] Websites page works during wizard even without a real project
- [ ] Sidebar shows all nav items during wizard
- [ ] Wizard auto-navigates through all 11 pages in correct order
- [ ] Welcome modal → full tour → completion writes flag to DB
- [ ] Skip wizard works at any point
- [ ] "Restart Product Tour" button in Settings still works
- [ ] No regressions on any page when wizard is NOT active
