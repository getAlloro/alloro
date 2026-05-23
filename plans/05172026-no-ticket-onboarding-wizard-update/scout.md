# Onboarding Wizard Update — Page Scout

> Accurate component inventory per page, documenting what the wizard currently expects vs. what actually renders.
> Generated 2026-05-17.

---

## Full App Navigation Map

### Sidebar Structure (Sidebar.tsx)

```
OPERATIONS
  Practice Hub        → /dashboard          (Dashboard tab)
  Referrals Hub       → /pmsStatistics      (PMS Statistics tab)
  Local Rankings      → /rankings           (Rankings tab)

WEBSITES (conditional: hasWebsite)
  Websites            → /dfy/website

EXECUTION
  To-Do List          → /tasks              (Tasks tab, badge: pending count)
  Notifications       → /notifications      (dot indicator: unread count)

SUPPORT
  Support             → /help               (ticket system)

FOOTER
  Settings            → /settings           (avatar/initials click)
  Log Out
```

All nav items are locked (`isLocked={isWizardActive}`) during the wizard tour.

### Settings Sub-Tabs (`/settings/*`)

| Tab | Route | Component |
|-----|-------|-----------|
| Integrations | `/settings/integrations` | `IntegrationsRoute.tsx` |
| Users & Roles | `/settings/users` | `UsersRoute.tsx` |
| Billing | `/settings/billing` | `BillingRoute.tsx` |
| Account | `/settings/account` | `AccountRoute.tsx` |

Default redirect: `/settings` → `/settings/integrations`

### Website Sub-Views (`/dfy/website`)

| View | Key | Description |
|------|-----|-------------|
| Editor | `editor` | Visual page editor with iframe preview + EditorSidebar |
| Submissions | `submissions` | Form submissions tab (`FormSubmissionsTab`) |
| Posts | `posts` | Blog/article posts tab (`PostsTab`) — conditional: only if `project.template_id` |
| Menus | `menus` | Navigation menus tab (`MenusTab`) |

### Dashboard Tab Views (all render inside `Dashboard.tsx`)

| Tab | Route | Component |
|-----|-------|-----------|
| Dashboard | `/dashboard` | `DashboardOverview` (Focus layout) |
| Patient Journey Insights | `/patientJourneyInsights` | `VitalSignsCards` |
| PMS Statistics | `/pmsStatistics` | `PMSVisualPillars` |
| Rankings | `/rankings` | `RankingsDashboard` |
| Tasks | `/tasks` | `TasksView` |
| Referral Engine | (internal tab) | `ReferralEngineDashboard` |

### Support (`/help`)

| Component | Description |
|-----------|-------------|
| `Help.tsx` | Support ticket system — list + detail split view |
| `SupportTicketList` | Left panel: ticket list with status badges |
| `SupportTicketDetail` | Right panel: message thread + attachments |
| `SupportTicketComposerModal` | Modal for creating new tickets with type selector + file attachments |

### Pages NOT in Current Wizard

The wizard covers 5 pages: Dashboard, PMS Statistics, Rankings, Tasks, Settings (integrations only).

**Not covered:**
- Patient Journey Insights (`/patientJourneyInsights`)
- Referral Engine (internal dashboard tab)
- Websites (`/dfy/website`) — Editor, Submissions, Posts, Menus
- Notifications (`/notifications`)
- Support (`/help`)
- Settings: Users & Roles, Billing, Account tabs

---

## Page 1: Dashboard (`/dashboard`)

**Entry:** `Dashboard.tsx` → `DashboardOverview.tsx`
**Layout:** `max-w-[1320px]`, warm beige bg (`#F7F5F3`)

### Current Components (DOM order)

