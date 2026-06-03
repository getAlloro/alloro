# Websites Tab → Cards-First Overview Dashboard

## Why
`/dfy/website` drops the user straight into the heavyweight page editor. It's not glanceable, and there's no single place to see how the site is doing. We want the Websites tab to land on an **owner-readable cards dashboard** first — same simplified spirit as the Rankings/Referrals redesign — with each card a glanceable summary + entry point into the existing tool.

## What
A new **overview** view becomes the default for `/dfy/website`, rendering five cards in the established cream-hero/white-line-soft design system, with charts in the house Recharts style:

1. **Analytics (Rybbit)** — sessions/pageviews trend sparkline + headline number.
2. **Form submissions** — unread/total + monthly sparkline.
3. **Posts** — count (+ empty state when no `template_id`).
4. **Menus** — count.
5. **Pages** — count; opens a new pages-list view.

The editor is demoted to `?tab=editor` and lazy-mounts. A new `?tab=pages` list view is added. A new user-facing analytics endpoint exposes Rybbit data (currently admin-only). The onboarding wizard tour is kept working.

**Done when:** clicking Websites lands on the cards overview; each card summarizes real data and links into its tool; the analytics card shows Rybbit data via a user endpoint; a pages-list view exists; the wizard tour still completes; `npx tsc -b` passes; the editor still edits/saves with no regression.

## Context

**Relevant files:**
- `frontend/src/pages/DFYWebsite.tsx` — the Websites page. Tab logic at `WEBSITE_TABS` (:94), `getWebsiteTabFromParams` (:103), `setWebsiteTab` (:152); editor mount state (:132-145); website fetch (:557-583); wizard demo-data branch (:517-528); view render switch (:1308-1450); wizard targets at :1309 / :1385.
- `src/controllers/user-website/UserWebsiteController.ts` — `getFormSubmissionStats` (:605) is the controller analog for the new analytics endpoint (org→project resolution pattern).
- `src/routes/user/website.ts` — user route table; add the analytics route near `/form-submissions/stats` (:217).
- `src/controllers/admin-websites/feature-services/service.rybbit-performance.ts` — `getDashboard(integration, rangeDays, rowsLimit, rowsOffset)` (:190); reuse as-is.
- `src/models/website-builder/WebsiteIntegrationModel.ts` — `findByProjectAndPlatform(projectId, platform)` (:63); the Rybbit resolver.
- `frontend/src/components/PMS/dashboard/PmsProductionChart.tsx` — dual-line house chart recipe.
- `frontend/src/components/dashboard/gbp-automation/GbpEngagementSparkline.tsx` — sparkline house recipe (primary analog for `TrendSparkline`).
- `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx` — overview composition analog (`.pm-light` wrapper + MeaningHero + cards + DetailsModal).
- `frontend/src/components/dashboard/shared/` — `MeaningHero`, `DetailsModal`, `SectionTitle`, `InfoTip` (reuse). New `TrendSparkline` lands here.
- `frontend/src/components/Admin/{FormSubmissionsTab,PostsTab,MenusTab}.tsx` — existing tab views the cards link into; `*Tab.tsx` is the naming analog for the new pages tab.
- `frontend/src/components/onboarding-wizard/wizardConfig.ts` — website steps `website-overview` (:265), `website-editor` (:274), `website-submissions` (:283); demo data `websiteCardData` (:555), demo project/pages (:820-839).
- `frontend/src/index.css` — chart tokens: dark defaults (:234-250), `.pm-light` warm overrides (:382-389).

**Patterns to follow:**
- Overview composition + `.pm-light` wrapper: mirror `PmsDashboardSurface.tsx`.
- House chart recipe (orange primary / navy or pm-success secondary, hidden axes + 3-col label row, no tooltip box → headline-number-on-hover, gradient wash, padded hidden Y-domain, 700ms ease-out): mirror `GbpEngagementSparkline.tsx` / `PmsProductionChart.tsx`.
- User endpoint org→project resolution: mirror `getFormSubmissionStats`.
- Detail card shell: `rounded-[14px] border border-line-soft bg-white shadow-premium`.

**Reference files:** `PmsDashboardSurface.tsx` (overview), `GbpEngagementSparkline.tsx` (charts), `getFormSubmissionStats` (endpoint).

## Constraints

