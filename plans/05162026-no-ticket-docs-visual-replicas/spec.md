# Docs: Replace Screenshots with Visual Replicas

> **This is the master spec.** Each task has its own detailed spec file in this folder.

## Why
Screenshots are brittle — every UI change requires re-running a Playwright capture pipeline, and hotspot positions drift when layouts change. Worse, the capture script loads the real frontend, exposing actual code and API shapes in the docs app. Visual replicas are hardcoded presentational components with fake data: no real code exposed, hotspot positions are inherently correct (they wrap the actual DOM elements), and the docs app is fully self-contained.

## What
Replace the screenshot-based documentation system with live React component replicas rendered inside a scaled-down desktop viewport container. Remove zoom views entirely. Keep the hotspot/step system but switch from percentage-based overlays to inline `HotspotZone` wrappers. Build replicas for all 16 page views (14 page configs, with website split into editor/submissions/menus).

## Task Specs

| Task | File | Summary |
|------|------|---------|
| T1 | [t01-infrastructure.md](t01-infrastructure.md) | Types, DesktopViewport, HotspotZone |
| T2 | [t02-common-layouts.md](t02-common-layouts.md) | AlloroSidebar, SettingsTabs, AuthLayout, DashboardLayout |
| T3 | [t03-auth-replicas.md](t03-auth-replicas.md) | Sign In, Sign Up, Forgot Password replicas |
| T4 | [t04-practice-hub.md](t04-practice-hub.md) | Practice Hub replica |
| T5 | [t05-referrals-hub.md](t05-referrals-hub.md) | Referrals Hub replica |
| T6 | [t06-local-rankings.md](t06-local-rankings.md) | Local Rankings replica |
| T7 | [t07-todo-list.md](t07-todo-list.md) | Todo List replica |
| T8 | [t08-notifications.md](t08-notifications.md) | Notifications replica |
| T9 | [t09-settings-integrations.md](t09-settings-integrations.md) | Settings — Integrations replica |
| T10 | [t10-settings-team.md](t10-settings-team.md) | Settings — Team Members replica |
| T11 | [t11-settings-billing.md](t11-settings-billing.md) | Settings — Billing replica |
| T12 | [t12-settings-account.md](t12-settings-account.md) | Settings — Account replica |
| T13 | [t13-website-replicas.md](t13-website-replicas.md) | Website Editor, Submissions, Menus replicas |
| T14 | [t14-support.md](t14-support.md) | Support replica |
| T15 | [t15-wiring.md](t15-wiring.md) | Update page configs & loader |
| T16 | [t16-cleanup.md](t16-cleanup.md) | Remove screenshots, capture script, fixtures |

## Context

**Relevant files:**
- `docs/src/types/docs.ts` — `DocPage` type with `fullScreenshot`, `zoomRegions`, `ZoomRegion`, `Screenshot`
- `docs/src/components/ScreenshotViewer.tsx` — renders `<img>` + `HotspotOverlay`
- `docs/src/components/HotspotOverlay.tsx` — percentage-based absolute positioning over image
- `docs/src/components/HotspotTooltip.tsx` — tooltip popup (keep mostly as-is)
- `docs/src/components/DocPageTemplate.tsx` — orchestrates screenshot viewer + steps
- `docs/src/data/pages/*.ts` — 14 page configs with screenshot paths, zoom regions, hotspot %
- `docs/src/data/pageLoader.ts` — aggregates page configs
- `docs/scripts/capture-screenshots.ts` — Playwright capture pipeline (will be removed)
- `docs/scripts/fixtures/*.json` — fixture data (reference for replica hardcoded data)

**Patterns to follow:**
- Tailwind 4 (already in use in docs app)
- Alloro brand tokens: `alloro-navy`, `alloro-orange`, `alloro-orange-light`, `alloro-slate`, `alloro-border`
- framer-motion for transitions (already a dependency)

## Constraints

**Must:**
- Replicas must be purely presentational — zero real business logic, zero API calls, zero context providers
- All data hardcoded directly in replica components
- Use existing Tailwind classes and Alloro brand tokens
- Maintain the step-by-step instruction panel and hotspot tooltip system
- Replicas must match the current screenshot visuals closely (use screenshots as reference)
- Website must be represented as 3 tab views (editor, submissions, menus)