| # | Component | File | What Users See | Conditional? | Has `data-wizard-target`? |
|---|-----------|------|----------------|-------------|--------------------------|
| 1 | `SetupProgressBanner` | `focus/SetupProgressBanner.tsx` | Orange banner: "Finish setting up your practice" + "Continue setup" CTA | Only when `onboardingCompleted === false` | No |
| 2 | `PmsUploadNudge` | `focus/PmsUploadNudge.tsx` | "Ready for the next focus?" banner + "Upload PMS data" CTA | Only when `period.isStale === true` | No |
| 3 | `FocusHeader` | inline in `DashboardOverview.tsx` | Eyebrow + "Focus — {Month YYYY}" + subtitle "One priority. Everything else, in order." | Always | No |
| 4 | `Hero` | `focus/Hero.tsx` | Dark radial-gradient card. Surfaces highest-priority SUMMARY action. Shows: pills row, large headline, rationale, domain strips, "Why this first" sidebar with 3 metrics + deliverables. Empty/loading/PMS-empty states. | Always (content varies) | **No** |
| 5 | `Trajectory` | `focus/Trajectory.tsx` | White card, left 2/3. Greeting ("Good morning, {firstName}"), trajectory paragraph from agent proofline, 3 mini-stats (Production MTD, New patient starts, Visibility score) with trends. "Read full explanation" link opens ProoflineModal. | Always (content varies) | **No** |
| 6 | `ActionQueue` | `focus/ActionQueue.tsx` | White card, right 1/3. "Queue · {n} more" header, scrollable list of remaining SUMMARY + REFERRAL_ENGINE_ANALYSIS actions. Each row: domain icon + title + urgency pill + chevron. "Open tasks" link. | Always (content varies) | **No** |
| 7 | `WebsiteCard` | `focus/WebsiteCard.tsx` | Cream card, 1/3 width. "Website · Form submissions" eyebrow, large verified leads count + trend pill, sparkline (12-month), "Coming soon" strip for sessions/bounce-rate/avg-session. "View submissions" link. Not-connected state shows "Connect website" CTA. | Always (content varies) | **No** |
| 8 | `LocalRankingCard` | `focus/LocalRankingCard.tsx` | Cream card, 1/3 width. "Local Visibility" eyebrow, Maps estimate rank, Practice Health score/100, Google Maps Signals (4 factor bars), Practice Health (4 factor bars), lowest-factor info box. | Always (content varies) | **No** |
| 9 | `PMSCard` | `focus/PMSCard.tsx` | Cream card, 1/3 width. "PMS · {Month}" eyebrow, production dollar amount + trend pill, referral counts (doctor/self), sparkline (12-month), referral mix stacked bar, top 3 sources. | Always (content varies) | **No** |

### Layout Grid

```
[Hero ─────────────────────────────────────────────]  (full width)
[Trajectory ─────────────── | ActionQueue ─────────]  (2fr | 1fr)
[WebsiteCard ── | LocalRankingCard ── | PMSCard ───]  (1/3 | 1/3 | 1/3)
```

### Wizard Step Mapping — CURRENT vs. PROPOSED

| Old Wizard Step | Old Target | Still Exists? | Proposed New Target |
|----------------|-----------|--------------|-------------------|
| `dashboard-overview` | (page overview, no target) | N/A | Keep as-is |
| `dashboard-hero` | `[data-wizard-target='dashboard-hero']` | **ORPHANED** — component exists but no attr | → Add attr to `Hero` |
| `dashboard-metrics` | `[data-wizard-target='dashboard-metrics']` | **ORPHANED** — old "Monthly Practice Totals" section removed | → Remap to `Trajectory` (closest analog: greeting + 3 mini-stats) |
| `dashboard-ranking` | `[data-wizard-target='dashboard-ranking']` | **ORPHANED** — old ranking card removed | → Remap to `LocalRankingCard` |
| `dashboard-intelligence` | `[data-wizard-target='dashboard-intelligence']` | **ORPHANED** — "Important Updates" section removed | → Remap to `ActionQueue` (closest analog: queued priority actions) |
| `dashboard-wins-risks` | `[data-wizard-target='dashboard-wins-risks']` | **REMOVED** — no equivalent component | → Remove step OR remap to `WebsiteCard` |
| `dashboard-growth` | `[data-wizard-target='dashboard-growth']` | **REMOVED** — no equivalent component | → Remove step OR remap to `PMSCard` |

