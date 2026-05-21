# Client Documentation App

## Why
Alloro clients need a beautiful, always-current documentation site that shows them how to use their dashboard — with real screenshots, interactive "click here" annotations, and per-page changelogs tied to the app's release history. No existing documentation exists.

## What
A standalone React + Vite app living at `/docs` inside the monorepo, with:
- Playwright-powered screenshot pipeline that captures every client-facing page with fake data
- Interactive hotspot overlay system (hover/click to see instructions)
- Per-page changelog + global changelog synced to `CHANGELOG.md` starting at `0.0.82`
- Beautiful, magazine-quality layout matching Alloro brand

## Context

**Relevant files:**
- `frontend/src/App.tsx` — client-facing route definitions
- `frontend/src/components/Sidebar.tsx` — navigation structure (Practice Hub, Referrals Hub, Local Rankings, To-Do, Notifications, Websites, Settings, Help)
- `frontend/src/pages/Signin.tsx` — login page (first page to document)
- `frontend/src/pages/Dashboard.tsx` — main dashboard with tab routing
- `frontend/src/components/dashboard/DashboardOverview.tsx` — Focus dashboard composition
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — local rankings view
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — referrals hub
- `frontend/src/pages/settings/` — settings sub-pages (Integrations, Users, Billing, Account)
- `CHANGELOG.md` — app changelog (latest: 0.0.82, May 2026)

**Patterns to follow:**
- Alloro brand: cream bg `#F7F5F3`, navy text, orange accents `alloro-orange`
- Tailwind 4 (same as main frontend)
- Framer Motion for transitions
- React Router for docs page navigation

**Client-facing pages to document (full scope):**

| Route | Page Name | Category |
|-------|-----------|----------|
| `/signin` | Sign In | Auth |
| `/signup` | Sign Up | Auth |
| `/forgot-password` | Forgot Password | Auth |
| `/dashboard` | Practice Hub | Dashboard |
| `/pmsStatistics` | Referrals Hub | Dashboard |
| `/rankings` | Local Rankings | Dashboard |
| `/tasks` | To-Do List | Dashboard |
| `/notifications` | Notifications | Dashboard |
| `/dfy/website` | Your Website | Features |
| `/settings/integrations` | Integrations | Settings |
| `/settings/users` | Team Members | Settings |
| `/settings/billing` | Billing | Settings |
| `/settings/account` | Account | Settings |
| `/help` | Support | Help |

## Constraints

**Must:**
- Independent Vite app — own `package.json`, own build, no imports from main frontend
- Playwright route interceptors for fake data (no code changes to main app)
- Percentage-based hotspot coordinates (resilient to minor layout shifts)
- One-command screenshot regeneration: `npm run screenshots`
- Changelog entries tagged per-page (which versions affected which pages)
- Responsive docs layout (desktop-first but readable on tablet)

**Must not:**
- No changes to the main `frontend/` codebase
- No real API calls or database access from the docs app
- No hardcoded pixel coordinates for hotspots
- No server-side rendering — pure static SPA
- No external documentation platforms (Gitbook, Notion, etc.)

**Out of scope:**
- Admin dashboard documentation
- Backend/API documentation
- Deployment/infrastructure docs
- Video tutorials or animated walkthroughs
- Search functionality (can add later)
- Multi-language support

## Risk

**Level:** 2

**Risks identified:**
- Scope magnitude → **Mitigation:** Phase execution — scaffold + one page E2E first, expand later
- Screenshot/fixture drift → **Mitigation:** One-command regen, typed fixtures
- Monorepo coupling → **Mitigation:** Fully independent app, own dependencies
- Hotspot coordinate fragility → **Mitigation:** Percentage-based coords, re-verify on regen
- Playwright interception accuracy → **Mitigation:** Type fixtures, match frontend API shape

**Blast radius:** Zero — new `/docs` directory only. No existing files modified.

## Tasks

### T1: Scaffold docs app
**Do:** Create `/docs` with Vite + React + TypeScript + Tailwind 4 setup. Include routing skeleton, base layout (sidebar + content area), and dev/build scripts.
**Files:** `docs/package.json`, `docs/vite.config.ts`, `docs/tsconfig.json`, `docs/index.html`, `docs/src/main.tsx`, `docs/src/App.tsx`, `docs/src/index.css`, `docs/tailwind.config.ts`
**Depends on:** none
**Verify:** `cd docs && npm install && npm run dev` starts successfully

### T2: Core layout and navigation
**Do:** Build the docs shell — sidebar with page groups (Auth, Dashboard, Settings, Features, Help), top bar with version badge, main content area with breadcrumbs. Brand-consistent styling.
**Files:** `docs/src/components/Layout.tsx`, `docs/src/components/Sidebar.tsx`, `docs/src/components/TopBar.tsx`, `docs/src/components/Breadcrumbs.tsx`
**Depends on:** T1
**Verify:** Manual: sidebar renders with all page groups, navigation works between placeholder pages

