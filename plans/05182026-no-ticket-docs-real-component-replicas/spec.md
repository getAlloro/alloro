# Docs Visual Replicas v2: Copy Real Components with Fake Data

## Why
v1 replicas were hand-built by agents referencing screenshots. The result doesn't match the real app's pixel-perfect appearance. Copying the actual component JSX and Tailwind styling with hardcoded fake data guarantees exact visual fidelity.

## What
Replace all 14 replica files in `docs/src/components/replicas/` with copies of the real app components from `frontend/src/`. Strip all hooks, API calls, context usage, and state management. Replace with hardcoded fake data. Maintain the existing HotspotZone + DesktopViewport + ReplicaProps architecture.

## Context

**Source (real app):** `frontend/src/pages/` and `frontend/src/components/`
**Target (docs app):** `docs/src/components/replicas/`

**Existing architecture to preserve:**
- `DocPageTemplate.tsx` renders `<DesktopViewport>` containing the replica
- Each replica accepts `ReplicaProps { hotspots, activeHotspotId, onHotspotClick }`
- `HotspotZone` wraps key sections for interactive documentation tooltips
- `data/pages/*.ts` configs already wired to current replicas

**Patterns to follow:**
- Current `SignInReplica.tsx` — reference for `findHotspot` helper + `HotspotZone` wrapping pattern
- Current `DashboardLayout.tsx` — wraps replica content in sidebar + content flexbox

**Real app component map (source files to copy from):**

| Doc Page | Source Component(s) | Lines |
|----------|-------------------|-------|
| Sign In | `pages/Signin.tsx` | 232 |
| Sign Up | `pages/Signup.tsx` | 327 |
| Forgot Password | `pages/ForgotPassword.tsx` | 416 |
| Practice Hub | `pages/Dashboard.tsx` > `DashboardOverview.tsx` + 6 sub-components (Hero, Trajectory, ActionQueue, WebsiteCard, LocalRankingCard, PMSCard) | 138 + 2340 |
| Referrals Hub | `pages/Dashboard.tsx` > `ReferralEngineDashboard.tsx` | 967 |
| Local Rankings | `pages/Dashboard.tsx` > `RankingsDashboard.tsx` | 2085 |
| Todo List | `pages/Dashboard.tsx` > `TasksView.tsx` | 877 |
| Notifications | `pages/Notifications.tsx` | 445 |
| Integrations | `pages/settings/IntegrationsRoute.tsx` | 654 |
| Team Members | `components/settings/UsersTab.tsx` | 563 |
| Billing | `components/settings/BillingTab.tsx` | 575 |
| Account | `components/settings/ProfileTab.tsx` | 270 |
| Website | `pages/DFYWebsite.tsx` | 1443 |
| Support | `pages/Help.tsx` + `components/support/SupportTicketList.tsx` + `SupportTicketDetail.tsx` | 155 + 128 + 125 |

**Layout components to copy:**
- `components/Sidebar.tsx` (655 lines) — replaces current `AlloroSidebar.tsx`
- `pages/Settings.tsx` (115 lines) — replaces current `SettingsTabs.tsx`

## Constraints

**Must:**
- Copy the exact JSX and Tailwind classes from real components
- Inline all sub-component JSX into one replica file per page (no separate sub-component files)
- Maintain `ReplicaProps` interface and `HotspotZone` wrapping on all replicas
- Keep `DashboardLayout` wrapper pattern (sidebar + content)
- Keep `AuthLayout` wrapper pattern for auth pages
- All fake data hardcoded at top of file as `const` declarations
- Zero new npm dependencies (no date-fns, no react-hot-toast, no @tanstack/react-query)

**Must not:**
- Import anything from `frontend/src/` (docs must be fully standalone)
- Include any real API endpoints, hook implementations, or business logic
- Include any interactive state management (form submissions, modals, file uploads)
- Include event listeners, polling, or side effects
- Create mock context providers (unnecessary — fake data is inline)