### Recommended Dashboard Steps (6 steps, down from 7)

1. **`dashboard-overview`** — Page overview (no target)
2. **`dashboard-hero`** → Hero card — "Your Top Priority"
3. **`dashboard-trajectory`** → Trajectory card — "Practice Trajectory & Key Metrics"
4. **`dashboard-queue`** → ActionQueue card — "Action Queue"
5. **`dashboard-visibility`** → LocalRankingCard — "Local Visibility Snapshot"
6. **`dashboard-bottom-cards`** → WebsiteCard + PMSCard — "Website & PMS At a Glance" (or split into 2 separate steps for 7 total)

---

## Page 2: PMS Statistics (`/pmsStatistics`)

**Entry:** `Dashboard.tsx` → `PMSVisualPillars.tsx` → `PmsDashboardSurface.tsx`
**Layout:** `max-w-[1320px]`, `pm-light` theme

### Current Components — "Has Data" State (DOM order)

| # | Component | File | What Users See | Has `data-wizard-target`? |
|---|-----------|------|----------------|--------------------------|
| 1 | `PmsDashboardHero` | `dashboard/PmsDashboardHero.tsx` | "Update data" CTA header at top | No |
| 2 | `PmsProcessingStatusCard` | `dashboard/PmsProcessingStatusCard.tsx` | Processing status indicator | No (conditional: only when processing) |
| 3 | `PmsSectionHeader` | `dashboard/PmsSectionHeader.tsx` | "PMS Vitals · YTD" section header | No |
| 4 | `PmsVitalsRow` | `dashboard/PmsVitalsRow.tsx` | 4-card grid: production, referrals, top sources, source count | **Yes: `pms-attribution`** |
| 5 | `PmsAttentionCards` | `dashboard/PmsAttentionCards.tsx` | "What's Good" / "What's Risky" side-by-side cards | No |
| 6 | `PmsExecutiveSummary` | `dashboard/PmsExecutiveSummary.tsx` | Bullet-point AI summary of findings | No |
| 7 | `PmsProductionChart` | `dashboard/PmsProductionChart.tsx` | Production over time line chart (3fr width) | No |
| 8 | `PmsReferralMixCard` | `dashboard/PmsReferralMixCard.tsx` | Marketing vs doctor referral mix (2fr width) | No |
| 9 | `PmsTopSourcesCard` | `dashboard/PmsTopSourcesCard.tsx` | Top referral sources ranked list (1/2 width) | No |
| 10 | `PmsVelocityCard` | `dashboard/PmsVelocityCard.tsx` | Monthly referral velocity bar chart (1/2 width) | No |
| 11 | `PmsGrowthOpportunities` | `dashboard/PmsGrowthOpportunities.tsx` | Growth recommendations from referral engine | No |
| 12 | `PmsIngestionCard` | `dashboard/PmsIngestionCard.tsx` | Upload CTA: wizard, template, direct, manual entry | **Yes: `pms-upload`** |

### Current Components — "No Data" State

| # | Component | File | Has `data-wizard-target`? |
|---|-----------|------|--------------------------|
| 1 | `PmsDashboardHero` | (same) | No |
| 2 | `PmsEmptyDashboardState` | `dashboard/PmsEmptyDashboardState.tsx` | **Yes: `pms-upload`** |

### Layout Grid (has-data)

```
[PmsDashboardHero ─────────────────────────────────]  (full width)
[PmsSectionHeader ─────────────────────────────────]  (full width)
[PmsVitalsRow ─────────────────────────────────────]  (4-card grid)
[PmsAttentionCards ────────────────────────────────]  (full width)
[PmsExecutiveSummary ──────────────────────────────]  (full width)
[PmsProductionChart ──────── | PmsReferralMixCard ─]  (3fr | 2fr)
[PmsTopSourcesCard ───────── | PmsVelocityCard ────]  (1/2 | 1/2)
[PmsGrowthOpportunities ──────────────────────────]  (full width)
[PmsIngestionCard ─────────────────────────────────]  (full width)
```

### Wizard Step Mapping