**Must:**
- Wrap the overview root in `.pm-light` — chart tokens (`--color-pm-*`) are dark by default and only warm under `.pm-light`.
- Reuse `getDashboard` + `findByProjectAndPlatform` for analytics; new code = one route + one thin controller only.
- Keep the lightweight `GET /user/website` fetch (overview needs `project`/`pages`/`usage`/`status`).
- Preserve `?tab=editor`, `?tab=submissions`, `?tab=posts`, `?tab=menus` deep-links.
- Keep the wizard tour working (see T7).
- House chart recipe only — orange `var(--color-alloro-orange)` primary, navy/pm-success secondary.
- Commit author `LagDave <laggy80@gmail.com>`.

**Must not:**
- Extract/restructure the editor into a separate component (gate its effects only).
- Refactor the shipped `PmsProductionChart`/`GbpEngagementSparkline` to use the new primitive (separate follow-up).
- Reuse the admin `RybbitPerformanceDashboard` rendering (wrong design system).
- Move the existing `Admin/*Tab.tsx` files.
- Add a DB migration (no schema change — analytics reuses `website_builder.rybbit_data`).
- Add new dependencies.

**Out of scope:**
- Full editor extraction into `WebsiteEditor.tsx`.
- Migrating existing PMS/GBP charts onto `TrendSparkline`.
- Consolidating `Admin/*Tab.tsx` into a `components/website/` home.
- A drill-in analytics modal beyond a simple sparkline (can be a follow-up; v1 = sparkline + headline).
- Surfacing `pagesPerSession`/`sessionDuration` beyond what the simple card needs.

## Risk

**Level:** 3 (wizard coupling can break a shipped onboarding flow; core user page restructured).

**Risks identified:**
- **Wizard tour breakage** → website steps target editor/submissions DOM and the page swaps to demo data when wizard active; default-flip + lazy-mount removes those targets. **Mitigation:** T7 — tab-aware wizard steps, `website-overview` target, force-mount targeted view when `isWizardActive`, demo data for overview cards.
- **Editor regression from default-flip/lazy-mount** → editing is the core feature. **Mitigation:** gate mount effects on `activeView==='editor'`, do not restructure; manual editor save/undo/redo verification in T6.
- **Analytics disconnected/empty** → no Rybbit integration or no data. **Mitigation:** three-state analytics card; endpoint returns `hasIntegration` + safe empty shape.
- **Parallel chart abstraction** → `TrendSparkline` becomes a 3rd near-duplicate. **Mitigation:** build it as the canonical shared primitive (new consumers now), migrate existing charts later (out of scope, noted).
- **Posts gating** (Level 1) → posts require `template_id`. **Mitigation:** posts card empty state.

**Blast radius:**
- `frontend/src/pages/DFYWebsite.tsx` — every user's website experience (editor, submissions, posts, menus). Highest-touch file.
- `frontend/src/components/onboarding-wizard/wizardConfig.ts` — onboarding tour for all new users.
- New backend route under `/api/user/website` — additive, no existing consumer affected.
- `frontend/src/components/dashboard/shared/` — adding `TrendSparkline` is additive (existing primitives untouched).
- `src/controllers/admin-websites/.../service.rybbit-performance.ts` and `WebsiteIntegrationModel` — read-only reuse, not modified.

**Pushback:** Making overview the default is right, but it converts DFYWebsite from "an editor" into "a router with an editor inside." We're doing the minimum restructure (gate, don't extract) to limit risk — accept that DFYWebsite stays large and a proper editor extraction is deferred. The wizard coupling is the real cost here; don't ship without T7.

## Tasks

### T1: User-facing analytics endpoint
**Do:** Add `getWebsiteAnalytics(req,res)` to `UserWebsiteController.ts` mirroring `getFormSubmissionStats`: `orgId → ProjectModel.findByOrganizationId → WebsiteIntegrationModel.findByProjectAndPlatform(project.id,"rybbit")`. If no integration → return `{ hasIntegration:false, latestReportDate:null, dataDays:0, totals:<zeros>, daily:[] }`. Else call `getDashboard(integration, rangeDays, 0, 0)` and return a slim `{ hasIntegration:true, latestReportDate, dataDays, totals, daily }` (drop `rows`/pagination). Accept `?rangeDays` (default 90). Register `GET /analytics` in `src/routes/user/website.ts` with the same RBAC middleware as `/form-submissions/stats`.
**Files:** `src/controllers/user-website/UserWebsiteController.ts`, `src/routes/user/website.ts`
**Depends on:** none.
**Verify:** `curl`/Playwright authed GET `/api/user/website/analytics` returns the slim shape for an org with and without a Rybbit integration; `npx tsc -b` passes in backend.