**Out of scope:**
- Responsive/mobile layouts (replicas render at 1440px inside DesktopViewport)
- Animation states (show "resting" state only, keep framer-motion for subtle entrance animations if already in the real component)
- Modal content (show the page in its default state, no modals open)
- Loading/error/empty states (show the "data loaded" happy path only)

## Risk

**Level:** 2

**Risks identified:**
- **Maintenance drift** — when real app components change markup, docs copies become stale. No automated detection.
  **Mitigation:** Accept this cost. User explicitly chose Option A. Consider adding a `// Copied from: frontend/src/pages/Signin.tsx @ v0.0.82` comment header to each file for manual sync tracking.
- **DFY Website complexity** — 1443 lines, iframe-based editor with template engine. Not practical to copy verbatim.
  **Mitigation:** For Website only, copy the tab bar + panel layout structure from the real component but use a static placeholder for the iframe/preview area. This gives accurate chrome without the impossible iframe reproduction.
- **Sub-component inlining bloat** — Practice Hub has 7 sub-components totaling 2478 lines. Inlining all into one file creates a very large replica.
  **Mitigation:** Acceptable. Each file is still self-contained with zero external dependencies. Add section comments (`// === Hero Section ===`) for navigation.

**Blast radius:** Only `docs/src/components/replicas/*.tsx` files change. No changes to types, page configs, DesktopViewport, HotspotZone, or any wiring. Drop-in replacements.

## Tasks

### T1: Shared layouts — copy real Sidebar + Settings tabs
**Do:**
- Read `frontend/src/components/Sidebar.tsx` (655 lines). Copy the JSX structure into `docs/src/components/replicas/AlloroSidebar.tsx`. Strip all: useEffect polling, event listeners, auth hooks, billing checks, location switching, logout flow. Hardcode: nav items with icons, badge counts, user card ("Dr. Alex Smith"), location card ("Smile Clinic - Downtown"), collapsed=false state. Keep the exact Tailwind classes and layout structure.
- Read `frontend/src/pages/Settings.tsx` (115 lines). Copy the tab bar JSX into `docs/src/components/replicas/SettingsTabs.tsx`. Strip: NavLink routing. Hardcode: tab items, active state passed as prop.
- Both files must maintain their current component interfaces so existing replicas continue working during the transition.
**Files:** `docs/src/components/replicas/AlloroSidebar.tsx`, `docs/src/components/replicas/SettingsTabs.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit` — zero errors