| Old Wizard Step | Old Target | Still Exists? | Proposed |
|----------------|-----------|--------------|---------|
| `pms-overview` | (page overview) | N/A | Keep as-is |
| `pms-attribution` | `pms-attribution` on `PmsVitalsRow` | **YES** | Keep — update title/description to match "PMS Vitals" |
| `pms-velocity` | `[data-wizard-target='pms-velocity']` | **ORPHANED** — `PmsVelocityCard` exists but no attr | → Add attr to `PmsVelocityCard` |
| `pms-matrices` | `[data-wizard-target='pms-matrices']` | **ORPHANED** — old "Intelligence Hub" removed, replaced by multiple cards | → Remap to `PmsAttentionCards` (What's Good / What's Risky) OR `PmsGrowthOpportunities` |
| `pms-upload` | `pms-upload` on `PmsIngestionCard` / `PmsEmptyDashboardState` | **YES** | Keep as-is |

### Recommended PMS Steps (5 steps, same count)

1. **`pms-overview`** — Page overview (no target)
2. **`pms-vitals`** → PmsVitalsRow — "PMS Vitals" (rename from `pms-attribution`)
3. **`pms-insights`** → PmsAttentionCards — "What's Good & What's Risky"
4. **`pms-velocity`** → PmsVelocityCard — "Referral Velocity"
5. **`pms-upload`** → PmsIngestionCard — "Upload Your PMS Data" (keep)

---

## Page 3: Rankings (`/rankings`)

**Entry:** `Dashboard.tsx` → `RankingsDashboard.tsx`
**Layout:** Large component (~2085 lines)

### Current Components (DOM order)

| # | Component/Section | What Users See | Has `data-wizard-target`? |
|---|-------------------|----------------|--------------------------|
| 1 | `CompetitorOnboardingBanner` | CTA to add competitors (conditional: no competitors yet) | No |
| 2 | `RankingInFlightBanner` | Status bar when ranking scan is running | No (conditional) |
| 3 | `PerformanceDashboard` wrapper | Contains all ranking sections below | **Yes: `rankings-score`** (wraps entire dashboard) |
| 3a | → `HeroPanel` | Live Google Rank composite + Practice Health gauge, metric strip | (inside `rankings-score`) |
| 3b | → `SearchPositionSection` | Search position details (left column, lg) | (inside `rankings-score`) |
| 3c | → `DriversPanel` | "What's driving visibility" — positive vs negative factors, split accordion | **Yes: `rankings-factors`** |
| 3d | → `NextMoves` | Recommended next actions (right column, lg) | (inside `rankings-score`) |
| 3e | → `GapsPanel` | Competitor gaps analysis (right column, lg) | (inside `rankings-score`) |
| 4 | Competitor list section | Top N on Google Maps, competitor rows with star/review counts | **Yes: `rankings-competitors`** |
| 5 | `CompetitorComparisonModal` | Modal for side-by-side comparison | No (modal) |

### Layout Grid

```
[CompetitorOnboardingBanner] (conditional)
[RankingInFlightBanner]      (conditional)
[CompetitorList ───────────────────────────────────]  rankings-competitors
[HeroPanel ────────────────────────────────────────]  rankings-score wrapper
[SearchPosition ──── | DriversPanel ──]  (1.35fr | 1fr)  rankings-factors inside left col
[                    | NextMoves ─────]
[                    | GapsPanel ─────]
```

### Wizard Step Mapping

| Old Wizard Step | Old Target | Still Exists? | Proposed |
|----------------|-----------|--------------|---------|
| `rankings-overview` | (page overview) | N/A | Keep as-is |
| `rankings-score` | `rankings-score` on `PerformanceDashboard` | **YES** | Keep — update description for new HeroPanel layout |
| `rankings-factors` | `rankings-factors` on `DriversPanel` | **YES** | Keep — update description ("What's driving visibility" instead of "Ranking Factors") |
| `rankings-competitors` | `rankings-competitors` on competitor list | **YES** | Keep — update description for curated competitor maps view |

### Verdict: Rankings page is intact. Only copy updates needed.

---