### T2: `TrendSparkline` shared primitive
**Do:** Create `frontend/src/components/dashboard/shared/TrendSparkline.tsx` implementing the house recipe from `GbpEngagementSparkline`: Recharts `LineChart`+`Area` gradient, configurable primary (default orange) / optional secondary line, hidden axes, horizontal dashed grid (`--color-pm-border-subtle`), `Tooltip content={()=>null}` + dashed cursor, padded hidden Y-domain, 3-col first/middle/last label row, hover→`onActiveIndexChange` so the parent shows the headline number. Props: `{ data, valueKey, secondaryKey?, labelKey, height?, onActiveIndexChange? }`. Do **not** modify the existing two charts.
**Files:** `frontend/src/components/dashboard/shared/TrendSparkline.tsx`
**Depends on:** none.
**Verify:** Renders in isolation with sample data; `tsc` clean. Visual parity with GbpEngagementSparkline when wrapped in `.pm-light`.

### T3: Frontend analytics API
**Do:** Add `WebsiteAnalytics` type (`{ hasIntegration, latestReportDate, dataDays, totals:{sessions,pageviews,users,bounceRate,pagesPerSession,sessionDuration}, daily: Array<{date,sessions,pageviews,users,...}> }`) and `fetchWebsiteAnalytics(rangeDays?)` to `frontend/src/api/websites.ts`, hitting `GET /user/website/analytics`. Match the existing fetch/error style in that module.
**Files:** `frontend/src/api/websites.ts`
**Depends on:** T1 (contract).
**Verify:** Type matches T1 response; `tsc` clean.

### T4: WebsiteOverview + five cards
**Do:** Create `frontend/src/components/website/overview/WebsiteOverview.tsx` (root wrapped in `.pm-light`, composition mirrors `PmsDashboardSurface`) plus card components in the same folder: `AnalyticsCard`, `FormSubmissionsCard`, `PostsCard`, `MenusCard`, `PagesCard`. Use detail-card shell + `SectionTitle`/`InfoTip`. Data: analytics via `fetchWebsiteAnalytics` (T3) + `TrendSparkline` (T2) with headline session/pageview number and three-state handling; form submissions via existing `/form-submissions/stats` + `/timeseries` (sparkline); posts count via `/user/website/posts` (empty state if no `project.template_id`); menus count via `/user/website/menus`; pages count from `pages` prop (already loaded by DFYWebsite). Each card has a click target: analytics→(stay/sparkline), forms→`?tab=submissions`, posts→`?tab=posts`, menus→`?tab=menus`, pages→`?tab=pages`. Accept an `isWizardActive`/demo-data prop path so cards can render demo values (wired in T7).
**Files:** `frontend/src/components/website/overview/WebsiteOverview.tsx`, `.../AnalyticsCard.tsx`, `.../FormSubmissionsCard.tsx`, `.../PostsCard.tsx`, `.../MenusCard.tsx`, `.../PagesCard.tsx`
**Depends on:** T2, T3.
**Verify:** Renders all five cards with real data for a seeded org; empty states for no-Rybbit and no-template; `tsc` clean; Playwright screenshot in `.pm-light` matches the warm system.

### T5: WebsitePagesTab (pages list)
**Do:** Create `frontend/src/components/website/WebsitePagesTab.tsx` — a list view of `pages` (path, status, `updated_at`), styled with the detail-card shell. Row click navigates to `?tab=editor&page=<id>`. Empty/loading states. Receives `pages` from DFYWebsite (no new fetch).
**Files:** `frontend/src/components/website/WebsitePagesTab.tsx`
**Depends on:** none (coordinate shell styling with T4).
**Verify:** Lists seeded pages; clicking a row lands the editor on that page (after T6); `tsc` clean.

### T6: DFYWebsite wiring (tabs, default, lazy editor, deep-link)
**Do:** Extend `WEBSITE_TABS` to `["overview","editor","submissions","posts","menus","pages"]`; make `getWebsiteTabFromParams` default to `"overview"`; update `setWebsiteTab` so `overview` is the no-param default and `editor` becomes `?tab=editor`. Render `WebsiteOverview` for `overview` and `WebsitePagesTab` for `pages`. **Gate the editor's heavy mount effects** (page-version fetch `/pages/:id/edit`, iframe HTML resolve, undo/redo init, chat) on `activeView==='editor'`; keep the top-level `GET /user/website` fetch. Read `?page=<id>` on entering the editor to preselect that page.
**Files:** `frontend/src/pages/DFYWebsite.tsx`
**Depends on:** T4, T5.
**Verify:** Websites lands on overview; `?tab=editor` opens the editor and editing/save/undo/redo still work; `?tab=editor&page=<id>` preselects; submissions/posts/menus deep-links unchanged; overview does not trigger editor-only network calls (check Network tab); `tsc` clean.