**Must not:**
- Import anything from `../frontend/src`
- Include any real API endpoint paths in replica code
- Add new npm dependencies (use existing: react, tailwind, framer-motion, lucide-react, clsx)
- Modify the docs app routing, sidebar, or layout shell

**Out of scope:**
- Mobile responsive replicas (desktop viewport only, 1440x900)
- Animations within replicas (static layouts with fake data)
- Dark mode replicas

## Risk

**Level:** 2

**Risks identified:**
- Visual fidelity drift: replicas may not perfectly match the real UI initially. **Mitigation:** Use the freshly captured screenshots as pixel reference during development. Accept that replicas are "close enough" rather than pixel-perfect.
- Large surface area: 16 replica components + infrastructure is a lot of code. **Mitigation:** Parallel sub-agent execution, shared layout components reduce per-replica work.
- Hotspot positioning changes: moving from percentage overlay to inline zones changes the interaction model. **Mitigation:** `HotspotZone` wrapper is a simple component; the step/tooltip system stays identical.

**Blast radius:** Only affects `docs/` — no changes to the frontend or backend.

## Tasks

### T1: Infrastructure — Types, DesktopViewport, HotspotZone
**Do:**
1. Update `docs/src/types/docs.ts`:
   - Remove `Screenshot`, `ZoomRegion` interfaces
   - Remove `fullScreenshot`, `zoomRegions` from `DocPage`
   - Remove `zoomRegionId` from `DocStep`
   - Add `replica: string` field to `DocPage` (component name for dynamic lookup)
2. Create `docs/src/components/DesktopViewport.tsx`:
   - Renders children at 1440px width inside a fixed container
   - CSS `transform: scale()` to fit within the docs content area (calc scale from container width)
   - Styled top bar that looks like a browser window (three dots, title)
   - `max-height` on the scaled container with `overflow-y: auto` for scrollable content
   - Accepts `children` (the replica) and overlays the hotspot system
3. Create `docs/src/components/HotspotZone.tsx`:
   - Wraps a section of replica content
   - Props: `id`, `hotspot: Hotspot | undefined`, `isActive: boolean`, `onMouseEnter`, `onMouseLeave`, `onClick`
   - When active/hovered: orange highlight border, step badge, renders `HotspotTooltip`
   - When inactive: transparent border, subtle hover effect
4. Update `docs/src/components/DocPageTemplate.tsx`:
   - Replace `ScreenshotViewer` with `DesktopViewport` + dynamic replica component
   - Pass hotspot state (activeId, handlers) to the replica via props
   - Remove zoom-related state and UI
5. Delete `docs/src/components/ScreenshotViewer.tsx`
6. Update `docs/src/components/HotspotOverlay.tsx` — delete (replaced by inline HotspotZone)