## Page 4: Tasks (`/tasks`)

**Entry:** `Dashboard.tsx` → `TasksView.tsx`
**Layout:** `max-w-[1100px]`, target icon header

### Current Components (DOM order)

| # | Component/Section | What Users See | Has `data-wizard-target`? |
|---|-------------------|----------------|--------------------------|
| 1 | Header | "To-Do List" title + "Tasks for your team" subtitle + "Update To-Do List" sync button | No |
| 2 | Team Tasks section | Orange icon + "Team Tasks" heading + "Action items for practice staff" + completion % ring + 2-column task card grid + "Add Task" dashed button | **Yes: `tasks-team`** |
| 3 | Alloro Tasks section | Collapsible navy/white panel. "Alloro Intelligence" heading + "What we're monitoring" subtitle. Zap icon. Expandable to show read-only Alloro system tasks. | **Yes: `tasks-alloro`** |

### Task Card Structure

Each task card shows:
- Checkbox toggle (complete/incomplete)
- Title
- Description (line-clamped, expandable)
- Priority badge (High/Medium/Low, color-coded)
- Due date
- Status indicator
- Help button (comment form)

### Wizard Step Mapping

| Old Wizard Step | Old Target | Still Exists? | Proposed |
|----------------|-----------|--------------|---------|
| `tasks-overview` | (page overview) | N/A | Keep — update title to "To-Do List" instead of "Your To-Do List" |
| `tasks-team` | `tasks-team` | **YES** | Keep as-is |
| `tasks-alloro` | `tasks-alloro` | **YES** | Keep — update description to match "Alloro Intelligence" / "What we're monitoring" |

### Verdict: Tasks page is intact. Only copy updates needed.

---

## Page 5: Settings (`/settings` → `/settings/integrations`)

**Entry:** `IntegrationsRoute.tsx`
**Layout:** 2-column grid (`xl:grid-cols-12`), left=5, right=7

### Current Components (DOM order)

**Left Column (xl:col-span-5):**

| # | Component/Section | What Users See | Has `data-wizard-target`? |
|---|-------------------|----------------|--------------------------|
| 1 | Practice Details | "Practice Details" heading + website URL + email | No |
| 2 | Security Banner | Dark navy card: "Encrypted & Secure" + HIPAA Compliant + Monitored 24/7 badges | No |
| 3 | Restart Tour Button | "Restart Product Tour" dashed button (hidden when wizard active) | No |

**Right Column (xl:col-span-7) — entire column is `settings-integrations` target:**

| # | Component/Section | What Users See | Conditional? |
|---|-------------------|----------------|-------------|
| 1 | `MissingScopeBanner` | Red/amber gradient: "Missing N Required API Access" + "Grant Alloro Missing Access" CTA | `missingScopeCount > 0` |
| 2 | Connect Google Banner | Orange gradient: "Connect Google Account" + GoogleConnectButton | `!hasGoogleConnection` |
| 3 | Google Search Console Settings | Expandable card: "Google Search Console" + Connected/Action needed badge. Expanded: account selector → property selector → "Save Source" | `hasGoogleConnection` |
| 4 | PMS Upload Banner | Green gradient: "You're All Set!" + "Go to Referrals Hub" CTA | `!hasPmsData && hasProperties` |
| 5 | Locations Management (`PropertiesTab`) | "Locations" heading + location cards (name, GBP info, Change/Set Primary/Delete actions). Empty state: "Connect your Google Account" or "No locations configured". Add Location modal (2-step: name → GBP select). | Always |

### Wizard Step Mapping

| Old Wizard Step | Old Target | Still Exists? | Proposed |
|----------------|-----------|--------------|---------|
| `settings-overview` | (page overview) | N/A | Keep as-is |
| `settings-integrations` | `settings-integrations` on right column | **YES** | Keep — update description for new GSC settings + locations management |

### Verdict: Settings page is intact. Copy updates needed to mention GSC and Locations.

---

## Page 6: FINAL STEP (back to PMS)