### T7: Wizard compatibility
**Do:** Make the website wizard steps tab-aware so each step mounts its target view before spotlighting: drive `?tab=` from the step (e.g. `website-overview`→overview, `website-editor`→editor, `website-submissions`→submissions). Add `data-wizard-target='website-overview'` on the overview root. When `isWizardActive`, force-mount the targeted view (bypass lazy-mount for the editor during the tour). Feed `WebsiteOverview` cards demo values from `wizardConfig.websiteCardData` (extend it with demo analytics if absent) instead of live fetches when wizard active.
**Files:** `frontend/src/components/onboarding-wizard/wizardConfig.ts`, `frontend/src/pages/DFYWebsite.tsx`, `frontend/src/components/website/overview/WebsiteOverview.tsx`
**Depends on:** T4, T5, T6.
**Verify:** Run the onboarding wizard end-to-end (Playwright): the `website-overview`, `website-editor`, and `website-submissions` steps each spotlight a mounted element; overview cards show demo numbers; tour completes without a missing-target error.

## Done
- [ ] `npx tsc -b` (backend) and `npx tsc -b` (frontend) — zero errors
- [ ] `GET /api/user/website/analytics` returns the slim shape, handling no-integration and no-data
- [ ] Websites tab lands on the overview cards by default; editor reachable at `?tab=editor`
- [ ] All 5 cards show real data + correct empty states (no-Rybbit, no-template)
- [ ] Charts use the house recipe under `.pm-light` (orange/navy, hidden axes, headline-on-hover) — visually consistent with PMS/Rankings
- [ ] Pages-list view at `?tab=pages`; row click opens the editor on that page
- [ ] Editor still edits/saves/undo-redo with no regression; overview triggers no editor-only network calls
- [ ] Onboarding wizard tour completes; all three website steps spotlight mounted targets
- [ ] No DB migration; existing PMS/GBP charts and `Admin/*Tab.tsx` untouched

## Revision Log

### Rev 1 — 2026-05-31
**Change:** Two follow-ups after the landing flip, both because the editor is no longer the default view.
- **Loading skeleton:** `DFYWebsite`'s `loading` skeleton was editor-shaped (center preview + `w-96` right panel), so it flashed an editor layout before resolving to the overview cards. Made it view-aware — renders an overview cards-grid skeleton when `activeView !== "editor"`, keeps the editor skeleton for the editor.
- **Sidebar auto-collapse:** the mount effect hard-collapsed the sidebar on every website-tab visit (built for editor-first). Now `setCollapsed(activeView === "editor")` — collapses only for the editor, expands for the overview and other non-editor views; expands on unmount.
**Reason:** Owner-readable overview is the default; editor-shaped loading + forced collapse were leftovers from editor-first behavior.
**Updated Done criteria:** Loading skeleton matches the active view; sidebar collapses only on the editor and expands on non-editor views.

### Rev 2 — 2026-05-31
**Change:** Simplified the Websites top bar to just the tab row (consistent with the app's standard underline tabs). Removed the always-on page selector entirely — page-switching now happens via the Pages tab — plus the edits/storage usage readout and the Connect Domain + View Live buttons. Relocated Connect Domain + View Live into the Overview header (passed `liveUrl`/`customDomain`/`domainVerified`/`onConnectDomain` to `WebsiteOverview`). Pruned the dead dropdown state/ref/click-outside effect, the orphaned `usage` state + `Usage` interface, and now-unused icon imports (`ChevronDown`, `Check`, `LinkIcon`, `ExternalLink`).
**Reason:** The editor-era top bar was clutter on the cards-first overview and every other non-editor view.
**Updated Done criteria:** Non-editor views show only the tab row; Connect Domain + View Live live in the Overview header; the editor keeps its own controls (viewport/undo/Save). Verified live: overview top bar = tabs only, header shows the domain + View Live, editor still mounts with viewport toggle.

### Rev 3 — 2026-05-31
**Change:** The editor-shaped skeleton the user kept seeing was **DFYRoute's** own tier-check skeleton (`DFYRoute.tsx`: a 3-pane sidebar+center+right layout), shown *before* DFYWebsite mounts while DFYRoute calls `/user/website` to check DFY tier. Rev 1 only fixed DFYWebsite's internal skeleton. Extracted a shared `frontend/src/components/website/WebsiteLoadingSkeleton.tsx` (overview cards shape by default; editor shape via `editor` prop) and used it in BOTH DFYRoute (tier check) and DFYWebsite (data fetch), so loading shows one consistent overview-shaped skeleton.
**Reason:** Two sequential skeletons (DFYRoute → DFYWebsite); the first was the stale editor-shaped one.
**Updated Done criteria:** No editor-shaped 3-pane skeleton on the overview; DFYRoute + DFYWebsite share one overview skeleton. Verified: old 3-pane markup (`w-64 …border-r`, `h-[70vh]`) absent from the live DOM; overview loads correctly. Transient skeleton frame itself too brief to screenshot on warm loads (confirmed at code + DOM-absence level).
**Known follow-up (out of scope):** DFYRoute's tier-check and DFYWebsite both fetch `/user/website` — a double call that doubles cold-load time. Consolidating (pass DFYRoute's response to DFYWebsite, or move the gate into DFYWebsite) would roughly halve perceived load.