**Files:** `types/docs.ts`, `components/DesktopViewport.tsx` (new), `components/HotspotZone.tsx` (new), `components/DocPageTemplate.tsx`, `components/ScreenshotViewer.tsx` (delete), `components/HotspotOverlay.tsx` (delete)
**Depends on:** none
**Verify:** `npx tsc --noEmit` (will have errors until page configs updated — that's expected)

### T2: Common Replica Components — Sidebar, Settings Tabs, Auth Layout
**Do:**
1. Create `docs/src/components/replicas/AlloroSidebar.tsx`:
   - Left nav sidebar matching the Alloro dashboard sidebar appearance
   - Alloro logo at top, nav sections (Dashboard, Settings, Features, Help & Support)
   - Nav items with icons (use lucide-react): Practice Hub, Referrals Hub, Local Rankings, To-Do List, Notifications, Integrations, Team, Billing, Account, Website, Support
   - Bottom: location selector card showing "Smile Clinic - Downtown"
   - Accepts `activeItem: string` prop to highlight current page
   - Fixed width ~220px, full height, soft gray background
2. Create `docs/src/components/replicas/SettingsTabs.tsx`:
   - Horizontal tab bar: Integrations, Users & Roles, Billing, Account
   - Accepts `activeTab: string` prop
   - Alloro pill-style active tab indicator
3. Create `docs/src/components/replicas/AuthLayout.tsx`:
   - Centered card with Alloro logo on top
   - White card with subtle shadow and rounded corners
   - Max-width centered in viewport
4. Create `docs/src/components/replicas/DashboardLayout.tsx`:
   - Combines `AlloroSidebar` + main content area
   - Accepts `activeItem`, `children`
   - Main content area has proper padding and max-width

**Files:** `components/replicas/AlloroSidebar.tsx`, `components/replicas/SettingsTabs.tsx`, `components/replicas/AuthLayout.tsx`, `components/replicas/DashboardLayout.tsx` (all new)
**Depends on:** none
**Verify:** Manual — components render without errors

### T3: Auth Page Replicas — Sign In, Sign Up, Forgot Password
**Do:** Create 3 replica components in `docs/src/components/replicas/`:
1. `SignInReplica.tsx` — Centered card: "Welcome to Alloro" heading, Email Address field, Password field, "Sign In" button (orange), "Forgot your password?" link, "Don't have an account? Sign up" link, terms footer
2. `SignUpReplica.tsx` — Centered card: "Create your Alloro account" heading, Email field, Password field (with requirements hint), Confirm Password field, "Create Account" button (orange), "Already have an account? Sign in" link, terms footer
3. `ForgotPasswordReplica.tsx` — Centered card: "Forgot your password?" heading, subtitle, Email Address field, "Reset Password" button (orange), "Back to sign in" link

All use `AuthLayout`. Each accepts `hotspots`, `activeHotspotId`, `onHotspotClick` props and wraps interactive sections with `HotspotZone`.

**Files:** `components/replicas/SignInReplica.tsx`, `components/replicas/SignUpReplica.tsx`, `components/replicas/ForgotPasswordReplica.tsx`
**Depends on:** T2 (AuthLayout)
**Verify:** Manual — renders in docs app

### T4: Practice Hub Replica
**Do:** Create `docs/src/components/replicas/PracticeHubReplica.tsx`:
- Uses `DashboardLayout` with `activeItem="practice-hub"`
- **Focus Header**: "THIS MONTH AT A GLANCE" label, "Focus — May 2026" heading, date range "MAY 1 – MAY 31"
- **Hero Card**: Large card with messaging like "Your first monthly priority will appear once your data finishes processing" (or a priority action card)
- **Trajectory Card** (left ~60%): "TRAJECTORY: LATEST UPDATE" header, "Good evening, Alex." greeting, trajectory summary text about practice health, review velocity, rankings, referral growth. "Read full proofline" link
- **Action Queue** (right ~40%): "GROWTH LOOKS GOOD" header, "0%" progress, "No queued actions" empty state
- **Bottom Status Row** (3 equal cards):
  - Website card: favicon, "smileclinic.com", "Published ..." status
  - Rankings card: "#3" rank badge, "Practice Health: 82", mini chart placeholder
  - PMS card: Alloro icon, production/referral stats

All sections wrapped in `HotspotZone` matching the hotspot IDs from the page config.

**Files:** `components/replicas/PracticeHubReplica.tsx`
**Depends on:** T1 (HotspotZone), T2 (DashboardLayout)
**Verify:** Manual — renders populated dashboard matching screenshot

### T5: Referrals Hub Replica
**Do:** Create `docs/src/components/replicas/ReferralsHubReplica.tsx`:
- Uses `DashboardLayout` with `activeItem="referrals-hub"`
- **Tab bar**: "PMS Statistics" active, "Rankings" tab
- **Stats Row**: Total Production ($221,100), Total Referrals (187), Doctor Referrals (75), Self Referrals (112), with trend arrows
- **Monthly Production Chart**: Placeholder bar chart showing 6 months of data
- **Referral Sources Section**: Top referral sources table with rank, name, referrals, production, percentage columns
- **Doctor Referral Matrix**: Table with referrer name, referred count, pct scheduled, trend label
- **Non-Doctor Referral Matrix**: Table with source label, source type, referred count, trend label

**Files:** `components/replicas/ReferralsHubReplica.tsx`
**Depends on:** T1, T2
**Verify:** Manual — shows populated referral data

### T6: Local Rankings Replica
**Do:** Create `docs/src/components/replicas/LocalRankingsReplica.tsx`:
- Uses `DashboardLayout` with `activeItem="local-rankings"`
- **Tab bar**: "PMS Statistics" tab, "Rankings" active
- **Rank Badge**: Large "#3" position indicator, "dentist in Austin TX" keyword
- **Practice Health Score**: Score of 82 with circular progress, 8 ranking factors list (category match 95, reviews quality 90, ..., gbp activity 72)
- **Competitors Table**: 5 competitors with rank, name, rating, reviews, distance
- **LLM Analysis Section**: "Top moves to climb" recommendations, gaps, drivers
- **Search Results**: 5 Google Maps positions showing competitor names

**Files:** `components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T1, T2
**Verify:** Manual — shows full rankings analysis

### T7: Todo List Replica
**Do:** Create `docs/src/components/replicas/TodoListReplica.tsx`:
- Uses `DashboardLayout` with `activeItem="todo-list"`
- **Header**: "TO-DO LIST" breadcrumb, "UPDATE TO-DO LIST" button
- **"Team Tasks" section**: 0% progress bar
- **Task Card Grid** (2 columns):
  - "Reply to 3 new Google reviews" — high priority, pending
  - "Upload May PMS export" — medium priority, pending
  - "Review website content draft" — low priority, pending

**Files:** `components/replicas/TodoListReplica.tsx`
**Depends on:** T1, T2
**Verify:** Manual

### T8: Notifications Replica
**Do:** Create `docs/src/components/replicas/NotificationsReplica.tsx`:
- Uses `DashboardLayout` with `activeItem="notifications"`
- **Header**: "NOTIFICATIONS" breadcrumb, "MARK ALL AS READ" and "DELETE ALL" buttons
- **Notification Cards**:
  - "Ranking improved!" — NEW badge, "You moved from #5 to #3...", "STRATEGIC ALPHA" tag, "Mark as read" button
  - "New 5-star review" — NEW badge, "A patient left a 5-star review on Google", "UPDATE" button
  - "Website published" — read state, "Your new homepage design is now live"
  - "PMS data processed" — read state, "Your May PMS export has been analyzed..."

**Files:** `components/replicas/NotificationsReplica.tsx`
**Depends on:** T1, T2
**Verify:** Manual

### T9: Settings — Integrations Replica
**Do:** Create `docs/src/components/replicas/IntegrationsReplica.tsx`:
- Uses `DashboardLayout` with `activeItem="integrations"` + `SettingsTabs` with `activeTab="integrations"`
- **Practice Details**: Domain cards showing "smileclinic.com" and "alexandleclinic.com"
- **Encryption notice**: "Encrypted & Secure" badge
- **Google Search Console**: Connected status with "Connected" badge
- **Locations**: "Smile Clinic - Downtown" with address, connected status

**Files:** `components/replicas/IntegrationsReplica.tsx`
**Depends on:** T1, T2
**Verify:** Manual

### T10: Settings — Team Members Replica
**Do:** Create `docs/src/components/replicas/TeamMembersReplica.tsx`:
- Uses `DashboardLayout` + `SettingsTabs` with `activeTab="users"`
- **Header**: "Team Members" with subtitle
- **Users Table**: Columns: Name, Role, Phone, Actions
  - Dr. Sarah Smith — owner
  - Jessica Torres — manager
  - Marcus Lee — viewer
- **Pending Invitations**: newdentist@smileclinic.com — viewer, pending

**Files:** `components/replicas/TeamMembersReplica.tsx`
**Depends on:** T1, T2
**Verify:** Manual

### T11: Settings — Billing Replica
**Do:** Create `docs/src/components/replicas/BillingReplica.tsx`:
- Uses `DashboardLayout` + `SettingsTabs` with `activeTab="billing"`
- **Subscription Card**: "Alloro Intelligence" plan, "ACTIVE" badge, features list (Practice rankings tracking, Team collaboration, AI-powered insights, AI-powered website builder, Task management), "$__ ending in 4242" payment method
- **Manage Subscription** button
- **Payment History Table**: Date, Amount, Status, Coupon, Invoice columns. One entry: May 1 2026, $19,900.00, PAID

**Files:** `components/replicas/BillingReplica.tsx`
**Depends on:** T1, T2
**Verify:** Manual

### T12: Settings — Account Replica
**Do:** Create `docs/src/components/replicas/AccountReplica.tsx`:
- Uses `DashboardLayout` + `SettingsTabs` with `activeTab="account"`
- **Change Password Form**: Current Password, New Password, Confirm Password fields
- **"UPDATE PASSWORD" button**

**Files:** `components/replicas/AccountReplica.tsx`
**Depends on:** T1, T2
**Verify:** Manual

### T13: Website Replicas — Editor, Submissions, Menus
**Do:** Create 3 replica components:
1. `WebsiteEditorReplica.tsx`:
   - Uses `DashboardLayout` with `activeItem="website"`
   - Tab bar: "Editing App", "Editor" (active), "Submissions", "Posts", "Menus"
   - Left panel: Site preview with component list/editor
   - Right panel: Component properties/settings (Contact/Location selector, fields)
2. `WebsiteSubmissionsReplica.tsx`:
   - Same layout, "Submissions" tab active
   - Form submissions list with columns, 3-5 fake submissions
3. `WebsiteMenusReplica.tsx`:
   - Same layout, "Menus" tab active
   - Menu editor showing navigation items

**Files:** `components/replicas/WebsiteEditorReplica.tsx`, `components/replicas/WebsiteSubmissionsReplica.tsx`, `components/replicas/WebsiteMenusReplica.tsx`
**Depends on:** T1, T2
**Verify:** Manual

### T14: Support Replica
**Do:** Create `docs/src/components/replicas/SupportReplica.tsx`:
- Uses `DashboardLayout` with `activeItem="support"`
- **Header**: "SUPPORT" label, "Help desk" heading, subtitle, "NEW TICKET" button (orange)
- **Two-column layout**:
  - Left: Ticket list with 3 tickets
    - "Rankings not updating after GBP reconnect" — NEW badge, bug report
    - "Homepage hero image broken on mobile Safari" — IN PROGRESS badge, website edit
    - "How do I add a team member?" — RESOLVED badge, feature request
  - Right: Ticket detail panel showing selected ticket title, messages thread

**Files:** `components/replicas/SupportReplica.tsx`
**Depends on:** T1, T2
**Verify:** Manual

### T15: Update Page Configs & Loader
**Do:**
1. Update all 14 `docs/src/data/pages/*.ts` files:
   - Remove `fullScreenshot` property
   - Remove `zoomRegions` array
   - Remove `zoomRegionId` from all steps
   - Add `replica` field (component name string)
2. Update `docs/src/data/pageLoader.ts`:
   - Import all replica components
   - Create replica component map
   - Export function to get replica by slug
3. For website: update to 3 page entries (website-editor, website-submissions, website-menus) or keep single entry with internal tab state. Decide based on simplicity.

**Files:** All 14 `data/pages/*.ts`, `data/pageLoader.ts`, `data/pages.ts`
**Depends on:** T3-T14 (all replicas must exist)
**Verify:** `npx tsc --noEmit` clean for docs-specific files

### T16: Cleanup
**Do:**
1. Delete `docs/public/screenshots/` directory (all screenshot PNGs)
2. Delete `docs/scripts/capture-screenshots.ts`
3. Delete `docs/scripts/fixtures/*.json` (data now hardcoded in replicas)
4. Remove unused type exports from `types/docs.ts` if any remain
5. Verify no broken imports or references

**Files:** `public/screenshots/` (delete), `scripts/` (delete)
**Depends on:** T15
**Verify:** `npm run build` succeeds, docs app loads all pages

## Parallelization

```
T1 ──┐
     ├──→ T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14 (all parallel)
T2 ──┘                                                               │
                                                                      ▼
                                                                     T15
                                                                      │
                                                                      ▼
                                                                     T16
```

T1 and T2 have no dependencies on each other and can run in parallel.
T3-T14 (all page replicas) can ALL run in parallel once T1 and T2 are done.
T15 depends on all replicas being complete.
T16 depends on T15.

## Done
- [ ] `npm run build` — zero errors in docs app
- [ ] Manual: every docs page renders a live replica instead of a screenshot
- [ ] Manual: hotspots highlight correctly on hover/click in every page
- [ ] Manual: step-by-step panel highlights corresponding hotspot zones
- [ ] Manual: viewport is scrollable and scaled to look like a desktop
- [ ] No references to `screenshots/` directory remain in source
- [ ] No imports from `../frontend/` exist anywhere in docs