| Old Wizard Step | Old Target | Still Exists? | Proposed |
|----------------|-----------|--------------|---------|
| `final-pms-upload` | `pms-upload` (reuses PMS target) | **YES** | Keep as-is |

---

## Summary of Work

### Steps to ADD `data-wizard-target` attrs (4 components)

1. `focus/Hero.tsx` → add `data-wizard-target="dashboard-hero"`
2. `focus/Trajectory.tsx` → add `data-wizard-target="dashboard-trajectory"`
3. `focus/ActionQueue.tsx` → add `data-wizard-target="dashboard-queue"`
4. `focus/LocalRankingCard.tsx` → add `data-wizard-target="dashboard-visibility"`

**Decision needed:** Do we also target `WebsiteCard` and `PMSCard` individually, or group the bottom 3 cards into one step?

### Steps to ADD `data-wizard-target` attrs on PMS page (1 component)

5. `PMS/dashboard/PmsVelocityCard.tsx` → add `data-wizard-target="pms-velocity"`

**Decision needed:** What replaces old `pms-matrices`? Options: `PmsAttentionCards`, `PmsGrowthOpportunities`, or drop the step.

### Wizard Config Changes (`wizardConfig.ts`)

- Rewrite all 7 dashboard steps → 6 (or 7 if splitting bottom cards)
- Rewrite PMS steps 2-3 (rename targets, update copy)
- Update copy for Rankings steps (match new section titles)
- Update copy for Tasks steps (match "To-Do List" / "Alloro Intelligence")
- Update copy for Settings steps (mention GSC + Locations)
- Update `WIZARD_DEMO_DATA` to match new component data shapes

### Demo Data Shape Changes

Current `WIZARD_DEMO_DATA` has:
- `pmsMetrics` — old dashboard metrics (newStarts, referrals, production, marketCoverage) → **needs reshape** for new Hero/Trajectory/card components
- `rankingData` — still usable for `LocalRankingCard`
- `tasks` — still usable
- `referralData` — still usable for PMS page
- `prooflineData` — `trajectory` text still usable for `Trajectory`, but `wins`/`risks`/`topFixes` may not be consumed anymore
- `criticalActionsCount` — may need reshape for `ActionQueue`
- `userProfile` — still usable

### Components consuming wizard demo data

1. `RankingsDashboard.tsx` — `useWizardDemoData()` for ranking display
2. `PMSVisualPillars.tsx` — `useWizardDemoData()` for PMS charts/metrics

**Need to check:** Do new dashboard components (`Hero`, `Trajectory`, `ActionQueue`, etc.) consume demo data, or do they need hooks added?

---

## NEW PAGES — Not in Old Wizard

### Page 7: Patient Journey Insights (`/patientJourneyInsights`)

**Entry:** `Dashboard.tsx` → `VitalSignsCards.tsx`
**Layout:** Tabbed card system

#### Components (DOM order)

| # | Component/Section | What Users See | Notes |
|---|-------------------|----------------|-------|
| 1 | Stage tab bar | "Consideration" / "Decision" toggle | Horizontal navigation |
| 2 | Active stage header | Stage title + description + data source label | e.g. "Google Business Profile" or "Microsoft Clarity" |
| 3 | Metrics cards (3 per stage) | **Consideration:** New Reviews, Avg. Rating, Call Clicks · **Decision:** User Sessions, Bounce Rate, Dead Clicks | Data from `useGBP()` / `useClarity()` |
| 4 | "Fetch AI-Ready Data" button | CTA to generate AI narrative | Triggers `fetchGBPAIData` / `fetchClarityAIData` |
| 5 | AI Insight paragraph | AI-generated summary of the data | Shown after fetch |
| 6 | Integration status indicators | Connected / Loading / Error state | Per integration |

**Suggested wizard steps (2):**
1. `pji-overview` — Page overview: "Patient Journey Insights"
2. `pji-stages` — Stage cards: "Track patients from consideration to decision"

---

### Page 8: Referral Engine (internal tab in Dashboard)

**Entry:** `Dashboard.tsx` → `ReferralEngineDashboard.tsx`
**Layout:** `max-w-[1100px]`, standard Alloro page layout
**Header title:** "Revenue Sources" / "Where your revenue comes from"