### Rev 4 — 2026-05-31
**Change:** Restructured the Websites tab to match the Local Rankings dashboard.
- Removed **Editor** from the tab menu; **Pages** takes its slot (tabs: Overview, Pages, Submissions, Posts, Menus). Editing only via Pages → a **focused editor** (own toolbar: "Back to pages" + page label + viewport/undo/Save; no dashboard tabs while editing).
- Replaced the sticky underline top bar with a **pill segmented control** (new `frontend/src/components/website/WebsiteDashboardTabs.tsx`, matching `RankingsDashboardViewTabs`), rendered **inside the scroll area** (not sticky) beneath the heading.
- Added a **Local-Rankings-style intro heading** above the tabs (eyebrow "Web presence" + h1 "Website" + subtitle). Moved Connect Domain + View Live from the `WebsiteOverview` card into this shared header; removed `WebsiteOverview`'s own heading + the 4 domain/liveUrl props.
**Reason:** Consistency with Local Rankings; declutter; funnel editing through Pages.
**Verified live (Garrison, user 26):** heading + pill tabs below it (no Editor); domain + View Live in header; Pages → page → focused editor with Back; Back returns to Pages; analytics/5 cards intact; sidebar expanded. `tsc -b` green. (Note: an expired test JWT briefly showed empty data mid-verification — re-minted; not a regression.)

### Rev 5 — 2026-05-31
**Change:** Reworked the Website Overview from flat number cards to a **performance-first, meaning-led** layout (matches PMS/Rankings), per Dave's ask to show insight over raw numbers.
- Cream **MeaningHero** leads with the conversion story: "turned {visitors} visitors into {leads} leads — {rate}% conversion rate," score = conversion rate (with "vs {x}% last month"), a Visitors→Leads funnel with ▲/▼ delta pills, and Traffic/Leads drill-in CTAs.
- Two trend cards (**Traffic**, **Leads**): big number + delta pill + sparkline, each opening a **DetailsModal** (Traffic: sessions/pageviews/visitors/bounce/pages-per-session/avg-visit + daily chart; Leads: this/last/all-time + conversion + 12-mo chart + "View all submissions").
- Compact **Manage** strip (pages · posts · menus links) replaces the 3 flat count tiles.
- New pure helper `websiteMetrics.ts`: conversion = verified leads ÷ unique visitors (this month); MoM visitor delta (MTD vs same-day-last-month); leads **pacing** delta (projected full month vs last month). All client-side from existing endpoints — **no backend**.
- Deleted `AnalyticsCard` + `FormSubmissionsCard` (absorbed into the centralized overview).
**Decisions (Dave):** hero-led; conversion = leads ÷ unique visitors.
**Verified live (Garrison):** hero insight ("17 visitors → 0 leads, 0.0% conversion vs 0.5% last month"), funnel + ▼ delta pills, 2 sparklines, Manage strip ("10 pages · 49 posts"), Traffic modal (225 visitors / 234 sessions / 313 page views / 84% bounce / daily chart). My files type-clean.
**Note:** `tsc -b` is currently red from an UNRELATED uncommitted WIP file (`PMSManualEntryModal.tsx`, +253/−72) — not mine, not touched; zero errors in any file this change touched. Committing only the Website files keeps HEAD clean.