### T3: Screenshot display + hotspot overlay system
**Do:** Build the core interactive documentation components:
- `ScreenshotViewer` — displays a screenshot image with zoom capability
- `HotspotOverlay` — renders percentage-based hotspot regions on top of screenshots
- `HotspotTooltip` — tooltip that appears on hover/click with instruction text
- `ZoomRegion` — zoomed-in view of a screenshot region for detail callouts
**Files:** `docs/src/components/ScreenshotViewer.tsx`, `docs/src/components/HotspotOverlay.tsx`, `docs/src/components/HotspotTooltip.tsx`, `docs/src/components/ZoomRegion.tsx`
**Depends on:** T1
**Verify:** Manual: can render a placeholder image with clickable hotspot regions that show tooltips

### T4: Page documentation schema and types
**Do:** Define the TypeScript types for page documentation configs:
- `DocPage` — route, title, description, category, screenshots, hotspots, changelog entries
- `Screenshot` — path, alt text, dimensions, associated version
- `Hotspot` — x%, y%, width%, height%, tooltip text, action label, optional zoom region
- `PageChangelog` — version, date, summary, what changed on this specific page
Create the page registry (all pages listed with metadata).
**Files:** `docs/src/types/docs.ts`, `docs/src/data/pages.ts`
**Depends on:** none
**Verify:** TypeScript compiles without errors

### T5: Changelog integration
**Do:** Build the changelog system:
- Parser that reads `CHANGELOG.md` from project root and extracts structured entries
- Per-page changelog component showing which versions affected that page
- Global changelog timeline view
- Version badge in top bar showing current docs version (0.0.82)
**Files:** `docs/src/utils/parseChangelog.ts`, `docs/src/components/PageChangelog.tsx`, `docs/src/pages/ChangelogPage.tsx`, `docs/src/data/changelog.json`
**Depends on:** T2, T4
**Verify:** Changelog page renders with entries from 0.0.82; per-page changelog shows relevant entries

### T6: Fixture data for Sign In page
**Do:** Create the first fixture set. Sign In doesn't need API fixtures (it's a form), but create the screenshot capture config and hotspot definitions for:
- Full page view
- Email field (zoom)
- Password field (zoom)
- Sign In button (zoom)
- Forgot Password link (zoom)
- Sign Up link (zoom)
**Files:** `docs/src/data/pages/signin.ts`, `docs/fixtures/` (directory scaffold)
**Depends on:** T4
**Verify:** Page config type-checks, hotspot coordinates defined

### T7: Playwright screenshot pipeline
**Do:** Create the Playwright script that:
- Starts the main frontend Vite dev server (port 5173)
- Intercepts `/api/*` routes with fixture responses via `page.route()`
- Injects a localStorage auth token to bypass login redirect
- Navigates to each documented page
- Captures full-page screenshot + zoomed region screenshots per hotspot config
- Saves to `docs/public/screenshots/{version}/{page-slug}/full.png` and `docs/public/screenshots/{version}/{page-slug}/zoom-{n}.png`
**Files:** `docs/scripts/capture-screenshots.ts`, `docs/scripts/fixtures/auth.json`, `docs/scripts/fixtures/dashboard.json`, `docs/scripts/playwright.config.ts`
**Depends on:** T4, T6
**Verify:** `npm run screenshots` in docs directory captures Sign In page screenshots

### T8: Documentation page template
**Do:** Build the reusable page template that composes all the pieces:
- Page title + description
- Full screenshot with hotspot overlay
- Step-by-step instruction list (derived from hotspots)
- Zoomed region gallery
- Per-page changelog at bottom
Create the Sign In documentation page as the first complete example.
**Files:** `docs/src/components/DocPageTemplate.tsx`, `docs/src/pages/auth/SignInDoc.tsx`
**Depends on:** T2, T3, T5, T6, T7
**Verify:** Manual: Sign In docs page renders with screenshot, clickable hotspots, zoom regions, and changelog

### T9: Fixture data for Dashboard pages
**Do:** Create fixture JSON responses for the main dashboard API endpoints:
- `GET /api/dashboard/metrics` — focus dashboard data
- `GET /api/user/website/form-submissions/timeseries` — website card data
- `GET /api/practice-ranking/history` — rankings sparkline
- `GET /api/practice-ranking/latest` — current rank
- `GET /api/user/pms/keyData` — PMS card data
- `GET /api/user/tasks` — task list
- `GET /api/user/notifications` — notification feed
- User profile / organization / location fixtures for context providers
**Files:** `docs/scripts/fixtures/dashboard-metrics.json`, `docs/scripts/fixtures/rankings.json`, `docs/scripts/fixtures/pms.json`, `docs/scripts/fixtures/tasks.json`, `docs/scripts/fixtures/notifications.json`, `docs/scripts/fixtures/user-profile.json`, `docs/scripts/fixtures/locations.json`
**Depends on:** T4
**Verify:** All fixture files are valid JSON and match expected response shapes