#### Components (DOM order)

| # | Component/Section | What Users See | Notes |
|---|-------------------|----------------|-------|
| 1 | Alert bar (no data) | Orange banner: "Revenue attribution analysis has not been run yet" | Conditional: no data |
| 2 | Header | "Revenue Sources" + "Export Attribution Hub" button | Always |
| 3 | Hero section | "Revenue Details." headline + "Revenue Tracking On" badge | Always |
| 4 | Monthly Totals | 4 MetricCards: MKT Production, Doc Production, Total Starts, Confidence Score | Grid, 4-col on desktop |
| 5 | Referral Velocity Pipeline | 6-month bar chart — orange (marketing) vs navy (doctor) per month | Full-width card |
| 6 | Attribution Master Matrix | Doctor + Marketing referral table with filter tabs (All/Doctor/Marketing) | Full-width card with overflow table |
| 7 | File upload area | Drag-and-drop PMS upload zone | Inside the component |

**Suggested wizard steps (2):**
1. `re-overview` — Page overview: "Revenue Sources"
2. `re-matrix` — Attribution matrix: "See which referral sources generate the most production"

---

### Page 9: Websites (`/dfy/website`)

**Entry:** `DFYWebsite.tsx`
**Layout:** Full-width editor with top toolbar

#### Views / Tabs

| View | Key | What Users See |
|------|-----|----------------|
| **Editor** | `editor` | Visual page editor: page list sidebar, iframe preview (desktop/mobile toggle), EditorSidebar chat panel, version history. Page selector dropdown. Save/Undo/Redo buttons. |
| **Submissions** | `submissions` | `FormSubmissionsTab` — table of form submissions with read/unread/flagged status |
| **Posts** | `posts` | `PostsTab` — blog post management (conditional: only if `project.template_id`) |
| **Menus** | `menus` | `MenusTab` — navigation menu management |

Also includes:
- `RecipientsConfig` — email recipient routing config
- `ConnectDomainModal` — custom domain connection

**Suggested wizard steps (3):**
1. `website-overview` — Page overview: "Your Website"
2. `website-editor` — Editor view: "Edit your website visually with our AI-powered editor"
3. `website-submissions` — Submissions tab: "Track and manage form submissions from your website"

---

### Page 10: Notifications (`/notifications`)

**Entry:** `Notifications.tsx`
**Layout:** `max-w-[1100px]`, standard Alloro page layout
**Header title:** "Notifications" / "Real-time Practice Updates"

#### Components (DOM order)

| # | Component/Section | What Users See | Notes |
|---|-------------------|----------------|-------|
| 1 | Header | "Notifications" title + "Mark all as read" + "Delete all" buttons | Always |
| 2 | Notification cards | List of notification cards with: icon by type, title, body, timestamp ("2 hours ago"), impact label (Critical/High Priority/Update), read/unread state | Scrollable list |
| 3 | Empty state | Bell icon + "All caught up!" message | When no notifications |

Each notification card:
- Type icon (success=green, warning=amber, error=red)
- Click navigates to relevant page (pms→/pmsStatistics, task→/tasks, etc.)
- "Mark as read" individual button

**Suggested wizard steps (1):**
1. `notifications-overview` — Page overview: "Notifications — real-time updates from your practice"

---

### Page 11: Support (`/help`)

**Entry:** `Help.tsx`
**Layout:** `max-w-[1320px]`, `pm-light` theme, 2-column grid

#### Components (DOM order)

| # | Component/Section | What Users See | Notes |
|---|-------------------|----------------|-------|
| 1 | Header | "Help desk" title + description + "New ticket" button | Always |
| 2 | `SupportTicketList` | Left panel (360px): ticket list with status badges, search/filter | Always |
| 3 | `SupportTicketDetail` | Right panel: message thread + attachments for selected ticket | Always (empty state if none selected) |
| 4 | `SupportTicketComposerModal` | Modal: type selector (Bug, Feature, Question, Other) + message + file attachments | On "New ticket" click |