### Rev 6 — 2026-05-31 (polish on Rev 5)
**Change:** (1) Added (i) `InfoTip` tooltips to every overview-modal stat card (Traffic: visitors, visits, page views, bounce, pages-per-visit, time-on-site; Leads: this/last month, conversion, all-time). (2) Plain-English stat labels with the technical term as a smaller, muted parenthetical — "Left right away (bounce rate)", "Pages per visit (pages/session)", "Time on site (avg. visit)", "Visits (sessions)". (3) Reworked the hero Visitors→Leads funnel (This-month header + arrow + conversion progress bar + "X% of visitors became leads" caption) to fill the dead whitespace.
**Reason:** Owner-readable metrics (jargon explained), less empty hero.
**Verified live (Garrison):** all 6 Traffic stats relabeled with 6 (i) tooltips; hero funnel filled. My files type-clean (the only `tsc` errors remain the unrelated `PMSManualEntryModal` WIP).

### Rev 7 — 2026-06-03 (live-review fixes)
**Change:**
- **Chart hover:** `TrendSparkline` now renders the hovered point's label + value in a small readout chip — fixes "numbers don't update on hover" on the overview cards AND the detail modals (the parents never wired `onActiveIndexChange`; centralised it in the sparkline instead).
- **Conversion honesty (Dave flagged):** dropped the "vs X% last month" line on the conversion score — it compared this-month-to-date (a rate) to last month's FULL-month rate, reading as a false decline. Now shows the current rate only.
- **Absurd deltas:** month-over-month deltas are suppressed when the prior baseline is below a floor (visitors <10, leads <3) or the swing exceeds ±500% — kills values like "+27000%".
- **Funnel:** removed the redundant "This month" header from the hero funnel box.
- **Submissions form list:** clicking anywhere in a form row opens it (not just the title); the up/down arrows are replaced by a drag handle (`@dnd-kit/sortable`, already a dep) with a 5px activation threshold so clicks still select. Reorder persists via the existing form-preferences `sortOrder`. Touches the shared `FormSubmissionsSidebar` + `FormSubmissionsTab` (admin + user).
**Reason:** owner-readable, honest comparisons; smoother form management.
**Verified:** type-clean (only the unrelated `PMSManualEntryModal` WIP keeps `tsc -b` red). Browser verification deferred this round — the local preview server was unstable; changes confirmed at type/logic level and surfaced for live review.
**Known follow-up:** a *fair* MTD conversion (and MTD leads delta) needs a daily-granularity form-submissions endpoint — small backend add, deferred.

### Rev 8 — 2026-06-03 (hover behaviour)
**Change:** Replaced the Rev 7 hover *chip* — Dave wanted the headline **components** to update on hover, not a floating tooltip. Now hovering a sparkline point updates that chart's own headline number **and period verbiage** (hover Feb → "N · Feb 2026"): the hero funnel Visitors **and Leads** (the funnel chart is daily visitors, so Leads shows the hovered day's *month* total — labeled with the month), the Traffic card (visitors + sessions/page-views + date), the Leads card (leads + month), and both detail-modal chart titles. Metrics expose `leadsByMonth` + a `month` on each visitor point for the funnel lookup. `TrendSparkline` reverted to a plain `onActiveIndexChange` callback (chip removed); each parent owns its hover index. `websiteMetrics.visitorSeries` enriched with per-day sessions/pageviews; lead-series month labels humanised ("2026-02" → "Feb 2026"). Deltas hide while a point is hovered (a single day/month has no MoM delta).
**Verified:** chip removed (DOM-confirmed, `removedChipStillPresent: 0`); headline-on-hover uses the same recharts `onMouseMove → activeTooltipIndex` pattern as PmsProductionChart and is type-clean. recharts hover can't be driven by synthetic mouse events in the preview, so confirm the feel by hovering live.

### Rev 9 — 2026-06-03 (monthly visitor cadence)
**Change:** Dave wanted *all* overview charts on a monthly cadence "like the Leads · Last 12 mo card." The visitor/traffic charts were daily. `websiteMetrics.visitorSeries` now aggregates the Rybbit **daily** series into **monthly** buckets (sum users/sessions/pageviews per `YYYY-MM`, most-recent 12), labeled "May 2026" like the leads series. All three visitor charts (hero funnel, Traffic card, Traffic detail modal) consume it; the funnel Leads-on-hover now maps each month directly to `leadsByMonth[month]`. Traffic card eyebrow → "Traffic · Last 12 mo"; modal heading → "Monthly visitors · last 12 months". Analytics fetch bumped **90 → 365 days** so aged accounts get a full year (`MAX_RANGE_DAYS = 365`). Dead `shortDate` helper removed.
**Honesty tradeoff:** visitor months are **not** zero-filled — a missing month means Rybbit wasn't tracking yet, not "0 visitors". So a low-history account (e.g. Garrison Orthodontics, ~2 months of data) renders a sparse **2-point** funnel line where the daily view looked full. Accepted: cadence consistency was the explicit ask, and the line fills toward 12 as history accrues. If sparse new-account heroes are a problem, the fallback is hybrid (daily until ≥3 months exist, then monthly).
**Verified:** type-clean (`tsc -b`); live preview shows both eyebrows "Last 12 mo", traffic labels "May 2026 / Jun 2026" (monthly, not daily), dot count 16 = 2 funnel + 2 traffic + 12 leads. Hover feel = same recharts pattern; confirm live.