### T2: Auth replicas — copy real SignIn, SignUp, ForgotPassword
**Do:**
- Read each auth page from `frontend/src/pages/` (Signin.tsx 232 lines, Signup.tsx 327 lines, ForgotPassword.tsx 416 lines)
- For each: copy the JSX return block. Strip: useState form state, API calls (signInWithPassword, signUpWithPassword, requestPasswordReset), useNavigate, useSearchParams, loading/error states. Keep: the form layout, input fields (as readOnly with placeholder values), buttons, links, icons, Tailwind classes. Wrap key sections in HotspotZone. Accept ReplicaProps.
- Show the "default/idle" state — empty form fields with placeholders, no error messages, no loading spinners
**Files:** `docs/src/components/replicas/SignInReplica.tsx`, `SignUpReplica.tsx`, `ForgotPasswordReplica.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T3: Practice Hub replica — copy real DashboardOverview + 6 sub-components
**Do:**
- Read `frontend/src/components/dashboard/focus/DashboardOverview.tsx` (138 lines) and all sub-components: `FocusHeader.tsx`, `Hero.tsx` (437), `Trajectory.tsx` (393), `ActionQueue.tsx` (193), `WebsiteCard.tsx` (406), `LocalRankingCard.tsx` (439), `PMSCard.tsx` (472)
- Inline all sub-component JSX into a single `PracticeHubReplica.tsx`. Add section comments.
- Strip: useAuth, useLocationContext, usePmsFocusPeriod, useTopAction, useAgentData, useDashboardMetrics, useQuery, all API fetches, sparkline data generation, event listeners
- Hardcode at top: focus period ("May 2026"), hero action data, trajectory greeting + summary text, action queue items (3), website stats (leads count, unread, sparkline as static bars), ranking position (#3) + health score (82) + factors, PMS production ($47K) + referral mix + top sources
- Wrap in DashboardLayout. Wrap 6-7 key sections in HotspotZone.
**Files:** `docs/src/components/replicas/PracticeHubReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T4: Referrals Hub replica — copy real ReferralEngineDashboard
**Do:**
- Read `frontend/src/components/dashboard/pms/ReferralEngineDashboard.tsx` (967 lines)
- Copy JSX. Strip: file upload drag-drop, API calls, locationContext, filter state management
- Hardcode: monthly production data (6 months), referral source table (5 rows), attribution matrix (doctor + non-doctor sections), filter showing "All"
- Show "data loaded" state with stats populated. No upload modal.
- Wrap in DashboardLayout. HotspotZone on: stats row, production chart, referral sources table, attribution matrix.
**Files:** `docs/src/components/replicas/ReferralsHubReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T5: Local Rankings replica — copy real RankingsDashboard
**Do:**
- Read `frontend/src/components/dashboard/rankings/RankingsDashboard.tsx` (2085 lines)
- Copy the JSX structure. This is the largest component — inline everything.
- Strip: all query hooks, wizard demo data generation, URL param handling, ranking job polling, callbacks
- Hardcode: Maps estimate (#3), Practice Health score (82/100), 8 factor scores with weights, top 5 competitors table, next moves recommendations (3 cards), gaps analysis
- Wrap in DashboardLayout. HotspotZone on: rank badge, health score gauge, competitors table, next moves section.
**Files:** `docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T6: Todo List replica — copy real TasksView
**Do:**
- Read `frontend/src/components/dashboard/tasks/TasksView.tsx` (877 lines)
- Copy JSX including inline TaskCard sub-component. Strip: fetchClientTasks, completeTask, event dispatchers, checkbox interaction, expand/collapse state, priority calculation
- Hardcode: 3-4 task cards with title, description, priority badge, domain icon, due date. Show mix of complete and incomplete. Progress indicator at ~40%.
- Wrap in DashboardLayout. HotspotZone on: header, progress indicator, individual task cards.
**Files:** `docs/src/components/replicas/TodoListReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T7: Notifications replica — copy real Notifications page
**Do:**
- Read `frontend/src/pages/Notifications.tsx` (445 lines)
- Copy JSX. Strip: notification queries, auth, location context, navigation handlers, mark-all/delete-all mutations, confirmation modal
- Hardcode: 4 notifications — mix of types (pms/task/ranking/agent) and impacts (critical/high/update), 2 unread + 2 read. Include the type-specific icon and color mapping from the real component.
- Wrap in DashboardLayout. HotspotZone on: header/actions, individual notification cards.
**Files:** `docs/src/components/replicas/NotificationsReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T8: Integrations replica — copy real IntegrationsRoute
**Do:**
- Read `frontend/src/pages/settings/IntegrationsRoute.tsx` (654 lines)
- Copy the JSX grid layout. Strip: useSettingsScopes, usePmsStatus, useGoogleReconnect, useUserGscIntegration, OAuth flows, expand/collapse state, banner logic
- Hardcode: practice details (website URL, email), GSC "Connected" state, 1 location card with "PRIMARY" badge, encryption notice card
- Wrap in DashboardLayout with SettingsTabs. HotspotZone on: settings tabs, practice details, GSC card, locations section.
**Files:** `docs/src/components/replicas/IntegrationsReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T9: Team Members replica — copy real UsersTab
**Do:**
- Read `frontend/src/components/settings/UsersTab.tsx` (563 lines)
- Copy the JSX for the users table and invitations section. Strip: API mutations, modal state, role change logic, invite flow, confirmation modals, alert modals
- Hardcode: 3 users (Owner, Manager, Viewer) with names, emails, roles, joined dates. 1 pending invitation.
- Wrap in DashboardLayout with SettingsTabs. HotspotZone on: settings tabs, header, users table, invitations section.
**Files:** `docs/src/components/replicas/TeamMembersReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T10: Billing replica — copy real BillingTab
**Do:**
- Read `frontend/src/components/settings/BillingTab.tsx` (575 lines)
- Copy the "Active Subscription" state JSX (skip Locked Out, Admin-Granted, Cancelled, Unsubscribed states). Strip: Stripe integration, checkout flows, portal redirect, billing API
- Hardcode: plan name ("Alloro Intelligence"), status "Active", renewal date, Visa ending 4242, 6 feature items, 2 invoice rows with dates/amounts/status
- Wrap in DashboardLayout with SettingsTabs. HotspotZone on: settings tabs, subscription card, manage button, payment history.
**Files:** `docs/src/components/replicas/BillingReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T11: Account replica — copy real ProfileTab
**Do:**
- Read `frontend/src/components/settings/ProfileTab.tsx` (270 lines)
- Copy the "Change Password" mode JSX (not "Set Password" mode). Strip: password API, validation logic, toast, loading state, visibility toggle state
- Hardcode: 3 password fields (current, new, confirm) with visibility toggle icons, all empty with placeholders. Show the password rules list in default (unchecked) state.
- Wrap in DashboardLayout with SettingsTabs. HotspotZone on: settings tabs, password form, submit button.
**Files:** `docs/src/components/replicas/AccountReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T12: Website replica — copy real DFYWebsite structure
**Do:**
- Read `frontend/src/pages/DFYWebsite.tsx` (1443 lines). This is the exception — iframe-based editor cannot be copied verbatim.
- Copy the tab bar structure (Editing Page selector, Editor/Submissions/Posts/Menus tabs, device toggles, action buttons) and the two-panel layout (preview left, chat/history right). Use the real component's exact Tailwind classes for the chrome.
- For the preview panel: instead of an iframe, render a static approximation of a dental website (hero section, services grid, about section) using the same layout dimensions the real component uses.
- Strip: iframe rendering, template engine, page CRUD, all API calls, sidebar hook
- Hardcode: page name "Home", tab state "Editor" active, desktop view active
- Wrap in DashboardLayout. HotspotZone on: website tabs, editor preview, editor controls.
**Files:** `docs/src/components/replicas/WebsiteEditorReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T13: Support replica — copy real Help + sub-components
**Do:**
- Read `frontend/src/pages/Help.tsx` (155 lines), `components/support/SupportTicketList.tsx` (128 lines), `components/support/SupportTicketDetail.tsx` (125 lines)
- Inline all sub-component JSX into a single file. Strip: support queries, ticket mutations, URL param sync, reply form submission
- Hardcode: 3 tickets (Bug Report selected, Website Edit, Feature Request) with status badges, 1 message thread on selected ticket, reply textarea empty
- Copy the real component's two-column grid layout (ticket list left, detail right), status badge colors, type label styling.
- Wrap in DashboardLayout. HotspotZone on: header, new ticket button, ticket list, ticket detail.
**Files:** `docs/src/components/replicas/SupportReplica.tsx`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

### T14: Verification + cleanup
**Do:**
- Run `npx tsc --noEmit` — fix any errors
- Delete unused replica files if any remain (WebsiteSubmissionsReplica.tsx, WebsiteMenusReplica.tsx)
- Visual verification: start dev server, check 3+ pages at desktop width
- Verify all 14 page configs still resolve correctly (no import changes needed — file names unchanged)
**Files:** various
**Depends on:** T1-T13
**Verify:** `npx tsc --noEmit` clean, visual check passes

## Done
- [ ] `npx tsc --noEmit` — zero errors
- [ ] All 14 replicas replaced with copies of real component JSX
- [ ] Each replica file has `// Copied from: frontend/src/...` header comment for sync tracking
- [ ] HotspotZone wrapping maintained on all replicas
- [ ] No imports from `frontend/src/` — all replicas are self-contained
- [ ] Visual verification: 3+ pages match real app appearance
- [ ] No new npm dependencies added