### T10: Fixture data for Settings & remaining pages
**Do:** Create fixtures for:
- Integrations page (connected GBP, analytics integrations)
- Users page (team member list)
- Billing page (subscription, payment method)
- Account page (user profile)
- Help page (support tickets list)
- Website page (DFY site preview state)
- Rankings page (full rankings dashboard data)
- Referrals Hub (PMS pillars data)
**Files:** `docs/scripts/fixtures/integrations.json`, `docs/scripts/fixtures/users.json`, `docs/scripts/fixtures/billing.json`, `docs/scripts/fixtures/account.json`, `docs/scripts/fixtures/support.json`, `docs/scripts/fixtures/website.json`
**Depends on:** T4
**Verify:** All fixture files valid JSON

### T11: All page documentation configs + hotspot definitions
**Do:** Create documentation page configs (title, description, hotspot definitions) for all remaining pages. Each page gets:
- Hotspot regions for key interactive elements
- Step-by-step instruction text
- Category assignment
- Related changelog versions
**Files:** `docs/src/data/pages/dashboard.ts`, `docs/src/data/pages/rankings.ts`, `docs/src/data/pages/referrals.ts`, `docs/src/data/pages/tasks.ts`, `docs/src/data/pages/notifications.ts`, `docs/src/data/pages/settings-integrations.ts`, `docs/src/data/pages/settings-users.ts`, `docs/src/data/pages/settings-billing.ts`, `docs/src/data/pages/settings-account.ts`, `docs/src/data/pages/help.ts`, `docs/src/data/pages/website.ts`, `docs/src/data/pages/signup.ts`, `docs/src/data/pages/forgot-password.ts`
**Depends on:** T4, T8 (uses the established pattern from Sign In)
**Verify:** All page configs type-check

### T12: Full screenshot capture run + all doc pages
**Do:** Run the Playwright pipeline for all pages (not just Sign In). Create the individual doc page components for each documented page using `DocPageTemplate`. Wire all pages into the docs router.
**Files:** `docs/src/pages/auth/SignUpDoc.tsx`, `docs/src/pages/auth/ForgotPasswordDoc.tsx`, `docs/src/pages/dashboard/PracticeHubDoc.tsx`, `docs/src/pages/dashboard/ReferralsHubDoc.tsx`, `docs/src/pages/dashboard/LocalRankingsDoc.tsx`, `docs/src/pages/dashboard/TodoListDoc.tsx`, `docs/src/pages/dashboard/NotificationsDoc.tsx`, `docs/src/pages/settings/IntegrationsDoc.tsx`, `docs/src/pages/settings/UsersDoc.tsx`, `docs/src/pages/settings/BillingDoc.tsx`, `docs/src/pages/settings/AccountDoc.tsx`, `docs/src/pages/features/WebsiteDoc.tsx`, `docs/src/pages/help/SupportDoc.tsx`
**Depends on:** T7, T8, T9, T10, T11
**Verify:** `npm run screenshots` captures all pages; all doc pages render with screenshots and hotspots

## Execution Phases

**Phase A (MVP — first execution):** T1, T2, T3, T4, T5, T6, T7, T8
- Delivers: working docs app with one complete page (Sign In), changelog, hotspot system proven

**Phase B (Content expansion):** T9, T10, T11, T12
- Delivers: all pages documented with fixtures, screenshots, and hotspot configs

## Task Dependency Graph

```
T1 ──┬── T2 ──── T5 ──┐
     │                  │
     ├── T3 ───────────┤
     │                  ├── T8 ──── T12
T4 ──┼── T6 ──── T7 ──┘           │
     │                              │
     ├── T9 ───────────────────────┤
     ├── T10 ──────────────────────┤
     └── T11 ──────────────────────┘
```

**Parallelizable groups:**
- T1 + T4 (no dependencies)
- T2 + T3 (both depend only on T1)
- T6 + T9 + T10 + T11 (all depend only on T4)
- T5 depends on T2 + T4
- T7 depends on T4 + T6
- T8 depends on T2 + T3 + T5 + T6 + T7
- T12 depends on T7 + T8 + T9 + T10 + T11

## Done
- [ ] `cd docs && npm run build` — zero errors
- [ ] `cd docs && npx tsc --noEmit` — zero errors
- [ ] `cd docs && npm run screenshots` — captures all 14 pages
- [ ] Manual: docs app renders at localhost with sidebar, all pages navigable
- [ ] Manual: Sign In page shows screenshot with working hotspot tooltips
- [ ] Manual: clicking hotspot zooms into relevant region with instruction
- [ ] Manual: per-page changelog shows relevant version entries
- [ ] Manual: global changelog page shows full history starting at 0.0.82
- [ ] No modifications to existing `frontend/` or `src/` files