### Rev 10 — 2026-06-03 (no-data filtering, daily modal, "typical" conversion)
Three asks: filter no-data plots, give the traffic *detail* modal daily resolution, and stop the conversion rate reading as a failure.
**Change:**
- **Filter no-data (cards):** `trimLeadingZeros` drops the leading zero/no-data run from card series. The **Leads card** now starts at the first month with leads (Rev 9's flat Jul 2025→Apr 2026 zero stretch is gone) via `leadSeriesCompact`; `visitorSeries` is trimmed too. The **Leads modal keeps the full 12-month** `leadSeries` for context.
- **Daily traffic modal:** new `websiteMetrics.visitorDaily` walks every calendar day from first→last data day; days Rybbit has **no row for are `null` (no-data), so the line breaks at the gap** rather than implying zero traffic. Modal heading → "Daily visitors · last 12 months"; hovering a gap day reads "No data · {date}". Cards stay monthly; only the modal is daily. `TrendSparkline` now accepts `null` values (gaps) and **auto-hides per-point dots when > 40 points** so a long daily series isn't dot soup.
- **"Typical" conversion (Dave: show 0.7% positively, not partial-month-vs-full-month):** new `typicalConversionRate` = verified leads ÷ visitors **blended across all months with data** — not deflated by a partial month or a one-off traffic spike. The hero headline + funnel highlight + leads-modal stat now lead with the typical rate; **MTD is demoted** to a small "{x}% so far this month" line. Funnel bar + leads-card subtitle scoped with "so far this month" / "this month".
**Honesty note:** typical is a *real blended average*, not spin; it can still sit low if the site genuinely converts low, but it isn't dragged down by a partial month. MTD is always shown alongside, just smaller.
**Verified:** type-clean (`tsc -b`, only unrelated `PMSManualEntryModal` WIP error). Live (Garrison): hero "0.4% / of visitors, typically" + "0.0% so far this month"; sentence "…Typically about 0.4% of visitors become leads"; funnel "0.0% … so far this month"; Leads card trimmed to May 2026/Jun 2026; Traffic modal heading "DAILY VISITORS · LAST 12 MONTHS" with per-day dots (May 19 / May 26 / Jun 2). recharts hover still can't be driven synthetically — confirm the hover feel live.

### Rev 11 — 2026-06-03 (label clarity)
**Change:** "Leads" is form submissions — made that explicit. Funnel right label → "Leads (form submissions)" (muted, normal-case parenthetical); Leads card eyebrow → "Leads (form submissions) · Last 12 mo". Leads detail modal already eyebrows "Form submissions". Verified live (Garrison): funnel shows "LEADS (form submissions)" on one line; eyebrow renders full.

## Data Accuracy Finding (2026-06-03) — unique-visitor over-count (NOT yet fixed)
Dave reported monthly numbers ~10% off vs Rybbit's own dashboard. Traced + **proved with direct Rybbit API calls** (temp probe, since deleted) comparing our stored daily-SUM vs a single Rybbit monthly `/overview` call, two full-month accounts:
- **Sessions: exact match** (Apr 1168=1168, May 784=784). **Pageviews: exact.**
- **Users (unique visitors): ours +12.5% / +13.6%** (Apr 1071 vs 952, May 753 vs 663); second account +7.2% / +10.8%.
**Root cause:** sessions & pageviews are additive across days, so summing daily harvests = the month. **Unique visitors are NOT additive** — a person visiting on N days = N daily-uniques but 1 monthly-unique. We sum daily `users` ([websiteMetrics.ts] monthVisitors + monthly buckets, and `summarizeDaily` totals.users in [service.rybbit-performance.ts]); Rybbit dedupes per period. So our **"Visitors" runs ~10-13% high**, which also **deflates the conversion rate** (denominator too big). Timezone (`America/New_York` hardcoded in [rybbitHarvestAdapter.ts:40] + [service.rybbit-history.ts:11]) is a near-non-issue: NY vs UTC moved sessions ~0.3%. Ruled out: missing days (0 gaps in every account), and a `sessions`/`visits` field mix (payload has no `visits`).

### Rev 12 — 2026-06-03 (FIX: true unique visitors, live)
Dave chose "fetch true uniques live". Discovered Rybbit's **`/api/sites/:id/overview-bucketed?bucket=month`** returns true deduped uniques per month in ONE call (zero-filled to the window, includes the current partial month).
**Backend:** [service.rybbit-performance.ts] gains `fetchRybbitOverview` (true period totals via `/overview`) + `fetchRybbitMonthlyUniques` (per-month true uniques via `overview-bucketed`), both with a 6s timeout + **null-on-failure** so callers fall back. [UserWebsiteController.ts] `getWebsiteAnalytics` now also returns `monthly` (live true per-month) and replaces `totals` with the live window overview (both via `Promise.all`, falling back to the stored daily/`summarizeDaily` on failure). Stored daily still powers the daily modal.
**Frontend:** [websiteAnalytics.ts] adds `monthly`. [websiteMetrics.ts] **prefers** `analytics.monthly` (true uniques) for `visitorSeries`, the this-month headline counts, and `prevMonthVisitorsFull`; falls back to `aggregateMonthlyFromDaily` (the old daily-sum) when `monthly` is empty (live-fetch failure / wizard demo). The MTD visitor delta now uses a daily-MTD-vs-daily-MTD basis (`dailyCurUsers`) so it stays a fair trend even though the headline is true-unique. Sessions/pageviews unchanged (already exact). Conversion denominators now use true uniques → **conversion reads slightly higher (more accurate)**.
**Verified live (Garrison):** endpoint returns `monthly` 13 buckets (May users=200 true vs 208 summed; Jun 31); modal window **Visitors 228** (was inflated 239); hero/chart render true; both `tsc` clean (backend `--noEmit` + frontend `-b`, only unrelated `PMSManualEntryModal`). Garrison's gap is small (~5%, 2 wks of data); fuller accounts (dentalemr Apr 952 vs 1071 = +12.5%) get the full correction. **Timezone stays hardcoded ET** — separate latent issue for non-Eastern practices, not addressed here.

### Rev 13 — 2026-06-03 (hero funnel: 3 columns + 3-line chart; drop "typical")
Dave: make the funnel **3 columns** (Unique visitors · Leads · Conversion rate) that all update on hover, with a **3-line chart** (visitors + submissions + conversion); and on the score card **remove the "typical" (2.5%) calculation** — show just the MTD conversion clearly with a "calculated from this month's data, updates daily" note.
**Change:**
- New `websiteMetrics.funnelSeries`: per-month {visitors, leads, conversion} on one axis, each also **normalized to its own peak** (`visitorsN/leadsN/conversionN`) because the three live on wildly different scales (visitors ~hundreds, leads ~single digits, conversion ~%). Chart plots the normalized lines (shape); the 3 columns show real values on hover. **Removed `typicalConversionRate`/`typicalMonths`** entirely.
- `TrendSparkline` gained an optional **third line** (`tertiaryKey`/`tertiaryColor`) + `showArea` toggle. Colors: visitors = orange (primary), leads = navy, conversion = green `#4F8A5B`; the hero columns get matching color dots so columns↔lines are obvious.
- Hero funnel rebuilt as a 3-col grid (replaces the visitors→leads 2-col + the conversion progress bar). Caption "This month · to date" / the hovered month. Funnel delta pills dropped (still on the Traffic/Leads cards).
- Score card: big number = MTD `conversionRate`, label "so far this month", sub-note "Calculated from this month's data so far — updates daily." Insight sentence drops the "Typically about X%" clause. Leads modal "Typical conv." stat → "Conversion · this month" (MTD).
**Verified live (Garrison):** 3 columns "UNIQUE VISITORS 31 / LEADS (form submissions) 0 / CONVERSION RATE 0.0%" with color dots; 3 line-curves in the funnel (5 total on page); score "0.0% / so far this month / Calculated…updates daily"; caption "THIS MONTH · TO DATE"; `tsc -b` clean. Note: Garrison's chart is sparse (2 months data); fuller accounts render all 3 trend lines. **Normalization caveat:** chart shows each metric's *trend/shape*, not absolute heights — real numbers are in the columns.