**Suggested wizard steps (1):**
1. `support-overview` — Page overview: "Support — submit tickets and track conversations with our team"

---

### Settings Sub-Tabs (Pages 12-14)

#### Settings: Users & Roles (`/settings/users`)

**Component:** `UsersTab.tsx`

| # | Section | What Users See |
|---|---------|----------------|
| 1 | Header card | "Team Members" heading + "Invite Member" button (admin only) |
| 2 | Users table | Columns: User (avatar+name+email), Role (badge: Admin/Manager/Viewer), Joined date, Actions (change role/remove) |
| 3 | Invite modal | Email input + role selector |

**Suggested wizard step (1):**
1. `settings-users` — "Manage your team — invite members and control access roles"

#### Settings: Billing (`/settings/billing`)

**Component:** `BillingTab.tsx`

| # | Section | What Users See |
|---|---------|----------------|
| 1 | Locked-out banner | Red banner if billing overdue (conditional) |
| 2 | Cancelled banner | Amber banner if cancelled at period end (conditional) |
| 3 | Plan card | Active subscription: plan name, status badge (Active/Cancelled), renewal date, payment method. OR subscribe CTA if no subscription. |
| 4 | Payment method section | Card on file details + update button |

**Suggested wizard step (1):**
1. `settings-billing` — "Manage your subscription and payment details"

#### Settings: Account (`/settings/account`)

**Component:** `ProfileTab.tsx` (actually a password change form)

| # | Section | What Users See |
|---|---------|----------------|
| 1 | Password card | "Change Password" / "Set Password" heading + form (current password, new password, confirm) with inline validation rules |

**Suggested wizard step (1):**
1. `settings-account` — "Manage your account password and security"

---

## Full Tour Step Count Estimate

| Page | Steps | Notes |
|------|-------|-------|
| Dashboard | 6 | overview + hero + trajectory + queue + visibility + bottom cards |
| PMS Statistics | 5 | overview + vitals + insights + velocity + upload |
| Rankings | 4 | overview + score + factors + competitors |
| Tasks | 3 | overview + team + alloro |
| Patient Journey | 2 | overview + stages |
| Referral Engine | 2 | overview + matrix |
| Websites | 3 | overview + editor + submissions |
| Notifications | 1 | overview only |
| Support | 1 | overview only |
| Settings: Integrations | 2 | overview + integrations |
| Settings: Users | 1 | users & roles |
| Settings: Billing | 1 | billing |
| Settings: Account | 1 | account/password |
| Final CTA | 1 | back to PMS upload |
| **TOTAL** | **~33** | Up from 23, covering full product |

---

## Open Questions for Dave

1. **Bottom dashboard cards:** Spotlight all 3 individually (WebsiteCard, LocalRankingCard, PMSCard = 3 steps) or group them (1 step)?
2. **PMS matrices replacement:** Which component should take the old `pms-matrices` spotlight? `PmsAttentionCards` or `PmsGrowthOpportunities`? Or drop the step?
3. **~33 steps — too many?** The full tour is ~33 steps. Could be trimmed by combining page overviews with first spotlight, or by dropping low-value pages (Notifications, Account are arguably skippable).
4. **Demo data for new dashboard:** The new Focus dashboard pulls from hooks like `useTopAction`, `useActionQueue`, `useDashboardMetrics`, `useAgentData`. These need demo data injection when wizard is active. How deep should we go?
5. **Websites conditional:** Websites tab only shows if the org has a website project. Should the wizard skip it if not available, or always show it with a "coming soon" message?
6. **Tour flow order:** Old flow was Dashboard → PMS → Rankings → Tasks → Settings. Full tour adds ~6 more pages. Suggested order: Dashboard → PMS → Referral Engine → Rankings → Patient Journey → Tasks → Notifications → Websites → Support → Settings (all tabs) → Final CTA. Does that work?
7. **Navigation during wizard:** Currently sidebar is locked during wizard (`isWizardActive`). The wizard auto-navigates between pages. With 11+ pages, we need the `WizardPage` type and `getPageRoute()` expanded significantly.
