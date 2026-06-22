# Alloro App Changelog

All notable changes to Alloro App are documented here.

## [0.0.131] - June 2026

### Renderer edge bot-block — enforced + One Endodontics analytics cleanup

Datacenter/cloud IP ranges are now blocked at the shared renderer's Caddy (`alloro-renderer`), the proxy in front of every client site, so headless-Chrome bots stop loading client pages and inflating analytics. Real visitors (ISP/mobile) and search crawlers (Googlebot/Bing/Apple — on networks that are never in the blocked clouds, and additionally allowlisted) pass through untouched. This is the durable fix behind the One Endodontics "20k June visitors" bot surge; the historical June data was re-scrubbed back to its real baseline. Infrastructure change on the renderer box (outside `src/`/`frontend/`); plan folder `plans/06172026-renderer-edge-bot-block` finalized.

**Key Changes:**

- **Edge block enforced (T5):** a generated Caddy snippet (13,926 datacenter + 352 allowlist CIDRs — AWS/GCP-compute/DigitalOcean/Oracle vs. our 9 Elastic IPs + Googlebot + Bing) returns 403 only when a request is datacenter-origin AND not allowlisted AND not an ACME challenge; everything else proxies as before. Applied via `systemctl restart` (reload wedges this box), with an instant Caddyfile rollback staged.
- **Verified safe on live traffic:** 403s go only to datacenter IPs (kinsta-bot, GCP/AWS scanners); Googlebot `66.249.x` (330×200) and Bingbot (175×200) pass; zero verified-crawler blocks, zero false positives; all client sites serve 200; ACME path reachable. The first flip auto-rolled-back on a snippet file-permission bug (`root:root 600` unreadable by the caddy service user, masked by root-run `caddy validate`); fixed to 644 and re-flipped clean.
- **Gate called at 5/5 clean dry-run days** (owner decision) rather than 7 — justified by the structural crawler-exclusion guarantee + allowlist + post-enforce watchdog + instant rollback.
- **One Endodontics data cleanup:** re-scrubbed June bot rows from self-hosted Rybbit (ClickHouse) and refreshed our stored daily snapshots — live June users 7,476 → 1,013 (May baseline 1,196; pages/session back to a healthy 2.60). All deleted rows backed up and reversible. Garrison and Artful were checked and were not inflated — the surge was One-Endo-specific.
- **Monitoring + alerts:** the daily renderer cron flipped from dry-run to a post-enforce watchdog that alerts if any verified crawler ever lands in the blocked set; the alert email pipe (n8n → Mailgun) was also fixed (it had silently dropped every send on a missing `cc`/`bcc`, and the body now renders as HTML).

**Commits:**

- `plans/06172026-renderer-edge-bot-block/spec.html` — status → Completed; Done checklist reconciled to actuals; Rev 2 (enforce + 5/5 deviation + perms-gotcha + cleanup)
- `plans/06172026-renderer-edge-bot-block/RUNBOOK.md` — status → ENFORCED; enforce-day notes
- Renderer box (`/opt/alloro/edge-block/`, `/etc/caddy/`): `gen-caddy-snippet.sh` (new), `analyze-dryrun.sh` (cc/bcc + HTML body + watchdog wording), enforced `Caddyfile` + generated `snippets/edge-block.caddy` — version-controlled in the `website-renderer` repo under `ops/edge-block/` (not the Alloro app repo)

## [0.0.130] - June 2026

### Website Editor Review 2 — Overview clarity, Posts/Submissions/Keywords fixes

Owner review of the client-facing Website hub (Pilot Mode, One Endodontics) raised eight items; #1 was excluded by the owner. The rest landed as a single pass on the Website surface: clearer visitor / Search Console terminology, honest time-window math, surface-aware controls, location-aware submissions, and Search Console range guards. Verified in the browser with seeded sessions (One Endodontics + Tri-City Endodontics) — the acceptance checklist rolls up to Passed (the chart-hover item is code-verified with a written waiver).

**Key Changes:**

- **Visitors terminology + honest windows (#2):** the Overview hero and the Traffic-detail modal now read "Visitors" (not "Unique visitors") with a plain definition; the Traffic and Leads cards headline the deduplicated last-3-months total instead of the this-month number (a new backend Rybbit window-overview supplies the deduped figure); the always-on trend pill + "N last month" line moved to a hover that shows a single month and its change against the previous month.
- **Import from Identity is admin-only (#3):** the button now renders only on the admin Website surface, so the client / pilot view no longer hits the super-admin-gated endpoint (the "Failed to fetch identity: Forbidden" 403). Server gating unchanged.
- **Duplicate post (#4):** confirmed present for every post type including Doctors on the client surface (the earlier "missing" report was a pre-deploy capture).
- **SEO score bar hidden on the client (#5):** the per-row and in-editor SEO completeness bars are hidden on the client Website view (kept on the admin view and on Pages) via a shared `surface` prop.
- **Location-aware Submissions (#6):** the Forms list floats forms whose name matches the currently-selected location to the top; all forms stay visible and manual drag order still works.
- **"Impressions" → "Search appearances" (#7):** renamed hub-wide (Keywords tab, Overview snapshot, admin GSC dashboard) with a plain definition; internal data field names unchanged.
- **Search Console range guards (#8):** range toggles longer than the available GSC history are disabled with a "Not enough Search Console history yet." tooltip (new backend earliest-report-date), and the Keywords tab opens on the largest window that fits instead of a disabled default.

**Commits:**

- `frontend/src/components/website/overview/WebsiteOverview.tsx`, `websiteMetrics.ts`, `api/websiteAnalytics.ts` — Visitors label, last-3-months window aggregate, hover trend, GSC rename
- `src/controllers/user-website/user-website-services/websiteAnalytics.service.ts` — deduped 3-month Rybbit window-overview (`windowVisitors`)
- `PostsTab.tsx` + `PostsTab/PostsListView.tsx` + `PostsTab/PostsEditorView.tsx` + `PageEditor/SeoPanel.tsx` + `DFYWebsite.tsx` / `WebsiteDetail/WebsiteDetailTabContent.tsx` — shared `surface` prop gating Import-from-Identity + the SEO bar on the client surface
- `Admin/leadgen/FormSubmissionsTab.tsx` — location-aware form ordering
- `website/KeywordsTab.tsx`, `Admin/integrations/GscPerformanceDashboard.tsx` + `GscPerformanceParts.tsx`, `api/websiteGscPerformance.ts` — "Search appearances" rename, range-toggle disable, default-range clamp
- `src/models/website-builder/GscDataModel.ts`, `controllers/admin-websites/feature-services/service.gsc-performance.ts` — `findEarliestReportDate` + `earliestReportDate`
- `plans/06182026-website-editor-review-2/` — spec (Rev 1–4) + acceptance artifact (`test.html` + `test-results.json`)
- Docs parity: `alloro-docs` Website page + dashboard replica synced (terminology + window copy)

## [0.0.129] - June 2026

### Frontend Architecture Remediation (Code Constitution) + reliability fixes

Finalized the behavior-preserving frontend remediation to the Code Constitution standard, plus the QA pass that closed it out. The SPA was refactored, not rewritten — every screen behaves as before, with a healthier codebase underneath: oversized "god" components were decomposed, the API error contract was unified, and the Admin tree was reorganized into feature folders. A full 41-item, page-by-page QA (admin + One Endodontics client) drove the acceptance checklist to Passed and surfaced one real crash, which was fixed.

**Key Changes:**

- **God-file decomposition:** every frontend source file is now under the ~800-line ceiling (was 38 over, including a 3,422-line Identity modal and 2,000+-line pages) — split into `use<Feature>()` hooks, sibling `*.utils.ts`, and child components.
- **Unified error contract (§16.1):** the API client throws a typed `ApiError` on failure via `unwrap()`, and a new `normalizeApiFailure()` guarantees every `api*` helper returns a proper `{ success:false }` envelope on any non-2xx — so a bad response now surfaces a handled error instead of crashing the page (protects the live Rankings / Reviews GBP surfaces).
- **AI Data Insights crash fixed:** the orphaned `/admin/ai-data-insight` page (superseded by `/admin/ai-data-insights`, linked nowhere) crashed on a 500. Removed the dead page + its `api/agents.ts` module, and hardened the dev proxy so an unknown `/api/*` route returns a fast 404 instead of an Express↔Vite loop that hung ~25s.
- **Convention cleanup:** lint errors 49 → 0 (lint passes), `console.*` 6 → 0 (routed to the shared logger), `: any` 12 → 0 (typed), raw `fetch`/`axios` 16 → 3 — the 3 remaining are documented, legitimate exceptions (axios upload-progress, external-URL HEAD checks, generated published-site form code) the shared client cannot replace.
- **Acceptance:** `tsc` 0, `eslint` 0 errors (advisory `max-lines`/`exhaustive-deps`/`max-depth` warnings remain by design), vitest harness 6/6, and the 41-item behavioral checklist (`plans/06152026-frontend-remediation/test.html`) rolls up to Passed.

**Commits:**

- `frontend/src/api/index.ts` — `normalizeApiFailure()`, shared `adminFetch` adoption, `isAxiosError` re-export
- `src/app.ts` — unmatched `/api/*` → clean 404 (kills the dev proxy loop)
- Removed orphaned `AgentInsights` page + `frontend/src/api/agents.ts`
- ~35 files — god-file splits, hook/utils extraction, error-contract flips, logger routing, `any` typing, `fetch` → `adminFetch` migration
- `plans/06152026-frontend-remediation/` — spec (Rev 1–8), acceptance artifact (`test.html` + `full-test-results.json`)

## [0.0.128] - June 2026

### Referrals Hub — Month Comparison + AI Insights

Added a Compare feature to the Referrals Hub (`/pmsStatistics`). A "Compare" button opens a modal where the owner picks two months via an animated month-calendar picker and sees a side-by-side dashboard: production and total/doctor/self referrals with directional change, plus a ranked per-source comparison (new / gone / up / down). An "Explain this comparison" action generates a concise, highlighted paragraph with Claude Haiku, summarizing the biggest production/referral shifts and naming any standout referral source. The "Spend time here" trend cue was removed from the hub.

**Key Changes:**

- New endpoint `POST /pms/comparison-insights` (controller + `pms-comparison-insights.service.ts`): re-derives both months server-side from the authoritative aggregation (never trusts client numbers), computes per-source movement A→B, and prompts Claude Haiku (`claude-haiku-4-5-20251001`) for a 2–3 sentence summary with `==highlight==` markers; cost logged via `safeLogAiCostEvent`.
- Per-month referral `sources` were already returned by `/pms/keyData` but undeclared on the client — typed onto `PmsKeyDataMonth` and threaded through, so the comparison needed no new data endpoint or aggregator change.
- New `CompareMonthsModal` (Framer Motion) with `MonthCalendarPicker` (animated year-nav + 12-month grid, data-only months selectable), `CompareMetricGrid` (left→right A→B change semantics), `CompareSourceList` (pairwise source diff), and an always-on "AI comparison" card that renders highlighted parchment/serif insight text via a React Query mutation (`usePmsComparisonInsights`).
- Compare button added to `PmsHubSurface` (shown only with ≥2 months) via a new optional `onOpenCompare` prop; modal mounted from `PMSVisualPillars`.
- Removed the `InsightCue` ("Spend time here.") line from the Referrals Hub.

**Commits:**

- `src/controllers/pms/pms-services/pms-comparison-insights.service.ts` (new), `src/controllers/pms/PmsController.ts`, `src/routes/pms.ts` — comparison-insights endpoint, Haiku service, per-source movement computation.
- `frontend/src/api/pms.ts` — `PmsKeyDataMonth.sources`, comparison response types, `generateComparisonInsights`.
- `frontend/src/hooks/queries/usePmsComparisonInsights.ts` (new) — generation mutation.
- `frontend/src/components/PMS/dashboard/CompareMonthsModal.tsx`, `CompareMetricGrid.tsx`, `CompareSourceList.tsx`, `MonthCalendarPicker.tsx`, `compareMonths.utils.ts` (new) — comparison UI.
- `frontend/src/components/PMS/dashboard/PmsHubSurface.tsx`, `PmsDashboardSurface.tsx`, `frontend/src/components/PMS/PMSVisualPillars.tsx` — Compare wiring + InsightCue removal.
- `plans/06152026-referrals-month-comparison/spec.html` — plan/spec (Rev 1–10).

## [0.0.127] - June 2026

### Code Constitution — Full-Stack + Mechanized Enforcement

The `/code-constitution` standard was expanded from backend-only to the full stack and turned into a citable, mechanically-enforced instrument. The skill doc (which lives outside the repo) was restructured into numbered Parts → Sections → Articles with stable `§N.M` identifiers plus an Enforcement Protocol, so any review/validation agent flags a violation as e.g. "§7.4 (Section 7, Article 4)" with the rule quoted verbatim. Repo-side, mechanized enforcement was extended across both trees and an interactive HTML viewer was added. All new enforcement is warn/baseline — it surfaces debt without failing CI.

**Key Changes:**

- `scripts/check-conventions.sh` now scans both `src/` and `frontend/src/`, prints the `§id` next to every finding, and adds an advisory Tier-A grep pass (§17.4 `dangerouslySetInnerHTML`, §17.5 token reads outside the api client, §17.3 `process.env` in the bundle, §15.4 stray state libraries, §10.2 `knex.raw`, §5.1 secret literals).
- Backend ESLint bootstrapped for the first time (`eslint.config.mjs`) with article-mapped, warn-only rules (§2.2 `max-lines-per-function`, §2.3 `max-depth`, §9.1 `no-console`, §17.2 `no-explicit-any`, §1.4 naming) — deliberately not a generic `recommended` dump. Matching rules added to `frontend/eslint.config.js`.
- `dependency-cruiser` (`.dependency-cruiser.cjs`) enforces the layering Articles structurally — §7.4 db-only-in-models, §7.3 controllers-no-db, §7.1 no-upward-imports, §7.2 routes-are-thin (33 advisory findings at baseline).
- `code-constitution.html`: a self-contained, animated viewer — collapsible Parts/Sections/Articles, search, stack + mechanizability filters, click-to-copy `§` citations, and a live mechanization roadmap. Auto-enforced coverage rose from 8 to ~33 of 67 Articles.
- New npm scripts: `lint`, `depcruise`, `check:all` (orchestrated advisory gate). `check:conventions --strict` still gates CI on backend size/console/db only.

**Baseline (2026-06-15):** backend ESLint 2369 warnings (2153 `any`, 152 fn-length, 62 depth); dependency-cruiser 33 layering; frontend detector 38 oversized / 88 console / 35 fetch-bypass / 155 `any`. All advisory.

**Commits:**

- `3f8d985c` - full-stack detector + §-citations + Tier-A greps; backend & frontend ESLint configs; dependency-cruiser layering rules; `package.json` scripts + dev-deps (eslint, typescript-eslint, globals, dependency-cruiser); `code-constitution.html` viewer; constitution-mechanization (Completed) + frontend-remediation (Pending) plan specs.
- Constitution skill doc (`~/.claude/skills/code-constitution/SKILL.md`, outside the repo) expanded to Backend + Frontend halves, numbered Articles, and the Enforcement Protocol.

## [0.0.126] - June 2026

### Codebase Orphan Cleanup

Removed confirmed orphaned source and asset files after a static reachability audit, exact-reference checks, and sibling-folder scan. The cleanup is intentionally conservative: parked product route islands and currently active model files were retained rather than deleted for the sake of a bigger number.

**Key Changes:**

- Deleted 78 tracked orphan files: unreferenced public/prototype assets, obsolete frontend component islands, backup artifacts, and backend zero-inbound helpers.
- Confirmed no runtime dependency from `website-builder-rebuild`, `alloro-leadgen-tool`, `alloro-site`, or other Desktop `alloro*` / `orange*` folders before deleting candidates.
- Preserved Monday, Documentation, and ranking-history parked files for explicit product follow-up instead of treating unmounted route code as disposable; Checkup route files were already absent from the current tracked baseline and are not part of this cleanup diff.
- Retained active PM and website-builder model files after finalization found live imports from admin website services, user website services, workers, and PM controllers.
- Verified cleanup with `npx tsc --noEmit`, `npm run build`, `cd frontend && npm run build`, and root Vitest (`31/31`). Frontend lint still has pre-existing failures unrelated to this deletion-only cleanup.

**Commits:**

- `prototype-v2.png`, `frontend/public/*` - removed unreferenced tracked assets.
- `frontend/src/components/*`, `frontend/src/hooks/*`, `frontend/src/types/*` - removed orphaned frontend component, hook, and type islands.
- `src/controllers/*`, `src/models/GoogleAccountModel.ts`, `src/models/index.ts`, `src/utils/core/weekDates.ts` - removed backend zero-inbound orphan files.
- `plans/06142026-codebase-orphan-cleanup/spec.html` - completed cleanup spec with sibling audit evidence and finalization reconciliation.

## [0.0.125] - June 2026

### Backend God-File Decomposition + Remediation QA

The final wave of the backend remediation: every code file over the ~800-line hard ceiling was decomposed into focused modules, behavior-preserving (verbatim bodies, route bindings and import surfaces preserved via re-export/delegation — zero caller edits). `npm run check:conventions` now reports the only file over the ceiling as an immutable DB migration. The full remediation (security hotfix, transactions, validation, Pino logging, db-into-models, decomposition) was then QA'd live against a local One Endodontics build.

**Key Changes:**

- **`AdminWebsitesController` 5,504 → deleted**, split into 18 domain controllers + 18 resource sub-routers.
- **Ranking pipeline** `service.ranking-pipeline` 1,910 → 261 (5 stage modules); `location-competitor-onboarding` 1,602 → 55 (barrel + 7 modules); `PracticeRankingController` 1,792 → 777; `places-competitor-discovery` 1,017 → 341 (5 modules).
- **Agents** `service.agent-orchestrator` 1,212 → 255 (4 processors); `AgentsController` 1,383 → 544 (3 runner services).
- **Client/website** `UserWebsiteController` 1,668 → 634; `shortcodeResolver.service` 955 → 109; `PmsController` 1,158 → 799; `aiCommandService` 882 → 722 + `dashboard-metrics` 831 → 205.
- **Models** `PageModel` 1,204 → 658, `ProjectModel` 1,084 → 603, `PmsJobModel` 858 → 576 (query-helper delegation).
- **QA verified live:** 14 admin + client surfaces render real data with zero console errors; write paths (set-password, org/redirect CRUD, lifecycle guards) pass; security (default-deny 401, super-admin gate, fixed no-token callers) confirmed; **email interception proven end-to-end** (non-prod sender reroutes all mail to dave@). Gate green: `tsc` 0, Vitest 31/31, `check:conventions` 0. Full matrix in `plans/06142026-backend-remediation-qa/test-plan.html`.

**Commits:**

- `df94db6f 3dc55bfe d7e3de41 cf981b26 cbb61817 49007d3e 28dd8851 278d1df6 7d111e4b 9b95134a 7b1a27ff d719e5b0 c310ec23` — decomposition refactors (13).
- `plans/06142026-*` — audit + 7 remediation specs + QA test plan (planning/verification artifacts).

## [0.0.124] - June 2026

### Backend Conventions Checker (`code-constitution`)

A read-only static check that surfaces where `src/` drifts from the backend architecture contract, so violations can't grow silently. Companion to the `code-constitution` skill — the refreshed, renamed backend conventions contract (formerly `alloro-conventions`).

**Key Changes:**

- **`scripts/check-conventions.sh` (new)** — reports files over the ~800-line hard ceiling, stray `console.*` in production code (excludes tests/migrations/seeds), `db()` calls outside `models/`, and an advisory list of route files with no inline auth middleware. Read-only: it mounts nothing and changes no runtime behavior — the auth-on-every-route remediation remains the separate Level-4 security hotfix.
- **`npm run check:conventions`** — wired into `package.json`. Default exits 0 (the backend carries known, in-flight remediation debt); `--strict` exits non-zero when any clear structural violation exists, for use as a CI gate once the debt clears.
- **Current snapshot:** 25 files over the ceiling, 2 stray `console.*`, 16 `db()` outside `models/`, 19 advisory unguarded routes.

**Commits:**

- `721a1511` — `scripts/check-conventions.sh` (new) + `check:conventions` npm script; `plans/06142026-alloro-conventions-skill-improvements/spec.html` (plan spec, Rev 2).

## [0.0.123] - June 2026

### Dashboard Revamp — 24-Item Feedback Round (Plans 0–5)

A full clarity pass over the client dashboard so it reads as one product: every number now states its timeframe, the time-format is standardized, cross-surface data reconciles, and one-line insight cues replace removed context. Driven by the owner's 24-item "Dashboard Revamp Review" and QA'd in a live One Endodontics pilot.

**Key Changes:**

- **Timeframe foundation (Plan 0):** new shared `utils/timeframe.ts` — spelled durations ("28 Days", "3 Months"), abbreviated to-date (MTD/QTD/YTD), `formatDataMonth` named-month labeler, and `currentMonthLabel` (UTC, matches the metrics window) — plus `PeriodToggle` (terracotta active pill) and `InsightCue` (one-line trend cue) primitives.
- **Practice Hub (#1, #2, #22, #23, #24):** every stat card labels its window with a named month; Referrals shows the signed month-over-month delta ("42 down"); Local rank's status moved to a tinted sub-line below the number; Reviews shows this-month new reviews labeled with the current month; the "1 thing" action card is one subject + a short rationale (agent prompt + schema cap); a one-line production cue.
- **Referrals Hub (#3, #4):** MONTH/QTD/YTD toggle that re-scopes the tiles; named-month tiles with the YTD figure beside the monthly one.
- **Local Rankings (#5, #6):** removed the dormant period toggle and the manual "Update location" refresh banner; map zooms in; reviews read from the canonical dashboard-metrics source (resolves the 163-vs-152 split); "Rating vs Market"; competitors strip moved up below the hero with a "Manage competitor list" label.
- **Reviews & Posts (#7–#11):** terracotta active tab; self-explaining review stats; "Reply Drafts" → "Drafts Ready for Review"; internal "Safe" badge hidden client-side; stray range count removed; Posts "why it matters" blurb; client automation toggles hidden in Settings; review cards switched from grayish (slate-50) to white.
- **Website (#12–#21):** nav reordered with page-vs-post descriptions moved into a tab (i) tooltip; honest timeframe-span labels on Keywords; "Avg Position" removed; conversion reframed as last full month (no month-to-date artifact); green leads line; axis-honest Traffic/Leads popouts; "/" page reads as "Home"; orange post-score number removed.
- **Cross-cutting:** one time-format standard everywhere (#22); data validity — every figure carries a labeled window and the latest uploaded month is named (#23); one-line insight cues restored (#24).
- **Convention:** `AGENTS.md` updated — plan specs are now self-contained `spec.html` (inline `<style>`, no separate `spec.css`).

**Commits:**

- `frontend/src/utils/timeframe.ts` (new) — shared time-format helpers; `frontend/src/components/dashboard/InsightCue.tsx` + `PeriodToggle.tsx` (new) — dashboard primitives.
- `frontend/src/components/dashboard/focus/` — `StatCardRow` / `StatCard` / `statusRules` (referral delta, Local-rank sub-line + `subTone`, this-month reviews); `ProductionPanel` (insight cue).
- `frontend/src/components/dashboard/RankingsDashboard.tsx` + `rankings-hub/RankingsHubSurface.tsx` / `RankingsMapCard.tsx` — refresh banner + dead code removed, map zoom, canonical reviews, competitors strip + "Manage competitor list".
- `frontend/src/components/PMS/dashboard/PmsHubSurface.tsx` / `pmsPeriod.ts` — Referrals timeframe toggle.
- `frontend/src/components/dashboard/gbp-automation/*` + `frontend/src/pages/GbpManagerPage.tsx` — Reviews & Posts clarity (tabs, stats, drafts rename, Safe badge, range count, posts blurb, settings, white cards).
- `frontend/src/components/website/*` + `frontend/src/pages/DFYWebsite.tsx` + `frontend/src/components/Admin/PostsTab.tsx` — nav reorder, tab (i) tooltip, Keywords labels, conversion validity, Pages "Home", post-score removal.
- `src/agents/monthlyAgents/Summary.md` + `src/controllers/agents/types/agent-output-schemas.ts` — one-subject action directive + rationale length cap.
- `AGENTS.md` — self-contained `spec.html` convention.
- `plans/06132026-*` (6 plan folders) — specs marked Completed.

## [0.0.122] - June 2026

### Auth: OTP Login Codes Bypass Email Interception

The email interceptor reroutes every non-production email to `dave@getalloro.com` (fail closed — see 0.0.116). That sent *every* user's OTP login code to Dave's inbox instead of their own, so no one but Dave could complete login on dev or local. OTP codes now bypass the interceptor and send live in every environment, while all other email still fails closed.

**Key Changes:**

- Added an opt-in `allowLiveSend?: boolean` to `SendEmailOptions`. When set, `sendEmail()` skips `interceptEmailPayload` and sends the built payload as-is; the flag is honored inside the exit function, alongside the existing interception logic.
- The flag is set by exactly one caller — `createAndSendOtp`. Blast radius is OTP login codes only; password-reset, invitations, contact forms, and notifications stay intercepted on non-prod.
- No env var and no `NODE_ENV` branch, preserving the interceptor's identity-not-config design.
- Trade-off (ratified): dev, local, and CI can now send a real OTP to a real inbox. OTP recipients are self-selected (the address typed at login), and `isTestAccount` still short-circuits before any send. Recommended narrower "internal-domains-only on non-prod" scope was declined in favor of a full bypass.

**Commits:**

- `src/emails/types.ts` — `allowLiveSend?: boolean` on `SendEmailOptions`, scoped to OTP in its doc comment.
- `src/emails/emailService.ts` — `sendEmail()` honors `allowLiveSend`, skipping the interceptor when set.
- `src/controllers/auth-otp/feature-services/service.otp-generation.ts` — `createAndSendOtp` sets `allowLiveSend: true`.
- `plans/06122026-otp-bypass-email-interception/` — spec + Level 3 risk notes.

## [0.0.121] - June 2026

### Website Cards: Dynamic Month-Range Label

The Websites overview Traffic and Leads cards now label the actual number of months on the chart instead of a hardcoded "Last 12 mo". The cards plot a trimmed monthly series (leading no-data months dropped, capped at 12 by `computeWebsiteMetrics`), so a practice live for only a few months showed 3 data points under a misleading "Last 12 mo" eyebrow. The label now reads "Last 3 mo" and grows back toward "Last 12 mo" as data accrues; each card reads its own series, so Traffic and Leads can differ honestly.

**Key Changes:**

- Added module-level `monthsRangeLabel(monthsShown)` → `"Last N mo"` (clamped 1–12; empty series falls back to "Last 12 mo", where the card shows its empty state anyway).
- Traffic eyebrow now derives from `m.visitorSeries.length`; Leads from `m.leadSeriesCompact.length`.
- Presentational only — no changes to `computeWebsiteMetrics`, chart rendering, the API, or dependencies. Detail-modal captions ("last 12 months") left as-is; they describe the full untrimmed daily/monthly window.

**Commits:**

- `frontend/src/components/website/overview/WebsiteOverview.tsx` — dynamic month-range eyebrow helper wired into both overview cards.

## [0.0.120] - June 2026

### GSC/Clarity Harvest: Empty-Write Guard

Prevents the daily data harvest from overwriting good Search Console / Clarity data with an empty payload. The worker re-harvests a rolling window every run; the data upsert previously fired on any successful fetch regardless of row count, and the GSC/Clarity adapters return `ok` with `rowCount: 0` on an empty response — so a transient empty fetch for an already-populated date could clobber it through the upsert merge.

**Key Changes:**

- Gated the data upsert in the shared `harvestSingle` on `result.rowCount > 0` (all platforms; a no-op for Rybbit, which always reports `rowCount` 1 — the actual fix is for GSC and Clarity, which report real counts). Empty fetches still log the attempt as `success / 0 rows`; they just never overwrite stored data.
- Added a one-time, dry-run-default repair script that finds dates the harvest log proves once had rows but whose stored data is now empty/missing, and re-enqueues a single-date harvest via the existing harvest queue (idempotent `jobId`). Live dry-run found **0 clobbered dates** across 7 GSC integrations — the guard is pure prevention; no past clobber had occurred.
- Verified the read paths (`service.gsc-performance`, AI-audit `organizationAuditContextService`) treat absent days as zero, so skipping empty writes is safe — and it improves the AI audit, which previously could anchor on an empty placeholder day.

**Commits:**

- `src/workers/processors/dataHarvest.processor.ts` — gate the data upsert on `result.rowCount > 0`; empty success still logged, never written.
- `src/models/website-builder/IntegrationHarvestLogModel.ts` — `findDatesWithDataByIntegration` helper for clobber detection.
- `src/scripts/repairClobberedHarvestData.ts` — dry-run-default GSC/Clarity clobber repair.
- `plans/06122026-harvest-empty-overwrite-guard/` — spec + risk notes.

**Known open issue (not addressed here):** a separate GSC data-lag gap — e.g. 2026-06-02/03 empty across all properties — where Google's data finalized later than the 4-day harvest window, so it was never captured. This is not a clobber (the harvest log shows `success / 0 rows`, not lost data), so the repair above does not touch it. Recovery needs a broadened in-span gap re-harvest plus a recurring gap sweep; tracked as follow-up.

## [0.0.119] - June 2026

### Client Dashboard: Search Console Keywords

Surfaces Google Search Console performance to website owners in the DFY dashboard — previously visible only in the admin dashboard. Adds a "Keywords" tab and a "Search keywords" card on the Overview tab, both fed by a new org-scoped endpoint that reuses the existing admin GSC dashboard service untouched.

**Key Changes:**

- New client endpoint `GET /api/user/website/gsc/performance` — resolves the project from the auth-token org (no `projectId` in the URL), reuses `service.gsc-performance.getDashboard`, returns `hasIntegration:false` with a null dashboard when GSC isn't connected. Mirrors the existing Rybbit `getWebsiteAnalytics` pattern.
- "Keywords" tab in the website dashboard: totals (clicks, impressions, avg position), a clicks + impressions trend, top queries and top pages, with not-connected and collecting-data empty states. Built fresh client-side (does not import admin GSC components); trimmed for owners (no countries/devices).
- "Search keywords" card on the Overview tab: headline clicks/impressions/avg-position, a clicks sparkline, top 3 queries, and "View all" into the tab. The eyebrow labels the rolling 90-day window; hovering the sparkline swaps the headline to that day's values.

**Commits:**

- `src/controllers/user-website/UserWebsiteController.ts`, `src/routes/user/website.ts` — org-scoped `getGscPerformance` handler + route.
- `frontend/src/api/websiteGscPerformance.ts`, `frontend/src/hooks/queries/useWebsiteGscPerformance.ts` — API client + shared React Query hook.
- `frontend/src/components/website/KeywordsTab.tsx` — the Keywords tab.
- `frontend/src/components/website/WebsiteDashboardTabs.tsx`, `frontend/src/pages/DFYWebsite.tsx` — `"keywords"` pill + render block.
- `frontend/src/components/website/overview/WebsiteOverview.tsx` — Overview "Search keywords" card with range label + hover.
- `plans/06112026-client-dashboard-gsc-keywords/` — spec.
- **Verified:** backend + frontend `tsc` clean; card verified live by the user. Cross-org isolation is code-verified (org-scoped, no `projectId` param), not two-org runtime-tested.

## [0.0.118] - June 2026

### Asia Dev Server Deployment Target

Adds a second dev deployment target in Asia while keeping the existing `dev/dave` EC2 dev deploy intact. The new server at `dev-asia.getalloro.com` is provisioned with the app runtime, local PostgreSQL 17, Redis, Apache, HTTPS, and a cloned copy of the current dev database.

**Key Changes:**

- Provisioned the Asia dev host with Node 22.18, PM2 6, Apache, Redis, PostgreSQL 17, pgvector, and Puppeteer Chrome support.
- Restored the current dev database into local Asia Postgres and rewired the Asia server env to use local Postgres/Redis while preserving the server-managed env/key-file deploy model.
- Refactored the `dev/dave` workflow to build once, upload one bundle artifact, then deploy independently to the existing EC2 dev server and the new Asia dev server.
- Added Apache and Let's Encrypt HTTPS for `dev-asia.getalloro.com`.

**Commits:**

- `.github/workflows/dev.yml` - split the single dev deploy into one build job plus `deploy-dev` and `deploy-asia` jobs that consume the same artifact.
- `plans/06122026-alloro-asia-dev-server/` - execution spec and risk notes for the new Asia dev server.

## [0.0.117] - June 2026

### Website Editor: Direct Editing, Versioning & Responsive Controls

A ground-up overhaul of the website editor (admin `PageEditor` + customer `DFYWebsite`) so practice sites can be edited directly on the page instead of only through the AI chat — with real version history, reliable saves/publishes, and per-breakpoint styling. Shipped iteratively (spec Rev 1–34) on branch `dave/website-editor` (PR to `main`) and mirrored to `dev/dave`.

**Key Changes:**

- **Direct, in-place editing (not AI-first):** any basic element (`p`/`span`/`a`/`img`/headings/buttons/containers) is selectable and editable on the canvas — type-on-page with the caret at the click point, edit links, swap photos with alt text, set text color and serif/sans font, toggle bold/italic, and align text. The AI editor is demoted into an "AI Editor — Tell Alloro what to change" dropdown that requires a selected element and shows a pill of what's selected. Shortcodes (post/review loops) and header/footer are protected with a "managed by Alloro" treatment.
- **Versioning that actually works:** autosave removed; explicit **Save** records a deduped, restorable snapshot (pruned to 20/path). History tab **previews** versions read-only and **restores** them (whole-version or per-section), with a per-section diff. The edited row stays the newest version so the live draft never reads as "Archived."
- **Save/publish reliability:** `Cmd/Ctrl+S`, localStorage crash recovery, optimistic-concurrency conflict modal (conditional-UPDATE 409), transactional + idempotent publish, snapshot-before-refresh so a concurrent customer save can't silently destroy an admin draft, honest error surfacing, and version preview that is genuinely read-only (editable only after Restore). Typing marks the editor dirty immediately and Save/Publish flush the in-progress inline edit without clicking away.
- **Breakpoint-aware styling (mobile + desktop only):** the viewport toggle doubles as a breakpoint selector — size, alignment, and visibility edits target the active tier (base for mobile, `md:` for desktop). The size label reads the actually-rendered computed size, and the admin desktop preview renders a true 1280px desktop viewport scaled to fit so it shows the real `lg:`/`xl:` sizes a visitor sees.
- **UI:** cobalt-dark sidebar matching the left nav rail, spacious labeled inspector, dark scrollbars, no preview reload on edits or publish, and the selection outline persists across viewport switches.
- **Post-launch refinements:** unwrapped/mixed-content text (e.g. stat numbers like a `<div>` holding "3.4" + a span) is now editable; a **Delete** control (two-step confirm) removes an element from the markup; the site footer is no longer hoverable/selectable; the admin preview is mobile + desktop only with desktop rendered at a true 1280px viewport scaled to fit; and a beta "report a bug / request a change" pill opens the support launcher, now docked into the editor preview.

**Commits:** (on `dave/website-editor`, PR #131)

- `frontend/src/pages/admin/PageEditor.tsx`, `frontend/src/pages/DFYWebsite.tsx` — host editors: undo/redo, manual save + snapshots, guards, version history, conflict handling, inline-edit flush, breakpoint plumbing, scaled desktop preview.
- `frontend/src/hooks/useIframeSelector.ts`, `frontend/src/utils/{canvasTextEditing,richTextEditing,editorDirectOperations,htmlReplacer,templateRenderer}.ts` — selection/auto-tagging, in-place direct edits, responsive class tiers, computed size, serializer hygiene, shortcode armoring.
- `frontend/src/components/PageEditor/*` — sidebar, ChatPanel gating + pill, selected-element inspector, version history tab, text-style controls.
- `src/controllers/admin-websites/feature-services/{service.page-editor,service.page-versions}.ts`, `src/controllers/user-website/UserWebsiteController.ts`, `src/utils/website-utils/pageSnapshots.ts` — snapshot-on-write, transactional/idempotent publish, restore, conditional-UPDATE concurrency, version bump.
- `src/database/migrations/20260611000000_add_page_revision_metadata.ts` — `change_source`/`revision_note` provenance columns (run on dev/prod at deploy).
- **Verified:** `tsc -p tsconfig.app.json --noEmit` (frontend) + backend `tsc` + ESLint green; manual QA by the user across each revision.

## [0.0.116] - June 2026

### Disallow Email on Dev & Local

Prevents any non-production server from sending real email. Previously dev.getalloro.com and local environments pointed at the same production n8n email webhooks and carried real recipient lists, so any email-triggering action (OTP, password reset, contact forms, PMS notifications, leadgen reports) reached real people. There was no runtime discriminator between environments — `ecosystem.config.js` hardcodes `NODE_ENV=production` for both PM2 apps and both servers deploy with it, so dev and prod were indistinguishable to the code.

The fix introduces a runtime sender-identity guard: a process may send live email only when its own public IP matches a DNS A record of `app.getalloro.com`. Anywhere else — and on any failure to determine identity — every email is intercepted: recipients rewritten to `dave@getalloro.com` only (cc/bcc emptied), subject prefixed with `[Intercepted] `, and original recipients logged. The check ignores env vars, `NODE_ENV`, and request `Host` headers by design: configuration can be copied between machines, identity cannot. It fails closed, so a misconfigured prod box diverts mail to an inbox rather than silently mailing clients.

**Key Changes:**

- New `src/emails/emailInterceptor.ts`: resolves `app.getalloro.com` A records and the box's own public IP (via `checkip.amazonaws.com`), caches the verdict for 10 minutes, dedupes concurrent checks, warms the cache at module load, and fails closed on any error.
- Guard applied inside all three backend email exit functions, covering every current and future caller without touching call sites.
- Intercepted mail reroutes to `dave@getalloro.com` strictly, with original recipients logged; interception never drops mail.
- No new dependencies (`axios` and `node:dns` already present); no env-var, `NODE_ENV`, or `Host`-header gating.
- Verified: `npx tsc --noEmit` clean; interception path confirmed locally (rerouted to dave, `[Intercepted]` subject, originals logged); live path confirmed against real DNS (prod IP 52.203.199.155 matches the A record, dev IP 3.210.41.226 does not).

**Commits:**

- `src/emails/emailInterceptor.ts` - new IP self-identity guard with cached, fail-closed verdict and payload reroute helper
- `src/emails/emailService.ts` - route `sendEmail()` through the interceptor; log interception with original recipients
- `src/controllers/websiteContact/websiteContact-services/emailWebhookService.ts` - route `sendEmailWebhook()` through the interceptor
- `src/controllers/leadgen-tracking/feature-services/service.n8n-email-sender.ts` - route the leadgen audit-report sender through the interceptor
- `plans/06102026-disallow-email-on-dev-and-local/` - spec and execution notes

## [0.0.115] - June 2026

### Reviews & Posts Page + App-Wide Design Consistency

The fourth dashboard redesign and the cross-app consistency pass, shipped together (interleaved edits). Reviews & Posts (Alloro Engage) is promoted out of Local Rankings into its own sidebar page at /gbp-manager, and every client surface now shares one design language: white cards on parchment, ink text, terracotta as the only accent.

**Key Changes — Reviews & Posts (/gbp-manager):**
- New standalone page: navy pill tabs (Reviews · Posts · Settings), three stat boxes (Needs reply last-60d, Last review countdown, Coverage), zero extra network requests
- 1–2 reply drafts silently pre-generated for the newest unreplied reviews (guarded, once per location)
- Reviews scoped to a 60-day chunk with "All loaded" escape; trend sparkline dropped
- Post photos now OPTIONAL end-to-end (composer, edits, published-post edits, Google deploy payload omits media) — existing images replace-only
- Engage tab removed from Local Rankings; Sidebar + mobile nav gain "Reviews & Posts"; de-nested card-in-card panels; compact posts header

**Key Changes — Design Consistency:**
- Parchment background token (#FAF8F3) app-wide; ink-muted/accent-soft tokens replace per-file hex constants; one card recipe everywhere
- Shared ActionBanner with "Mark done" (localStorage) across all three hub 1-action banners; shared StatBox
- Referrals top sources are now a click-in (per-source production, avg/referral, funnel %, notes)
- Month-key sorting bug fixed backend-wide (labeled months sorted alphabetically): aggregator 12-month cap, production_change_30d (+0% deltas), "this month" grounding, per-source trends; Practice Hub YTD is strictly Jan 1 → today with honest empty state (the "$2.2M" fix)
- To-Do List & Notifications removed from nav (routes intact); 3s notification poll deleted
- Settings: single-column priority layout, Locations promoted to its own tab, serif display headings (font-heading was never defined), compacted
- Website tab: all views in the shared 960px container; Submissions compacted with truncation tooltips
- Sidebar: Settings + Log out rows replace the account card; org name under the wordmark; "Disconnect" → "Log out"

**Commits:**
- frontend: GbpManagerPage + gbp-automation panel promotion props/frameless; ActionBanner/StatBox/useActionDone/PmsHubTopSources (new); hub surfaces + focus components on tokens; Sidebar/MobileBottomNav/App routes; Settings + settings components; Website tab containers + FormSubmissions compaction; index.css tokens
- backend: photo-optional (GbpLocalPostDraft/Deployment/PublishedLocalPost services); monthKey.ts chronological sorts in pmsAggregator + dashboard-metrics

## [0.0.114] - June 2026

### AI/SEO Audit Admin App

New admin-only Apps workspace (`/admin/apps/ai-seo-audit`) that scores an organization's website — or any external URL — for AI/search readiness against a five-category, evidence-backed rubric (Findability, Content Readiness, Business Consistency, Connected Data, Reputation), with async execution, real external entity discovery, and a plain-English results surface.

**Key Changes:**

- Audits run asynchronously on a new `wb-ai-seo-audit` BullMQ worker: launching returns a queued run immediately, the run list and detail poll live progress (gathering business data → reading pages → checking the web → scoring) until completed/failed.
- Scoring contract: per-check weighted points roll up into five categories summing to 100; a rubric-integrity assertion fails fast if check weights ever drift from declared category weights. Missing integrations (GSC/GBP) reduce coverage and confidence, never the score. Hard caps apply per page and report which pages they cap.
- Organization audits prioritize home → content → legal/utility pages before the 12-page cap (disclosed as "12 of N"), and the run score is an importance-weighted average (home ×2, content ×1, utility ×0.5). Legal/utility pages are exempt from service-page content checks.
- External entity consistency runs once per audit via SerpAPI plus on-page profile links, never cites the audited site's own pages, detects blocked/CAPTCHA listing pages, and gives benefit of the doubt when the business's real phone/address appears anywhere on the listing page. Findings are framed as "Referenced" leads with one-line "possible mismatch — worth double-checking" advisories instead of asserted verdicts.
- Results UI leads with an overall score + grade band (Excellent/Good/Needs work/At risk), a "Biggest wins" top-fixes list ranked by score impact, per-page scores (lowest first), category score cards with bars, and criteria grouped by check with plain-English labels, hover explanations, and per-page expansion.
- Run management: delete a single run or clear all, organization picker lists only auditable orgs (connected website project with published pages), and the whole view deep-links via `/admin/apps/ai-seo-audit?mode=&organization=&run=` so refresh restores state.
- Persistence: five new `website_builder.ai_seo_audit_*` tables (runs, targets, results, external sources, evidence) with enum CHECK constraints, cascade deletes, and a pinned rule version.

**Commits:**

- backend: `src/services/ai-seo-audit/*` (scoring engine, URL collector + SSRF safety, identity extraction, SerpAPI external search, entity consistency, org context resolver, persistence), admin routes/controller, audit models, migration `20260608000000`, `aiSeoAudit.processor` + worker registration.
- frontend: `pages/admin/AdminApps.tsx`, `components/Admin/ai-seo-audit/*` (workspace, panel, run list, run detail, labels dictionary, org search select), `api/aiSeoAudit.ts`, `useAiSeoAuditQueries` polling hooks, query-key additions, `/admin/apps/:appKey` routes + sidebar Apps entry.

## [0.0.113] - June 2026

### Local Rankings Simplification

Replaces the dense Local Rankings overview (`/rankings`) with a slim, map-anchored surface, drops both scores, and unifies the dashboard container width across the three client hubs.

**Key Changes:**

- New Rankings hub: "YOU RANK #N of M nearby" hero with a leaflet competitor map (rank-numbered pins + YOU marker), the standard search query, three vitals (Reviews with star icon, Last post, Rating vs market), a single "1 action" banner, and a comparison-insight strip that opens Manage Competitors.
- Visibility Score and Practice Health are removed entirely (gauge, factor breakdown, drivers/gaps modals, Next Moves). The legacy overview is retained behind a `USE_LEGACY_RANKINGS_DASHBOARD` fallback flag.
- A MONTH/QTR/YTD toggle ships disabled ("Not enough ranking history yet") with the ranking-history wiring built behind a single enable point.
- The ranking agent now emits one recommendation (prompt + guardrails backfill capped at 1); takes effect on the next ranking run.
- All three hubs (Practice, Referrals, Rankings) now share one container recipe (960px, same gutters); fixed Practice Hub double padding and the Referrals surface rendering outside its padded main.
- Manage-comparison page compacted to the same 960 container: map column matches the competitor-list height (with leaflet resize handling), suggestions toolbar slimmed, competitor pins recolored to brand terracotta, and Local Rankings stays active in the sidebar on that route.

**Commits:**

- frontend: new `rankings-hub/` surface (RankingsHubSurface, RankingsMapCard, rankingPeriod); RankingsDashboard overview swap; wizard rankings steps 4 → 3; width/padding unification across DashboardOverview, PMSVisualPillars, PmsHubSurface; LocationCompetitorOnboarding + competitor-map.css + Sidebar refinements.
- backend: ranking LLM prompt + output guardrails emit a single `top_recommendations` entry.

## [0.0.112] - June 2026

### Referrals Hub Simplification

Collapses the Referrals Hub (`/pmsStatistics`) into a slim surface and reworks the PMS upload / file-manager flow.

**Key Changes:**

- New slim Referrals Hub surface: a MONTH/QTR/YTD period toggle, a dual-line production & referrals chart (hover a point to scope the stat tiles to that month/quarter), four stat tiles, a lean upload CTA, top-3 sources with trend arrows, and a single "1 action" banner.
- The "1 action" banner shows the Referral-Engine's recommended action; that agent now emits a single fix (schema `top_three_fixes` capped at 1).
- Revenue Manager (file manager) panel: per-location "Analysis #N" / "Batch Analysis #N" naming with a "Ran on {date} with data included for {months}" line, static Edit/Overwrite buttons under the month grid, and row actions consolidated into a single ⋯ menu.
- PMS entry modal: month-selected mode is locked to one month, off-month uploads are flagged (discard / re-upload) instead of silently trimmed, and the empty state presents four action cards.
- The upload modal now overlays the file-manager panel (matching the edit flow), and the panel refreshes after submit.

**Commits:**

- frontend: new `PmsHubSurface`, `PmsHubTrendChart`, `pmsPeriod`, `sourceTrend`; `PMSVisualPillars` swaps in the surface; `PMSManualEntryModal`, `PmsJobDataEditorModal`, `PMSDataViewer`, `PmsFileManager`, `PmsMonthSlotGrid`, `PmsFileList` reworked; `useInvalidatePmsFileSurfaces` exported.
- backend: Referral-Engine growth-opportunity rule + schema emit a single fix.

## [0.0.111] - June 2026

### Practice Hub Simplification

Collapses the Practice Hub dashboard (`/dashboard`) into a focused, scannable surface and trims the data it loads.

**Key Changes:**

- Rebuilt the Practice Hub layout: greeting, one year-to-date production chart, a "1 thing that matters" banner, and four compact stat cards (Referrals, Local rank, Reviews, Form subs).
- Dropped the heavier Trajectory, Action Queue, and per-card LLM/sparkline fetches from this surface (`useAgentData`, `useActionQueue`, `useLatestRanking` no longer load here).
- Surfaced `reviews.total_review_count` from already-fetched GBP data so the Reviews card shows a total count.
- The Summary (Chief-of-Staff) monthly agent now emits a single top action instead of 3–5; the task creator persists only the top-ranked entry.
- Onboarding wizard tour updated for the new layout.

**Commits:**

- frontend: `DashboardOverview` rebuilt; new `ProductionPanel`, `OneThingBanner`, `StatCard`, `StatCardRow`, `statusRules`, shared `usePmsKeyData`; `total_review_count` mirrored in the dashboard-metrics type.
- backend: `total_review_count` added to the dashboard-metrics builder; `Summary.md` + output schema + task-creator emit one action.


## [0.0.110] - June 2026

### Mission Control Telemetry Refinements

Refines the Mission Control Telemetry rollout so the default view reflects client usage, admin/pilot activity is explicitly filterable, Clarity is linked for qualitative replay review, and telemetry drilldowns are navigable by organization and user.

**Key Changes:**

- Telemetry defaults to client usage, with animated Admin and Pilot toggles for explicitly including internal or pilot activity.
- Summary/page/surface rows now avoid duplicate rendered items and include latest organization/user attribution where available.
- The frontend tracker avoids unauthenticated telemetry attempts on sign-in-gated routes.
- Added the Clarity project link for external replays and heatmaps while keeping Alloro's first-party telemetry dashboard focused on operational usage facts.
- Organization rows open a detail view with org-scoped cards, trends, surfaces/pages, user breakdown, and recent movement timeline.
- User rows open a user detail view with user-scoped KPIs, trends, pages, and movement timeline.
- Detail headers now use clickable breadcrumbs: `Overview > Organization > User`.
- Fixed daily trend date rendering so local June 7 activity appears on June 7 instead of shifting through UTC.
- Docs parity checked against `alloro-docs`; no Mission Control docs exist there, and existing docs changes are unrelated Referrals Hub edits.
- Verified: `npx tsc --noEmit`, backend `npm run build`, frontend `npm run build`, `git diff --check`, focused frontend ESLint, and Playwright telemetry/breadcrumb smoke checks passed.

**Commits:**

- `frontend/src/components/Admin/mission-control/telemetry/*` - refined telemetry tab, filters, org/user drilldowns, breadcrumbs, loading/error states, Clarity link, and trend/surface/page display
- `frontend/src/api/admin-mission-control.ts`, `frontend/src/hooks/queries/useAdminMissionControlTelemetryQueries.ts`, `frontend/src/lib/queryClient.ts` - telemetry response types, query hooks, and cache keys for aggregate/org/user detail data
- `frontend/src/components/telemetry/AppTelemetryTracker.tsx`, `frontend/src/hooks/useAppTelemetry.ts`, `frontend/src/hooks/useClarityMonitoring.ts`, `frontend/src/utils/telemetry/clarityMonitoring.ts` - authenticated telemetry hardening and Clarity client-app tagging
- `src/controllers/admin-mission-control/*`, `src/models/AppUsage*`, `src/routes/admin/missionControl.ts` - admin telemetry aggregate, organization detail, user detail, and movement query support
- `plans/06052026-mission-control-product-telemetry/` - updated execution spec and verification notes

## [0.0.109] - June 2026

### Worker Stall Watchdog & Redis Connection Hardening

After `minds-worker` silently wedged on 2026-06-07 (pm2 reported `online`, idle CPU, but zero jobs processed for ~42h — so the 5 AM data harvest missed two days with no alert), added an out-of-process watchdog plus Redis-connection resilience. Alert-only, no auto-restart (per decision). Harvest cadence is unchanged — it is already correct for the Clarity API, which only serves a last-1-to-3-day aggregate (no historical/per-day fetch).

**Key Changes:**

- New `src/workers/workerHealth.ts` — file-based processing heartbeat (chosen over Redis so detection survives a Redis outage). Records `schedulerTickAt` on each scheduler tick and `harvestCompletedAt` on each completed daily harvest; writes never throw into the caller.
- Heartbeats emitted from `scheduler.processor.ts` (at the top of the tick, before its no-due-schedules early-return) and `dataHarvest.processor.ts` (after "Daily harvest complete").
- New `src/scripts/worker-watchdog.ts` — runs via system cron, OUTSIDE the worker (pm2 reports "online" while wedged, so an in-process check is useless). Emails dave@getalloro.com via the existing n8n `emailService` webhook when the scheduler tick is stale (>5m) or a daily harvest is missed (>26h). De-duped via a state file: alerts on the healthy→unhealthy transition, then at most once per 6h.
- Redis hardening: `makeConnection()` (worker.ts) and `getRedisConnection()` (queues.ts) now attach `error`/`close`/`reconnecting`/`end` handlers and a bounded `retryStrategy` (kept `maxRetriesPerRequest: null` for BullMQ). Previously these events were unhandled, so a dropped/hung connection froze the worker with zero log output.
- Verified: `tsc --noEmit` clean. Deploy (env in `/etc/alloro/app.env` + a 5-min crontab running `dist/scripts/worker-watchdog.js`) and live QA are pending — see `plans/06072026-worker-harvest-watchdog`.

**Commits:**

- `src/workers/workerHealth.ts` - new file-based heartbeat helper
- `src/scripts/worker-watchdog.ts` - new out-of-process watchdog (n8n email alert, de-duped)
- `src/workers/processors/scheduler.processor.ts` - emit tick heartbeat before the early-return
- `src/workers/processors/dataHarvest.processor.ts` - emit heartbeat on harvest completion
- `src/workers/worker.ts` - Redis connection error/reconnect handlers + retryStrategy
- `src/workers/queues.ts` - same Redis hardening on the producer connection
- `plans/06072026-worker-harvest-watchdog/` - spec

## [0.0.108] - June 2026

### Mission Control Product Telemetry

Adds first-party product telemetry to Mission Control so Alloro can see actual authenticated app usage by organization, user, page, feature surface, session, and active-time heartbeat. This is intentionally not a replay or heatmap system: V1 tracks route/session/activity facts with server-derived identity and strict allowlists so we can answer usage questions without collecting sensitive payloads.

**Key Changes:**

- New additive `app_usage_events` table captures allowlisted app telemetry events with server-derived `user_id`, `organization_id`, `user_role`, session id, route template, surface, page label, active seconds, pilot-session flag, timestamps, and compact allowlisted properties.
- New authenticated `POST /api/telemetry/events` endpoint validates batch size, event names, route templates, surfaces, and property keys; heartbeat durations are clamped server-side.
- App-level route tracker records session start, page views, visible-tab active-time heartbeats, and Mission Control Telemetry tab opens without sending full URLs or sensitive query strings.
- Mission Control gains an `Overview` / `Telemetry` tab switch; the existing revenue/client grid stays intact and telemetry renders in its own admin surface.
- Telemetry tab includes summary KPIs, daily usage trend, surface/page adoption, organization usage rows, date-range filters, pilot-session exclusion, and per-organization user drilldown.
- Docs parity checked against `alloro-docs`; no Mission Control docs exist there, so no docs edit was made.
- Verified: `npx tsc --noEmit`, backend `npm run build`, frontend `npm run build`, `git diff --check`, and scoped frontend ESLint on touched files passed.

**Known Follow-ups:**

- Local `npm run db:migrate` is currently blocked by a pre-existing Knex migration-history mismatch for missing `2026060400000*_email_*` migrations in the local DB.
- Authenticated visual QA for `/admin/mission-control?tab=telemetry` still needs to run on dev after deployment or with an admin browser session.

**Commits:**

- `src/database/migrations/20260605010000_create_app_usage_events.ts` - additive telemetry event table and dashboard query indexes
- `src/controllers/app-telemetry/*`, `src/routes/appTelemetry.ts` - authenticated first-party telemetry ingestion and event catalog
- `src/models/AppUsageEventModel.ts` - insert and aggregate query model for telemetry dashboards
- `src/controllers/admin-mission-control/feature-services/MissionControlTelemetryService.ts` - Mission Control telemetry aggregate service
- `frontend/src/hooks/useAppTelemetry.ts`, `frontend/src/api/app-telemetry.ts`, `frontend/src/utils/telemetry/routeTelemetry.ts` - frontend route/session/heartbeat tracker
- `frontend/src/components/Admin/mission-control/telemetry/*` - Mission Control Telemetry tab UI
- `plans/06052026-mission-control-product-telemetry/` - completed HTML/CSS spec and migration review artifacts

## [0.0.107] - June 2026

### Website Headers - Phone CTA Defaults

Adds a standard phone CTA to Alloro-built website headers so published website visitors can quickly call the practice from the top navigation. The template now expects a formatted phone number with a `tel:` link and defaults the helper line to `Call us today`, including the previous TriCity-style Spanish helper slot.

**Key Changes:**

- Migration backfills header phone CTAs for the confirmed target sites: Artful Orthodontics, One Endodontics, Garrison Orthodontics, TriCity Endodontics, and Surf City Endodontics.
- Phone values are sourced from each project's `project_identity.business.phone`, with a primary-location fallback when needed.
- Published website templates get the same header phone block so future generated websites inherit the behavior by default.
- The website builder prompt now instructs generated layouts to render a phone number in the header, use a digits-only `tel:` href, and default helper copy to `Call us today`.
- Migration is reversible and creates backup tables before mutating template/project JSON. It should run on dev first through `dev/dave`, then production only after promotion to `main`.
- Verified: `npx tsc --noEmit` clean; local migration up/down smoke test passed; `git diff --check` clean.

**Commits:**

- `src/database/migrations/20260605000000_add_website_header_phone_ctas.ts` - reversible JSON backfill for target project headers and published templates
- `src/agents/websiteAgents/builder/LayoutGenerator.md` - builder instruction for header phone CTA defaults
- `plans/04212026-no-ticket-dental-seo-template-visual-refresh/preview/template.header.html` - preview header phone CTA block
- `plans/06052026-website-header-phone-cta/` - completed execution spec

## [0.0.106] - June 2026

### Clarity Integration — Installation Validation & Completeness Gate

Adds a **Validate installation** action and a completeness gate to the Clarity integration page. The token + Project ID fields only cover the inbound Data Export (fetch) direction; there was no way to confirm the outbound tracking tag is actually live on the published site. Validation now checks three things server-side and marks the integration **Complete** only when all pass: the Project ID is valid, the stored API token still authenticates, and the live published page serves the Clarity tag for that Project ID (flagging a mismatched/legacy tag). The tracking script is **derived** from the Project ID (shown read-only/copyable), never stored, and pasting a full snippet auto-extracts the Project ID. No renderer changes — `website-builder-rebuild` already injects Clarity from `website_integrations`.

**Key Changes:**

- Backend: new `validateInstallation` in `service.clarity-integration.ts` — validates the Project ID format, re-checks the decrypted token against the Clarity API (non-throwing: 401/403 → invalid, 429 → valid, else unconfirmed), and fetches the project's own published URL to detect every Clarity Project ID on the page (`present` / `mismatch` / `absent` / `error`). Persists a snapshot to `metadata.validation` + `last_validated_at` + `last_error`.
- Guardrail: validation **never mutates the integration `status` column** — the renderer injects only `status='active'` rows, so flipping to `broken` on a failed check would silently stop live tracking. Documented in code.
- `getStatus` now returns a `completeness` summary (`hasProjectId`, `hasToken`, `lastValidation`, `isComplete`) computed from stored data only; the live probe runs solely on the explicit Validate action, never on load.
- New endpoint `POST /admin/websites/:id/integrations/clarity/validate`.
- Frontend: `ClaritySettingsCard` gains a derived-tag block (copyable), paste-to-extract, a three-row installation checklist with a mismatch warning, a Validate button, and a Complete badge. New `clarity-snippet.ts` util mirrors the backend tag derivation/extraction.
- Per decision, the API token is **required** for "Complete" (tracking-only setups stay incomplete).
- Verified: backend + frontend `tsc --noEmit` clean; eslint clean on all changed frontend files. Manual QA against live data (Garrison → mismatch, Caswell → absent, a good site → all green) still pending.

**Commits:**

- `src/controllers/admin-websites/feature-services/service.clarity-integration.ts` - validateInstallation + token re-check + live-tag probe; completeness in getStatus; never mutates status
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` - validateClarityInstallation handler
- `src/routes/admin/websites.ts` - POST /clarity/validate route
- `frontend/src/api/integrations.ts` - validation types, completeness on ClarityStatus, validateClarityIntegration client
- `frontend/src/components/Admin/integrations/ClaritySettingsCard.tsx` - derived tag, paste-to-extract, checklist, Validate button, Complete badge
- `frontend/src/components/Admin/integrations/ClarityTab.tsx` - validate handler + completeness wiring
- `frontend/src/components/Admin/integrations/clarity-snippet.ts` - new derive/extract util
- `plans/06052026-clarity-integration-validation/` - spec (spec.html + spec.css)

## [0.0.105] - June 2026

### Integration Logos — Single Source of Truth Across the Provider Sidebar

Follow-up refactor to 0.0.104. The four brand SVGs (HubSpot, Rybbit, Clarity, Search Console) were still defined a second time inside `IntegrationProviderList` (the larger sidebar variants), so 0.0.104's dedup was only partial. Extracted the raw SVGs into a dedicated shared module; every consumer now renders from one definition and passes its own size via `className`. Pure refactor — no behavior or visual change.

**Key Changes:**

- New `frontend/src/components/Admin/integrations/integrationLogos.tsx` — the four brand SVGs defined exactly once as named components (`HubSpotLogo`/`RybbitLogo`/`ClarityLogo`/`GoogleLogo`), each accepting `className` so the caller owns sizing.
- `ActiveIntegrationLogos.tsx` (compact badge row) and `IntegrationProviderList.tsx` (provider sidebar) drop their inline SVG copies and import the shared components — ~64 lines of duplication removed. Sizes preserved verbatim: badge row `h-3.5`/`h-4`, sidebar `w-4.5`/`w-5`/`w-4`.
- All existing exports (`ActiveIntegrationLogos`, `IntegrationPlatform`, `ActiveIntegration`) and the three external consumers (`WebsitesList`, `OrganizationMissionCard`, `admin-mission-control`) are unchanged.
- Verified: `npx tsc -b frontend` clean; eslint clean on all three touched files; rendered output identical by construction (verbatim geometry + size classes). `IntegrationPlatform` remains separately duplicated in `api/integrations.ts` — left untouched as a distinct concern.

**Commits:**

- `frontend/src/components/Admin/integrations/integrationLogos.tsx` - new shared raw-SVG logo module (caller-sized)
- `frontend/src/components/Admin/integrations/ActiveIntegrationLogos.tsx` - consume shared logos at compact sizes
- `frontend/src/components/Admin/integrations/IntegrationProviderList.tsx` - consume shared logos at larger sizes; remove duplicate defs

## [0.0.104] - June 2026

### Mission Control — Integration Icons Inline With Website Pill

Mission Control org cards now show each practice's active analytics/integration logos (HubSpot, Rybbit, Clarity, Search Console) inline to the right of the green Website pill, mirroring the Websites tab. The four SVG logos plus the badge-row component were extracted into a single shared `ActiveIntegrationLogos` module so the Websites tab and the Mission Control card render from one source instead of duplicated copies.

**Key Changes:**

- New shared `frontend/src/components/Admin/integrations/ActiveIntegrationLogos.tsx` (logos, platform order/labels, and the compact badge row). `WebsitesList` imports it and its local duplicate was removed (−79 lines).
- Backend: `MissionControlModel.getLatestWebsiteSummaries` joins `website_builder.website_integrations` for each org's latest project (`status='active'`, deduped — mirrors the Websites tab query) and surfaces it as `activeIntegrations` on each Mission Control org. No schema change (table already existed).
- The card renders the logos inside the existing stop-propagation row; the row shows when a website pill OR active integrations exist, and logos stay display-only (no card navigation).
- Null-safe: `ActiveIntegrationLogos` tolerates a missing `integrations` array and the card guards `activeIntegrations?.length`, preventing a crash when a persisted react-query cache rehydrates org data from before the backend change.
- Verified against live: `/admin/mission-control` returns `activeIntegrations` for all orgs (Garrison = Rybbit + Search Console); browser-verified render (9 cards, icons inline, empty org shows none, no error boundary); backend + frontend `tsc` clean; eslint clean.

**Commits:**

- `src/models/MissionControlModel.ts` - join active integrations for each org's latest project
- `src/controllers/admin-mission-control/feature-services/MissionControlService.ts` - expose `activeIntegrations` on the org payload
- `frontend/src/components/Admin/integrations/ActiveIntegrationLogos.tsx` - new shared logo/badge component (null-safe)
- `frontend/src/pages/admin/WebsitesList.tsx` - consume shared component, remove duplicated logos
- `frontend/src/api/admin-mission-control.ts` - `activeIntegrations` on `MissionControlOrganization`
- `frontend/src/components/Admin/mission-control/OrganizationMissionCard.tsx` - render logos inline with the Website pill

## [0.0.103] - June 2026

### Remove Unused SetupProgressBanner Component

Cleanup tail of the 0.0.101 PMS Updated-Data Alert work. The `SetupProgressBanner` focus-dashboard component was superseded by the shared `DashboardAlertStack` "setup" alert variant and had no remaining importers. Removed the dead file; no behavioral or UI change.

**Key Changes:**

- Deleted `frontend/src/components/dashboard/focus/SetupProgressBanner.tsx` (zero importers; replaced by the setup variant in `frontend/src/utils/dashboardAlerts.ts`).
- Verified: exact-name `grep` shows no references, frontend `npx tsc --noEmit` clean, `npm run build` passes.

**Commits:**

- `frontend/src/components/dashboard/focus/SetupProgressBanner.tsx` - removed unused component

## [0.0.102] - June 2026

### Mission Control — Test Org Filter Pill (De-Hardcoded Sandbox Hiding)

Mission Control used to hide "sandbox" orgs by excluding any whose name matched a hardcoded list (`test`, Hamilton Wise, Alloro Team) inside `MissionControlModel`, so a rename silently changed visibility and the orgs were unreachable from the admin view. Sandbox status now lives on a real `organizations.is_sandbox` column: test orgs flow through the API tagged with `isTest`, stay out of every default view and all revenue/summary/count aggregates, and are reachable through a new **Test** filter pill. The unused **Risk** (`payment-risk`) pill was removed; `riskFlags` data is unchanged and still powers the org-card chips, the No Method pill, and the Payment Attention panel.

**Key Changes:**

- New `organizations.is_sandbox` boolean (idempotent, `hasColumn`-guarded migration; backfilled for the three existing test orgs — Hamilton Wise #36, Test #41, Alloro Team #45). The hardcoded name list now exists only in the one-time migration backfill.
- Backend no longer excludes sandbox orgs from the Mission Control payload; each org carries `isTest`, and test orgs are excluded from the headline count, summary, revenue trend, and movement signals (headline count stays at 9).
- Frontend adds a **Test** filter pill that reveals only test orgs and hides them from every other view; removed the **Risk** pill (data retained).
- Verified against live: API returns `isTest` on orgs 36/41/45; backend + frontend `tsc` clean; eslint clean.

**Commits:**

- `src/database/migrations/20260604000005_add_is_sandbox_to_organizations.ts` - adds `is_sandbox` + one-time name-based backfill
- `src/models/MissionControlModel.ts` - select `is_sandbox`, return all orgs, removed `isSandboxOrganization`
- `src/controllers/admin-mission-control/feature-services/MissionControlService.ts` - expose `isTest`; exclude test orgs from aggregates
- `frontend/src/api/admin-mission-control.ts` - `isTest` on the org type
- `frontend/src/components/Admin/mission-control/MissionControlHeader.tsx` - Test pill in, Risk pill out
- `frontend/src/pages/admin/MissionControl.tsx` - Test-pill filter logic; count excludes test orgs
- `plans/06042026-mission-control-test-pill/*` - execution spec

**Follow-ups (outside this commit):**

- The frontend served on `:3000` (built bundle) needs a rebuild to show the Test pill; the change is live on the `:5174` vite dev server. The backend (`isTest`) is already live.
- Migration `20260604000005` was applied to live surgically (column added directly), not yet recorded in `knex_migrations`; the next `npm run db:migrate` records it (idempotent) and will also apply the other currently-pending migrations (Rybbit `20260603000000`, Email Manager `…004000`/`…004004`/seed).

## [0.0.101] - June 2026

### PMS Updated-Data Alert & Sidebar Event Feedback

Editing or deleting PMS data in the Referrals Hub File Manager used to silently kick off a multi-minute monthly-agent rerun, flipping the dashboard into a processing state unexpectedly. Edits and deletes are now cheap and reversible: they record the change and surface a prioritized "Updated data detected" alert, and the rerun is an explicit "Get updated insights" action. Uploads (new month or overwrite) still run automatically. The same alert renders on both the main dashboard and the Referrals Hub through one shared, cascaded alert component, and the File Manager now responds optimistically instead of waiting on a full surface refetch.

**Key Changes:**

- Edit and delete no longer auto-trigger the monthly agent; they record an event and mark insights stale. Uploads keep auto-running through the existing finalize path.
- Staleness is computed server-side with no migration: key-data `stats` now returns `insightsStale`, `lastDataChangeAt`, and `lastInsightsRunAt`, derived from PMS edit/delete events versus the latest completed run.
- New authenticated, location-scoped `POST /pms/file-manager/rerun` (admin/manager, 409 while a run is active) backs the "Get updated insights" CTA, which immediately reveals the animated processing card on the Referrals Hub.
- Introduced a shared `DashboardAlert` + cascaded `DashboardAlertStack` (top alert full-size, others scaled behind, prev/next arrows) used on both the main dashboard and `/pmsStatistics`; removed the previously duplicated upload-nudge markup.
- File Manager delete is now optimistic with rollback, the delete confirm shows an in-flight state, the `agentData`/`tasks` refetch cascade was dropped, and the misleading "the agent is rerunning" toasts were removed.
- Updated Alloro Docs (Referrals Hub page + visual replica) to document the alert and the explicit-rerun behavior.

**Commits:**

- `src/controllers/pms/pms-services/PmsFileManagerService.ts` - removed auto-rerun from edit/delete; added `rerunInsights`
- `src/controllers/pms/PmsFileManagerController.ts`, `src/routes/pms.ts` - authenticated `POST /pms/file-manager/rerun`
- `src/controllers/pms/pms-services/pms-data.service.ts`, `src/controllers/pms/pms-utils/pms-insights-freshness.util.ts` - server-side staleness detection on key-data `stats`
- `src/models/PmsJobModel.ts`, `src/models/PmsJobEventModel.ts` - latest-change and run-summary queries; latest-active-job lookup
- `frontend/src/components/dashboard/alerts/*`, `frontend/src/utils/dashboardAlerts.ts` - shared cascaded alert component + builder
- `frontend/src/components/PMS/PMSVisualPillars.tsx`, `frontend/src/components/dashboard/DashboardOverview.tsx` - wired the alert stack and "Get updated insights" on both surfaces
- `frontend/src/hooks/queries/usePmsFileManagerQueries.ts` - optimistic delete + rerun hook + trimmed invalidation
- `frontend/src/hooks/queries/usePmsFocusPeriod.ts`, `frontend/src/api/pms.ts` - `insightsStale` plumbing + rerun client
- `frontend/src/components/PMS/file-manager/PmsFileManager.tsx`, `PmsFileList.tsx` - in-flight delete state, corrected toasts
- `plans/06042026-pms-updated-data-alert-and-sidebar-feedback/*` - execution spec

**Follow-ups (outside this commit):**

- Manual browser verification at `/pmsStatistics` (edit → alert → Get updated insights → animation).
- Remove the now-unused `frontend/src/components/dashboard/focus/SetupProgressBanner.tsx`.
- Alloro Docs changes live in the separate `alloro-docs` repo and are committed/pushed there separately.

## [0.0.100] - June 2026

### Per-Site Rybbit Reporting Timezone

Rybbit analytics day/month buckets were computed in a hardcoded Eastern timezone for every practice, so practices outside Eastern time saw boundaries that didn't match their own Rybbit dashboard (a small ~0.3% near-boundary shift, but a real correctness gap that also touched the new live unique-visitor queries). Practices can now carry their own IANA reporting timezone, threaded through every Rybbit query, with Eastern as the fallback so existing sites are unchanged.

**Key Changes:**

- Added a per-practice `rybbit_time_zone` (nullable IANA string) on `website_builder.projects`, settable from the admin Rybbit integration tab, falling back to `America/New_York` when unset — zero change for existing Eastern practices.
- Replaced the hardcoded `America/New_York` in all four Rybbit `time_zone` call sites — daily harvest, historic-backfill date bounds, live unique-visitor queries, and the Proofline/Summary agent comparisons — with the per-site zone resolved through one shared helper.
- Confirmed Rybbit exposes no per-site timezone of its own (it buckets by the `time_zone` query parameter), so the zone is sourced from our records; admin input is validated against the platform `Intl` API with no new dependency.

**Follow-ups (operational, outside this commit's runtime):**

- Apply the migration (`npm run db:migrate`) before the feature is active.
- After setting a non-Eastern zone on an existing site, run the Rybbit historic backfill to re-bucket stored daily rows; live overview/monthly-unique queries need no backfill.

**Commits:**

- `src/database/migrations/20260603000000_add_rybbit_time_zone_to_projects.ts`, `src/utils/rybbit/rybbit-time-zone.ts` - schema column + shared default/resolver/validator
- `src/models/website-builder/ProjectModel.ts` - `rybbit_time_zone` field, `getRybbitTimeZone` / `updateRybbitTimeZone`
- `src/services/integrations/rybbitHarvestAdapter.ts`, `service.rybbit-history.ts`, `service.rybbit-performance.ts`, `src/utils/rybbit/service.rybbit-data.ts` - the four call sites now resolve the per-site zone
- `src/controllers/user-website/UserWebsiteController.ts` - resolves the zone once for the live unique-visitor queries
- `service.rybbit-integration.ts`, `WebsiteIntegrationsController.ts` - admin set: validate, persist, surface in status
- `frontend/src/api/integrations.ts`, `frontend/src/components/Admin/integrations/RybbitTab.tsx` - timezone field + status type
- `plans/06032026-rybbit-per-site-report-timezone/*` - execution spec

## [0.0.99] - June 2026

### Local Rankings Competitor Address Labels

Improved the Local Rankings competitor comparison table so same-name practices, such as multiple Dominion Endodontics locations, are distinguished by address instead of looking like duplicate rows.

**Key Changes:**

- Preserved competitor addresses in future ranking snapshots and raw competitor payloads.
- Enriched existing latest-ranking responses with saved `location_competitors` addresses by place ID.
- Updated comparison row matching to prefer place ID before name, avoiding same-name metric mismatches.
- Kept category as a fallback when an address is unavailable and preserved the full address tooltip behavior.

**Commits:**

- `src/controllers/practice-ranking/PracticeRankingController.ts` and `util.ranking-formatter.ts` - latest-response address enrichment and `placeId` / `place_id` normalization
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` and `service.location-competitor-onboarding.ts` - future snapshot/raw-data address preservation
- `frontend/src/components/dashboard/rankings/competitorComparison.ts` - address-aware comparison rows and place-ID-first raw metric matching
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts` and `LocalRankingsReplica.tsx` - documentation parity for address sublines
- `plans/06032026-local-rankings-competitor-address-labels/*` - completed execution spec

## [0.0.98] - June 2026

### Website Overview Refinements

Refined the Websites tab cards-first overview (added in 0.0.95) for clarity and accuracy: hover-driven chart readouts, a monthly visitor cadence, a daily traffic drill-down that honestly marks gaps, clearer "Leads = form submissions" labeling, a three-column hero funnel, and a fix for an inflated unique-visitor count.

**Key Changes:**

- Hovering a chart point now updates that card's own headline number and period label (e.g. "Apr 2026") instead of a floating tooltip; month-over-month deltas hide while hovering.
- Reworked the hero funnel into three columns — Unique visitors, Leads (form submissions), and Conversion rate — that all update on hover, with a three-line trend chart (visitors, submissions, conversion) and color-matched dots.
- Switched the visitor/traffic cards to a monthly cadence (last 12 months) to match the leads chart; the Traffic detail modal keeps daily resolution and marks days with no data as gaps rather than zeros.
- Conversion rate is shown as a clear month-to-date figure ("so far this month") with a note that it updates daily; removed the earlier blended "typical" rate.
- Labeled "Leads" as "(form submissions)" across the funnel and cards so the metric's source is explicit.
- Filtered no-data months out of the overview cards so charts start at the first month with real data.
- Fixed an inflated unique-visitor count: monthly/period visitor totals are now fetched as true deduped uniques from Rybbit (a single bucketed query) instead of summing daily uniques, which over-counted repeat visitors by ~10%. Sessions and page views were already accurate. This also corrects (raises) the conversion rate.
- Form submissions catalog: click any row to open it and drag-and-drop to reorder (replacing the up/down arrows).

**Commits:**

- `frontend/src/components/website/overview/WebsiteOverview.tsx`, `websiteMetrics.ts`, `OverviewCard.tsx` - 3-column funnel, monthly cadence, no-data filtering, hover readouts, conversion framing, labeling
- `frontend/src/components/dashboard/shared/TrendSparkline.tsx` - hover-driven headlines, null-gap support, optional third line + area toggle
- `frontend/src/api/websiteAnalytics.ts` - true per-month unique-visitor field
- `src/controllers/admin-websites/feature-services/service.rybbit-performance.ts`, `src/controllers/user-website/UserWebsiteController.ts` - live Rybbit per-month/window true-unique queries with stored-data fallback
- `frontend/src/components/Admin/FormSubmissionsSidebar.tsx`, `FormSubmissionsTab.tsx` - click-to-open + drag-and-drop reorder
- `plans/05312026-no-ticket-websites-tab-cards-overview/spec.md` - Rev 7–13 plus the data-accuracy finding

## [0.0.97] - June 2026

### PMS File Manager

Added a location-scoped PMS File Manager for Referrals Hub data so admins and managers can upload, inspect, edit, download, overwrite, and soft-delete monthly PMS files without leaving the PMS Statistics workflow.

**Key Changes:**

- Added a compact Manage Data side panel with a latest-completed-month data window, month-specific upload/edit/overwrite actions, file cards, original parsed-data review, download, delete confirmation, and edit history.
- Replaced the ingestion-card availability grid with a production/referral trend graph; plot points are hoverable/focusable and open the same month-scoped edit or upload flow.
- Added authenticated PMS file-manager API endpoints with admin/manager write controls, location scoping, processing guards, original-file downloads, edit-event history, and soft-delete handling.
- Persisted original upload metadata, original parsed PMS snapshots, response-log diffs, uploader/editor/delete attribution, and mutation events while keeping the existing aggregator behavior intact.
- Removed `.txt` PMS upload support and kept PMS uploads limited to CSV, XLS, and XLSX files.
- Updated the Referrals Hub docs replica and page guidance for Upload New Data, Manage Data, trend graph interactions, monthly file management, and history/download behavior.

**Commits:**

- `frontend/src/components/PMS/dashboard/*`, `frontend/src/components/PMS/file-manager/*`, and `frontend/src/hooks/queries/usePmsFileManagerQueries.ts` - side panel, trend graph, month-slot interactions, file list, history panel, and query wiring
- `frontend/src/components/PMS/*` and `frontend/src/api/pms.ts` - upload/edit modal reuse, file-type handling, month-scoped upload behavior, and typed PMS API helpers
- `src/controllers/pms/*`, `src/models/PmsJobModel.ts`, `src/models/PmsJobEventModel.ts`, and `src/routes/pms.ts` - PMS file-manager controllers, services, presenters, storage helpers, mutation guards, event history, and route registration
- `src/database/migrations/20260602010000_add_pms_file_manager_metadata.ts` - PMS file-manager metadata and event-history schema
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/ReferralsHubReplica.tsx` and `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/referrals-hub.ts` - documentation parity for the updated Referrals Hub data workflow
- `plans/06022026-pms-file-manager/*` - completed execution spec and migration notes

## [0.0.96] - June 2026

### PMS File Manager

Added a location-scoped PMS File Manager for Referrals Hub data so admins and managers can upload, inspect, edit, download, overwrite, and soft-delete monthly PMS files without leaving the PMS Statistics workflow.

**Key Changes:**

- Added a compact Manage Data side panel with a latest-completed-month data window, month-specific upload/edit/overwrite actions, file cards, original parsed-data review, download, delete confirmation, and edit history.
- Replaced the ingestion-card availability grid with a production/referral trend graph; plot points are hoverable/focusable and open the same month-scoped edit or upload flow.
- Added authenticated PMS file-manager API endpoints with admin/manager write controls, location scoping, processing guards, original-file downloads, edit-event history, and soft-delete handling.
- Persisted original upload metadata, original parsed PMS snapshots, response-log diffs, uploader/editor/delete attribution, and mutation events while keeping the existing aggregator behavior intact.
- Removed `.txt` PMS upload support and kept PMS uploads limited to CSV, XLS, and XLSX files.
- Updated the Referrals Hub docs replica and page guidance for Upload New Data, Manage Data, trend graph interactions, monthly file management, and history/download behavior.

**Commits:**

- `frontend/src/components/PMS/dashboard/*`, `frontend/src/components/PMS/file-manager/*`, and `frontend/src/hooks/queries/usePmsFileManagerQueries.ts` - side panel, trend graph, month-slot interactions, file list, history panel, and query wiring
- `frontend/src/components/PMS/*` and `frontend/src/api/pms.ts` - upload/edit modal reuse, file-type handling, month-scoped upload behavior, and typed PMS API helpers
- `src/controllers/pms/*`, `src/models/PmsJobModel.ts`, `src/models/PmsJobEventModel.ts`, and `src/routes/pms.ts` - PMS file-manager controllers, services, presenters, storage helpers, mutation guards, event history, and route registration
- `src/database/migrations/20260602010000_add_pms_file_manager_metadata.ts` - PMS file-manager metadata and event-history schema
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/ReferralsHubReplica.tsx` and `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/referrals-hub.ts` - documentation parity for the updated Referrals Hub data workflow
- `plans/06022026-pms-file-manager/*` - completed execution spec and migration notes

## [0.0.95] - June 2026

### Spectral Serif Typography Standardization

Standardized the active frontend serif/display typography on the Google Font Spectral so dashboard, editorial, and chat surfaces no longer mix older serif stacks.

**Key Changes:**

- Removed the remaining Literata fallback from the SPA font loader, dashboard display token, and Local Rankings gauge stack
- Updated hardcoded frontend serif stacks used by dashboard metric cards and Minds chat surfaces to Spectral
- Added the current-week Feature Friyay package and completed HTML/CSS plan spec for the typography change
- Kept Alloro Docs aligned through a separate docs parity commit

**Commits:**

- `frontend/index.html` and `frontend/src/index.css` - final Spectral loader and display font token cleanup
- `frontend/src/components/dashboard/focus/*`, `frontend/src/components/dashboard/RankingsDashboard.tsx`, and `frontend/src/components/Admin/minds/*` - direct serif stack replacements
- `friyays/06-01-2026/*` - current-week Feature Friyay draft package
- `plans/06032026-replace-serif-with-spectral/*` - completed execution spec

## [0.0.94] - May 2026

### Review Sync OAuth Refresh Hardening

Hardened the Google Business Profile review sync worker after Garrison Orthodontics showed stale-token `401` failures in the daily Reviews sync status. The worker now uses the existing refresh-aware OAuth path and records fresh health rows when connection auth fails before location sync begins.

**Key Changes:**

- Switched OAuth review sync from raw stored-token client creation to the existing refresh-aware Google connection helper
- Added a one-time forced token refresh retry for Google unauthorized responses, reusing the refreshed client for later locations on the same connection
- Added current failed `gbp_sync_health` rows for connection-level auth failures so the dashboard does not keep showing stale status
- Verified production state for Garrison Orthodontics, including one `minds-worker`, one `daily-review-sync` repeatable job, and latest successful sync rows with 90 reviews synced

**Commits:**

- `src/workers/processors/reviewSync.processor.ts` - refresh-aware auth setup, bounded unauthorized retry, refreshed-client reuse, safe sync-health failure rows, and sync metadata cleanup
- `plans/05312026-no-ticket-fix-review-sync-oauth-refresh/spec.md` - execution spec, risk notes, and verification checklist

## [0.0.93] - May 2026

### Background Worker Lock-Renewal Stability Fix

Eliminated the `could not renew lock for job repeat:...` error flood on the `minds-scheduler`, `minds-skill-triggers`, and `gbp-automation-deployment` BullMQ workers. Root cause: tick processors awaited multi-minute work (AI agent runs, per-location Google syncs) inline while holding a short 30-second lock, so the lock expired mid-run, the stalled-job checker requeued the job, the orphaned attempt's renewal failed, and the repeatable iteration never reached a terminal state — looping forever.

**Key Changes:**

- Split the scheduler tick into a lightweight dispatcher plus a dedicated execution worker: the `minds-scheduler` tick now only finds due schedules and enqueues one job per schedule onto a new `minds-schedule-exec` queue, so the 60-second tick always finishes sub-second and never holds a lock through long-running agent work
- Added an execution-half processor that owns the agent-run lifecycle (run record, handler execution, `next_run_at` advance) under a 15-minute lock with bounded concurrency, guarded by `hasActiveRun` in both dispatcher and executor for at-most-one active run per schedule
- Gave every BullMQ worker its own Redis connection via a `makeConnection()` factory instead of sharing a single ioredis instance, removing the lock-renewal starvation amplifier
- Set realistic explicit lock durations on the previously default-locked workers (skill-triggers 5 minutes, gbp-automation-deployment 20 minutes) and switched skill-trigger webhook fires to bounded-concurrency batches so tick wall-time no longer scales linearly with due-skill count

**Commits:**

- `src/workers/processors/scheduler.processor.ts` - rewrote `processSchedulerTick` as a dispatcher that enqueues per-schedule exec jobs with an idempotent due-window `jobId`; removed the inline `agent.handler()` call
- `src/workers/processors/scheduleExec.processor.ts` - new execution-half processor: re-checks active run, creates the run record, runs the agent handler, completes/fails the run, and advances `next_run_at` once per execution
- `src/workers/processors/skillTrigger.processor.ts` - extracted `processSingleSkill` and fired due-skill webhooks in bounded `Promise.allSettled` batches with per-skill error isolation
- `src/workers/worker.ts` - added a `makeConnection()` per-worker connection factory and tracked-connection shutdown, registered the new `minds-schedule-exec` worker, and set explicit lock durations on the skill-triggers and gbp-automation-deployment workers
- `plans/05302026-no-ticket-fix-scheduler-worker-lock-loop/*` - executed spec and revision history (T4 gbp lock-duration resolution plus the deferred per-location dispatch follow-up)

## [0.0.92] - May 2026

### Local Rankings And Support Workflow Polish

Redesigned the client Local Rankings experience around a clearer owner-readable story, upgraded Alloro Engage with review-reply quick actions, and added faster support reporting from anywhere in the app.

**Key Changes:**

- Rebuilt `/rankings` so the first screen leads with a plain-English ranking summary, Local Search Estimate, Local Search Score, owner-friendly next actions, Alloro Engage, and a sortable competitor table
- Moved Practice Health details into secondary score/gap modals, removed estimated/filler copy, defaulted competitor sorting to Local Search, and blocked website-speed recommendations from ranking outputs
- Added Alloro Engage review/post narrative cards, compact metric tooltips, latest-review reply drafting, deploy success toasts, card-deck transitions, and optimistic reply-count decrement animations
- Added a global support launcher that captures a page screenshot, attaches current-session console logs, opens the existing `/help` composer, and preserves the normal support ticket flow
- Replaced the full pilot-mode bar with a dismissible top-left `PILOT MODE` pill
- Cleaned up Website Edit ticket copy by removing Approval Notes and renaming the date prompt to `When do you need this by?`
- Updated Alloro Docs replicas and page guidance for Local Rankings, Alloro Engage, global support, and Website Edit support-copy parity

**Commits:**

- `frontend/src/components/dashboard/RankingsDashboard.tsx` and `frontend/src/components/dashboard/rankings/*` - owner-readable Local Rankings layout, Local Search Estimate/Score cards, inline competitor table, detail modals, loaders, and copy cleanup
- `src/controllers/practice-ranking/feature-services/*` - ranking output guardrails, review/post engagement payload context, score alignment, and website-speed recommendation filtering
- `frontend/src/components/dashboard/gbp-automation/*` - Alloro Engage card narrative, metric cards, latest-review quick action, queue progress, deck animation, and deploy feedback
- `frontend/src/components/support/*`, `frontend/src/contexts/SupportQuickActionContext.tsx`, and `frontend/src/utils/support*.ts` - global support launcher, screenshot/log capture, draft handoff, attachment animation, and support composer integration
- `frontend/src/components/Admin/PilotBanner.tsx` - compact dismissible pilot-mode pill
- `src/controllers/support/*` and `frontend/src/components/support/supportTicketComposerFields.ts` - Website Edit guided-field cleanup and server validation alignment
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/*` and `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/*` - documentation parity for the redesigned client/dashboard surfaces
- `plans/05272026-no-ticket-local-rankings-owner-readable-redesign/*` and `plans/05282026-no-ticket-*/*` - executed specs and revision history for the combined release

## [0.0.91] - May 2026

### Feature Friyays

Added the inaugural Feature Friyay release package so weekly shipped work can be compiled into a branded shareable roundup and customer email draft.

**Key Changes:**

- Added repo-local Feature Friyay workflow rules, including `--done friyay`, plain `--done` inference, and ask-when-unsure classification behavior
- Added the inaugural `friyays/05-25-2026` static HTML/CSS package with a branded roundup page, email draft, evidence-backed inventory, release-state notes, and ship checklist
- Switched Friyay artifacts from standalone Markdown drafts to `index.html`, `email.html`, and `styles.css` so the weekly roundup is presentable without extra tooling
- Preserved release-state distinctions between production workflow evidence, dev workflow evidence, needs verification, and internal-only items

**Commits:**

- `AGENTS.md` - Feature Friyay folder contract, `--done friyay` behavior, inference rules, and HTML/CSS artifact requirements
- `friyays/05-25-2026/*` - inaugural branded Feature Friyay page, email draft, and shared Alloro styling
- `plans/05282026-no-ticket-feature-friyays-inaugural-roundup/spec.md` - execution spec and revision log for the Markdown-to-HTML conversion

## [0.0.90] - May 2026

### GBP Posts Manager And Admin Navigation

Expanded GBP Automation into a fuller posts manager while tightening the admin and client workflows around Local Rankings, organization detail, and Mission Control.

**Key Changes:**

- Added draft-first GBP local post generation with required per-post image upload, background generation jobs, safety checks, editable drafts, explicit deploy, and delete flows
- Added published GBP post sync, pagination, image previews, edit/delete actions, Google open links, and manual/automatic sync health labels
- Added client and admin GBP Posts tabs with Published/Drafts separation and a create-post modal instead of an always-visible generation form
- Simplified client Local Rankings Alloro Engage by removing the extra workspace heading card and Next Post tile, keeping users directly in the action panel
- Moved Reply Drafts into the Reviews workflow and improved GBP Automation settings/diagnostics copy and feature separation
- Added shared organization-detail submenus for Website, Agent Results, and GBP Automation, plus a Mission Control-friendly organization title block
- Added Mission Control card actions for Pilot/Website and collapsed lower-priority organization signals into Quick details
- Updated Local Rankings docs replica and walkthrough copy for the simplified Alloro Engage client flow

**Commits:**

- `src/controllers/gbp-automation/*`, `src/models/GbpLocalPostModel.ts`, `src/models/GbpWorkItemModel.ts`, `src/routes/gbpAutomation.ts`, and `src/routes/admin/gbpAutomation.ts` - local post draft generation, media upload, published post sync, deployment, and API surfaces
- `src/controllers/gbp/gbp-services/gbp-write.service.ts`, `src/workers/processors/gbpAutomation.processor.ts`, and `src/workers/worker.ts` - Google local post write/update/delete/sync helpers and scheduled worker wiring
- `frontend/src/components/dashboard/gbp-automation/*`, `frontend/src/api/gbpAutomation.ts`, and `frontend/src/hooks/queries/useGbpAutomationQueries.ts` - client Alloro Engage reviews, reply drafts, GBP posts manager, image upload, and settings flow
- `frontend/src/components/Admin/OrgGbpAutomationTab.tsx`, `frontend/src/api/admin-gbp-automation.ts`, and `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts` - admin GBP Automation parity for reviews, posts, sync, and settings
- `frontend/src/pages/admin/OrganizationDetail.tsx`, `frontend/src/pages/admin/WebsiteDetail.tsx`, and `frontend/src/components/Admin/OrganizationDetailNavigation.tsx` - shared organization-detail navigation and embedded Website/GBP submenus
- `frontend/src/components/Admin/mission-control/OrganizationMissionCard.tsx` - Mission Control card actions and Quick details disclosure
- `plans/05252026-no-ticket-gbp-automated-posting-draft-deploy/*` and `plans/05272026-no-ticket-*/*` - executed specs and verification notes for the posts manager, client Local Rankings Engage view, and admin navigation polish
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts` and `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx` - docs parity for the updated Local Rankings / Alloro Engage workflow

## [0.0.89] - May 2026

### GBP Automation And Alloro Engage

Added the GBP review-reply automation foundation, client-facing Alloro Engage experience, admin controls, review intelligence metrics, and production hardening for Google write actions.

**Key Changes:**

- Added GBP Automation admin and client surfaces for review queues, reply drafts, replied reviews, settings, diagnostics, and draft deletion
- Added Alloro Engage to Local Rankings with an Overview card, engagement metrics, monthly review map, and a dedicated reply workflow tab
- Added review-reply work items, audit events, deployment attempts, automation settings, review insights, escalation tracking, and sync-health persistence
- Added AI review reply draft generation with organization/location customizations, safety checks, deploy previews, and manual save/deploy flows
- Added Google Business Profile reply write/delete support with scoped OAuth usage, retryable worker deployment, and review sync support
- Hardened authorization, location scoping, attempt visibility, status transitions, Google error classification, LLM input sanitization, and autosave/deploy race handling
- Updated Alloro Docs replicas and page copy for the new Local Rankings / Alloro Engage workflow

**Commits:**

- `src/controllers/gbp-automation/*`, `src/routes/gbpAutomation.ts`, and `src/routes/admin/gbpAutomation.ts` - GBP automation controllers, services, client/admin routes, deploy previews, draft generation, settings, published-reply management, and hardening utilities
- `src/models/Gbp*Model.ts`, `src/database/migrations/20260524*.ts`, and `src/database/migrations/20260525*.ts` - GBP work item, event, attempt, settings, insight, escalation, and sync-health schema/model support
- `src/controllers/gbp/gbp-services/gbp-write.service.ts`, `src/workers/processors/gbpAutomation.processor.ts`, and worker queue wiring - Google write helpers and queued deployment processing
- `frontend/src/components/dashboard/gbp-automation/*`, `frontend/src/api/gbpAutomation.ts`, and `frontend/src/hooks/queries/useGbpAutomationQueries.ts` - client Alloro Engage UI, review queues, draft slots, settings, metrics, and React Query wiring
- `frontend/src/components/Admin/gbp-automation/*`, `frontend/src/api/admin-gbp-automation.ts`, and `frontend/src/hooks/queries/useAdminGbpAutomationQueries.ts` - admin GBP Automation tab, settings, diagnostics, review queues, drafts, and replied-review controls
- `frontend/src/components/dashboard/RankingsDashboard.tsx`, `frontend/src/components/dashboard/rankings/RankingsDashboardViewTabs.tsx`, and `frontend/src/pages/admin/OrganizationDetail.tsx` - Local Rankings tab split, overview integration, and admin navigation
- `src/agents/gbpAgents/*` - GBP review reply, local post, and review insight prompts with healthcare safety guidance
- `plans/05242026-no-ticket-gbp-review-reply-draft-deploy-foundation/*` and `plans/05252026-no-ticket-gbp-*/*` - executed specs, migrations scaffolds, phased add-on plans, and hardening verification notes
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts` and `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx` - docs parity for Local Rankings and Alloro Engage

## [0.0.88] - May 2026

### Admin Mission Control Dashboard

Added a super-admin Mission Control dashboard for revenue visibility, organization health, payment watchlists, and concise movement insight.

**Key Changes:**

- Added a Mission Control admin route with Stripe-backed expected MRR, paid revenue, lifetime revenue, and payment-risk summaries
- Added organization grid cards with Recharts paid-invoice movement charts, billing flags, admin-role pilot shortcuts, and click-through to existing organization detail pages
- Added a 12-month recurring revenue trend, Payment Watch lifetime/billing flag views, and on-demand sanitized movement insight
- Filtered internal sandbox organizations out of client counts and sorted the client grid by highest lifetime paid first
- Kept the legacy Organizations management route available and extracted create-organization behavior for reuse

**Commits:**

- `src/controllers/admin-mission-control/*`, `src/models/MissionControlModel.ts`, and `src/routes/admin/missionControl.ts` - aggregate Mission Control API, Stripe revenue reads, sanitized insight generation, and admin route protection
- `frontend/src/pages/admin/MissionControl.tsx` and `frontend/src/components/Admin/mission-control/*` - Mission Control dashboard UI, revenue charts, organization cards, Payment Watch, pilot menu, and insight panel
- `frontend/src/api/admin-mission-control.ts`, `frontend/src/hooks/queries/useAdminMissionControlQueries.ts`, and `frontend/src/lib/queryClient.ts` - typed frontend API, React Query hooks, and cache keys
- `frontend/src/components/Admin/CreateOrganizationModal.tsx`, `frontend/src/pages/admin/OrganizationManagement.tsx`, `frontend/src/pages/Admin.tsx`, and `frontend/src/components/Admin/AdminSidebar.tsx` - shared create-org modal and admin navigation/routing
- `plans/05252026-no-ticket-admin-mission-control-dashboard/spec.md` - executed spec, revisions, risk notes, and verification checklist

## [0.0.87] - May 2026

### Form Email Submission Links

Made website form emails send recipients directly to the Website submissions tab when uploaded files or photos are present, without exposing patient images in the email itself.

**Key Changes:**

- Updated uploaded-file email copy to point to the Alloro submissions dashboard for clearer previews and full-size downloads
- Added `?tab=` permalink support to the DFY Website page for Editor, Submissions, Posts, and Menus
- Preserved legacy `?view=` website tab links by normalizing them to the new `?tab=` parameter
- Updated Alloro Docs Website guidance to mention direct tab links

**Commits:**

- `src/controllers/websiteContact/websiteContact-services/emailBodyBuilder.ts` - uploaded-file email note now links to `/dfy/website?tab=submissions`
- `frontend/src/pages/DFYWebsite.tsx` - URL-backed Website tab selection and legacy `?view=` compatibility
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/website.ts` - Website docs walkthrough copy for `?tab=` links
- `plans/05232026-no-ticket-email-submissions-tab-link/spec.md` - executed spec and verification checklist

## [0.0.86] - May 2026

### Caswell Organization Data Consolidation

Consolidated Caswell Orthodontics operational ownership onto the canonical org `43` while preserving the live website project and stable location IDs.

**Key Changes:**

- Kept org `43` as the canonical Caswell organization and left org `25` undeleted for a separate cleanup decision
- Moved the three real Caswell locations, Google connection, and user membership from org `25` to org `43`
- Rehomed Caswell ranking, task, agent result, PMS, notification, and Google data history to org `43`
- Removed the empty placeholder location on org `43` after preflight confirmed it had no dependent rows
- Verified org `43` owns one primary location, both Caswell user memberships, and the live website project after the transfer

**Commits:**

- `plans/05232026-no-ticket-migrate-caswell-org-data/spec.md` - executed data-migration spec, risk notes, and verified checklist
- Live database rows - transactional org ownership transfer for Caswell locations, Google connection, users, and operational history

## [0.0.85] - May 2026

### Canvas Inline Website Editing

Made routine website text edits feel more like a real page editor by allowing safe direct typing on selected canvas text while keeping structure-changing operations out of scope.

**Key Changes:**

- Added plain-text canvas editing for safe selected headings, paragraphs, links, list items, captions, and button labels
- Made selected text open a focused on-canvas textarea at the selected element so typing happens in place with a real caret
- Replaced the right-sidebar single-line text input with a multi-line textarea and visible font-size controls
- Added paste/keyboard guards so canvas edits stay plain text and can be committed or cancelled without injecting rich markup
- Blocked unsafe nested media, icon, and form content from direct canvas editing instead of risking wrapper damage
- Routed committed canvas text edits through the existing direct operation, undo/history, section extraction, autosave, dirty-state, save, and layout persistence paths
- Kept link href, media replacement, font-size, hide/show, and section background edits in the compact property toolbar
- Preserved the no-reorder, no-delete, no-drag/drop, no-arbitrary-HTML, and no-new-storage-path boundaries

**Commits:**

- `frontend/src/utils/canvasTextEditing.ts` - safe on-canvas textarea edit session lifecycle, paste sanitization, commit, and cancel behavior
- `frontend/src/hooks/useIframeSelector.ts` - selected-element editability metadata, canvas textarea pointer handling, and iframe editing-state handling
- `frontend/src/utils/editorDirectOperations.ts` - no-op detection and canvas edit availability in direct operation results
- `frontend/src/components/PageEditor/InlineEditorPopover.tsx` - compact text toolbar behavior with fallback input for unsafe nested content
- `frontend/src/components/PageEditor/SelectedElementEditorPanel.tsx` - sidebar selected-element textarea editor, font-size controls, link controls, media controls, and visibility controls
- `frontend/src/pages/admin/PageEditor.tsx`, `LayoutEditor.tsx`, and `DFYWebsite.tsx` - shared canvas edit wiring through existing save/persistence flows
- `plans/05222026-no-ticket-canvas-inline-content-editing/spec.md` - executed spec and verification checklist

## [0.0.84] - May 2026

### Website Editor Direct Controls

Hardened the website editor media boundary and moved routine page-editor operations off AI prompts into deterministic editor controls across admin and client-facing surfaces.

**Key Changes:**

- Added authenticated, user-scoped DFY media list/upload endpoints and guarded admin media/editor routes
- Routed shared media browser/upload UI through explicit admin or user media adapters
- Added direct editor operations for text replacement, link updates, media replacement, font-size stepping, and hide/show
- Wired direct operations into admin Page Editor, admin Layout Editor, and the client DFY Website editor while preserving existing section extraction and save/publish flows
- Kept freeform AI editing available for non-basic edits

**Commits:**

- `src/routes/admin/media.ts`, `src/routes/admin/websites.ts`, and `src/routes/user/website.ts` - media/editor route protection and user media routes
- `src/controllers/user-website/*` - org-scoped DFY media list/upload handling
- `frontend/src/api/websiteMedia.ts`, `frontend/src/api/websites.ts`, and shared media components - admin/user media adapter wiring
- `frontend/src/utils/editorDirectOperations.ts`, `frontend/src/components/PageEditor/EditorSidebar.tsx`, `frontend/src/hooks/useIframeSelector.ts`, and editor pages - deterministic selected-element edit operations
- `plans/05212026-no-ticket-website-editor-*` - executed media-boundary and traditional-controls specs

## [0.0.83] - May 2026

### Form Submission Email Branding

Updated website form-submission emails so recipient inboxes show the client organization context and use the project's brand accent color in the email header.

**Key Changes:**

- Changed form-submission sender names to use `[{organization name}] Alloro Forms` when organization context is available
- Added a shared email context resolver for inbound sends and admin manual resends
- Updated the form-submission email header to use project accent color with contrast-safe header text
- Added the Alloro logo mark inside the colored header and applied serif typography to the header and field labels
- Kept recipient routing, saved recipients, and subject text unchanged

**Commits:**

- `src/controllers/websiteContact/websiteContact-services/emailBodyBuilder.ts` - branded header rendering, logo mark, contrast logic, and serif field labels
- `src/controllers/websiteContact/websiteContact-services/formSubmissionEmailContextService.ts` - organization sender name and project color context resolution
- `src/controllers/websiteContact/formSubmissionController.ts` and `src/controllers/admin-websites/AdminWebsitesController.ts` - shared context wiring for inbound sends and manual resends
- `plans/05162026-no-ticket-form-submission-email-branding/spec.md` - executed spec and verification checklist

## [0.0.82] - May 2026

### SerpApi Maps Estimate Source

Moved the Local Rankings headline Google Maps estimate from the legacy Apify Maps actor to SerpApi Google Maps search centered on the client's saved GBP coordinates, making the sampled rank closer to the visible Maps result set for cases like One Endodontics-Fredericksburg.

**Key Changes:**

- Added a SerpApi Maps search-position wrapper with retry handling, place-id matching, and ordered result normalization
- Wired ranking Step 0 to persist `serpapi_maps` results and avoid silently falling back to Apify for the headline estimate
- Added a reversible migration allowing `serpapi_maps` in `practice_rankings.search_position_source`
- Updated backend and dashboard source typing/comments so historical Apify rows remain readable while new snapshots use SerpApi
- Verified SerpApi returns One Endodontics-Fredericksburg as `#1` for `endodontist in Fredericksburg, VA` at `ll=@38.2238985,-77.5053993,15z`

**Commits:**

- `src/controllers/practice-ranking/feature-services/service.serpapi-maps.ts` - SerpApi Maps lookup wrapper and ordered result normalization
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` - Step 0 SerpApi integration, Places-only fallback, and timing/source metadata
- `src/database/migrations/20260514000001_allow_serpapi_search_position_source.ts` and `src/models/PracticeRankingModel.ts` - persisted source support for `serpapi_maps`
- `frontend/src/components/dashboard/RankingsDashboard.tsx` and `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts` - source typing and source-neutral ranking copy
- `plans/05142026-no-ticket-serpapi-maps-rank-source/spec.md` - executed spec, migration scaffolds, and post-deploy verification checklist

## [0.0.81] - May 2026

### Integration Revocation Repair

Stopped the CRM mapping validation worker from applying HubSpot-style credential validation to analytics integrations, preventing Rybbit and GSC rows from being incorrectly marked revoked.

**Key Changes:**

- Scoped daily CRM mapping validation to active `crm_push` integrations only
- Reused the existing integration model helper instead of maintaining a broad inline query
- Verified the erroneous Rybbit/GSC revocation condition is cleared in live data

**Commits:**

- `src/workers/processors/crmMappingValidation.processor.ts` - CRM validation now selects only CRM push integrations
- `plans/05142026-no-ticket-integration-revocation-repair/spec.md` - executed spec and verification checklist

## [0.0.80] - May 2026

### Website Project Archive Tab

Added an admin-only Archive view for website projects so staff can move projects out of the normal Active and Inactive lists without changing live status, organization links, or custom domains.

**Key Changes:**

- Added `archived_at` metadata to website projects instead of overloading the lifecycle `status` enum
- Added server-backed Active, Inactive, and Archive filters for the admin website projects list
- Kept archived projects visible in Archive regardless of organization attachment or custom domain state
- Added a row-level Archive action with confirmation copy that clarifies it is admin labelling only
- Preserved lifecycle status, organization links, generated hostnames, and custom domains when archiving

**Commits:**

- `src/database/migrations/20260514000000_add_website_project_archived_at.ts` - archive metadata column and lookup index
- `src/controllers/admin-websites/AdminWebsitesController.ts` and `service.project-manager.ts` - project list view filtering and safe `archived_at` update handling
- `frontend/src/api/websites.ts`, `frontend/src/lib/queryClient.ts`, and `frontend/src/pages/admin/WebsitesList.tsx` - typed Archive tab, cache key, and Archive row action
- `plans/05142026-no-ticket-website-project-archive-tab/*` - executed spec and migration scaffolds

## [0.0.79] - May 2026

### Harvest Row JSON Inspector

Added a lazy JSON inspector for integration harvest rows so admins can inspect the stored raw analytics payload for one GSC, Rybbit, or Clarity run without loading heavy JSON into the Harvest Activity table.

**Key Changes:**

- Added a project-scoped harvest payload endpoint guarded by integration id and log id
- Added stored payload lookup helpers for GSC, Rybbit, and Clarity daily data rows
- Added log/error JSON fallback for failed harvest rows without stored analytics data
- Added an Inspect action and read-only Monaco side drawer in the Harvest Activity table
- Kept the harvest log list response lightweight by fetching raw JSON only on demand

**Commits:**

- `src/controllers/admin-websites/WebsiteIntegrationsController.ts`, `src/routes/admin/websites.ts`, and `src/controllers/admin-websites/feature-services/service.harvest-log-inspector.ts` - project-scoped harvest payload endpoint and platform payload resolver
- `src/models/website-builder/*DataModel.ts` and `IntegrationHarvestLogModel.ts` - single-date stored payload and log lookup helpers
- `frontend/src/api/integrations.ts` and `frontend/src/components/Admin/integrations/*` - typed payload API client, Inspect action, and read-only JSON drawer
- `plans/05142026-no-ticket-harvest-row-json-inspector/spec.md` - executed spec and verification checklist

## [0.0.78] - May 2026

### Selected Competitor Maps List Clarity

Made the Local Rankings selected competitors card easier to read by removing the user's own practice from the comparison list and grouping lower-visibility selected competitors behind a clear disclosure.

**Key Changes:**

- Replaced exact orange `Est. #n` labels with `EST IN TOP 10` for selected competitors that are in the sampled Google Maps top 10
- Removed the user's own practice from the selected competitor list so the card always focuses on competitors
- Moved selected competitors outside the sampled top 10, not in the top 20, or not measured into a collapsible gray section with query context
- Preserved selected competitor ordering and kept review/rating/address rows unchanged

**Commits:**

- `frontend/src/components/dashboard/RankingsDashboard.tsx` - selected competitors card top-10 label and outside-top-10 disclosure
- `plans/05142026-no-ticket-ranking-competitor-comparison-modal/spec.md` - Rev 3 selected competitor card contract

## [0.0.77] - May 2026

### Ranking Maps Estimate Cleanup

Cleaned up the Local Rankings dashboard Maps estimate card and made recommended-radius competitor refresh trust the local Google Maps query order first.

**Key Changes:**

- Removed the legacy red trend pill from the Google Maps estimate hero card
- Tightened the Maps query label alignment without changing the rank, rating, or review typography sizes
- Updated local specialist competitor discovery to keep exact Google Places query order before lower-level specialty filtering
- Added spec revisions for the dashboard card cleanup and competitor refresh ordering behavior

**Commits:**

- `frontend/src/components/dashboard/RankingsDashboard.tsx` - Maps estimate hero card trend-pill removal and layout cleanup
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` - local specialist refresh now preserves exact Google Places order
- `plans/05142026-no-ticket-ranking-competitor-comparison-modal/spec.md` and `plans/05102026-no-ticket-selected-competitor-maps-radius/spec.md` - Rev 2/Rev 5 verification notes

## [0.0.76] - May 2026

### Recommended Ranking Radius

Made the competitor reselector default to a tighter, explainable 25-mile market radius so the default comparison set better matches the sampled Google Maps top results.

**Key Changes:**

- Marked `25 mi` as the recommended competitor suggestion radius with a hover/focus tooltip
- Opened competitor reselection on the 25-mile default instead of inheriting prior wide-radius test selections
- Filtered Google Places discovery results to the selected radius while preserving sampled Maps result order
- Updated the selected competitor radius spec with the recommendation and verification contract

**Commits:**

- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` - 25-mile recommended badge, tooltip, and reselection default
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts` - radius-bounded Places discovery while keeping Maps estimate ordering
- `plans/05102026-no-ticket-selected-competitor-maps-radius/spec.md` - Rev 4 recommendation and done criteria

## [0.0.75] - May 2026

### Ranking Competitor Comparison And Rybbit History

Added a richer Practice Health competitor comparison modal, made selected competitor review velocity honest and measurable, and added an admin-triggered Rybbit historic data rebuild path.

**Key Changes:**

- Replaced the Practice Health cohort sentence with a competitor comparison action and modal
- Added sortable competitor factor rows for review count, measured review velocity, rating, Maps estimate, and Practice Health
- Highlighted the user's own practice inside the selected competitors Google Maps list
- Added selected-competitor velocity measurement using Apify only for selected competitors, with recent measured velocity reuse and explicit `not_measured` fallback
- Stopped showing fake competitor `+0 / 30d` when review velocity was not measured
- Added per-project Rybbit Fetch History support that clears stored Rybbit rows/logs and queues newest-first daily harvest jobs
- Added an admin all-active Rybbit historic backfill runner with skip reporting

**Commits:**

- `frontend/src/components/dashboard/RankingsDashboard.tsx` and `frontend/src/components/dashboard/rankings/*` - Practice Health comparison modal, selected Maps list self-highlight, sorting, and honest velocity display
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` - selected-competitor velocity enrichment, measured source metadata, cache reuse, and timing telemetry
- `src/controllers/admin-websites/feature-services/service.rybbit-history.ts`, `WebsiteIntegrationsController.ts`, and `src/routes/admin/websites.ts` - Rybbit historic backfill service and admin routes
- `src/models/website-builder/*` and `frontend/src/api/integrations.ts` - Rybbit model helpers and typed backfill API clients
- `frontend/src/components/Admin/integrations/RybbitTab.tsx` - Rybbit Fetch History admin action
- `plans/05142026-no-ticket-ranking-competitor-comparison-modal/spec.md`, `plans/05142026-no-ticket-selected-competitor-review-velocity/spec.md`, and `plans/05142026-no-ticket-rybbit-historic-backfill/spec.md` - executed specs and verification checklists

## [0.0.74] - May 2026

### Clarity Install And Export Integration

Separated Microsoft Clarity tracking installation from Data Export credentials so the Integrations screen can manage script ownership without requiring an API token.

**Key Changes:**

- Added Clarity-specific status, save, and legacy-snippet disable routes instead of routing Clarity through the HubSpot-shaped generic integration endpoint
- Added Project ID-only Clarity installs as `script_injection` rows and API-token-backed installs as `hybrid` rows
- Reworked the Clarity admin UI around tracking status, optional Data Export token state, and legacy script blockers
- Added Clarity legacy header/footer snippet detection and project-level disable support
- Narrowed scheduled Clarity harvests to one recent export window so the same API payload is not stored under multiple fake dates
- Hardened renderer Clarity duplicate detection to avoid duplicate tracking scripts

**Commits:**

- `src/controllers/admin-websites/*`, `src/models/website-builder/WebsiteIntegrationModel.ts`, and `src/workers/processors/dataHarvest.processor.ts` - Clarity-specific integration service, routes, credentials checks, and harvest-window behavior
- `frontend/src/components/Admin/integrations/*` and `frontend/src/api/integrations.ts` - Clarity install/export management UI and typed API helpers
- `/Users/rustinedave/Desktop/website-builder-rebuild/src/routes/site.ts` - renderer Clarity script dedupe hardening
- `plans/05142026-no-ticket-clarity-install-export-integration/spec.md` - executed spec and verification checklist

## [0.0.73] - May 2026

### Website Project Active And Inactive Tabs

Separated website projects by organization attachment so admins can focus on assigned client sites while still keeping unassigned drafts accessible.

**Key Changes:**

- Added Active and Inactive tabs to the admin website projects list
- Defined Active as projects attached to an organization and Inactive as projects with no organization yet
- Added a server-backed `organizationStatus` list filter so pagination totals match the selected tab
- Kept the existing website status dropdown independent from the new organization attachment tabs

**Commits:**

- `src/controllers/admin-websites/AdminWebsitesController.ts` and `service.project-manager.ts` — parse and apply the organization attachment filter
- `frontend/src/api/websites.ts` and `frontend/src/lib/queryClient.ts` — type and cache the new list filter
- `frontend/src/pages/admin/WebsitesList.tsx` — Active/Inactive tab state, default Active view, scoped empty copy, and tab-aware counts
- `plans/05142026-no-ticket-website-project-active-inactive-tabs/spec.md` — executed spec and verification checklist

## [0.0.72] - May 2026

### Ranking Labels, Media Uploads, And Website Admin Signals

Closed out remaining dashboard and website-admin polish by clarifying selected competitor labels, improving large media upload handling, and surfacing active integrations in the admin websites list.

**Key Changes:**

- Added selected competitor address metadata to latest ranking responses and rendered truncated address labels with full-address tooltips
- Increased admin website media upload handling to 500 MB per file with readable client and server error messages
- Replaced noisy page-editor media upload alerts with inline upload errors
- Added active integration metadata to website project listing responses
- Displayed active HubSpot, Rybbit, Clarity, and Search Console badges beside website names in the admin list
- Added missing plan specs for selected competitor address labels, media upload handling, and GBP-less identity generation

**Commits:**

- `src/controllers/practice-ranking/*` and `frontend/src/components/dashboard/RankingsDashboard.tsx` — selected competitor address enrichment and display
- `src/routes/admin/media.ts`, `frontend/src/components/Admin/MediaTab.tsx`, and `frontend/src/components/PageEditor/ChatPanel.tsx` — 500 MB upload limit and safer upload errors
- `src/controllers/admin-websites/feature-services/service.project-manager.ts`, `frontend/src/api/websites.ts`, and `frontend/src/pages/admin/WebsitesList.tsx` — active integration metadata and badges
- `plans/05122026-no-ticket-selected-competitor-address-labels/spec.md`, `plans/05132026-no-ticket-media-upload-limit-error-handling/spec.md`, and `plans/05132026-no-ticket-allow-gbp-less-identity-generation/spec.md` — finalized planning artifacts

## [0.0.71] - May 2026

### GSC Freshness Window And Date Display

Refreshed recent analytics windows for scheduled harvests and normalized GSC date-only fields so admin tables and charts stop drifting a day early.

**Key Changes:**

- Added provider-specific daily harvest freshness windows: four recent UTC dates for GSC and three for Rybbit and Clarity
- Preserved explicit manual and historic harvest jobs as one-date jobs
- Returned GSC harvest and report dates as plain `YYYY-MM-DD` strings from the model/API boundary
- Added a GSC refresh action for successful zero-row harvest logs
- Verified stored GSC log and dashboard payloads keep dates such as `2026-05-12` unchanged

**Commits:**

- `src/workers/processors/dataHarvest.processor.ts` — provider-specific rolling harvest windows
- `src/models/website-builder/IntegrationHarvestLogModel.ts` and `GscDataModel.ts` — date-only API serialization
- `src/controllers/admin-websites/feature-services/service.gsc-performance.ts` — dashboard date normalization fallback
- `frontend/src/components/Admin/integrations/IntegrationPanel.tsx` — zero-row GSC refresh action
- `plans/05142026-no-ticket-gsc-freshness-window-date-display/spec.md` — executed spec and verification checklist

## [0.0.70] - May 2026

### Ranking Resilience And Website Basics Audit

Hardened the local ranking pipeline so transient failures retry safely, permanent failures fail clearly, and website audit outages no longer create fake zero-score recommendations.

**Key Changes:**

- Added classified max-3 retry handling for ranking LLM, Identifier, GBP fetches, Apify Maps, and competitor detail scrape boundaries
- Replaced the broken Apify Lighthouse dependency with an internal website basics check that records reachability, HTTPS, metadata, schema, robots, sitemap, and NAP hints
- Changed website audit failure semantics from fake zero scores to `failed`, `skipped`, `unknown`, or nullable measured fields
- Updated ranking LLM context so failed or skipped website checks cannot produce false critical website recommendations
- Added retry evidence to ranking pipeline timing details for observability

**Commits:**

- `src/controllers/practice-ranking/feature-services/service.ranking-resilience.ts` — shared classified retry helper and attempt summaries
- `src/controllers/practice-ranking/feature-services/service.website-audit.ts` and `service.website-audit-parser.ts` — custom single-URL website basics audit
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `service.apify.ts`, and `service.ranking-llm.ts` — retry telemetry, Apify retry boundaries, and safe LLM audit compaction
- `src/controllers/agents/feature-services/service.ranking-executor.ts`, `service.webhook-orchestrator.ts`, and `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — resilient GBP/Identifier paths and safer specialty fallback
- `plans/05142026-no-ticket-ranking-resilience-custom-auditor/spec.md` — executed spec and verification checklist

## [0.0.69] - May 2026

### Rybbit Integration Cleanup And Dashboard

Moved Rybbit toward a single integration-owned tracking path with legacy script detection, safer connect management, renderer injection, and stored analytics visibility in the website Integrations screen.

**Key Changes:**

- Added Rybbit legacy header/footer script detection by script content and parsed `data-site-id`
- Blocked Rybbit connect/reconnect while enabled legacy scripts would create duplicate tracking
- Added Rybbit site ID management, stored analytics cards, daily trend, and latest-first raw rows
- Stopped future Rybbit provisioning from creating header/footer snippets and synced `projects.rybbit_site_id` from integration state
- Hardened renderer-side Rybbit script injection and deduplication
- Added a dry-run inventory command for legacy Rybbit snippets and data coverage

**Commits:**

- `src/controllers/admin-websites/*`, `src/models/website-builder/*`, and `src/services/integrations/rybbitHarvestAdapter.ts` — Rybbit status, connect, analytics, and harvest plumbing
- `frontend/src/components/Admin/integrations/*` and `frontend/src/api/integrations.ts` — Rybbit management UI and dashboard
- `scripts/rybbit-legacy-inventory.ts` — dry-run inventory for legacy Rybbit scripts
- `/Users/rustinedave/Desktop/website-builder-rebuild/src/routes/site.ts` — renderer injection defaults and duplicate-script checks
- `plans/05132026-no-ticket-rybbit-integration-cleanup-dashboard/spec.md` — executed spec and safety revision

## [0.0.68] - May 2026

### Ranking Pipeline Optimization

Reduced local ranking runtime while preserving the client-facing analysis contract by reusing GBP data, avoiding unnecessary competitor scrapes, and recording structured step timings.

**Key Changes:**

- Reused the pre-identification Google Business Profile payload in scheduled-style ranking runs when account, location, and date window match
- Added `raw_data.pipeline_timings` records for search position, competitor resolution, GBP, competitor details, website audit, posts, score calculation, and LLM
- Skipped full Apify competitor detail scraping when finalized curated competitors already have fresh Google Places metadata
- Normalized specialty keyword aliases such as `endodontist` to the same endodontic keyword set used by scoring
- Preferred the GBP `websiteUri` for website audit instead of falling back to the root domain first
- Compacted the ranking LLM input and tightened prose length guidance while preserving the existing JSON schema

**Commits:**

- `src/controllers/agents/feature-services/service.ranking-executor.ts` — pass pre-fetched GBP profile data into the ranking pipeline
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — GBP reuse, timing telemetry, curated competitor fast path, and GBP website audit URL
- `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts` — compact LLM input packet, output-length guidance, and timing success/failure return
- `src/controllers/practice-ranking/feature-services/service.apify.ts` and `service.competitor-source-resolver.ts` — specialty alias normalization and curated metadata freshness markers
- `plans/05122026-no-ticket-ranking-pipeline-optimization/*` — executed spec and Falls Church quality/timing fixture

## [0.0.67] - May 2026

### No GBP Manual Identity Intake

Added a first-class No GBP path for website identity warmup so new projects can provide structured business and location basics without pretending they have Google Business Profile data.

**Key Changes:**

- Added a No GBP yet mode to the Project Identity modal with business basics, hours, and repeatable manual locations
- Required either a selected GBP profile or complete No GBP manual data before warmup can start
- Stored manual locations with explicit manual source metadata and no fake Google place IDs
- Cleared stale selected GBP columns when running a valid manual-only warmup
- Kept layout/page generation blocked when identity only has raw URL/text scrape evidence and no structured business or location anchor

**Commits:**

- `frontend/src/components/Admin/IdentityModal.tsx` — No GBP mode, manual fields, rerun rehydration, and source-aware location rows
- `frontend/src/api/websites.ts` — manual identity payload and nullable/manual location types
- `src/controllers/admin-websites/AdminWebsitesController.ts` — hard source gate and stale GBP selection clearing
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` — manual business/location identity construction
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts` and `util.project-identity.ts` — manual location shape and strict generation readiness
- `frontend/src/components/Admin/ImportFromIdentityModal.tsx` and `ReviewsTab.tsx` — GBP-only consumers ignore manual rows
- `plans/05132026-no-ticket-no-gbp-manual-identity-intake/spec.md` — executed spec and revision log

## [0.0.65] - May 2026

### Google Token Refresh Ranking Guardrail

Prevented ranking reruns from publishing bad Practice Health scores when Google Business Profile requests reject a stale access token. GBP fetches now retry once with a forced refresh, and required ranking GBP data fails safely instead of being scored as an empty profile.

**Key Changes:**

- Added force-refresh support to Google OAuth client resolution
- Added a shared one-time 401 retry path for GBP data aggregation
- Blocked ranking completion when required client GBP data is still unavailable after retry
- Kept dashboard and PMS-adjacent GBP metrics best-effort while giving them the same forced-refresh retry
- Extended the retry path to scheduled ranking identification and competitor onboarding specialty fallback

**Commits:**

- `src/auth/oauth2Helper.ts` — optional forced OAuth refresh for connection and organization lookups
- `src/utils/dataAggregation/dataAggregator.ts` — one-time GBP 401 retry with shared refreshed client
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — fail-safe ranking guardrail for missing client GBP data
- `src/utils/dashboard-metrics/service.dashboard-metrics.ts` — forced-refresh retry for dashboard/PMS-adjacent GBP metrics
- `src/controllers/agents/feature-services/service.ranking-executor.ts` and `src/controllers/practice-ranking/feature-services/*` — retry support for ranking identification and onboarding fallback fetches
- `plans/05122026-no-ticket-google-token-refresh-ranking-guardrail/*` — executed spec

## [0.0.64] - May 2026

### Form Submissions UX Refresh

Rebuilt the Forms submissions workflow around detected forms, with form-scoped inbox filtering, safer per-form routing settings, visual-only form labels, and persistent form ordering for admin and client website users.

**Key Changes:**

- Grouped submissions by detected form with a left sidebar and selected-form submissions pane
- Moved per-form routing into a selected-form Settings tab while keeping global Form Settings focused on default fallback recipients
- Added form-scoped `All`, `Verified`, and `Flagged` filters plus a scoped `Mark all as read` action
- Added 5-second refresh for form submissions/catalog counts and orange unread indicators in the form sidebar
- Added persisted visual-only form labels and manual ordering without changing original `form_name` routing semantics
- Added user-scoped form catalog, routing, and preference endpoints for the client-facing website tab

**Commits:**

- `src/database/migrations/20260511000000_create_form_recipient_rules.ts` and `src/database/migrations/20260512000000_create_form_catalog_preferences.ts` — schema support for per-form recipient overrides and visual form labels/order
- `src/models/website-builder/FormSubmissionModel.ts`, `FormRecipientRuleModel.ts`, and `FormCatalogPreferenceModel.ts` — form stats, unread counts, form-scoped mark-all-read, routing rules, and catalog preferences
- `src/controllers/admin-websites/*`, `src/controllers/user-website/UserWebsiteController.ts`, `src/routes/admin/websites.ts`, and `src/routes/user/website.ts` — admin and user-scoped APIs for catalog, routing, preferences, submissions, and read state
- `frontend/src/components/Admin/FormSubmissionsTab.tsx`, `FormSubmissionsSidebar.tsx`, `SelectedFormRoutingSettings.tsx`, and `FormSubmissionsViewTabs.tsx` — grouped inbox UI, selected-form settings, unread indicators, reorder/rename controls, and scoped actions
- `frontend/src/components/Admin/FormRecipient*` — focused routing controls with clearer loading states and recipient editing behavior
- `frontend/src/api/websites.ts`, `frontend/src/hooks/queries/useWebsiteFormRecipientRouting.ts`, `frontend/src/pages/admin/WebsiteDetail.tsx`, and `frontend/src/pages/DFYWebsite.tsx` — typed client contracts and admin/client wiring
- `plans/05112026-no-ticket-form-submissions-ux-refresh/*` — executed spec and revisions

## [0.0.63] - May 2026

### GSC Integration Connect Flow

Completed the end-to-end Google Search Console connect flow so the daily harvest worker can start pulling search performance data. The backend plumbing (adapter, worker, data storage) was already functional — this fills the missing connection UI, scope detection, and admin endpoints.

**Key Changes:**

- Added GSC to the scope parser so the settings page correctly detects when Search Console access is missing
- Fixed the reconnect endpoint to encode auth context in OAuth state, ensuring callbacks link connections to the correct organization
- Added admin GSC endpoints: list Google connections with GSC scope, list available Search Console sites, create GSC integration for a project
- Rewrote the admin GscConnectPanel as a multi-step flow: pick Google account → pick site → connect
- Fixed the settings page "Grant Access" button to use popup OAuth instead of navigating to a JSON endpoint
- Supports separate admin Google account for GSC (admin's connection referenced by ID across all client projects)

**Commits:**

- `src/controllers/settings/feature-utils/util.scope-parser.ts` — added GSC to SCOPE_MAP and buildScopeStatus
- `src/controllers/auth/AuthController.ts` — reconnect endpoint encodes auth context in OAuth state
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` — listGscConnections, listGscSites, createGscIntegration
- `src/models/GoogleConnectionModel.ts` — findByOrgWithScope, findAllWithScope query methods
- `src/routes/admin/websites.ts` — three new GSC-specific routes
- `frontend/src/api/integrations.ts` — GSC API functions and types
- `frontend/src/components/Admin/integrations/GscConnectPanel.tsx` — multi-step connect flow with popup OAuth
- `frontend/src/components/Admin/integrations/GscTab.tsx` — simplified, self-contained state
- `frontend/src/components/Admin/IntegrationsTab.tsx` — removed broken phantom metadata checks
- `frontend/src/pages/settings/IntegrationsRoute.tsx` — popup OAuth for scope grant, fixed scope key check

## [0.0.62] - May 2026

### Rankings Clarity And Competitor Workflow

Redesigned the client rankings experience around defensible Google Maps estimates, Practice Health scoring, and an explicit comparison-set workflow that lets users refresh, curate, save, and rerank competitors without creating tasks.

**Key Changes:**

- Reworked `/rankings` labels, cards, loading state, and competitor list copy to avoid implying exact personalized Google rankings
- Added selected-competitor Maps projection so the dashboard shows only the saved comparison set with `Est. #`, `Not in top 20`, or `Not measured yet`
- Added comparison-set reselection with rerank-only save behavior and 5-10 minute expectation copy
- Added suggestion-radius controls up to 100 miles with a visible map radius and confirmation before refreshing suggestions
- Added specialty-aware automated competitor filtering that defaults from the client specialty and excludes pure general dentists for specialist practices
- Added migration support for competitor discovery metadata, selected-set snapshots, rerun reason, radius metadata, and Summary task guardrails

**Commits:**

- `frontend/src/components/dashboard/RankingsDashboard.tsx` and `frontend/src/components/dashboard/rankings/RankingsLoadingState.tsx` — redesigned rankings surface, selected-competitor Maps list, and dashboard loading behavior
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` — comparison-set reselection, radius UI, map pins, manual add measurement, and specialty control
- `src/controllers/practice-ranking/*` and `src/models/*Ranking*` — ranking response contract, competitor snapshots, radius-aware discovery, rerank-only persistence, and selected-competitor projection
- `src/controllers/agents/feature-services/service.ranking-recommendations.ts` — guardrail excluding rerank-only competitor reselection rows from Summary task creation
- `src/database/migrations/20260510000000_rankings_clarity_competitor_reselection.ts` and `src/database/migrations/20260510000001_selected_competitor_maps_radius.ts` — schema support for ranking clarity, competitor reselection, and radius metadata
- `plans/05092026-no-ticket-rankings-clarity-competitor-reselection/*`, `plans/05102026-no-ticket-selected-competitor-maps-radius/*`, and `plans/05102026-no-ticket-specialty-aware-competitor-filter/*` — executed specs

## [0.0.61] - May 2026

### Support Ticket Feedback Alignment

Aligned the client and admin support-ticketing system with the latest Alloro review feedback, including warmer client language, screenshot/file attachments, required website edit approval details, clearer internal triage semantics, and safer client/admin response contracts.

**Key Changes:**

- Rewrote client ticket prompts to use client-facing language instead of developer terms
- Added S3-backed support ticket attachments with image/PDF restrictions, size limits, and scoped client/admin access
- Required website edit approval notes and requested completion date in UI and backend validation
- Separated client-impact severity from internal P-level priority
- Removed Category from the support product surface while keeping the existing DB column deprecated
- Required resolution notes for resolved, closed, and archived states
- Split client-safe and admin-full support presenters so internal fields are not exposed to client ticket APIs

**Commits:**

- `src/database/migrations/20260508000000_support_feedback_alignment.ts` — priority/severity enum migration and support attachment metadata table
- `src/controllers/support/*` and `src/models/SupportTicketAttachmentModel.ts` — support attachment upload/list/signing flow and client-safe ticket presentation
- `src/routes/support.ts` and `src/routes/admin/support.ts` — client/admin attachment endpoints
- `frontend/src/api/support.ts` and `frontend/src/hooks/queries/useSupportQueries.ts` — typed attachment APIs and create-ticket upload orchestration
- `frontend/src/components/support/*` and `frontend/src/pages/Help.tsx` — client copy updates, required fields, attachment picker, and attachment list
- `frontend/src/components/Admin/support/*` and `frontend/src/pages/admin/SupportDashboard.tsx` — Category removal, P-level priority labels, client-impact severity labels, and admin attachment display
- `plans/05082026-no-ticket-support-feedback-alignment/*` — executed spec and migration planning artifacts

## [0.0.60] - May 2026

### Admin PM Global Backlog And Assignee Views

Added cross-project PM triage views so admins can inspect backlog work without opening every project and review workload for Dave or any other PM assignee without hardcoding a person.

**Key Changes:**

- Added a clickable Backlog metric tile that opens `/admin/pm?view=backlog`
- Added a global backlog view grouped by project with assignment and real project-column move controls
- Added a reusable assignee workload view with `Me` preserved as the current-user shortcut
- Added People view support for `/admin/pm?view=assignee&userId={id}`
- Added backend aggregate PM task queries that avoid client-side project-board fanout
- Normalized PM user IDs to numeric values so URL params and picker state agree

**Commits:**

- `src/models/PmTaskModel.ts` and `src/models/PmColumnModel.ts` — aggregate backlog, assigned-task, velocity, and project-column map helpers
- `src/controllers/pm/PmTaskViewsController.ts`, `src/controllers/pm/PmStatsController.ts`, and `src/routes/pm/*` — new backlog, assigned-user, and shared `mine` task routes
- `src/controllers/pm/PmController.ts` — numeric PM user IDs for assignee picker contracts
- `frontend/src/pages/admin/ProjectsDashboard.tsx` and `frontend/src/components/pm/StatsRow.tsx` — dashboard tabs and clickable Backlog tile
- `frontend/src/components/pm/BacklogTabView.tsx` and `frontend/src/components/pm/BacklogProjectGroup.tsx` — project-grouped backlog triage UI
- `frontend/src/components/pm/AssigneeTabView.tsx` and `frontend/src/components/pm/MeTabView.tsx` — reusable Me/People workload board
- `frontend/src/api/pm.ts` and `frontend/src/types/pm.ts` — typed backlog, assignee, user, stats, and velocity client contracts

## [0.0.59] - May 2026

### Article And Review Shortcode Pagination

Added API-backed pagination support across article grids and compact review lists, then migrated existing active page content so long article and review pages load incrementally instead of relying on fixed limits or client-side reveal scripts.

**Key Changes:**

- Updated admin shortcode previews so paginated post and review blocks render the correct first page using `per_page`
- Added post-block docs and AI-command guidance for `paginate='load-more'`, `paginate='numbered'`, `paginate='infinite'`, and `per_page`
- Migrated active `articles-grid` page shortcodes from fixed `limit='12'` to API-backed Load More pagination
- Migrated `review-list-compact` page usage to API-backed Load More pagination and removed its local hide/reveal script from the shared review block template
- Preserved rollback coverage with backup tables in the Knex migration
- Fixed the live renderer pagination client so the Load More loading state is centered and newly loaded cards receive the same truncation/tooltip behavior as initial cards

**Commits:**

- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — admin preview parity for paginated post/review shortcodes
- `src/database/migrations/20260507000000_article_review_shortcode_pagination.ts` — reversible DB content/template migration for article and compact review pagination
- `frontend/src/pages/admin/AlloroPostsDocs.tsx` and `frontend/src/components/Admin/ReviewBlocksTab.tsx` — shortcode docs and compact review copy helper
- `src/agents/websiteAgents/aiCommand/*` and `src/controllers/admin-websites/feature-services/service.ai-command.ts` — AI guidance for paginated article and compact review shortcodes
- `../website-builder-rebuild/src/utils/pagination-client.ts` — live renderer loading alignment and post-append truncation/tooltip enhancement

## [0.0.58] - May 2026

### Reviews Tab Loading, List, Stats, and Fetch Modal

Fixed the admin Reviews tab so review stats, distribution, and rows now come from one project review scope, failed review loads show real errors, and Google Maps fetching happens through an explicit animated modal instead of an inline selector.

**Key Changes:**

- Unified initial Reviews loading into one skeleton state and removed the competing loading indicators
- Added project-scoped review stats/list handling so totals, rows, hidden filtering, and distribution agree
- Replaced the collapsed distribution display with count-based 5-to-1 star rows and percentages
- Split the large Reviews tab into focused review components and React Query hooks
- Moved Google Maps location selection into an accessible Framer Motion modal with destructive-action copy
- Changed Apify replacement behavior to delete only Maps/Apify rows for a place inside the successful replacement transaction
- Preserved OAuth review rows and fixed OAuth upsert conflict handling against the new partial unique index

**Commits:**

- `frontend/src/components/Admin/ReviewsTab.tsx` — unified state orchestration, modal entry point, job banner, filters, and review list wiring
- `frontend/src/components/Admin/reviews/*` — extracted loading, stats, filters, rows, empty states, modal, error, and job banner components
- `frontend/src/hooks/queries/useAdminReviewQueries.ts` — React Query hooks and invalidation for review stats/list/job actions
- `frontend/src/api/reviewBlocks.ts` and `frontend/src/lib/queryClient.ts` — typed review stats/list/fetch APIs and query keys
- `src/models/website-builder/ProjectReviewModel.ts` and `src/models/website-builder/ReviewModel.ts` — centralized review scope, stats, list, and source-safe replacement semantics
- `src/controllers/admin-websites/AdminWebsitesController.ts` and `src/workers/processors/reviewApifyFetch.processor.ts` — controller wiring and Apify fetch replacement flow

## [0.0.57] - May 2026

### PMS Statistics — Upload Nudge Replaces Duplicate Card

The `/pmsStatistics` page was rendering a standalone `<PMSCard />` that duplicated the production and referral data already shown in the PMS Vitals section below. Replaced it with the "Ready for the next focus?" upload nudge (matching the main dashboard's design) that only appears when PMS data is stale, with a CTA that scrolls to the ingestion hub.

**Key Changes:**

- Removed duplicate `<PMSCard />` rendering and import
- Added `derivePmsFocusPeriod` memo using existing `keyData.months` — no new API call
- Upload nudge card shown conditionally when `focusPeriod.isStale`, styled identically to the dashboard's `PmsUploadNudge`
- CTA button scrolls to ingestion hub instead of linking back to `/pmsStatistics`

**Commits:**

- `frontend/src/components/PMS/PMSVisualPillars.tsx` — swapped PMSCard for inline upload nudge with stale-data condition

## [0.0.56] - May 2026

### Onboarding Wizard — Temporarily Disabled

The guided onboarding wizard tour is disabled while dashboard and settings components are being rebuilt. The wizard context provider still mounts (no breaking changes to consumers), but both activation paths — initial status check and `recheckWizardStatus` — are stubbed as no-ops. Original logic is preserved inline with `TODO: RESTORE` markers for re-enablement once the new components are finalized.

**Key Changes:**

- Auto-start `useEffect` replaced with no-op that immediately clears loading state
- `recheckWizardStatus` callback replaced with no-op stub
- Original code preserved as commented-out blocks for easy restoration

**Commits:**

- `frontend/src/contexts/OnboardingWizardContext.tsx` — no-op stubs for wizard activation, original logic commented with restoration markers

## [0.0.55] - May 2026

### Custom Domain Modal — Verify View Fix

After connecting a custom domain, the modal showed a success toast but stayed on the input form instead of transitioning to the DNS verification view. The `onDomainChange()` callback was not awaited, so the parent's state hadn't updated before the modal re-rendered.

**Key Changes:**

- `await onDomainChange()` in `handleConnect` so the parent refetches the project before the loading state clears

**Commits:**

- `frontend/src/components/Admin/ConnectDomainModal.tsx` — await onDomainChange so currentDomain prop is set before re-render

## [0.0.54] - May 2026

### PMSCard Current Period Fix + PMS Statistics Page

The Focus dashboard PMS card was showing total production across all months ($1.97M for a 10-month practice) labeled as "production this month." Now shows the latest month's production as "current period" and renders the headline immediately while the sparkline and top sources load progressively. Same card also added to the PMS Statistics page.

**Key Changes:**

- PMSCard uses `production_this_month`, `doctor_referrals_this_month`, `total_referrals_this_month` instead of aggregate totals
- Frontend `PmsMetrics` type updated with `_this_month` fields
- Card renders headline from `useDashboardMetrics` immediately — sparkline/sources section shows skeleton while `usePmsKeyData` loads
- PMSCard added to PMS Statistics page (`PMSVisualPillars`) when data is available

**Commits:**

- `frontend/src/components/dashboard/focus/PMSCard.tsx` — current period data + progressive loading
- `frontend/src/types/dashboardMetrics.ts` — added `_this_month` PMS fields
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — render PMSCard at top of PMS Statistics page

## [0.0.53] - May 2026

### Agent Pipeline Reliability Fixes + Zombie Job Cleanup

Three reliability fixes that eliminated all agent retry failures and unblocked Falls Church (310 referral sources). Validated in production: Gainesville ($1.16), Sterling ($1.29), and Falls Church ($1.65) — all passed RE + Summary on attempt 1, zero retries. Previous Sterling runs failed 3/3 Summary attempts; previous Falls Church RE truncated entirely.

**Key Changes:**

- `getLatestReferralEngineOutput` pending check now scoped by `location_id` — stops false "pending" for unrelated locations in the same org
- Poll interval in `PMSVisualPillars` increased from 1s to 5s — eliminates polling storm during agent runs
- Referral Engine `maxTokens` bumped from 32768 to 65536 — Falls Church (310 sources) no longer truncates
- Added `production_this_month`, `doctor_referrals_this_month`, `total_referrals_this_month` to `PmsMetrics` — Summary agent can now ground monthly values without hitting aggregate mismatch validator
- New startup zombie cleanup: scans for `pms_jobs` stuck in "processing" > 30 minutes on server boot and resets them to "failed"

**Commits:**

- `src/controllers/agents/AgentsController.ts` — location-scoped pending query
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — poll interval 1s → 5s
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts` — RE maxTokens 65536
- `src/utils/dashboard-metrics/types.ts` + `service.dashboard-metrics.ts` — `_this_month` PMS fields
- `src/utils/startup/zombieJobCleanup.ts` + `src/index.ts` — startup zombie detection

## [0.0.52] - May 2026

### Unified Recipient Settings

Added canonical organization-level recipient settings for website form emails and monthly agent notification emails. Admins can now manage Website Form Recipients and Agent Notification Recipients from Organization Settings, while the existing Website Detail recipient editor remains a shortcut to the same website form recipient source.

**Key Changes:**

- Added `organization_recipient_settings` with `website_form` and `agent_notifications` channels
- Backfilled website form recipients from existing website projects during migration
- Routed website submissions and confirmed newsletter owner notifications through the canonical `website_form` resolver
- Routed monthly agent emails through `agent_notifications` before deterministic fallback
- Added admin organization recipient settings API and Organization Settings UI
- Preserved legacy website project recipient mirroring for compatibility

**Commits:**

- `src/database/migrations/20260501000000_create_organization_recipient_settings.ts` — recipient settings table, channel constraint, index, and website form backfill
- `src/models/OrganizationRecipientSettingsModel.ts` — model for channel recipient lookup and upsert
- `src/services/recipientSettingsService.ts` — normalization, validation, explicit/fallback resolution, and legacy mirror update
- `src/controllers/websiteContact/formSubmissionController.ts` — website form email routing now uses `website_form`
- `src/controllers/websiteContact/newsletterConfirmController.ts` — confirmed newsletter subscriber owner emails now use `website_form`
- `src/utils/core/notificationHelper.ts` — agent notification emails now use `agent_notifications`
- `src/controllers/admin-websites/AdminWebsitesController.ts` and `src/controllers/user-website/UserWebsiteController.ts` — website recipient endpoints read/write canonical settings
- `src/controllers/admin-organizations/AdminOrganizationsController.ts` and `src/routes/admin/organizations.ts` — admin recipient settings read/update endpoints
- `frontend/src/api/admin-organizations.ts`, `frontend/src/hooks/queries/useAdminQueries.ts`, and `frontend/src/lib/queryClient.ts` — typed client API/query plumbing
- `frontend/src/components/Admin/OrgRecipientSettingsSection.tsx` and `frontend/src/components/Admin/OrgSettingsSection.tsx` — unified admin recipient settings UI

## [0.0.51] - April 2026

### Month-Scoped Review Verbiage + Domain Summary Strips

The Summary agent was telling practices "You have 26 unanswered reviews" — but that was only reviews from the current month window, not a total backlog. Practices with deliberately-skipped older reviews were seeing misleading counts. The agent now qualifies every review count with the month name, names specific reviewers, and states sentiment. Additionally, a new `domain_summaries` output section provides at-a-glance strips for each data domain (reviews, GBP, ranking, referrals) rendered as expandable rows inside the Hero dashboard card.

**Key Changes:**

- `ReviewsMetrics` enriched with `unanswered_reviewer_names` (up to 5) and `avg_rating_this_month` for agent grounding
- Summary prompt enforces month-scoped review language ("26 March reviews without a reply", never generic "unanswered reviews")
- Summary prompt instructs agent to name up to 3 reviewers with "and N more", plus sentiment read (all 5-star / mixed / needs attention)
- New `DomainSummarySchema` added to `SummaryV2OutputSchema` (optional, backward-compatible)
- Hero task metadata carries `domain_summaries` for the highest-priority action
- Frontend `DomainStrips` component renders expandable domain rows inside the Hero card; hides gracefully when data is absent

**Commits:**

- `src/utils/dashboard-metrics/types.ts` — added `unanswered_reviewer_names`, `avg_rating_this_month` to `ReviewsMetrics`
- `src/utils/dashboard-metrics/service.dashboard-metrics.ts` — pass reviewer names through `extractReviewSummary`, collect names + compute avg in `buildReviewsMetrics`
- `src/agents/monthlyAgents/Summary.md` — REVIEW VERBIAGE RULES + DOMAIN SUMMARIES sections
- `src/controllers/agents/types/agent-output-schemas.ts` — `DomainSummarySchema` + optional `domain_summaries` on output
- `src/controllers/agents/feature-services/service.task-creator.ts` — attach `domain_summaries` to hero task metadata
- `frontend/src/hooks/queries/useTopAction.ts` — parse `DomainSummary` from metadata
- `frontend/src/components/dashboard/focus/Hero.tsx` — `DomainStripRow` + `DomainStrips` components

## [0.0.50] - April 2026

### Fix: Location-Scoped PMS Uploads, Processing Cards, and Dashboard Data

Fixed a chain of multi-location bugs where PMS uploads via the mapping path (`uploadWithMapping`) always attributed data to the primary location, processing cards appeared on all locations during any upload, and the main dashboard PMS card flashed org-wide totals before the location selector loaded.

**Key Changes:**

- Backend `uploadWithMapping` now reads `body.locationId` before falling back to `resolveLocationId()` — uploads land on the correct location
- `pms:job-uploaded` event includes `locationId`; `PMSVisualPillars` only shows processing card for the matching location
- Automation status polling (`fetchActiveAutomationJobs`) gated on `locationId` being available — no more org-wide active job leaks
- `useDashboardMetrics` and `usePmsKeyData` hooks disabled until `locationId` is non-null — prevents org-wide data flash
- Dashboard cogitating spinner holds until `selectedLocation` is populated — eliminates partial-sidebar layout shift
- PMS modal header shows location name ("Enter PMS Data for Fredericksburg"); modal blocked from opening until location is loaded
- PMSVisualPillars shows cogitating spinner until both key data and automation status have completed initial fetch

**Commits:**

- `src/controllers/pms/PmsController.ts` — read `body.locationId` in `uploadWithMapping`
- `frontend/src/components/PMS/PMSManualEntryModal.tsx` — location name header, locationId in event
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — initial load gate, event scoping, automation fetch guards, cogitating spinner
- `frontend/src/pages/Dashboard.tsx` — spinner holds for location context
- `frontend/src/hooks/queries/useDashboardMetrics.ts` — gated on locationId
- `frontend/src/components/dashboard/focus/PMSCard.tsx` — gated on locationId

## [0.0.49] - April 2026

### PMSUploadModal Retirement & 12-Month Aggregator Cap

Retired the dead `PMSUploadModal` from Dashboard (no trigger ever opened it) — `PMSManualEntryModal` now handles all PMS upload paths with multi-file drag-and-drop and column mapping. Added a 12-month sliding window to `aggregatePmsData()` so sources, totals, and trends are computed from the most recent 12 months only, preventing unbounded payload growth for the RE and Summary agents.

**Key Changes:**

- Removed `PMSUploadModal` import, state, and render from `Dashboard.tsx`
- Added `@deprecated` comment to `PMSUploadModal.tsx` (file preserved for git history)
- `aggregatePmsData()` now sorts all months, slices to last 12, then computes source aggregation and trends from the capped window
- Data quality flag added when months are capped: "Capped to most recent 12 months of data (N months total available)"

**Commits:**

- `frontend/src/pages/Dashboard.tsx` — removed PMSUploadModal dead code
- `frontend/src/components/PMS/PMSUploadModal.tsx` — deprecation notice
- `src/utils/pms/pmsAggregator.ts` — 12-month sliding window before source/trend computation

## [0.0.48] - April 2026

### Fix: Import from Identity Checkbox Bug

Fixed a bug where selecting one doctor/service checkbox in the Import from Identity modal would visually check all entries — but only count as 1 selected — when multiple entries shared the same source URL (e.g. all doctors listed on a single /our-team page). Each entry now gets a unique composite key (`url#name-slug`) throughout the full pipeline so checkboxes work independently, each creates a separate draft post, and shared URLs are scraped only once.

**Key Changes:**

- Frontend modal uses composite key (`source_url#slugified-name`) per entry instead of bare URL
- API transport sends `{ source_url, name }` objects for doctor/service entries
- Backend normalizes entries, builds composite dedup keys, and caches scrape results per URL
- Retry flow resolves entries back to `{ source_url, name }` objects for correct identity lookup

**Commits:**

- `frontend/src/components/Admin/ImportFromIdentityModal.tsx` — composite keys, entry resolution, external link fix
- `frontend/src/api/websites.ts` — entries type widened
- `src/controllers/admin-websites/feature-services/service.post-importer.ts` — entry normalizer, scrape cache, name-based identity lookup
- `src/workers/processors/postImporter.processor.ts` — job data type updated

## [0.0.47] - April 2026

### Project Identity Model + Identity-First Website Generation

Centralized website-builder identity parsing/persistence and made page/layout generation depend on `project_identity` as the explicit source-of-truth contract. This removes redundant scrape fallback behavior from active generation paths while preserving the existing bulk endpoint for external compatibility.

**Key Changes:**

- Added `ProjectIdentityModel` plus shared identity helpers for parsing, saving, warmup status, brand-column mirroring, and generation readiness checks
- Migrated identity endpoints, identity warmup, slot prefill, and slot generation away from local JSON parsing/update helpers
- Updated single-page generation start to block with `IDENTITY_NOT_READY` instead of falling back to `project-scrape`
- Retained bulk `create-all-from-template`, but made it identity-first and enqueue `page-generate` jobs directly
- Removed the page-generation legacy shim that built identity from `step_*` scrape columns
- Aligned layout generation with the same identity model/readiness path

**Commits:**

- `src/models/website-builder/ProjectIdentityModel.ts` — model-owned `project_identity` reads, writes, warmup status, patching, and brand mirroring
- `src/controllers/admin-websites/feature-utils/util.project-identity.ts` — shared identity parse/save/readiness helpers
- `src/controllers/admin-websites/AdminWebsitesController.ts` — identity endpoints and page creation flows now use the identity model and readiness checks
- `src/controllers/admin-websites/feature-services/service.*` — warmup, slots, layout, and page generation moved to identity-first behavior
- `frontend/src/api/websites.ts` — API contract updated for identity-first generation

## [0.0.46] - April 2026

### Fix: RE Agent Token Truncation + Agent Pipeline Observability

Fixed Referral Engine agent failing on orgs with large referral networks (60+ sources) due to output hitting the 16K max_tokens ceiling. JSON was truncated mid-stream, causing parse failures and unnecessary retries. Also added structured error logging across the entire monthly agent pipeline so failures are diagnosable from the log file without needing server console access.

**Key Changes:**

- RE agent maxTokens bumped from 16,384 → 32,768 to accommodate large referral matrices
- `runMonthlyAgent` now accepts per-agent `maxTokens` override instead of hardcoding
- LLM runner returns `stopReason` ("end_turn" / "max_tokens") — truncation detected and warned explicitly
- RE and Summary retry catch blocks now log error type classification (rate_limit, overloaded, parse_failure, metrics_validation), API status codes, and stack traces
- Failed retry attempts are pushed to `onProgress` so the admin UI shows why a retry happened
- Timing instrumentation added: data fetch phase, RE duration, Summary duration, total pipeline

**Commits:**

- `src/agents/service.llm-runner.ts` — `stopReason` in result interface, truncation warning on max_tokens + null parse
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts` — RE maxTokens=32768, per-agent maxTokens param, structured error logging, timing, API error classification

## [0.0.45] - April 2026

### Dashboard & PMS Page UI Polish

Unified visual consistency between the main dashboard and PMS statistics page.

**Key Changes:**

- Background color changed from cool gray (`#F3F4F6`) to warm parchment (`#F7F5F3`) across both pages
- Top padding aligned so headings sit at the same vertical position on both pages
- PMS processing status card: "Background PMS Processing" label replaced with "Est. 3-5 minutes" in muted gray; animated typewriter text thinned from black to normal weight while keeping the orange/dark gradient

**Commits:**

- `frontend/src/pages/Dashboard.tsx` — warm parchment background + content top padding
- `frontend/src/components/dashboard/DashboardOverview.tsx` — matching padding
- `frontend/src/components/PMS/PMSVisualPillars.tsx` — removed duplicate top padding (inherits from parent)
- `frontend/src/components/PMS/dashboard/PmsProcessingStatusCard.tsx` — label and font weight changes

## [0.0.44] - April 2026

### Fix: Multi-File PMS Upload Cross-Month Dedup

Fixed a bug where dropping multiple CSV files (e.g. Jan + Feb + Mar) onto the PMS modal produced incorrect per-month production and referral counts. Patients visiting the same referring practice across different months were collapsed into a single referral because the dedup key lacked a month component. Mar showed $167,692 instead of the correct $193,763.

**Key Changes:**

- Backend: procedure log adapter dedup key changed from `patient::practice` to `patient::month::practice`, making cross-month visits count as separate referral events
- Frontend: multi-file drop now strips header lines from files 2+ before concatenating, preventing embedded CSV headers from becoming garbage data rows

**Commits:**

- `src/utils/pms/adapters/procedureLogAdapter.ts` — month-aware dedup grouping key
- `frontend/src/components/PMS/PMSManualEntryModal.tsx` — header-stripping in multi-file concatenation

## [0.0.43] - April 2026

### PMS Modal: Multi-Month Merge + Multi-File Drop

The PMS upload modal now supports additive multi-month data entry. Previously, each paste/drop replaced all existing data. Now months merge intelligently: new months insert silently, existing months prompt for confirmation before replacing.

**Key Changes:**

1. **Month-merge logic.** `handleParsedPaste` no longer calls `setMonths(parsedMonths)` (the wipe). Instead, incoming months are classified as "new" or "conflict" against existing state. New-only → silent merge. Any conflicts → modal dialog listing affected months with ⚠️/✅ indicators and row counts.

2. **Month-conflict dialog.** Inline `AnimatePresence` modal shows per-month status: ⚠️ amber for existing months that will be replaced (with row count + manual-edit warning), ✅ green for new months. "Existing months not listed above will be kept as-is." Confirm & Merge / Cancel.

3. **Mapping-refinement guard.** The `parsedPreview` effect (column-mapping pipeline) skips while the conflict dialog is open, preventing the mapping re-parse from silently dismissing the dialog. After user confirms, the effect re-fires and applies the mapping-refined version.

4. **Multi-file drop.** Drop handler reads ALL dropped files via `Promise.all`, concatenates text with newline separator, feeds as a single paste. Validates all files have supported extensions. Filename display shows "3 files" for multi-file drops.

5. **`mappingAllRows` accumulation.** Fixed a bug where each paste replaced `mappingAllRows` (the raw CSV rows sent to `uploadWithMapping`). Now accumulates across pastes so multi-paste submissions include all months' data, not just the last paste.

**Verification:** Multi-file drop of 3 CSVs (Jan+Feb+Mar) → all 3 months detected → 3 month tabs → submit → aggregator confirms "3 months, 64 sources" → full pipeline completes.

## [0.0.42] - April 2026

### Deterministic RE Matrix Pre-Compute + Loading UX Overhaul

Two changes shipped together: (1) the PMS aggregator now pre-computes per-source trend labels and duplicate-name candidates deterministically in JS, stripping raw per-month source arrays from RE's input to make Claude latency O(1) regardless of CSV size; (2) the client-facing "Generating Your Attribution Matrix" view and the global Dashboard loading state both got a visual overhaul with the Alloro Lottie leaf, spinning ring, and typewriter-animated loading phrases.

**Key Changes:**

1. **Deterministic trends + dedup in pmsAggregator.ts.** After the existing source aggregation, a second pass computes per-source `trend_label` (increasing/decreasing/new/dormant/stable) by comparing the latest two months, and flags `dedup_candidates` via Levenshtein distance ≤ 3 or same-first-word heuristic. Both fields added to `AggregatedPmsData` and included in the leaner RE-specific payload.

2. **Leaner RE payload (O(1) on Claude input).** The orchestrator now builds a separate `pmsDataForRE` shape: `monthly_totals` (month-level totals without per-source arrays) + `sources_summary` + pre-computed `source_trends` + `dedup_candidates`. Summary continues to receive the full pmsData with per-month sources for narrative context.

3. **RE prompt rewrite.** INPUTS section updated for the new shape. PRE-PROCESSING dedup section replaced with DEDUP HANDLING (review upstream-flagged pairs only). TREND RULES simplified to "use pre-computed trend_label, don't re-derive." NOTES RULE added to stop the model from restating rank/percentage already visible in the table columns.

4. **Attribution matrix loading state.** Replaced the 4-step progress timeline with a single centered view: Alloro Lottie leaf inside a spinning orange ring, typewriter-animated referral-specific loading phrases ("Mapping your referral sources", "Ranking top referrers", etc.), plain-text description, and estimated time.

5. **Global Dashboard loading state.** Added the same spinning ring around the existing Lottie leaf, upgraded CogitatingText to typewriter animation (35ms/char, 1.8s hold between phrases).

6. **lottie-react dependency.** Added to frontend/package.json + cogitating-spinner.json asset + cogitating CSS animations in index.css.

**Verification:** `tsc --noEmit` clean (backend + frontend). End-to-end run verified — RE receives the pre-computed payload, Summary passes validator attempt 1, tasks created.

## [0.0.41] - April 2026

### RE Input Optimization + Per-Agent Model Override + FE Pill Cleanup

Bundle of five changes that reduce RE latency, clean up the FE progress UI, and add optional per-agent model selection infrastructure. Verified across multiple trial runs — RE input tokens dropped 61% (18k → 7k), total monthly run time dropped ~18-21% depending on API variance.

**Key Changes:**

1. **GBP stripped from RE input.** RE's prompt (`ReferralEngineAnalysis.md`) explicitly states GBP is "enrich if available" and the GROUNDING RULES forbid citing GBP fields — yet RE was receiving the full `monthData` GBP blob, which dominated its input tokens on big-org runs. Removed: `gbpData` param from `buildReferralEnginePayload`, the `gbp` field from `additional_data`, and the three GBP references from the RE prompt. Summary still receives GBP (via `monthData` spread) — only RE lost it.

2. **RE NOTES RULE added to prompt.** Matrix row notes were repeating data already visible in the table columns ("Rank 1 source, February 2026. 21.6% of all referral production."). New NOTES RULE with explicit good/bad examples: notes should add context not in the columns (merged source names, trend detail, relationship context, concentration risk, efficiency outliers) or be empty. Single-month notes no longer restate "New source" since the trend_label column already says "new".

3. **Per-agent model override via `RE_AGENT_MODEL` env var.** `runMonthlyAgent` opts now accepts `model?: string`, passed through to `runAgent`. RE call site reads `process.env.RE_AGENT_MODEL || undefined`. When unset (default), RE runs on the global model (Sonnet 4.6). When set to e.g. `claude-haiku-4-5-20251001`, RE runs on Haiku. Summary call site intentionally untouched — stays on default. Log line includes `(model: <name>)` when overridden. Rollback: remove the env var from `.env`, restart. Eval procedure: compare RE `agent_output` via Pipeline modal at `/admin/ai-pms-automation`.

4. **RE pill checkmark fix.** The `onProgress` call transitioning from RE → Summary was passing `agentCompleted: "dashboard_metrics"` (an invalid `MonthlyAgentKey`), so the FE silently dropped it and never marked RE's pill as completed during the Summary phase. Fixed to `agentCompleted: "referral_engine"`.

5. **Disabled agents hidden from FE.** Opportunity Agent and CRO Optimizer are disabled in the orchestrator (`if (false)` blocks) but were still rendering in both the AGENT PROGRESS strip (as pills with clock icons) and the AUTOMATION COMPLETE summary (as "opportunity 0" and "cro optimizer 0" pills). `MONTHLY_AGENT_CONFIG` in `frontend/src/api/pms.ts` now only lists the three active agents (Fetching data, Summary Agent, Referral Engine), and the AUTOMATION COMPLETE pill renderer filters out `opportunity` and `cro_optimizer` keys.

**Measured impact (org-36, 1 month PMS, same org+location+date_range across runs):**

| Metric             | Sonnet + GBP (baseline) | Sonnet + no GBP + Haiku RE | Change  |
| ------------------ | ----------------------- | -------------------------- | ------- |
| RE input tokens    | 18,283                  | 7,161–7,510                | -60%    |
| RE call duration   | 105.1s                  | 42–46s                     | -58%    |
| Total run duration | 217.2s                  | 172–182s                   | -18–21% |

**Verification:** `tsc --noEmit` clean (backend + frontend). Multiple end-to-end runs verified — Summary v2 passes validator attempt 1, tasks created cleanly, Pipeline modal renders correctly, FE pills show only active agents with proper checkmarks.

## [0.0.40] - April 2026

### Fix: Summary v2 Validator + Prompt Contract — Monthly Runs Actually Pass

Three bundled fixes that, together, take the monthly agents pipeline from "every run dies in Summary v2 validation" to "Summary v2 passes attempt 1 and emits 5 USER tasks." Verified end-to-end on a Job #118 rerun this session — full pipeline completed in ~6:41 with zero retries on either RE or Summary.

The proximate failures all lived in three different places, but they shared one root: contracts between the Summary prompt and the `validateSummarySupportingMetrics` validator that didn't agree with each other. Once the prompt told the model the right thing AND the validator honored what the prompt promised, the run passed cleanly on attempt 1.

**Key Changes:**

1. **`Summary.md` — GROUNDING RULES + PASSTHROUGH RULE rewrite.** The previous PASSTHROUGH RULE explicitly told Summary to cite `referral_engine_output.practice_action_plan[N].title` in `supporting_metrics[*].source_field`, which the validator then rejected because that field is restricted to `dashboard_metrics` paths. An earlier in-session attempt to fix this (using the phrase _"pick at least one deterministic dashboard_metrics path"_) accidentally caused the model to literally prefix every path with `"dashboard_metrics."` (e.g. `"dashboard_metrics.ranking.position"`), which the validator also rejected because it walks the dashboard_metrics object as root.

   The rewrite makes the contract crystal clear:
   - Lists valid top-level keys explicitly: `reviews, gbp, ranking, form_submissions, pms, referral`
   - Shows correct examples (bare paths like `"ranking.position"`)
   - Shows forbidden examples with explicit explanations: `"dashboard_metrics.X"` (no prefix), `"referral_engine_output.X"` (RE not allowed in source_field), `"pms.sources_summary[N].X"` (only dashboard_metrics.pms keys)
   - Separates `rationale` (permissive — any input narratively) from `supporting_metrics` (restricted to dashboard_metrics paths)
   - Says explicitly that the RE passthrough audit trail flows through preserved title/rationale wording, NOT through any source_field citation

2. **`service.prompt-loader.ts` — cache bypass in dev.** `loadPrompt()` had an in-memory `Map<string, string>` cache that, once populated, never re-read from disk. This made prompt iteration in dev impossible: every Summary.md edit required a full server restart to take effect. The fix gates the cache on `NODE_ENV === "production"`. In dev (tsx) every `loadPrompt()` call re-reads the file; in prod the cache stays on for performance. This was the silent reason multiple prompt-fix attempts during the session appeared to do nothing — the dev server was serving the prompt content from server-start time regardless of disk edits.

3. **`service.agent-orchestrator.ts` — `metricValuesMatch` tolerance and normalization.** The validator's prior implementation only stripped non-numeric characters from the _metric_ side (the model's value), not from the _dict_ side. So `"$365,747"` reduced to `365747` and was strict-`===`-compared against `365747.01` (which carried two decimals from `.toFixed(2)` rounding of summed monthly production), and failed. The Summary prompt explicitly promised "_Numeric equivalence counts (`$48,420 == 48420`)_" — the validator was breaking that promise on any decimal residue. Same shape for strings: case-sensitive substring fallback rejected `"GBP activity"` ≈ `"gbp_activity"`. The new implementation:
   - Strips non-numeric from BOTH sides before numeric comparison
   - Adds 1% relative-tolerance check (`Math.max(|a|,|b|,1)` denominator avoids div-by-zero and asymmetric tolerance)
   - Adds string normalization layer (lowercase, `_-` ↔ space, whitespace collapse) for both exact-and-substring fallbacks
   - Length guards on substring to prevent empty-string degeneracy
   - Function-level docstring updated to document the precedence order and explicitly link the contract to the prompt's "numeric equivalence counts" line

**Why all three were needed in one shipping unit:** Fix (1) alone is invisible without (2) — disk edits don't reach the model with a stale prompt cache. Fix (1)+(2) gets paths right but exposes the value-format mismatch that always existed. Fix (3) closes that final gap. Skipping any of the three leaves the monthly pipeline broken.

**Verification:** `tsc --noEmit` clean. Job #118 monthly run (One Endodontics, Falls Church) completed cleanly in ~6:41 with Summary v2 passing on attempt 1 and emitting 5 USER tasks across 5 domains (review, referral, gbp, referral, pms-data-quality), plus 6 ALLORO tasks from RE.

## [0.0.39] - April 2026

### Fix: Monthly Agents No Longer Crash Between Referral Engine and Summary

Pre-existing bug from the Plan 1 "Summary as Chief-of-Staff" refactor (commit `35a54b50`). The orchestrator wrote a progress notification for `subStep="dashboard_metrics"` between Referral Engine and Summary, but `dashboard_metrics` was never added to `MonthlyAgentKey` / `MONTHLY_AGENT_CONFIG` — so `calculateProgress()` looked up `undefined` and threw `Cannot read properties of undefined (reading 'progressOffset')`. Every monthly run since the refactor has been crashing at the same spot, with the failure surfacing in the UI as a stuck "Referral Engine" badge (RE had completed; the crash was on the _next_ progress write).

**Key Changes:**

- `service.agent-orchestrator.ts` — deleted the broken `onProgress("dashboard_metrics", ...)` call. `dashboard_metrics` is a sub-second deterministic compute, not a real agent step worth surfacing in the agent-progress UI; the backend `log(...)` line one over still records it for server observability.

**Commits:**

- `fix: monthly agents crash between RE and Summary on dashboard_metrics progress write`

**Verification:** `tsc --noEmit` clean. Next PMS-triggered monthly run will pass through dashboard_metrics → Summary cleanly. Job #118 (One Endodontics) and any earlier failed runs remain in their failed state and will need to be re-triggered via the existing PMS restart flow.

## [0.0.38] - April 2026

### Summary as Sole USER Task Writer + Pipeline Debug Modal

Two coordination problems shared one root cause and got fixed together: (1) the ranking pipeline was writing its own `agent_type="RANKING"` USER tasks in parallel to Summary's `top_actions`, so clients on `/to-do-list` could see duplicate or contradictory tasks; (2) admins had no way to debug a monthly run because `agent_results.agent_input` was nulled out for any payload >50KB and `dashboard_metrics`/GBP/Rybbit were never persisted. Folding ranking into Summary's input and removing the truncation fixes both with one coherent change.

**Key Changes:**

- `service.agent-orchestrator.ts` — removed the 50KB truncation on `agent_results.agent_input`; the column is already JSONB-shaped via `BaseModel.jsonFields`, so no migration was needed. The full payload sent to Claude (PMS rollup + GBP + RE output + dashboard_metrics + ranking_recommendations) is now persisted verbatim per run for both Referral Engine and Summary.
- `service.ranking-recommendations.ts` (new) — `fetchLatestRankingRecommendations(orgId, locationId)` reads the most recent completed `practice_rankings.llm_analysis.top_recommendations[]` for a location.
- `service.agent-input-builder.ts` — `buildSummaryPayload` accepts `rankingRecommendations` and emits it as `additional_data.ranking_recommendations` (sibling key, intentionally not folded into `dashboard_metrics` so the deterministic-dictionary contract stays intact).
- `Summary.md` — listed `ranking_recommendations` in INPUTS as interpretive (not deterministic); added a usage rule that recommendations enrich `rationale`/`outcome` and merge with overlapping RE actions, but values must NOT be cited via `supporting_metrics[*].source_field` (those still must trace to `dashboard_metrics` paths).
- `service.ranking-llm.ts` — removed the call to `archiveAndCreateTasks`. Summary v2 is now the sole writer of `category="USER"` tasks; ranking output reaches Summary on the next monthly run via the new payload field.
- `service.llm-webhook-handler.ts` — deleted dead `archiveAndCreateTasks` and `WebhookBody`; renamed conceptual purpose in the header comment (file is now ranking-result persistence, no longer a webhook handler).
- `20260429000001_archive_legacy_ranking_tasks.ts` (new) — one-shot data migration: snapshots existing `agent_type="RANKING"` pending/in_progress tasks to `tasks_ranking_archive_backup_20260429`, archives them, verifies, with full rollback support.
- `PmsPipelineController.ts` + `routes/admin/pmsPipeline.ts` (new) — `GET /api/admin/pms-jobs/:id/pipeline` returns the PMS metadata plus full RE and Summary `agent_input`/`agent_output` rows. Linkage is primary via `pms_jobs.automation_status_detail.summary.agentResults.{agent}.resultId` (recorded at completion), with a fallback org+location ORDER BY join for legacy/partial-fail rows. Gated behind `authenticateToken + superAdminMiddleware`.
- `PMSPipelineModal.tsx` (new) — admin debug modal: horizontal DAG (PMS → Referral Engine → Dashboard Metrics → Summary → Tasks) with click-to-expand raw-JSON drill-down for each node. Dashboard Metrics node reads its data from inside Summary's persisted `agent_input.additional_data.dashboard_metrics`. Renders a "Not captured (legacy run)" placeholder for runs that completed before the truncation fix.
- `PMSAutomationCards.tsx` — added a "Pipeline" button next to the existing "View" button on each row. Visibility gated on `automation_status_detail.currentStep IN (monthly_agents, task_creation, complete)` so it only appears when pipeline data exists.

**What this changes for clients:** existing pending RANKING-typed tasks become `archived` at deploy. New ranking insights surface on the next monthly Summary run as part of the unified `top_actions[]` list, instead of as a parallel pipeline.

**What this changes for admins:** every monthly run from this version forward is fully replayable via the Pipeline modal — full RE input, full Summary input including dashboard_metrics, and both agent outputs.

**Out of scope (deliberate):** RE → ALLORO tasks left untouched (different audience, agency-internal); cadence policy for ranking news between PMS uploads accepts the lag (option a from the planning thread); `pms_job_id` FK on `agent_results` deferred (current join sufficient); Rybbit website analytics path stays as-is (not yet emitting data).

**Verification:** `tsc --noEmit` clean (backend + frontend). `npm run lint` clean for the changed files (264 pre-existing errors elsewhere, unchanged by this work).

## [0.0.37] - April 2026

### Rankings Polish — Eyebrow Pattern, Layout Repair, Tone & Brand Sweep

Iterative refinement pass on the Rankings dashboard and the surrounding UI shell. Removed a redundant hero block, replaced overlapping section descriptors with `(i)`-icon hover tooltips (`InfoHint` helper), recovered from a layout regression where the eyebrow tooltip was rendering behind adjacent stacking contexts and one KPI label ("Practice Health") was wrapping to two lines, and finished the multi-page serif sweep that had been rolling out since 0.0.36. Brand bar in the sidebar now renders "Alloro" in bold Fraunces with the "Intelligence" subtitle dropped. The legacy v1 "auto-discovered competitors" notice on Practice Health was removed entirely.

**Key Changes:**

- `RankingsDashboard.tsx` — dropped Local Reputation hero block; restyled `client_summary` as a soft cream parchment callout (`#FCFAED` / `#EDE5C0`) with an "Practice insight" Info eyebrow and serif body; introduced `InfoHint` component for section eyebrows (Practice Health + Live Google Rank), replacing inline overflowing descriptors with bottom-positioned animated tooltips; grouped each `InfoHint` with its section in `space-y-4` containers so eyebrows hug their content while preserving 80px breathing room between major groups; tightened KPI label tracking (`0.25em` → `0.18em`) + added `whitespace-nowrap` so "PRACTICE HEALTH" stays on one line; removed the `LegacyRankingTag` v1 notice and its dead import.
- `CompetitorOnboardingBanner.tsx` — slimmed v2 banner from a 3-line card to a single padded row (`px-4 py-2.5`, 28px icon); added animated Info hover tooltip explaining what curation does to ranking accuracy.
- `focus/ActionQueue.tsx` — removed the explanatory footer paragraph ("Summary outputs 3–5 actions per month, ordered by priority_score…").
- `focus/WebsiteCard.tsx` — added `NotReadyShell` with Globe2 icon + "Connect website →" CTA; routes 404 "No website found" responses to the not-ready path instead of the generic error shell.
- `Sidebar.tsx` — brand block switched to `font-display font-bold text-2xl` Alloro and the "Intelligence" subtitle was removed; flex column collapsed.
- **Serif sweep across the rest of the app:** `Help.tsx`, `Notifications.tsx` (notification card titles), `TasksView.tsx` (Team Tasks h2 + error states), `BillingTab.tsx` (plan name h3s), `PMSVisualPillars.tsx`, `DFYWebsite.tsx`, `VitalSignsCards/VitalSignsCards.tsx` (Patient Journey Insights), `ReferralEngineDashboard.tsx`, `Profile.tsx`, `Signin.tsx`, `Signup.tsx`, `ForgotPassword.tsx`, `LocationCompetitorOnboarding.tsx`.
- **Tone shift in competitor copy** — "you compete with…" / "anyone you don't compete with" passive-aggressive phrasing replaced with neutral "local competitors" framing on the location curation page.

**Tooltip layering fix (post-regression):** Initial `InfoHint` rendered tooltips above the icon (`bottom-full mb-2`) with a `-mb-6` negative margin on the row, causing the tooltip to clash with the previous section's stacking context and the eyebrow row to crowd against the next KPI grid. Flipped tooltip to render below (`top-full mt-2`), flipped the arrow (`border-b-alloro-navy`), replaced `-mb-6` with `pb-2`, bumped tooltip `z-50` → `z-[100]`, and added a per-instance `zIndex: 60` on the `InfoHint` root when the tooltip is open.

**Commits:**

- `e9927fdf` — drop hero header, restyle client summary as parchment callout
- `f44ef3c2` — subtler cream callout + slim v2 banner above
- `ced05757` — info tooltip on v2 banner explaining the curation upgrade
- `17ae6dee` — passive 'local competitors' tone + serif headings on more pages
- `61a47809` — bold serif 'Alloro' brand, drop 'Intelligence' subtitle
- `50e8bd95` — drop queue footer note + WebsiteCard not-ready shell
- `0753d3a1` — clarify Practice Health vs Live Google Rank + serif on remaining tabs
- `4ad1df91` — rankings overflow + serif sweep across remaining pages
- `ea8a323d` — replace overlapping section descriptors with InfoHint tooltips
- `8c1eac84` — InfoHint tooltip layering + spacing
- `375062b2` — group eyebrows with sections, attach legacy tag to Practice Health
- `b84d467f` — keep KPI label on one line (tighter tracking + nowrap)
- `22ef6bc5` — remove v1 legacy auto-discovered competitor notice

**Verification:** `tsc --noEmit` clean. `npm run build` clean (~4.3s) on each iteration.

## [0.0.36] - April 2026

### Page Headings Cleanup — Drop 4, Shrink 1, Apply Serif

Stripped page-level eyebrow + headline + subtitle blocks that were taking first-fold space without adding signal. Tasks, Notifications, Help, and Settings lose their headers entirely; Rankings keeps its header but at a much smaller scale and switches to Fraunces (`font-display`). Two remaining setup-state headings (PMS Visual Pillars, DFY Website) also pick up Fraunces for consistency with the Focus dashboard's typography.

**Removed entirely (no replacement):**

- `TasksView.tsx` — "Actionable Growth · Practice Roadmap. Complete these Team Tasks to capture high-value revenue leakage."
- `Notifications.tsx` — "Notifications Active · Practice Updates. A live feed of Important Events that need your attention."
- `Help.tsx` — "We are here to help · How can we help? Talk to your Alloro Strategist for help with your practice growth."
- `Settings.tsx` — avatar circle + "Hamilton Wise's Organization" h1 + "Manage your practice details and connect your Google integrations" subtitle, plus the entire `<header>` shell that wrapped them.

**Shrunk + serif:**

- `RankingsDashboard.tsx` — "Local Reputation." heading dropped from `text-5xl/6xl font-black font-heading` to `font-display text-2xl md:text-3xl font-medium tracking-tight`. Subtitle dropped from `text-xl/2xl` to `text-base/lg`. The "Local SEO Tracking On" eyebrow + structure preserved.

**Serif applied to remaining prominent page headings:**

- `PMSVisualPillars.tsx:1148` setup-state heading — `font-display text-3xl font-medium`
- `DFYWebsite.tsx:888` building-state heading — `font-display text-2xl md:text-3xl font-medium`

**Settings cleanup also removed the unused `useAuth().userProfile` destructure** — caught by `tsc -b` after the header removal.

**Verification:** `tsc --noEmit` clean (backend + frontend). `npm run build` clean (4.39s).

## [0.0.35] - April 2026

### Restore Sidebar — Keep New Dashboard Content

Walked back the most visible part of 0.0.34 (the global sidebar → top-bar swap) while preserving every other piece of that release. The sidebar returns as the live navigation across all authenticated pages; the new Focus dashboard content (Hero, Trajectory, Action Queue, three product cards), the new fonts (Fraunces, Inter, JetBrains Mono), the `mark.hl` highlight class, and the brand-orange wizard outline all stay.

**Code changes:**

- `PageWrapper.tsx` — restored to its pre-0.0.34 shape (sidebar mount + mobile header + sidebar-aware main padding via `useSidebar` collapsed state). `TopBar` and `Ticker` are no longer mounted.
- `Sidebar.tsx` — `@deprecated` JSDoc block from 0.0.34 removed; the sidebar is fully live again.
- `components/layout/TopBar.tsx` + `components/layout/Ticker.tsx` — `@deprecated` JSDoc added (mirrors the pattern we just removed from Sidebar). Components preserved on disk and trivially revivable with a one-line `PageWrapper` edit if a top-bar rethink lands later.

**Unchanged from 0.0.34:**

- All 11 components under `components/dashboard/focus/` (Hero, Trajectory, ActionQueue, WebsiteCard, LocalRankingCard, PMSCard, ProoflineModal, SetupProgressBanner, HighlightedText, Sparkline, FactorBar, icons)
- The thin `DashboardOverview.tsx` composition rendering them
- 3 new API clients (`dashboardMetrics`, `formSubmissionsTimeseries`, `rankingHistory`)
- 5 new React Query hooks
- `frontend/src/types/dashboardMetrics.ts`
- `index.html` font links (Fraunces, Inter, JetBrains Mono)
- `index.css` additions (`mark.hl` class, `--font-display`/`--font-mono` vars, domain icon tile classes)
- Wizard `wizard-highlight` outline brand-orange fix in `SpotlightOverlay.tsx`

**Visual outcome:** `/dashboard` renders the new Focus content (Hero card on dark, Trajectory + Action Queue 2-col row, three product cards 3-col row) inside the sidebar-constrained main area. All other authenticated routes (Settings, Help, Notifications, DFY Website) look exactly as they did before 0.0.34. Mobile uses the legacy mobile-header burger + slide-in sidebar drawer + bottom nav.

**Verification:** `npx tsc --noEmit` clean (backend + frontend). `npm run build` clean (4.35s, 4.7MB main chunk per pre-existing pattern).

**Out of scope (deferred):**
Decide within ~1 release cycle whether to delete `TopBar.tsx` + `Ticker.tsx` or commit to a different navigation rethink that revives them. Adjust new dashboard card spacing if the Hero or product cards feel cramped at typical sidebar-open desktop widths. Reintroduce a refresh affordance on the new dashboard surface (none currently surfaced — TanStack Query's automatic refetch is keeping data current). Mobile redesign of the new dashboard cards.

## [0.0.34] - April 2026

### Focus Dashboard — Frontend Redesign

The practice-facing dashboard at `/dashboard` is fully redesigned. The global left sidebar is replaced with a top-bar nav across all authenticated pages. The dashboard's "Focus" tab gets a single dominant Hero card surfacing Summary v2's `top_actions[0]`, a Trajectory + Action Queue row, and three product cards (Website / Local Ranking / PMS) that surface real grounded metrics with month-over-month context. The 1700-line legacy `DashboardOverview.tsx` is replaced by a 95-line composition that delegates all rendering to small focused components under `frontend/src/components/dashboard/focus/`.

**Layout shell (global):**

- `PageWrapper.tsx` rewritten — sidebar mount removed, replaced with `<TopBar>` at top + `<Ticker>` (only on dashboard routes). Content area no longer reserves sidebar width. Mobile header consolidated into `TopBar`'s mobile variant. `MobileBottomNav` continues to render as primary mobile nav until the mobile redesign lands.
- New `components/layout/TopBar.tsx` — brand mark · 6-tab nav (Focus/Journey/PMS/Rankings/Tasks·count/Referral Engine) via `<NavLink>` for URL-driven active state · live pulse pill · refresh icon (wires to `useQueryClient().invalidateQueries()`) · location selector consuming `useLocationContext` · avatar with initials from `useAuth().userProfile`. Mobile: collapses to brand + avatar + hamburger drawer.
- New `components/layout/Ticker.tsx` — today strip with ambient signals + refreshed-at timestamp.
- `components/Sidebar.tsx` preserved on disk (with `@deprecated` JSDoc) for revert path. Not mounted.

**Focus dashboard composition** (`components/dashboard/focus/`):

- `Hero.tsx` (+ `useTopAction` hook) — reads tasks where `agent_type='SUMMARY'` filtered to highest `metadata.priority_score`. Renders dark card with 3 pills (1-thing-that-matters · urgency · domain), Fraunces display headline with inline `<mark class="hl">` highlights, rationale paragraph, primary/secondary/tertiary CTAs, and a right-side "Why this first" panel with 3 grounded stats + outcome (deliverables in green-bold + mechanism muted).
- `Trajectory.tsx` — reads existing `useAgentData` for Proofline. Renders salutation ("Good morning, {firstName}." with time-of-day) + body with highlights + "Read full explanation →" link triggering `ProoflineModal` + 3 mini-stats (Production MTD / New patient starts / Visibility score) sourced from `useDashboardMetrics`.
- `ActionQueue.tsx` (+ `useActionQueue` hook) — reads remaining tasks (Summary `priority_score < hero` + RE ALLORO), sorts desc, slices to 5 rows. Each row: domain icon tile via `getDomainIcon` lookup · title · color-coded urgency · due date · agent pill (Summary/Referral Engine) · chevron. Footer note explains the priority_score ordering rule.
- `WebsiteCard.tsx` — verified leads count headline + MoM trend computed from timeseries · 12-month area sparkline (new `/timeseries` endpoint) · "Coming soon: Rybbit" annotation · view submissions link.
- `LocalRankingCard.tsx` — rank position + history trend (new `/history` endpoint) · two factor sub-sections "Google Search" + "Practice Health" each with 4 weighted `<FactorBar>` rows + computed sub-score · lowest-factor annotation.
- `PMSCard.tsx` — production headline + MoM trend · 12-month sparkline from `pmsKeyData.months[]` · referral mix bar (doctor vs self) · top-3 sources from `sources[]` with optional drop pill.
- `ProoflineModal.tsx` — extracted from legacy `DashboardOverview` with framer-motion AnimatePresence pattern.
- `SetupProgressBanner.tsx` — thin orange-tinted banner above hero, only when `useAuth().onboardingCompleted === false`. CTA to `/new-account-onboarding`.

**Helper components:**

- `HighlightedText.tsx` — pure-text deterministic substring → `<mark class="hl">` JSX wrap. Sorts highlights longest-first, escapes regex specials, never injects raw HTML from agent output. Mismatched phrases silently dropped.
- `Sparkline.tsx` — area + line + last-point dot SVG. `viewBox` + `preserveAspectRatio="none"` for responsive scaling.
- `FactorBar.tsx` — labeled horizontal progress bar with color tier (green ≥0.7, orange 0.5-0.7, red <0.5). Score clamped to [0,1].
- `icons.ts` — `DOMAIN_ICONS` lookup map (review→MessageSquare, gbp→MapPin, ranking→TrendingUp, form-submission→Inbox, pms-data-quality→Database, referral→UserPlus). Frontend-derived per Plan 1's domain enum; agent never picks an icon.

**Typography & tokens:**

- New fonts: Fraunces (display, weights 400/500/600), Inter (400/500/600/700), JetBrains Mono (400/500/600). Loaded via Google Fonts in `index.html` alongside existing Plus Jakarta Sans + Literata. CSS vars `--font-display`, `--font-mono`, `--font-inter` added to `index.css`.
- `mark.hl` class added with light + dark variants (toggled by `focus-card-dark` wrapper class on the Hero). Brand orange `#D66853`.
- Domain icon tile classes (`.di-review`, `.di-gbp`, `.di-ranking`, `.di-form`, `.di-pms`, `.di-referral`) added to `index.css` with their respective tints.

**Onboarding wizard fix:**

- `SpotlightOverlay.tsx` — `wizard-highlight` outline color updated from off-brand `rgba(255,138,61,X)` to brand orange `rgba(214,104,83,X)` matching `--color-alloro-orange`. Pulse animation pattern unchanged. Now reads correctly against the new dashboard's dark hero card.

**API clients (consume Plan 1 endpoints):**

- `frontend/src/api/dashboardMetrics.ts` + `useDashboardMetrics` hook
- `frontend/src/api/formSubmissionsTimeseries.ts` + `useFormSubmissionsTimeseries` hook
- `frontend/src/api/rankingHistory.ts` + `useRankingHistory` hook
- `frontend/src/types/dashboardMetrics.ts` mirrors backend shape

**Refresh wiring:** TopBar's refresh icon dispatches `queryClient.invalidateQueries()` from PageWrapper, refetching every TanStack key (cards dedupe identical keys, so it's cheap). Replaces the legacy `handleRefresh` that lived inside DashboardOverview.

**Verification:** `npx tsc --noEmit` zero new errors backend + frontend. Live visual smoke (hero card hierarchy, hover states, mobile collapse, wizard outline against new layout) is gated on dev-server execution by the user.

**Out of scope (deferred):**
Mobile-first redesign of the new layout (current mobile is "works, doesn't crash"). Per-page reflow for Settings/Help/Notifications/DFY Website if the new TopBar reveals broken spacing. Touch device interaction patterns. Full WCAG accessibility audit. Sidebar component full removal (kept for revert path until v2 is proven). TopBar feature flag for staged rollout. Performance optimization (lazy-load Sparkline/FactorBar, defer below-fold). Animation polish (tab underline, hero entrance, queue stagger).

## [0.0.33] - April 2026

### Monthly Agents v2 — Summary as Chief-of-Staff

The monthly agent chain is reorganized so a single agent (Summary v2) writes practice-facing tasks, with Referral Engine providing specialist input and a new deterministic metrics service grounding every claim. Opportunity and CRO Optimizer are disabled (preserved on disk for revival). Two new endpoints land for the upcoming dashboard redesign (Plan 2 — frontend).

**Architecture:**

- **New chain order:** `Referral Engine → service.dashboard-metrics.ts → Summary v2`. RE runs first to produce specialist analysis (matrices, growth opportunity summary). The new dashboard-metrics service computes a deterministic dictionary of org-specific numbers (review/GBP/ranking/form-submission/PMS/referral) consuming RE's output. Summary v2 runs last with the full context (PMS, GBP, analytics, RE output, dashboard metrics) and picks 3-5 monthly priorities across all six domains.
- **Opportunity + CRO disabled** in `service.agent-orchestrator.ts` via `if (false)` blocks. Their prompt files, payload builders, and task-creator branches are preserved on disk; revival is a one-line orchestrator change.
- **Summary v2 schema** (`SummaryV2OutputSchema` in `agent-output-schemas.ts`): top-level `.strict()` Zod, requires `top_actions: TopAction[]` of length 3-5. Each `TopAction` carries `title · urgency · priority_score (0-1) · domain · rationale · highlights[≤2] · supporting_metrics[exactly 3] · outcome.{deliverables, mechanism} · cta · due_at?`. The domain enum is `review | gbp | ranking | form-submission | pms-data-quality | referral` — Summary now picks across all six (the earlier "exclude referral" rule is dropped).
- **Summary v2 prompt** (`src/agents/monthlyAgents/Summary.md` rewritten): Chief-of-Staff role, 154 lines. Mirrors the RE Tier-1 grounding pattern with new sections — GROUNDING RULES STRICT, SINGLE-MONTH RULE, UPSTREAM DATA QUALITY ACKNOWLEDGEMENT, PASSTHROUGH RULE (preserve specialist wording verbatim), CROSS-SOURCE CONSOLIDATION RULE (merge actions referencing the same entity), OUTCOME RULE — NO MAGNITUDE PREDICTIONS (forbidden patterns: "+2 positions", "+5 patients/mo", "$3,200 revenue est."), HIGHLIGHTS RULE.
- **Post-Zod value validator hook** in the orchestrator: walks every `top_actions[*].supporting_metrics[*].source_field` against the dashboard_metrics dictionary at the dotted path. Mismatch (numeric-normalized + substring-tolerant comparison) throws to trigger the runner's outer 3-attempt retry. Means the agent literally cannot invent values — every `value` in the stat strip traces to a deterministic backend computation.
- **Highlights post-validator** (warn-only): logs mismatched entries; frontend silently drops at render time.
- **Summary writes USER tasks** via the new `createTasksFromSummaryV2Output` branch in `service.task-creator.ts`. Each `top_actions[i]` becomes one row with `agent_type='SUMMARY', category='USER', is_approved=true` and the entire TopAction object stored in `metadata` (jsonb) so the dashboard renders hero/queue without a separate fetch.
- **RE keeps ALLORO task writes only**. The `practice_action_plan → USER` branch was removed from `service.task-creator.ts`; those items now feed Summary as input. The `alloro_automation_opportunities → ALLORO` branch (agency-internal automation tasks) is unchanged.
- **Proofline `highlights[]`** field added (additive). `ProoflineAgentOutputSchema` is new (Proofline previously had only a TS interface). Same pattern as Summary — max 2 phrases, must appear verbatim in `trajectory`.
- **3-attempt retry on Summary v2** (mirrors RE's pattern). Each attempt: Zod corrective retry inside the runner + value/highlights validators outside. Failure of all 3 attempts returns `{ success: false }` with the error.

**New backend endpoints (consumed by Plan 2 frontend):**

- `GET /api/dashboard/metrics?organization_id=X[&location_id=Y]` — wraps `computeDashboardMetrics`. Validates output via `DashboardMetricsSchema` before returning.
- `GET /api/user/website/form-submissions/timeseries?range=12m|6m|3m` — returns `[{ month, verified, unread, flagged }]` zero-filled, oldest-first. Filters via the existing `is_flagged` / `is_read` columns + `form_name` exclusion that match the existing `/stats` semantics (so dashboard counts stay consistent).
- `GET /api/practice-ranking/history?googleAccountId=X[&locationId=Y]&range=6m|3m` — returns `[{ observedAt, rankScore, rankPosition, factorScores }]` oldest-first, with `factorScores` flattened from the `ranking_factors` jsonb to a `Record<string, number>` of just the score numbers.

**`service.dashboard-metrics.ts` — the deterministic dictionary:**
Pure function — no LLM calls. Six sections:

- `reviews` — oldest_unanswered_hours, unanswered_count, current_rating, rating_change_30d, reviews_this_month
- `gbp` — days_since_last_post, posts_last_quarter, call/direction_clicks_last_30d
- `ranking` — position, total_competitors, score, lowest_factor, highest_factor, score_gap_to_top
- `form_submissions` — unread_count, oldest_unread_hours, verified_count, verified_this_week, flagged_count
- `pms` — distinct_months, last_upload_days_ago, missing_months_in_period, production_total, production_change_30d, total/doctor/self_referrals
- `referral` (sourced from RE output) — top_dropping_source, top_growing_source, sources_count

Each section is wrapped in try/catch — a failure in one section logs a warning and emits zero/null defaults rather than failing the whole dictionary. The result is `safeParse`'d through `DashboardMetricsSchema` and throws on schema violation (programming-error signal). The dotted-path keys ARE the legal `source_field` values for Summary's `supporting_metrics[*]` validator.

**Smoke verification (Plan 1 T15) is gated on live infrastructure** — running monthly agents end-to-end on a real test org and inspecting `tasks` table + `agent_results.response_log` shape compliance. Code is TypeScript-clean (`npx tsc --noEmit` zero new errors backend + frontend). Recommended pre-merge: smoke-test against a staging copy of prod data.

**Out of scope (deferred):**
Frontend redesign (Plan 2 — separate spec at `plans/04282026-no-ticket-focus-dashboard-frontend/`). Removal (full delete) of Opportunity/CRO Optimizer prompt files + task-creator branches. Future specialist agents (ranking-analyzer, website-analyzer) feeding Summary. Backfill of historical Summary outputs into the new shape. Per-claim confidence scoring inside top_actions[*]. Daily-cadence Summary.

## [0.0.32] - April 2026

### PMS Column Mapping with AI Inference

PMS uploads now run through a column-mapping system that handles arbitrary export shapes — not just the 4-col Alloro template. The previous positional parser silently misclassified procedure-log exports (e.g., Open Dental: `Treatment Date | Procedure | Patient | … | Referring Practice | …`) by treating procedure codes as source names and per-procedure rows as per-referral rows. New flow hashes the file's headers into a signature and resolves through three tiers: **org cache → global library → AI inference (Haiku 4.5)**. On first upload of an unknown shape, the user reviews/edits the mapping in a side drawer; on confirm (or "Re-process and save") it clones into the org's cache so subsequent uploads of the same shape are silent. The n8n PMS parsing webhook is no longer called — paste and file-upload paths now run the same code in this repo.

**Architecture:**

- New `pms_column_mappings` table (jsonb mapping payload, `is_global` flag, partial unique indexes for org rows and global rows). `pms_jobs.column_mapping_id` added as additive nullable FK with `ON DELETE SET NULL`.
- Three-tier resolver in `src/utils/pms/resolveColumnMapping.ts` with `[pms-mapping]` telemetry on every dispatch (`{ signatureHash, source, confidence, orgId, success }`). One-way fallback chain — never reversed, never merged.
- AI inference (`src/utils/pms/columnMappingInference.ts`) reuses the same Zod + corrective-retry plumbing the Referral Engine got in 0.0.31. 8s hard timeout, Haiku 4.5, temperature 0, prompt cache enabled (`cachedSystemBlocks: []`). On timeout or repeat-Zod-failure, falls through to manual-mapping UI.
- Two adapters under `src/utils/pms/adapters/`: `templateAdapter` (1 row = 1 referral, byte-identical to the previous parser for Alloro template signatures) and `procedureLogAdapter` (group rows, count groups). Dispatcher (`applyColumnMapping.ts`) picks based on which roles are mapped (`source` vs. `referring_practice`); throws on both-mapped or neither-mapped.
- Procedure-log adapter strips leading/trailing `*` characters from referring-practice values (handles `***Cox Family Dentistry & Orthodontics***` style annotations) and classifies blank → `self`, non-blank → `doctor`. No keyword inference on text.
- Production formula is an array of `{ op: "+" | "-", column }` ops — no expression strings, no parentheses, no multiplication/division. Evaluator reuses `toNumber()` from `pmsAggregator.ts` for currency-aware coercion (`"$1,234.56"`, parenthesised negatives `"(91.6)"`, signed strings).
- Initial global library seeded with two entries: Alloro 4-col template and the Open Dental procedure-log shape derived from the Fredericksburg test fixture. Engineering-controlled — global writes are seed-only; app code can only read from the library and write to the org cache.

**Frontend:**

- `PMSManualEntryModal.tsx` rewritten with a state-machine CSV parser. The previous naive `split(',')` shifted all columns silently whenever a quoted field contained a comma (patient names like `"Diab, Zied"`). State machine handles quoted fields, escaped quotes (`""`), and CRLF.
- New `ColumnMappingDrawer.tsx` — 3 main fields (Date, Source, Production) + Advanced collapsible (Patient + status filter). Inverted from the original per-header dropdown matrix because doctors found the role-enum-first UX unintuitive — "tell us where Date / Source / Production live" matches the mental model of someone who knows their PMS export but not the role enum. Single "Re-process and save" CTA, disabled until edits exist.
- New `ProductionFormulaBuilder.tsx` — `+` / `−` ops over column dropdowns with live preview against the first row (`Gross Revenue − Total Writeoffs = $1,234.56`). The target-of-formula dropdown was removed during execution (overengineered — defaults to `production_net` silently).
- 4 new typed API client wrappers in `frontend/src/api/pms.ts`: `previewMapping`, `uploadWithMapping`, `reprocessJob`, `getCachedMapping`.

**Behavior changes from spec (logged in spec Revision Log):**

- **Dedup model** changed from per-`(patient, date, practice)` triplet (D8) to per-`(patient, practice)` pair after verification against Hamilton Wise's reference pivot on the Fredericksburg Feb 2026 dataset. The spreadsheet treats a patient referred by Practice X as one referral for the period regardless of visit count — per-patient mental model, not per-visit. Multiple visits collapse into one referral; production sums across visits. Per-source counts and production now match the pivot exactly.
- **Zero-production skip rule** was prototyped then removed. The reference pivot retains zero-production referrals (post-op visits) as legitimate referral events. The `flags?: string[]` parameter on `applyMapping` and `applyProcedureLogMapping` is preserved for future data-quality use.
- **Clone-on-confirm cache write** now also fires from the drawer's "Re-process and save" CTA, not just initial Submit. User edits made during the preview flow weren't being persisted before, so re-uploads after Clear Data showed the seed/global mapping again instead of the edited version.
- **Backend response shape**: adapter returns a flat `MonthlyRollupForJob` array; controller now wraps it as `{ monthly_rollup: parsedPreview }` in both override and normal branches before responding, matching what the existing UI consumes.
- **Re-process-and-save** sends the full row set (`mappingAllRows`), not just the 5-row sample — sample-only re-processing didn't update toast counts or rollup totals.
- **Drawer auto-open** deferred to fire from `handleParsedPaste` after the legacy paste-detected modal completes (sequenced via `pastedRawTextRef` and `runMappingPreviewRef`) to avoid the drawer opening over the legacy modal.
- **`seed-second-location.ts`** moved from `src/database/seeds/` to `scripts/`. Adding the `seeds:` config block to `src/database/config.ts` (required for the new global-library seed) made the knex seed loader pick up the standalone ts-node script, which isn't compatible with knex's seed contract. Both files remain runnable in their new locations.

**Out of scope (deferred):**
Admin UI for managing the global library, AI inference for the dedup step, multi-mapping per file (sectioned exports), drag-drop UI redesign, multiplication/division/parentheses in production formulas, telemetry dashboard, backfill of historical `pms_jobs` rows, per-uploader (vs per-org) mappings, telemetry-driven auto-promotion of org cache entries into the global library.

### Practice Ranking v2 — User-Curated Competitor Lists

Replaces the auto-discovered competitor set with a user-curated list per location. Clients control exactly which practices their Practice Health score is benchmarked against — no more drift run-to-run, no more nearby-but-irrelevant competitors, no more missing real ones. Search Position stays untouched (still pure-Google top-20) so the live rank signal remains a real Google rank, not a relative position within a curated set.

**Architecture:**

- New `location_competitors` table (per-location, soft-deletable via `removed_at`, partial unique index on `(location_id, place_id) WHERE removed_at IS NULL` so re-add revives instead of duplicates). FK cascades from `locations`; `added_by_user_id` SET NULL on user deletion.
- New `LocationCompetitorModel` mirrors the `PracticeRankingModel` style — find-active, find-including-removed, addCompetitor (handles soft-delete revival), removeCompetitor (soft), countActive, getOnboardingStatus, setOnboardingStatus, findLatestInitialScrapeAt.
- Per-location v2 lifecycle on `locations`: `location_competitor_onboarding_status` (`pending` → `curating` → `finalized`) + `location_competitor_onboarding_finalized_at`. Verbose name to disambiguate from the existing organization-level onboarding.
- New `competitor_source` column on `practice_rankings` (`curated` / `discovered_v2_pending` / `discovered_v1_legacy`) with backfill of all pre-v2 rows as `discovered_v1_legacy`. Enables history rendering with explicit provenance.
- Dead `competitor_cache` table dropped — bypassed by the location-bias rewrite per `service.ranking-pipeline.ts:421` comment.
- Existing `agent_key='ranking'` schedule row updated in-place from drifting `interval_days=15` to calendar-aligned cron `0 0 1,15 * *` UTC. No new scheduler entry; the worker recomputes `next_run_at` via `cron-parser`.

**Pipeline branching (single decision point):**

- New `service.competitor-source-resolver.ts:resolveCompetitorsForRanking` resolves the competitor set used for Practice Health scoring. For finalized locations: loads the curated list, batch-fetches fresh `getPlaceDetails`, returns hydrated `DiscoveredCompetitor[]`. For pending/curating: passes through the Step 0 Places top-N. Falls back to the discovered set on any curated-path failure (graceful degradation).
- Resolver wired into `service.ranking-pipeline.ts` after Step 0 sub-step 5 (search_position persisted), before Step 1. Step 0 sub-steps 1-5 (Places top-20 → search_position fields) are UNCHANGED — Search Position math is fully isolated from curation status.
- `competitor_source` persisted on the `practice_rankings` row at the same point.

**Scheduler filter:**

- `service.ranking-executor.ts:setupRankingBatches` skips locations whose `location_competitor_onboarding_status !== 'finalized'`. Logged per-location with status. Existing admin trigger flow (`POST /api/practice-ranking/trigger`) is unchanged — admins can still trigger any location regardless of onboarding status.

**Backend endpoints (location-scoped, JWT + RBAC + locationScope gated):**

- `GET    /api/practice-ranking/locations/:locationId/competitors` — list active curated competitors + onboarding status + cap.
- `POST   /api/practice-ranking/locations/:locationId/competitors/discover` — runs initial Places discovery (top 10), populates `location_competitors` with `source='initial_scrape'`, flips status to `curating`. Idempotent: skips if existing initial_scrape <7 days old.
- `POST   /api/practice-ranking/locations/:locationId/competitors` — adds a user-chosen competitor by Place ID (cap enforced server-side at 10).
- `DELETE /api/practice-ranking/locations/:locationId/competitors/:placeId` — soft-deletes from the active list.
- `POST   /api/practice-ranking/locations/:locationId/competitors/finalize-and-run` — single-click finalize: flips status to `finalized`, creates `practice_rankings` row tagged `competitor_source='curated'`, kicks off pipeline async. Idempotent on rapid double-click via 5-min in-flight window check.
- All write endpoints require `admin` or `manager` role; `viewer` cannot mutate the curated list.

**Places API rate limiting:**

- `placesAutocompleteLimiter` (60/min/IP), `placesDetailsLimiter` (60/min/IP), `placesSearchLimiter` (30/min/IP) added to the existing `publicRateLimiter.ts`. Wired into `routes/places.ts`. Generous enough that the leadgen-tool's onboarding flow (which shares these public endpoints) is unaffected.

**Frontend — 3-stage onboarding page:**

- New route `/dashboard/competitors/:locationId/onboarding` → `LocationCompetitorOnboarding.tsx`.
- Stage 1 — Discovering: framer-motion radar pulses + staggered pin reveal as the Places top-10 lands. No Google Maps iframe dependency (works without lat/lng up front).
- Stage 2 — Curating: list with per-row Remove (soft delete, optimistic), Add via debounced autocomplete against `/api/places/autocomplete`. Counter shows N/10. Source tag distinguishes "you added" vs "auto" entries.
- Stage 3 — Finalize: single button → `POST /finalize-and-run`, redirects to `/rankings?batchId=…` for the user to watch their first run.

**Frontend — Dashboard banner + v1 legacy tag:**

- `CompetitorOnboardingBanner.tsx` renders for `pending`/`curating` locations with copy + CTA to the onboarding page.
- `LegacyRankingTag` renders next to Practice Health when the latest ranking row has `competitor_source='discovered_v1_legacy'` — explains the score predates curation and prompts setup.
- `/latest` controller now returns `competitorSource` and `locationOnboarding` per ranking; `RankingResult` interface extended; `wizardDemoData` updated to satisfy the new fields.

**Out of scope (v1 — explicit deferrals):**

- Admin-side curate UI (admin trigger flow stays as-is — read-only competitor list view via existing endpoints).
- Re-discovery UX ("suggest competitors I might have missed").
- Per-competitor scoring weight overrides.
- Geographic radius slider on the curate page.
- Email templates / send infrastructure (announce email sent manually by ops).
- Reminder/nudge automation for un-finalized locations.
- Minimum competitor count enforcement (lists may be 0–10).

**Runtime verification:**

- `tsc --noEmit` clean across backend and frontend (one pre-existing unused-var error in `FieldMappingDropdown.tsx` predates this work).
- ESLint clean for all newly-authored files (one benign React hooks warning about ref cleanup in `LocationCompetitorOnboarding.tsx`).
- Migration applied successfully against the configured DB; `competitor_cache` dropped, `location_competitors` created, `locations` and `practice_rankings` columns added, `schedules.ranking` row switched to cron `0 0 1,15 * *` UTC.
- End-to-end manual verification (3-stage onboarding walkthrough, scheduler skip behavior, dashboard banner + v1 tag rendering, Search Position non-cross-contamination) is the deployment owner's responsibility — Done checklist captured in spec.

**Commits:**

- `src/database/migrations/20260428000001_practice_ranking_v2_curated_competitors.ts` — drops `competitor_cache`, creates `location_competitors`, adds onboarding columns to `locations`, `competitor_source` to `practice_rankings` (with backfill), updates the `agent_key='ranking'` schedule row.
- `src/models/LocationCompetitorModel.ts` — new model.
- `src/models/LocationModel.ts` — `ILocation` extended with v2 columns; `create()` signature widened so callers don't need to pass the defaulted onboarding fields.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — runDiscoveryForLocation, addCustomCompetitor, removeCompetitorFromList, finalizeAndTriggerRun.
- `src/controllers/practice-ranking/feature-services/service.competitor-source-resolver.ts` — single-decision-point pipeline branch.
- `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts` — resolver call + `competitor_source` persist after Step 0 sub-step 5.
- `src/controllers/practice-ranking/feature-utils/util.competitor-validator.ts` — locationId / placeId / cap validators.
- `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts` — `competitorSource` + `locationOnboarding` + `locationId` added to `formatLatestRanking` payload.
- `src/controllers/practice-ranking/PracticeRankingController.ts` — 5 new endpoint handlers + extended `/latest` response with onboarding metadata.
- `src/controllers/agents/feature-services/service.ranking-executor.ts` — scheduler filter on `location_competitor_onboarding_status === 'finalized'`.
- `src/routes/practiceRanking.ts` — 5 new gated routes (authenticateToken + rbacMiddleware + locationScopeMiddleware + requireRole on writes).
- `src/middleware/publicRateLimiter.ts` — 3 new Places limiters.
- `src/routes/places.ts` — limiters wired.
- `frontend/src/api/practiceRanking.ts` — typed client for all 5 v2 endpoints.
- `frontend/src/components/dashboard/CompetitorOnboardingBanner.tsx` — banner + legacy-tag components.
- `frontend/src/components/dashboard/RankingsDashboard.tsx` — `RankingResult` interface extended; banner injected above PerformanceDashboard; legacy tag injected at top of PerformanceDashboard for `discovered_v1_legacy` rows.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` — 3-stage page with framer-motion radar discovery animation.
- `frontend/src/App.tsx` — `/dashboard/competitors/:locationId/onboarding` route registered inside the protected layout.
- `plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md` — 12-decision spec with Risk Level 3 analysis (pipeline branching, Search Position non-cross-contamination, blast radius, deployment-mid-batch resilience).

## [0.0.31] - April 2026

### Per-Organization Data Reset (Admin)

Admin can now wipe agent outputs and PMS data for a single organization via a "Reset Data" button on `/admin/organizations/:id`, scoped to the Agent Results section. v1 ships two reset groups — **PMS Ingestion** (clears `pms_jobs`) and **Referral Engine output** (clears `agent_results` + `agent_recommendations` where `agent_type='referral_engine'`) — with a one-way cascade: checking PMS auto-checks-and-disables Referral Engine because the analysis output is derived from PMS source data. Wiping PMS without RE would leave stale analysis pointing at deleted source data, so the modal forces them together. RE alone remains independent so admins can re-run analysis on existing PMS data without disturbing the source.

**Architecture:**

- Backend: `GET /api/admin/organizations/:id/reset-data/preview` returns live row counts for both groups; `POST /api/admin/organizations/:id/reset-data` accepts `{ groups, confirmName }` and runs all selected deletes inside a single `knex.transaction()` so partial failure rolls back. Returns per-table `deletedCounts`.
- `agent_recommendations` deleted manually first via subquery on `agent_results` — there's no FK CASCADE from `agent_results.id`, confirmed during the prior one-off org-36 reset.
- Audit trail via console-logged `[admin-reset]` structured JSON line on every successful commit (`adminEmail`, `orgId`, `orgName`, `groups`, `deletedCounts`, `timestamp`). No new audit table for v1.
- RBAC: existing `superAdminMiddleware` (env-allowlist via `SUPER_ADMIN_EMAILS`). Defense-in-depth — backend route enforces super-admin even though the entire `/admin/*` tree is already gated by `AdminGuard` on the frontend.

**Frontend:**

- `ResetOrgDataModal.tsx` mirrors the existing `OrgSettingsSection` delete-org modal pattern (framer-motion `motion.div`, react-hot-toast feedback, type-org-name confirm input, `lucide-react` icons). On open, fetches preview counts and renders 2 checkboxes with row-count badges.
- Cascade UX: when PMS checkbox is checked, RE is force-checked + disabled with hint "PMS reset also clears Referral Engine output (derived data)." When PMS is unchecked, RE becomes independently toggleable.
- Submit button disabled until `confirmText === org.name` AND ≥1 group selected. On success: toasts deletion summary, fires `queryClient.invalidateQueries` for `adminOrgPmsJobsAll(orgId)` and `adminOrgAgentOutputsAll(orgId)`, closes modal.
- Button placement gated to `?section=agent` only — hidden on Subscription/Users/Connections/Settings to reduce accidental-click surface (Rev 2 of the spec).

**One-off org-36 PMS reset (prior plan, now in version control):**

- `src/database/migrations/20260423000002_reset_pms_data_org_36.ts` — the manual prod reset that motivated this feature. Snapshot-rollback via `<table>_reset_backup_org36_20260423` tables; `down()` restores rows with original IDs and JSONB intact.
- Dual env-var guarded: `RESET_ORG_36_CONFIRM=true` AND `RESET_ORG_36_DB_NAME=<DB_NAME>` both required, plus `DB_NAME` must match `RESET_ORG_36_DB_NAME`. Migration is a no-op in any future env that doesn't explicitly opt in. Deletion order is FK-safe: `agent_recommendations` (subquery) → `agent_results` → `tasks` → `pms_jobs`. `agent_recommendations` for org 36 had 0 rows; backups still created for rollback symmetry.

**Out of scope (v1 — explicit deferrals):**
The other 7 reset groups (Rankings, Tasks Hub, Notifications, Proofline, Summary, Opportunity, CRO) — modal architecture is structured to scale (just add list entries). In-flight job cancellation / org-lock during reset. Per-tab inline reset buttons. Admin audit log table + viewer. `google_data_store` reset (Proofline source data) as a separate group.

### Referral Engine Accuracy — Tier 1 Fixes

Six surgical accuracy improvements identified during a deep map of the Referral Engine flow. Bounded scope: no model change, no n8n contract change, no parser internals.

**Key Changes:**

- `buildReferralEnginePayload` now emits `additional_data.{pms, gbp, website_analytics}`. Prompt previously promised GBP + analytics enrichment but the code only sent PMS — the model was told to weigh data it never saw. Reuses the GBP fetch already wired into Summary; no new fetches.
- New `ReferralEngineAgentOutputSchema` (Zod, top-level `.strict()`, nested permissive) validates every Referral Engine output. On shape mismatch the runner sends a corrective user message with formatted Zod issues and re-calls Anthropic once; both attempts logged with `[zod-retry]` prefix. Falls through to legacy `isValidAgentOutput` if the corrective retry also fails. Cap is one retry per outer attempt — outer retry budget unchanged at 3.
- Three additive prompt sections in `src/agents/monthlyAgents/ReferralEngineAnalysis.md` (no existing rule reworded):
  - **GROUNDING RULES — STRICT:** cite only source names, months, and numbers that appear verbatim in the input JSON. Omit claims with numbers not in the input. Do not infer, estimate, or interpolate.
  - **SINGLE-MONTH RULE:** when `monthly_rollup` has one month, force `trend_label='new'` for every source in both matrices and add the corresponding `data_quality_flags` entry. Do not invent prior-month numbers.
  - **UPSTREAM DATA QUALITY ACKNOWLEDGEMENT:** surface upstream flags from `additional_data.pms.data_quality_flags` verbatim — they are deterministic checks already run before the model saw the data.
- `pmsAggregator`: new `SOURCE_SUM_TOLERANCE = 0.05` constant. Per-month reconciliation pushes `Sum-of-sources mismatch in <month>: sources=N, total=M` entries into a new `dataQualityFlags: string[]` field on the aggregator output. The orchestrator propagates this through its existing camelCase→snake_case PMS payload transform to `additional_data.pms.data_quality_flags`, which the new prompt section instructs the model to surface.
- Prompt caching enabled at the Referral Engine `runAgent` call site (5-min ephemeral). `cache_creation_input_tokens` / `cache_read_input_tokens` visible in `llm-runner` logs from the second within-window call onward.
- Runner cache condition relaxed: `cachedSystemBlocks !== undefined` (was: `length > 0`). Callers can now pass `[]` to cache only the auto-appended `systemPrompt` without duplicating it as a prefix block — fixes a double-send bug discovered during integration verification (the runner auto-appends the systemPrompt as a cached block; passing `[systemPrompt]` would have produced two identical cached blocks per call).

**Backward compat:**
No new dependencies (Zod 4.3.6 already in deps). No schema migration. Other agents (Proofline, Summary, Opportunity, CRO Optimizer) byte-identical at the runner call — `runAgent` and `runMonthlyAgent` extensions are optional params; existing callers behave exactly as before.

**Out of scope (Tier 2 / Tier 3 — explicit follow-ups):**
AI-driven type classification (replace keyword matching at parse time), date-format detection by sampling, parser unit test suite, "review parsed data" admin UI step, self-critique second pass (Haiku), n8n parser repatriation, per-claim confidence scoring, output cache keyed by PMS data fingerprint, 1-hour cache TTL (Anthropic beta).

**Commits:**

- `src/types/adminReset.ts` — `ResetGroupKey` union + request/response types.
- `src/controllers/admin-organizations/feature-services/service.reset-org-data.ts` — transactional reset service with `[admin-reset]` audit log.
- `src/controllers/admin-organizations/AdminOrganizationsController.ts` — `previewResetData` + `resetOrgData` handlers with org-name confirmation validation.
- `src/routes/admin/organizations.ts` — 2 super-admin gated routes (`GET /:id/reset-data/preview`, `POST /:id/reset-data`).
- `src/database/migrations/20260423000002_reset_pms_data_org_36.ts` — prior one-off prod reset, snapshot-rollback, dual env-var guarded.
- `frontend/src/components/Admin/ResetOrgDataModal.tsx` — type-org-name confirm modal with PMS→RE cascade UX.
- `frontend/src/api/admin-organizations.ts` — typed API client (`adminPreviewResetData`, `adminResetOrgData`).
- `frontend/src/pages/admin/OrganizationDetail.tsx` — Reset Data button next to DFY badge, gated to `?section=agent`.
- `src/agents/monthlyAgents/ReferralEngineAnalysis.md` — three new rule sections.
- `src/agents/service.llm-runner.ts` — `outputSchema` optional param + corrective single-retry; relaxed cache condition.
- `src/controllers/agents/feature-services/service.agent-input-builder.ts` — `buildReferralEnginePayload` payload extension.
- `src/controllers/agents/feature-services/service.agent-orchestrator.ts` — Referral Engine call passes GBP + analytics + `enableCache` + `outputSchema`; PMS payload transform now includes `data_quality_flags`.
- `src/controllers/agents/types/agent-output-schemas.ts` — `ReferralEngineAgentOutputSchema` Zod export alongside the existing TS interface.
- `src/utils/pms/pmsAggregator.ts` — `SOURCE_SUM_TOLERANCE` + per-month sum reconciliation.

**Runtime verification:**
**Deferred.** Code is `tsc --noEmit` clean across backend and frontend. UI walkthrough of the Reset Data modal and end-to-end Referral Engine smoke test (cache token logs, Zod-valid output, single-month trend behavior, upstream-flag surfacing) are flagged in their respective spec Done checklists. Treat 0.0.31 as code-complete; runtime gate fires the first time a super-admin uses Reset Data on Hamilton Wise's org and the next Referral Engine run that produces `cache_creation_input_tokens` logs and a Zod-valid output.

## [0.0.30] - April 2026

### Website Integrations — HubSpot Form-to-Contact Mapping (v1)

New per-website **Integrations** tab in the admin dashboard. Connect a HubSpot Private App token, see website forms detected from existing submissions, map their fields to a HubSpot form via per-row dropdowns, and every non-flagged submission automatically pushes to HubSpot via the Forms Submissions API. Schema, controller, and worker are vendor-agnostic from day one — Salesforce/Pipedrive drop in as additional adapters without restructure. Existing Make.com "new contact" automation keeps firing because HubSpot's form-submit path emits the same `contact.creation` webhook as direct contact creates.

**Architecture:**

- New `website_builder.website_integrations` (per-project credentials, AES-256-GCM encrypted, vendor metadata in JSONB), `website_integration_form_mappings` (N→1 fan-in: many website forms to one HubSpot form), and `crm_sync_logs` (audit trail with `ON DELETE SET NULL` + denormalized `platform`/`vendor_form_id` so logs survive integration deletion).
- Vendor-agnostic adapter layer at `src/services/integrations/` (`ICrmAdapter` interface + HubSpot impl). v1 uses raw `fetch` — no `@hubspot/api-client` dependency added.
- New `crm-hubspot-push` queue (concurrency 3, prefix `{crm}`) on the existing single-process worker. Idempotent via `jobId === submissionId` (BullMQ refuses duplicate jobIds, so retries on transient errors don't create duplicate HubSpot contacts).
- New `crm-mapping-validation` daily job at 4:30 AM UTC: validates each integration's token AND cross-references mapped vendor form IDs against HubSpot's current form list. Tokens revoked on the HubSpot side flip to `status='revoked'` within 24h without needing a real submission to expose the failure.
- Form-detection feature service derives website forms from `form_submissions` GROUP BY `form_name` and unions field keys across the last 20 submissions per form — handles BOTH the legacy flat shape AND the sectioned `FormSection[]` shape via a shared `flattenSubmissionContents` util.

**Hot-path hook (T0 audit corrected the placement):**

- T0 audit of `formSubmissionController.ts` found that `FormSubmissionModel.create()` always writes `is_flagged: false`; the AI block UPDATEs to flagged=true LATER. Hooking after `create()` (the original spec wording) would have pushed AI-caught spam to HubSpot. Corrected hook lives AFTER the AI block (after line 475), gates on the local `flagged` boolean, and is wrapped in an inner try/catch so a Redis hiccup never breaks form submissions.
- AI-flagged submissions skip the push and write a `skipped_flagged` log row (only if an integration exists — write-amplification rule).
- Submissions on websites with no integration write nothing to `crm_sync_logs` at all.

**Frontend (per-website dashboard):**

- `IntegrationsTab.tsx` follows the PostsTab 30/70 sidebar+main layout. State machine: not connected → connect modal; connected → connection panel + detected-forms list + (when a form is selected) field-mapping dropdown editor + recent activity panel; revoked → red banner + reconnect CTA.
- `FieldMappingDropdown` is per-row `<select>` (NOT drag-drop — explicit decision to halve the build cost; required HubSpot fields show red asterisk). "Auto-fill defaults" calls the inference service and merges suggestions over empty rows only — never overwrites user choices.
- `RecentActivityPanel` shows the last 10 sync attempts with outcome badges so customers can self-diagnose "why didn't this push?"

**Security:**

- Tokens encrypted at rest with AES-256-GCM via existing `src/utils/encryption.ts` (requires `CREDENTIALS_ENCRYPTION_KEY` env var — same encryption module already used by `minds.platform_credentials`).
- `SAFE_COLUMNS` list ensures `encrypted_credentials` never returns from any controller endpoint. `getDecryptedCredentials` is internal-only and called from the adapter layer only.
- DB-level `CHECK (platform IN ('hubspot'))` on `website_integrations` rejects typos that would create unreadable rows. Extending vendors = small follow-up migration to widen the CHECK.

**Out of scope (v1 — explicit deferrals):**
OAuth flow (Private App token only), one-to-many fanout, static defaults / field transformations, manual retry from UI for failed pushes, soft delete, custom HubSpot property creation for unmapped fields, encryption key rotation, bulk replay of historical submissions, in-memory caching of vendor forms list.

**Runtime verification:**
**Deferred.** Code is `tsc --noEmit` clean across backend and frontend, but no migrations have been applied to a real DB, no real HubSpot token has been validated through the adapter, no end-to-end form submission has actually pushed a contact. The spec's Done checklist (~17 manual items including idempotency, Make.com regression, broken-form detection, Redis-down resilience) is unrun. Treat 0.0.30 as code-complete — the runtime gate fires the first time a customer connects HubSpot in dev/staging.

**Commits:**

- `src/database/migrations/20260425100000_create_website_integrations.ts` — `website_integrations` table with `CHECK` on `platform` + `status`, unique `(project_id, platform)`.
- `src/database/migrations/20260425100001_create_website_integration_form_mappings.ts` — N→1 mappings with unique `(integration_id, website_form_name)`.
- `src/database/migrations/20260425100002_create_crm_sync_logs.ts` — audit trail with `SET NULL` cascade + denormalized `platform`/`vendor_form_id`.
- `src/models/website-builder/WebsiteIntegrationModel.ts` — `SAFE_COLUMNS` excludes `encrypted_credentials`; internal `getDecryptedCredentials`.
- `src/models/website-builder/IntegrationFormMappingModel.ts` — `bulkMarkBrokenForMissingVendorForms` + `bulkMarkValidated` for daily validation.
- `src/models/website-builder/CrmSyncLogModel.ts` — paginated query for Recent Activity panel; `pruneOlderThan` retention helper.
- `src/services/integrations/types.ts` — `ICrmAdapter` + DTOs.
- `src/services/integrations/hubspotAdapter.ts` — fetch-based impl: `validateConnection` (account-info/v3/details), `listForms` (marketing/v3/forms paginated), `getFormSchema`, `submitForm` (api.hsforms.com auth-less endpoint). 429/5xx throw to trigger BullMQ retry; 401 returns `auth_failed`; 404 returns `form_not_found`.
- `src/services/integrations/fieldInference.ts` — exact + alias + length-capped fuzzy matching for `email`/`phone`/`firstname`/etc. plus dental synonyms (`practice_name → company`).
- `src/services/integrations/index.ts` — `getAdapter(platform)` registry.
- `src/utils/formContentsFlattener.ts` — handles both `FormSection[]` and legacy flat shapes; shared between form-detection and CRM push.
- `src/controllers/admin-websites/feature-services/service.form-detection.ts` — `listDetectedForms` (excludes Newsletter Signup) + `getFormFieldShape` with sample values.
- `src/controllers/admin-websites/WebsiteIntegrationsController.ts` — 16 endpoint handlers; project-ownership checks on every per-integration route.
- `src/routes/admin/websites.ts` — 16 new routes mounted between form-submissions and review-sync sections.
- `src/workers/queues.ts` — `getCrmQueue` helper, prefix `{crm}`.
- `src/workers/processors/crmPush.processor.ts` — late-skip on `is_flagged` race; flips integration to revoked on 401, mapping to broken on 404.
- `src/workers/processors/crmMappingValidation.processor.ts` — daily token + form-existence sweep, best-effort across all integrations.
- `src/workers/worker.ts` — `crm-hubspot-push` (concurrency 3, lockDuration 30s) + `crm-mapping-validation` (concurrency 1, daily 4:30 AM UTC) workers + scheduled job + shutdown wiring.
- `src/controllers/websiteContact/formSubmissionController.ts` — additive enqueue block AFTER AI classification, gated on local `flagged` boolean + `submissionId !== null`, idempotent via `jobId: submissionId`, inner try/catch isolates Redis failures from visitor response.
- `frontend/src/api/integrations.ts` — typed client for all 16 endpoints + `SyncLog` type.
- `frontend/src/components/Admin/IntegrationsTab.tsx` — main tab with state machine for not-connected / connected / revoked.
- `frontend/src/components/Admin/integrations/{IntegrationProviderList,HubSpotConnectModal,HubSpotConnectionPanel,DetectedFormsPanel,FieldMappingDropdown,RecentActivityPanel}.tsx` — 6 subcomponents.
- `frontend/src/pages/admin/WebsiteDetail.tsx` — register `?tab=integrations` (4 edits: VALID_TABS, tabConfig, conditional render, lucide `Plug` import).
- `plans/04252026-no-ticket-website-integrations-hubspot-form-mapping/spec.md` — 800+ line spec with Risk section, T0 audit findings, two Revision Log entries (Rev 1: pre-execution review fixes; Rev 2: T7 placement correction from T0 findings).

## [0.0.29] - April 2026

### Audit Pipeline — Stealth Scrape Fallback + Branch-B Perf Tightening

Two related changes shipped to make the leadgen audit work on Cloudflare-protected sites and finish faster on every site. Before this release, dental sites behind CF Bot Fight Mode (which our EC2 IP isn't whitelisted for) failed at the homepage scrape and the audit dead-ended at "Heavier traffic than usual." The default Puppeteer scraper was also wasting input tokens on framework boilerplate that Claude was throwing away anyway.

**Key Changes — CF stealth fallback:**

- New `service.playwright-stealth-manager.ts` runs Playwright + `puppeteer-extra-plugin-stealth` as a fallback when the default Puppeteer path hits `ERR_BLOCKED_BY_CLIENT`. Returns the same `ScrapingResult` shape so downstream consumers don't care which method won.
- `service.puppeteer-manager.ts navigateWithRetry` now returns `{ok, blocked, error?}` and fails fast on bot-block patterns (`ERR_BLOCKED_BY_CLIENT`, `ERR_HTTP2_PROTOCOL_ERROR`, `ERR_TOO_MANY_REDIRECTS`) — no wasted second retry. Saves ~5s per blocked audit before the fallback even starts.
- `service.scraping-orchestrator.ts scrapeHomepage` now returns `ScrapeOutcome = {result, blocked}` and orchestrates the chain: default → (on bot-block, if `AUDIT_USE_STEALTH_FALLBACK !== "false"`) stealth → null. All paths log `[CHAIN]` lines for grep-able prod telemetry.
- New `audit_processes.website_blocked` boolean column threaded through the API response and the GBP analysis pillar prompts. ProfileIntegrity prompt updated to NEVER recommend "site is down / migrate to dedicated website" when the user message indicates `(BLOCKED — bot protection — ...)` — the user has a working website that we just couldn't scan.
- Migration `20260425000000_add_website_blocked_to_audit_processes.ts` — additive nullable boolean default false. Must run before deploy.
- Feature flag `AUDIT_USE_STEALTH_FALLBACK` env var (default true). Set to `"false"` to instantly disable the stealth fallback if the plugin starts hurting more than helping.

**Key Changes — Branch B input tightening:**

- `markupStripper.ts` extended with five new rules: drop framework-utility class strings (>60 chars OR >5 space-separated tokens), drop generated `id` values (>30 chars), drop most `data-*` attributes (kept: `data-type`, `data-role`, `data-cy`), drop `<head><link>` tags except `canonical` and `alternate`, drop `aria-hidden="true"` subtrees. Strip ratio improved from 39–66% → 51–80% across test targets.
- `CLAUDE_MAX_DIMENSION` lowered from 1568 px → 1024 px and made env-overridable via `process.env.CLAUDE_MAX_DIMENSION`. Halves the JPEG fed to Claude (~80kB → ~24–38kB) without losing layout/CTA-prominence signal.
- Combined effect on `[B] WebsiteAnalysis LLM` duration: -13% on Artful (clean baseline, 26.6s → 23.2s), -27% on Coastal Endo (CF target, 34.5s → 25.1s). Total audit wall-clock down ~9 seconds on the harder targets.
- Quality validated empirically: `overall_grade` and `overall_score` on website_analysis identical pre/post on Artful (C+/78 → C+/78); GBP analysis grade identical on Coastal Endo (B/85 → B/85). Aggressive stripping is NOT removing content the LLM relied on for grading.

**Commits:**

- `package.json` / `package-lock.json` — add `playwright-extra` + `puppeteer-extra-plugin-stealth`.
- `src/agents/auditAgents/gbp/ProfileIntegrity.md` — bot-blocked-website rules added.
- `src/controllers/audit/audit-services/auditRetrievalService.ts` — expose `website_blocked` in status response.
- `src/controllers/scraper/ScraperController.ts` — consume new `ScrapeOutcome` shape.
- `src/controllers/scraper/feature-services/service.puppeteer-manager.ts` — `NavigationResult`, fail-fast on bot-block.
- `src/controllers/scraper/feature-services/service.scraping-orchestrator.ts` — chain wiring + telemetry.
- `src/controllers/scraper/feature-services/service.playwright-stealth-manager.ts` — new stealth path.
- `src/controllers/audit/audit-utils/markupStripper.ts` — five new stripping rules.
- `src/models/AuditProcessModel.ts` — `website_blocked?: boolean` on `IAuditProcess`.
- `src/workers/processors/auditLeadgen.processor.ts` — `let hasWebsite` + `websiteBlocked` flag, three-state prompt context, env-overridable `CLAUDE_MAX_DIMENSION` default 1024.
- `src/database/migrations/20260425000000_add_website_blocked_to_audit_processes.ts` — new migration.
- `plans/04252026-no-ticket-audit-stealth-fallback-and-blocked-ux/spec.md` — full spec with revision log.
- `plans/04252026-no-ticket-audit-perf-and-stage-copy/spec.md` — perf-tightening spec.

## [0.0.28] - April 2026

### Page Editor — Stop Shortcode Pill From Leaking to Public Sites

Fixes a regression introduced in 0.0.25 where editor-only "DOCTORS BLOCK" / "SERVICES BLOCK" / "REVIEWS" pill labels were rendering on published sites (first spotted on ARCS / calm-clinic-3597). The preview pill writer and the save-path restorer were keyed to two different attribute names, so the pill wrapper was being persisted verbatim into `website_builder.pages.sections[].content` on every save. The public site renderer then served the wrapper as-is, and the post/review/menu resolver expanded the raw token that still sat inside the wrapper — resulting in the label + dashed border appearing around the real cards.

**Key Changes:**

- `renderShortcodePlaceholders` now emits `data-alloro-shortcode-original="<encoded-token>"` on the pill's outer div, matching the contract that `wrapResolved` (admin-side shortcode resolver) has always followed.
- `restoreShortcodeTokens` rewritten with `DOMParser` instead of a lazy `[\s\S]*?</div>` regex. The old regex stopped at the first `</div>`, which (a) silently no-op'd on the new pill because the attribute didn't match and (b) was already subtly broken for multi-div resolved content from `wrapResolved`. Both call paths now unwrap correctly, including nested wrapper children.
- One-shot cleanup script `scripts/debug-warmup/unpollute-shortcode-pills.ts`: pre-filters via `sections::text LIKE '%data-alloro-shortcode%'` to only fetch candidate rows, walks each section with cheerio, strips `<div data-alloro-shortcode="…">…</div>` pills via fixed-point loop (handles pill-inside-pill from repeated saves), restoring either the `data-alloro-shortcode-original` token (post-fix pills) or the raw token text in the inner div (pre-fix pills). Dry-run by default; `--apply` required to write. Forces blocking stdio so progress lines flush under piped stdout.
- One-shot applied: 12 polluted pages across 2 projects (ARCS + one other), 38 pill wrappers removed. Post-apply dry-run confirms zero remaining candidate rows.

**Commits:**

- `frontend/src/utils/templateRenderer.ts` — add `data-alloro-shortcode-original="<encoded-token>"` to the pill outer div; use a separate attribute-safe encoding that escapes `"` as `&quot;` on top of the text encoding.
- `frontend/src/utils/htmlReplacer.ts` — `restoreShortcodeTokens` rewritten to parse with `DOMParser`, query all `[data-alloro-shortcode-original]` elements, and replace each (including children) with a text node holding the decoded token. Short-circuits when the marker string is absent so non-polluted HTML pays zero cost.
- `scripts/debug-warmup/unpollute-shortcode-pills.ts` — new one-shot cleanup script.
- `plans/04232026-no-ticket-fix-shortcode-pill-leak/spec.md` — spec + risk assessment + task breakdown.

## [0.0.27] - April 2026

### Post Editor Custom Fields — Linear-Inspired Redesign

Replaces the cluttered, grid-based custom-fields panel in the post editor with an inline-edit vertical list. Each field type now has a dedicated editor component under a new `postEditor/` module; framer-motion drives add/remove/reorder transitions; `@dnd-kit` powers sortable gallery items. Click-to-edit is the default interaction on simple fields (text, textarea, number, date, select); complex items (gallery) are compact rows by default with per-item expand affordances for link/caption. Zero new npm dependencies. Desktop-only scope; backend untouched.

**Key Changes:**

- New module `frontend/src/components/Admin/postEditor/` with `types.ts`, `index.ts` barrel, three primitives (`FieldTypeIcon`, `InlineEditRow`, `BulkPasteDialog`), three hooks (`useInlineEdit`, `useClipboardRow`, `useBulkPaste`), eight field editors (text, textarea, number, date, boolean, select, media_url, gallery), a gallery item card, and the `CustomFieldsPanel` composer.
- `PostsTab.tsx` custom-fields panel (~109 lines of inline switchboard) replaced with a single `<CustomFieldsPanel />` render; state management (`formCustomFields`, `setFormCustomFields`) stays in `PostsTab` so save semantics are unchanged.
- Gallery items gain an optional `id: string` (UUID, synthesized lazily on mount) as stable key for framer-motion exits and `@dnd-kit` sort. Backwards-compatible: extra key in JSONB, ignored by the render path.
- Drag-to-reorder for gallery items via `@dnd-kit` pointer + keyboard sensors. Copy row / paste row via namespaced clipboard (`__alloro_clipboard: "gallery-item"`). Bulk-paste dialog parses newline/comma-separated URL lists into N items.
- Animation budget: 180ms enter, ease-out; exits via `AnimatePresence`. Subtle, no bounce.
- Visible focus rings on every interactive element. Full keyboard navigation inside the panel.
- `MediaPickerArrayField.tsx` deleted — gallery editing lives entirely in `postEditor/fieldEditors/GalleryFieldEditor` + `GalleryItemCard` now.
- `MediaPickerField` helper kept inline in `PostsTab.tsx` (still consumed by the Featured Image row) with a TODO to extract later.

**Commits:**

- `frontend/src/components/Admin/postEditor/` — new module (16 files)
- `frontend/src/components/Admin/PostsTab.tsx` — switchboard IIFE replaced with `<CustomFieldsPanel />`; `MediaPickerArrayField` import removed; TODO comment added above the retained `MediaPickerField` helper
- `frontend/src/components/Admin/MediaPickerArrayField.tsx` — deleted; behavior absorbed into `GalleryFieldEditor` + `GalleryItemCard`

## [0.0.26] - April 2026

### Gallery Custom-Field Type + Doctor Affiliations

Introduces the first composite custom-field type in the CMS. Posts can now store ordered arrays of image items (each with optional link, alt text, and caption), and templates can iterate them inline via a new `{{start_gallery_loop}}…{{end_gallery_loop}}` shortcode grammar with per-item `{{if item.X}}` conditionals. Ships alongside a data migration that replaces the hardcoded AAE + VDA affiliation logos on the dental SEO template's single-doctor page with the new subloop, and prefills both logos onto the 8 One Endodontics doctors so their rendered pages stay visually identical. Other practices using the same template (six projects including orthodontic and non-VA endodontic sites) now correctly render no affiliations section until the practice authors its own list per doctor, fixing a long-standing accuracy bug where AAE + VDA were showing on sites those logos did not apply to.

**Key Changes:**

- New `gallery` field type registered in the custom-field system; value shape `{ url, link?, alt, caption? }[]`
- Shortcode grammar: `{{start_gallery_loop field='X'}}…{{end_gallery_loop}}` with `{{item.url/link/alt/caption}}` and `{{if item.X}}…{{endif}}` inside the loop body
- `isConditionalValueEmpty` now treats empty arrays as empty, so `{{if post.custom.X}}` correctly hides sections when a gallery field has zero items
- Scalar `{{post.custom.<slug>}}` replacement hardened — non-primitive values return empty string instead of coercing to `[object Object]`
- New `MediaPickerArrayField` admin component (Browse Library / Upload / Paste URL + link/alt/caption + reorder/remove), modelled on the existing single-image `MediaPickerField`
- `Gallery` appears as a selectable field type in the post-type schema editor dropdown
- Cross-repo shortcode-logic sync: alloro resolver, website-builder-rebuild's `src/utils/shortcodes.ts`, and the admin-preview iframe in `PostBlocksTab.tsx` all updated in lockstep to keep HTML output byte-identical
- Data migration: adds `affiliations` gallery field to the Doctors post-type schema on the dental SEO template, rewrites the single-doctor template markup to use the subloop, prefills both logos for the 8 One Endodontics doctors; fully idempotent with a symmetric down migration

**Commits:**

- `src/controllers/admin-websites/feature-services/service.post-type-manager.ts` — `gallery` added to `VALID_FIELD_TYPES`
- `src/controllers/admin-websites/feature-services/service.post-manager.ts` — schema-aware boundary check rejects non-array gallery values on post create/update
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — new `renderGalleryLoops` + `processItemConditionals` passes, ordered before `processConditionals` in `renderPostBlock`; empty-array fix; scalar hardening; NOTE updated for three-location sync
- `src/models/website-builder/PostTypeModel.ts` — documented gallery field shape
- `src/database/migrations/20260423000001_add_affiliations_gallery_field_and_prefill_one_endo.ts` — new migration (3 linked JSONB updates with idempotency guards + symmetric down)
- `frontend/src/components/Admin/MediaPickerArrayField.tsx` — new component
- `frontend/src/components/Admin/PostsTab.tsx` — gallery branch in custom-field switchboard; import of new component
- `frontend/src/components/Admin/PostBlocksTab.tsx` — `Gallery` in `FIELD_TYPES` dropdown; admin-preview mirror of gallery-loop stripping so tokens don't leak in the iframe preview
- `website-builder-rebuild/src/utils/shortcodes.ts` (separate repo) — gallery-loop + item-conditional grammar mirror; `isEmptyField` empty-array fix; scalar hardening

## [0.0.25] - April 2026

### Website Builder — Page Editor Preview & Regenerate Fixes

Follow-up bug sweep after the progressive-preview + shortcode-marker work.
Surfaces three issues hit during real use on the ARCS and One Endodontics
projects and lands guardrails so the same silent failures can't repeat.

**Progressive preview stayed stuck on "Loading preview…":**
The `initialSrcDoc` memo in `ProgressivePagePreview.tsx` used a ref guard
that made every render after the first return `null`, which re-triggered
the loading state even once valid data had arrived. Moved the built
srcDoc into component state so it persists across renders.

**Regenerating a section wiped its body down to just the shortcode:**
`enforceShortcodeMarkers` in the post-generation HTML normalizer would
strip every non-heading/paragraph direct child of any element carrying
the `<!-- ALLORO_SHORTCODE: doctors -->` marker. Section templates
(Meet Our Team, Testimonials) place the marker at the `<section>` level
while the shortcode lives two divs deep, so the wrapper div holding the
credentials, CTA, and everything else got nuked. Normalizer now only
enforces when the shortcode token is a **direct** text child of the
marker's element — wider-scope markers are treated as documentation.

**Regenerate silently no-op'd on legacy pages:**
Pages whose `template_page_id` is null (common for projects whose v0
kept the link but later revisions dropped it) would hit
`buildComponentList(null) → []` and the worker marked the page "ready"
without doing anything. The editor saw a 200 with no toast and no
content change. Pipeline now fails loudly with `NO_TEMPLATE_PAGE` when
a single-component regen lands on an unlinked page. Broader backfill
script walks any sibling version (not just `published`) to inherit the
link — fixed 69 homepage versions for the One Endodontics project.

**Shortcode-only sections now render + overlay correctly in preview:**
Sections whose content is just `{{ post_block … }}` used to render as
raw text in the iframe, and because `tagSectionRoot` couldn't find a
root HTML element they never received the `data-alloro-section` marker
either — meaning the "Rebuilding section…" pulse + pill skipped them
during regenerate. `renderPage()` now swaps shortcode tokens for a
styled gray-bg placeholder div, which becomes the section's root and
receives both the section marker and the regenerate overlay.

**Commits:**

- `frontend/src/components/Admin/ProgressivePagePreview.tsx` — srcDoc
  held in state, not `useMemo` with a one-shot ref gate.
- `frontend/src/utils/templateRenderer.ts` —
  `renderShortcodePlaceholders` swaps `{{ post_block … }}`, `{{ review_block … }}`,
  `{{ menu … }}`, and `[post_block …]` / `[review_block …]` tokens
  with a centered placeholder before `tagSectionRoot` runs.
- `src/controllers/admin-websites/feature-utils/util.html-normalizer.ts`
  — `enforceShortcodeMarkers` checks for a **direct** shortcode text
  child before stripping siblings; skips when the marker is at a wider
  scope.
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts`
  — guard marks the page failed with `NO_TEMPLATE_PAGE` instead of
  silently flipping to ready on single-component regen against an
  unlinked page.
- `scripts/debug-warmup/fix-draft-template-link.ts` — backfill now
  inherits `template_page_id` from any sibling version at the same
  project+path, not just published.
- `scripts/debug-warmup/diagnose-one-endo.ts`,
  `scripts/debug-warmup/fix-one-endo-homepage.ts` — one-shot diagnostics
  and targeted link for the One Endodontics homepage lineage.

## [0.0.24] - April 2026

### Website Builder — Agent Accuracy, Progressive Section Reveal, Shortcode Markers, Slot LLM-Fill

Quality and UX pass landing three plan folders —
`04202026-no-ticket-agent-accuracy-fixes`,
`04202026-no-ticket-progressive-section-reveal`,
`04202026-no-ticket-template-shortcode-audit` — plus a Create Page modal
feature for on-demand LLM slot fill and a doctor-credentials fallback on
the deterministic prefill. Driven by the Coastal homepage audit: button
shape drift, fabricated doctor/service/review sections, missing shortcode
coverage, inline styles, and a build experience that scrolled the viewport
on every section completion.

**Agent accuracy — prompts + normalizer + whole-page critic:**

- **`ComponentGenerator.md` tightened** — four new contract sections:
  - **Button System (MANDATORY)** — two allowed shapes (`rounded-full` pill
    or `rounded-lg` rectangle), two variants each. Pick ONE shape per page
    and apply everywhere. Badges are `<span>`, never `<a>`.
  - **Thin/empty slot preservation** — if a template section is a thin
    wrapper with just a heading + shortcode slot / marker comment / empty
    body, customize heading/subheading only and preserve the slot verbatim.
    No more invented cards to fill empty regions.
  - **Shortcode emission fallback** — if a section is clearly about
    doctors / services / reviews but no shortcode token is present, emit
    the canonical token (`[post_block type="doctors"]` etc.) as the only
    body content. Never fill these slots with hand-written HTML.
  - **Alt-text grounding** — use the image manifest's `description` field
    verbatim for `alt` attributes. No more fabricated "Reception Desk" /
    "Treatment Bay" alts.
- **`ComponentCritic.md`** — three new checks: #10 no inline styles (fail
  `INLINE_STYLE_USED`), #11 button shape consistency within a section
  (fail `BUTTON_SHAPE_DRIFT`), #12 badge-as-anchor (fail `BADGE_AS_ANCHOR`).
- **New `util.html-normalizer.ts`** — deterministic cheerio pass between
  generator and critic: strips LLM-emitted `style="..."` attributes
  (whitelisting `<section style="background: var(...)">`), converts
  credential-pill `<a>` elements to `<span>`, normalizes mixed button
  radii to the dominant shape, and enforces `ALLORO_SHORTCODE` markers
  (strips fabricated children, injects canonical shortcode token). Wired
  in `service.generation-pipeline.ts` before each per-component critic
  call so the critic evaluates normalized output.
- **New `WholePageCritic.md` + `runWholePageCritique()`** — single LLM
  pass over the concatenated page after all components complete. Checks
  cross-section button uniformity, border-weight drift on secondary
  buttons, shortcode coverage for expected content types, no inline
  styles anywhere, no duplicate primary CTAs. Soft gate: logs issues, does
  not block publish.

**Progressive section reveal — Page Editor build experience:**

- **New `GET /:id/pages/:pageId/progressive-state`** endpoint and
  `getPageProgressiveState()` service — returns the template section
  scaffolding (name + template markup) plus whichever sections have been
  generated so far. Polling-ready; mirrors the existing page-status shape.
- **New `ProgressivePagePreview.tsx`** — single sandboxed iframe that
  renders every template section from tick zero. Pending sections show
  their template markup dimmed with a centered "Building {section}…"
  pill; completed sections swap in with a CSS fade-in, in place.
  **Viewport stays put** — no scroll-to-top on section completion. Sticky
  progress bar at the top of the preview keeps "section-gallery (9/11)"
  visible without overlaying content.
- **`PageEditor.tsx` wired** — when `isLivePreview` is true, the old
  single-iframe-plus-overlay-card is replaced by `ProgressivePagePreview`.
  When generation completes, the existing preview takes over as before.

**Template shortcode markers — 6 sections annotated:**

- **`ALLORO_SHORTCODE` convention documented** at top of
  `shortcodeResolver.service.ts` with the full type vocabulary (doctors,
  services, reviews, posts, menus, locations). The resolver itself never
  reads the marker — it's advisory metadata for the ComponentGenerator +
  normalizer.
- **New `scripts/debug-warmup/audit-template-shortcodes.ts`** — scans
  every `templates` + `template_pages` row, reports regions that look
  like they should be owned by a shortcode but aren't marked. Heuristic
  based on heading keywords + structural thinness; output is reviewable,
  never auto-applies.
- **New `scripts/debug-warmup/apply-template-markers.ts`** — one-off
  write script for the 5 accepted candidates. Dry-run by default,
  `--apply` writes. Idempotent — re-run is a no-op.
- **6 sections marked in the DB** across both active templates:
  - Alloro Dental (2d325d15): `section-meet-our-team` → doctors,
    `section-testimonials` → reviews, `section-location-services` → services
  - Alloro SaaS (4c8da173): `section-google-reviews` → reviews,
    `section-testimonials` → reviews, `section-testimonials-grid` → reviews

**Create Page modal — on-demand LLM slot fill + smarter prefill:**

- **"Rewrite all from identity" button** in the Create Page modal's
  Section Content header. Single click triggers one Sonnet call over all
  text-type slots using the full identity context (voice, locations,
  doctors, services), replies with concrete text for every slot, and
  populates the form inline so the admin can review/edit before
  Continue. URL slots skipped. Replaces the older "Generate all empty"
  sentinel-flip button — admin now sees materialized text, not a "you'll
  see it after the page is built" surprise.
- **New `service.slot-generator.ts`** — reuses
  `buildStableIdentityContext()` so multi-location rules + doctor roster
  - service blurbs all land in the prompt. Response values are key-allow-
    listed against the template_page's slot definitions so the LLM can't
    inject extra keys. Returns 409 when identity isn't ready, 400 on
    missing `templatePageId`.
- **New `POST /:id/slot-generate`** endpoint and
  `generateSlotValues()` controller handler + `generateSlotValues` API
  client in `frontend/src/api/websites.ts`.
- **Deterministic prefill gains a fallback** —
  `certifications_credentials` now falls back to a deduped union of
  `doctors[].credentials` when `content_essentials.certifications` is
  empty. For Coastal, the previously-empty "Certifications & Credentials"
  slot now auto-fills with DDS / Diplomate ABE / Board Certified
  Endodontist / etc. Helper `uniqueDoctorCredentials()` (case-insensitive
  dedup, skips stale doctors).

**Coastal homepage audit findings (concrete):** button shapes mixed
`rounded-full` with `rounded-lg` in the Specialists section, the whole
Specialists block was hand-rolled with no `alloro-tpl-v1-release-*` class
namespace, doctor roster never rendered (comment stub, no shortcode
emitted), services section was heading-only, footer columns empty, alt
text invented. All six root causes are addressed by the prompt contract
changes + normalizer + shortcode markers above.

**Commits:**

- `feat(website-builder): agent accuracy + progressive reveal + shortcode markers`

## [0.0.23] - April 2026

### Website Builder — Identity Rebuild, Warmup Quality, Multi-Location + Doctor Enrichment

A multi-plan arc hardening the website-builder identity pipeline end to end.
Three plan folders landed together in one shippable slice —
`04192026-no-ticket-warmup-quality-fixes`,
`04192026-no-ticket-warmup-autodiscover-and-distill-tuning`,
`04202026-no-ticket-identity-modal-cleanup-and-crud` — plus post-audit
refinements around multi-location rendering, doctor / service prompt
enrichment, and content-hash image dedup.

**Warmup — Quality Fixes:**

- **Prefill 400 across 5 callers** — `claude-sonnet-4-6` silently dropped
  assistant-prefill support. `classifyArchetype`, `distillContent`, image
  vision analysis, and two other callers were failing with 400 and falling
  back to defaults. Removed `prefill: "{"` everywhere; added a strip+warn
  guardrail in `runAgent` so future callers can't re-break it.
- **URL normalization** — GBP-returned `http://example.com/` was getting
  blocked by Chromium. Added `normalizeScrapeUrl()` with fallback-once
  retry (http → https + www).
- **Clean-before-cap** — `MAX_SOURCE_CHARS` was applied to raw HTML before
  cleaning, leaving ~3-5k of usable text out of 50k scaffolding. Swapped
  to clean first, then cap. Raised cap to 100k. Distillation slice bumped
  8k → 15k.
- **Browser scrape lazy-image capture** — 5s flat wait missed
  IntersectionObserver loaders. Added `autoScroll` helper, absolutize
  relative URLs, bumped timeout to 25s.

**Warmup — Auto-Discover + Distillation Tuning:**

- **Auto-discover sub-pages** — homepage scrape emits a `discovered_pages`
  list (doctor pages, contact, practice pages); distillation uses them to
  populate per-doctor credentials and per-service blurbs not visible from
  the homepage alone.
- **Distillation prompt tightened** — `IdentityDistiller.md` stops emitting
  empty `certifications[]` when nothing was found, and populates
  `doctors[i].credentials[]` per-doctor rather than a single catch-all list.

**Identity Modal — Rebuild:**

- **Monaco JSON editor** replaces the raw textarea on the JSON tab.
  Lazy-loaded via `React.lazy` + `Suspense`. Validation-gated save.
- **Slice PATCH endpoint** — `PATCH /:id/identity/slice` with Zod validators
  per slice and a 13-path allow-list (`content_essentials.*`, `locations`,
  `brand`, `voice_and_tone`). `brand` and `voice_and_tone` remain
  permissive-shaped.
- **Doctors / Services CRUD with merge semantics** — add + per-row edit
  with placeholder = current value, empty = no change, null = clear.
  Stamps `last_synced_at` on every edit.
- **Slide-up source editor** — bottom sheet panel matching the
  LeadgenSubmissionDetail pattern (70vh, rounded-t-2xl). Wired to the
  Doctors + Services tabs so admins can edit the raw source behind any row
  inline.
- **New Images tab** — renders `extracted_assets.images[]` with
  description, use_case, and S3 URL. Logo thumbnail surfaced.
- **Re-run warmup "Keep sources" dialog** — three-button replacement for
  the native `confirm()`: Keep / Replace / Cancel. Prevents accidental
  destruction of manually-edited identity data.
- **Chat Update tab removed (wire-rip)** — deleted
  `service.identity-proposer.ts`, `IdentityProposer.md`, both handlers,
  routes, imports, and all frontend plumbing.

**Media Backfill:**

- **New migration `20260420000001_add_unique_project_s3url_to_media.ts`** —
  unique partial index on `(project_id, s3_url) WHERE s3_url IS NOT NULL`
  so repeat warmups + backfill are idempotent via ON CONFLICT DO NOTHING.
- **New migration `20260420000002_backfill_media_from_identity_images.ts`** —
  streams projects, inserts `website_builder.media` rows from each
  project's `project_identity.extracted_assets.images[]`, `.onConflict`
  ignored.
- **`util.image-processor.ts`** — warmup image pipeline now mirrors every
  analyzed image into the `media` table as a fire-and-forget insert so the
  Media Browser picks up warmup-captured photos. Insert failure is
  non-fatal and logged.

**Layouts Tab — Modal Extraction:**

- **New `LayoutInputsModal.tsx`** — mirrors the IdentityModal shell (fixed
  inset, max-w-3xl, 75vh body). Houses slot inputs + generate / regenerate
  / cancel. The Layouts tab now shows a compact summary card + single
  button to open the modal, letting "Edit Layouts Directly" sit right
  under without a wall of inputs pushing it off-screen.

**Prompt Enrichment — Multi-Location, Doctors, Services:**

- **Multi-location** — `util.identity-context.ts` emits a
  `## LOCATIONS (N total)` block in stable context whenever >1 active
  location exists, listing each as `Name — City, ST (primary)`. Footer
  components also get a full list with phone per row. About / story /
  values components get a plural-framing nudge. Hero / upgrade / wrapper
  components get city-list context with CTA guidance. Prompts explicitly
  forbid hyperlinks to `/location/<slug>` until the public route lands
  (deferred follow-up).
- **Doctor roster** — stable context emits credentials verbatim
  (`— DDS, Diplomate ABE, Board Certified`) with the short blurb indented.
  Component-specific block for doctor / team / meet / staff / provider
  components includes the full roster + guidance to match photos by
  description ("name embroidered on scrubs").
- **Service blurbs** — stable context + service / treatment / procedure
  component blocks include `services[].short_blurb` with an
  anti-hallucination guardrail ("don't invent services not listed").

**Image Dedup:**

- **Content-hash dedup in `util.image-processor.ts`** — SHA-1 of the
  downloaded buffer; byte-identical images served from CDN + origin
  (WordPress' `tdosites.com` vs `www.*.com` pattern) upload + analyze
  once. Logs dedup count. Prior warmups still have dupes in
  `extracted_assets.images[]`; re-run warmup to clear.

**One-off Ops (Coastal project):**

- **Template assignment** — project was created without the confirm flow
  so `template_id` was NULL and the Layouts tab had nothing to render.
  Assigned Alloro Dental Template via
  `scripts/debug-warmup/assign-coastal-template.ts`.
- **Media backfill** — 58 identity images backfilled into
  `website_builder.media` via
  `scripts/debug-warmup/backfill-coastal-media.ts` (idempotent per-row
  existence check, works without the unique index migration applied).

**Debug Scripts:**

- New `scripts/debug-warmup/` with: `inspect-identity`, `inspect-images`,
  `inspect-template`, `list-templates`, `e2e-pipeline`,
  `repro-distill-prod`, `test-url-normalize`, `test-autodiscover`,
  `check-cost-events`, `find-project`, `backfill-coastal-media`,
  `assign-coastal-template`.

**Commits:**

- `feat(website-builder): identity rebuild + warmup quality + prompt enrichment`

## [0.0.22] - April 2026

### Leadgen Audit Retry — Public Endpoint, Admin Rerun, 3-Retry Cap

Adds a self-service retry path for failed leadgen audits (public endpoint
hit by the FAB "Try again" button on the leadgen tool) and an admin
rerun override in the Leadgen Submissions detail drawer. Both reuse the
SAME `audit_id`, preserving session → audit continuity in the admin
timeline — no more orphaned failed rows with brand-new retry rows alongside.

**Key Changes:**

- **New migration `20260418000000_add_retry_count_to_audit_processes.ts`** —
  adds `retry_count INTEGER NOT NULL DEFAULT 0` to `audit_processes`. The
  column is read as part of a row-scoped UPDATE; no index needed.
- **New shared service `service.audit-retry.ts`** with
  `retryAuditById(auditId, options)`. A single atomic UPDATE
  (`WHERE id=:id AND status='failed' AND retry_count < 3`) resets the row
  and increments the counter in one shot, so two concurrent retries
  cannot both slip past the cap. Never throws to the caller. Admin
  callers pass `{skipLimit:true, countsTowardLimit:false}` to bypass the
  cap without touching the user's retry budget.
- **New public endpoint `POST /api/audit/:auditId/retry`**, gated by the
  existing `X-Leadgen-Key` shared secret (non-silent 401 variant — this
  is fetch, not beacon). Returns 200 `{ok:true, audit_id, retry_count}`
  on success, 404 when the audit is missing, 409 when not in failed
  state, and **429** `{error:"limit_exceeded", retry_count, max_retries}`
  on the 4th attempt. Re-enqueues the same BullMQ job shape as the
  original kickoff in `auditWorkflowService.ts`.
- **New admin endpoint `POST /api/admin/leadgen-submissions/:id/rerun`** —
  JWT + super-admin gated. Resolves the submission's `audit_id`, calls
  the shared service with the admin bypass flags. Logs the admin email +
  user id on every rerun for auditability.
- **Admin detail drawer gains a "Rerun" button** (only visible when
  `audit.status === 'failed'`). Click → confirm modal → hits the admin
  endpoint → optimistically flips local status to "pending" so the UI
  reflects the change before the next live-poll tick. Inline notice
  banner surfaces success ("Rerun queued") or error messages.
- **`retry_count` surfaced in the AuditPayloadBar** — `Retries: N/3`
  badge next to the status pill so admins can see how many times the
  user already tried before escalating.
- **Frontend types updated** — `AuditProcess.retry_count: number` added
  and `audit_retried` added to the `LeadgenCtaEvent` union (enriches
  timelines without advancing `final_stage`).
- Request handler added to `audit.ts` wraps ONLY the new `/retry` route
  with the tracking-key gate so the existing `/start`, `/:auditId`,
  `/:auditId/status`, and `PATCH /:auditId` routes remain unchanged.

**Commits:**

- `feat(leadgen): audit retry endpoint + admin rerun + 3-retry cap`

## [0.0.21] - April 2026

### Identity Enrichments + Multi-Location + Post Imports

Closes the gap between "what we know about the practice" and "content we
publish about them." Identity now captures hours, doctors, services, and
multiple locations. Posts tab imports from identity in one click (fetch
pages, download images to S3, create draft rows). Also lands the
canonical `/contact` CTA rule and a simplified 3-step setup checklist on
the website detail page.

**Key Changes:**

- **Multi-location support** — `identity.locations[]` top-level array
  populated by scraping every `project.selected_place_ids[]` entry
  (concurrency 3). `identity.business` stays as a pointer to the
  designated primary (`project.primary_place_id`) so every existing
  consumer keeps working unchanged. Scrape failures on individual
  locations write `warmup_status: "failed"` + `stale: true` entries
  instead of tanking the whole warmup.
- **Locations tab in Identity modal** — list view with primary badge,
  address/phone/hours, per-row re-sync, set-as-primary, and remove
  actions. Add Location opens a modal that reuses the existing
  `GbpSearchPicker`. Primary removal is blocked; set-as-primary warns
  that affected pages should be regenerated.
- **Doctor + service lightweight lists** — extracted during the
  existing warmup distillation pass. `{name, source_url,
short_blurb, last_synced_at, stale?}` only, no images, no full
  content. Capped at 100 entries per list; 400-char blurbs;
  `source_url` must match a real discovered page.
- **Doctors / Services tabs** — same list view with per-row
  timestamps, stale badges, and a Re-sync button that re-runs
  extraction against cached `discovered_pages` without re-scraping.
- **Hours rendered in Summary** — normalizes three GBP shapes
  (array-of-strings, `weekdayDescriptions[]`, `periods[]` object)
  into a Mon–Sun table. "Not provided" row when missing.
- **Import from Identity** — new toolbar button on Posts tab for
  `doctor`, `service`, and `location` post types. Modal shows
  checkbox-selectable entries; already-imported rows flip to
  "Overwrite" toggles. Import fires a `wb-post-import` BullMQ job:
  doctors/services run the existing URL-scrape strategy stack
  (fetch → browser → screenshot), extract main content, download
  the first meaningful image to S3, insert a post row.
  Locations build content from structured GBP data without
  scraping. Partial unique index on
  `(project_id, post_type_id, source_url)` enforces dedup.
- **Canonical `/contact` CTA rule** — prompt rule in
  `ComponentGenerator.md` + `LayoutGenerator.md` plus a new
  `checkCtaPaths` validator that flags CTA-shaped elements pointing
  outside `/contact`, `tel:`, `mailto:`, or matching same-page
  anchors. Absolute URLs pass through for external booking portals.
- **Simpler 3-step setup UI** — replaced the onboarding-wizard style
  card rows on `WebsiteDetail` with a compact admin checklist
  (checkbox · title · inline action link). Locked rows dim; running
  shows a small spinner; completed shows a green check.

**Commits:**

- `src/database/migrations/20260418000002_add_multi_location_to_projects.ts` —
  adds `selected_place_ids TEXT[]` + `primary_place_id TEXT` on
  `website_builder.projects`; backfills from the existing
  `selected_place_id`.
- `src/database/migrations/20260418000003_add_source_url_to_posts.ts` —
  adds `posts.source_url TEXT` + partial unique index for import
  dedup.
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` —
  `buildLocationsArray` + `runWithConcurrency` helpers; primary
  reuses its already-fetched GBP data, additional place_ids run
  through `scrapeGbp` with concurrency 3; distillation now emits
  `doctors[]`/`services[]` with URL allow-listing against
  `discovered_pages`.
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts` —
  `ProjectIdentity.locations[]`, `content_essentials.doctors[]`,
  `content_essentials.services[]`. `buildStableIdentityContext`
  lists doctor/service names under CONTENT ESSENTIALS; does NOT
  iterate locations (prompts still read `business`).
- `src/controllers/admin-websites/AdminWebsitesController.ts` —
  6 new handlers: `resyncIdentityList`, `addProjectLocation`,
  `setPrimaryLocation`, `removeProjectLocation`,
  `resyncProjectLocation`, `startPostImport`, `getPostImportStatus`.
- `src/controllers/admin-websites/feature-services/service.post-importer.ts` —
  `importFromIdentity(projectId, {postType, entries, overwrite})`
  branches on `location` vs doctor/service; reuses existing
  `scrapeUrl` fallback strategy, `uploadToS3`, and `buildMediaS3Key`.
  15 MB image cap with `content-type: image/*` guard.
- `src/workers/processors/postImporter.processor.ts` +
  `src/workers/worker.ts` — `wb-post-import` BullMQ worker;
  concurrency 1, 10-min lock; progress via
  `job.updateProgress({total, completed, results[]})`.
- `src/agents/websiteAgents/builder/IdentityDistiller.md` — extended
  output schema + hard rules for the new doctor/service lists.
- `src/agents/websiteAgents/builder/{ComponentGenerator,LayoutGenerator}.md` —
  CTA canonical-path rule.
- `src/utils/website-utils/htmlValidator.ts` — `checkCtaPaths`
  function; flags off-pattern CTAs with per-offender detail.
- `frontend/src/components/Admin/IdentityModal.tsx` — three new
  tabs (Doctors, Services, Locations); hours rendering; pulls in
  `AddLocationModal` + `useConfirm` for primary-switch and removal.
- `frontend/src/components/Admin/AddLocationModal.tsx` — thin
  wrapper around `GbpSearchPicker` for the Locations tab Add flow.
- `frontend/src/components/Admin/ImportFromIdentityModal.tsx` —
  checkbox list, "Already imported → Overwrite" rows, live progress
  polling against the BullMQ job, per-row results with Retry.
- `frontend/src/components/Admin/PostsTab.tsx` — "Import from
  Identity" toolbar button on doctor/service/location post types.
- `frontend/src/pages/admin/WebsiteDetail.tsx` — simplified setup
  checklist; earlier placeId-required, wizard, and Preview/Stop/
  Delete actions from 0.0.20 remain in place.
- `frontend/src/api/websites.ts` + `posts.ts` —
  `resyncProjectIdentityList`, `addProjectLocation`,
  `setPrimaryLocation`, `removeProjectLocation`,
  `resyncProjectLocation`, `startPostImport`,
  `fetchPostImportStatus`, and the corresponding types.

## [0.0.20] - April 2026

### Website Builder — Costs Tab, Quality Hardening, Skip Fix, Rebuild UX

Rolls up two coherent improvement bundles for the AI website builder:
(a) a **Costs tab** per project that logs every Anthropic call with
model, tokens, and frozen USD estimate; (b) a quality/UX pass that fixes
the broken "Skip section" behavior, stops em-dash tells, forces serif
headings globally, tightens template structural fidelity, adds mandatory
contrast pairings, and finally gives the per-section rebuild a real
pulsing overlay + toast. Also folds in the page-creation wizard refactor,
URL scrape-blocked detection, and the per-page Preview/Stop/Delete
actions that shipped earlier in the same thread.

**Key Changes:**

- **Costs tab** — new `website_builder.ai_cost_events` table (frozen
  `estimated_cost_usd` at write time, nested tool-call roll-ups via
  `parent_event_id`). Cost capture is fire-and-forget: the pipeline
  never fails because a cost row failed to write. Wired into nine
  Anthropic call sites: warmup, page-generate, section-regenerate,
  layouts-build, identity-propose, seo-generation, editor-chat,
  ai-command, minds-chat, plus the `critic` pass and nested
  `select-image` tool turns.
- **Costs UI** — header shows total USD + per-bucket token breakdown
  (input / output / cache write / cache read). Event list with
  expandable metadata JSON. Auto-refreshes when any generation
  transitions from active to idle.
- **Skip slot actually skips** — `__skip__` used to be advisory; the
  AI regularly ignored it. Now: `stripSkippedSlotGroups()` pre-strips
  tied subtrees via a `SLOT_TO_SECTION_KEYWORDS` map (cheerio-based,
  `data-slot-group` annotations win when present). If every slot in
  a component is skipped, the pipeline short-circuits and saves an
  LLM call. The critic also hard-rejects `SKIPPED_SLOT_LEAKED`.
- **Em-dash ban** — `ComponentGenerator`, `LayoutGenerator`, and
  `ComponentCritic` prompts all forbid em-dashes and en-dashes.
  `htmlValidator.checkProseStyle` scans visible text (not shortcodes)
  and flags every `—` / `–`.
- **Serif headings** — wrapper `<style>` injection forces `h1`–`h6`
  to a serif stack globally. Component prompt tells the generator
  not to add `font-sans` to headings.
- **Structural fidelity** — critic rejects output that changes the
  number of top-level children under the root `<section>` by more
  than one. Validator flags outputs with more than one `<section>`.
- **Contrast pairing** — explicit allow-list in the prompts. Validator
  flags `text-white` on light backgrounds and `text-gray-7/8/900` on
  dark backgrounds per class attribute.
- **Section rebuild UX** — `PageEditor` tracks
  `regeneratingSectionNames` and injects `opacity-50 animate-pulse
pointer-events-none` + a "Rebuilding section…" overlay into the
  iframe `srcDoc` for the target section. On content change detected
  by the existing live-preview poll: overlay clears, toast fires via
  existing `showSuccessToast`, section scrolls into view.
- **Per-page actions during generation** — in the Pages list, a row
  in `generating` state now shows Preview / Stop / Delete buttons.
  Preview opens the editor where sections stream in live; Stop
  cancels the project's generation; Delete removes the page entirely.
- **Page creation wizard** — template mode is now a 3-step wizard
  (Page → Style → Content) with progress indicator, Back/Continue
  footer, and the new `TemplatePageSelect` searchable combobox
  replacing the scrolling button list.
- **Slot UX enhancements** — each slot gets per-row **Generate** and
  **Skip** action buttons. URL-type slots get a **Test** button that
  probes for WAF / Cloudflare / anti-bot blocks and reports a clear
  verdict before generation spends cycles.
- **`placeId` requirement relaxed** — pipeline only requires `placeId`
  when the project has no cached `project_identity` or `step_gbp_scrape`.
  Existing projects with warmup data no longer error on page create.

**Commits:**

- `src/database/migrations/20260418000001_create_ai_cost_events.ts` —
  new per-LLM-call table with project FK, vendor, model, token
  breakdown, frozen USD, optional `metadata` JSONB, and
  `parent_event_id` self-reference.
- `src/services/ai-cost/service.ai-cost.ts` +
  `src/services/ai-cost/pricing.ts` — hardcoded Anthropic pricing
  map (Sonnet/Opus/Haiku 4.x), `estimateCost()`, `logAiCostEvent()`,
  `safeLogAiCostEvent()` (never-throws).
- `src/agents/service.llm-runner.ts` — `CostContext` option on
  `runAgent()` and `runWithTools()`; returns `costEventId` for
  nested tool-call threading.
- `src/agents/websiteAgents/builder/{ComponentGenerator,LayoutGenerator,ComponentCritic}.md` —
  em-dash ban, serif rule, structural fidelity, contrast pairings,
  skip-slot enforcement.
- `src/utils/website-utils/htmlValidator.ts` — `checkProseStyle`,
  `checkContrastPairs`, and multi-section detection added to the
  validator loop.
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts` —
  `stripSkippedSlotGroups()` + `SLOT_TO_SECTION_KEYWORDS` map,
  automatically applied inside `buildComponentContext`.
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` —
  short-circuit when `ctx.skipGeneration` is true; cost-context
  wiring; `section-regenerate` vs `page-generate` event differentiation.
- `src/controllers/admin-websites/feature-services/service.{identity-warmup,layouts-pipeline,identity-proposer,seo-generation,page-editor,ai-command}.ts` —
  cost-context threading at every call site.
- `src/controllers/admin-websites/AdminWebsitesController.ts` —
  `getProjectCosts` handler; `placeId` requirement relaxed when
  identity cache exists.
- `src/routes/admin/websites.ts` — `GET /:projectId/costs` route.
- `src/controllers/minds/feature-services/service.minds-chat.ts` —
  cost logging for non-streaming and streaming paths.
- `src/workers/processors/seoBulkGenerate.processor.ts` — threads
  `projectId` + `entity.id` so bulk SEO runs attribute costs correctly.
- `src/utils/website-utils/{aiCommandService,pageEditorService}.ts` —
  direct SDK calls instrumented via internal helpers.
- `frontend/src/components/Admin/CostsTab.tsx` — total card,
  tokens pills, scrollable event list with expandable metadata.
- `frontend/src/components/Admin/CreatePageModal.tsx` — 3-step
  wizard refactor, integrates `TemplatePageSelect`.
- `frontend/src/components/Admin/TemplatePageSelect.tsx` — new
  searchable combobox for template pages.
- `frontend/src/components/Admin/DynamicSlotInputs.tsx` — per-slot
  Generate/Skip actions, URL slot Test button with block detection.
- `frontend/src/components/Admin/RegenerateComponentModal.tsx` —
  passes section name to `onRegenerated`.
- `frontend/src/pages/admin/PageEditor.tsx` — pulse/overlay injection,
  content-change detection via snapshot map, toast + scroll on
  completion.
- `frontend/src/pages/admin/WebsiteDetail.tsx` — Costs tab mount,
  Preview/Stop/Delete row actions during generation.
- `frontend/src/api/websites.ts` — `fetchProjectCosts()`,
  `AiCostEvent` / `ProjectCostsResponse` types; `placeId` made
  optional on `StartPipelineRequest`.

## [0.0.19] - April 2026

### Live Admin Leadgen — Polling + Multi-Select Bulk Delete

Makes the admin leadgen submissions page feel live: detail drawer polls
for updates while open, list refreshes every 5s, pulsing indicator shows
active fetches, and admins can now multi-select rows for bulk delete
without clicking the row delete button one at a time.

**Key Changes:**

- Detail drawer — **request-after-response polling** with a 500ms gap
  between ticks. Pauses when the browser tab is hidden (admin switches
  away), resumes seamlessly on visible. Initial fetch surfaces errors;
  subsequent tick failures log and retry next tick (no flashing red
  banner over a rendered drawer).
- **`LiveIndicator`** in drawer header — static green dot between ticks,
  pulses (expanding ring animation) during the in-flight request.
  Label: "LIVE TRACKING".
- **`onDetailUpdate` callback** — every fresh detail snapshot merges
  back into the matching list row, so `final_stage` / `last_seen_at`
  stay in sync on the list without a full re-fetch.
- **Animated event timeline** — `AnimatePresence` + `layout` on event
  items so new events fade/slide in; stage pill remounts on
  `final_stage` change and plays a scale + green ring flash.
- Table — multi-select: header checkbox (indeterminate when partial),
  per-row checkbox with click-propagation stopped. Active-drawer row
  highlighted in brand orange tint; selected rows in blue tint.
- New `LeadgenBulkActionBar` — floating bottom card with count badge,
  Clear, and "Delete N sessions" CTA. Confirm modal reuses the existing
  `useConfirm` pattern. Slides up/down via framer-motion.
- Page — **5s list polling** while the Submissions tab is visible;
  pauses on hidden, refreshes immediately on visible.
- Backend — new `POST /api/admin/leadgen-submissions/bulk-delete` with
  `{ ids: [] }`. Caps at 500 ids/request, UUID-validates every id, cascades
  via existing FK `ON DELETE CASCADE`. Returns `{ deleted: number }`.

**Commits:**

- `feat(admin): live leadgen polling + multi-select bulk delete`

## [0.0.18] - April 2026

### Mobile Responsive Refactor — Client-Facing Pages

Standardized the Tailwind class vocabulary across the post-login client
app so onboarding, settings, billing, and the new-account-setup flow
render cleanly on iPhone 16 (393px) instead of overflowing horizontally
with desktop-sized headlines and padding. Establishes a canonical
responsive doc that future devs (and DesignSystem additions) must follow.

**Key Changes:**

- New `frontend/docs/responsive-vocabulary.md` — the canonical class-ladder
  table for typography, padding, card max-widths, and layout direction.
  Linked from the top of `DesignSystem.tsx`. Acts as the convention
  enforced at PR review time.
- `DesignSystem.tsx` — `MetricCard` now uses `p-4 sm:p-5 lg:p-6` and
  `text-2xl sm:text-3xl` value scaling; `PageHeader` has responsive
  padding ladder and shrinks the avatar/icon on narrow screens. Header
  comment enforces responsive-by-default for all primitives.
- Onboarding wizard (`OnboardingContainer`, `Step0`–`Step3` files):
  card padding ladders, `text-xl sm:text-2xl lg:text-3xl` headlines,
  `w-full max-w-md` ordering rule applied to all card-like containers.
- `Step3_PlanChooser`: plan card now scales `w-full max-w-md sm:max-w-lg`
  and price uses `text-2xl sm:text-3xl lg:text-4xl` ladder.
- `NewAccountOnboarding`: headline `text-2xl sm:text-3xl lg:text-4xl`;
  all four step cards use the standard padding ladder; title + REQUIRED
  badge container stacks `flex-col sm:flex-row` so the badge wraps
  below the title on narrow screens.
- `Settings.tsx`: page padding `px-4 sm:px-6 md:px-8 lg:px-10`; tab bar
  gains `overflow-x-auto` so 4 tabs scroll horizontally at 393px instead
  of clipping; headline scales smoothly through every breakpoint.
- `BillingTab.tsx`: card padding ladders applied to every state
  (skeleton / locked / cancelled / active / subscribe-CTA / invoice
  history); plan card matches `Step3_PlanChooser` aesthetic; feature
  grid stacks `grid-cols-1 sm:grid-cols-2` on mobile.

**Commits:**

- `feat(frontend): mobile responsive refactor — client-facing pages + standardized vocabulary`

## [0.0.17] - April 2026

### Account-Link Gap Fix + LocalStorage Session Persistence

Fixes the silent failure of the `account_created` funnel step. Two
compounding bugs were preventing every prod signup from being credited
as a conversion in the leadgen funnel.

**Key Changes:**

- **`linkAccountCreation` now wired into `AuthPasswordController.verifyEmail`** —
  the actual prod signup path. Was previously only in `AuthOtpController`,
  which the public signup flow doesn't go through. Reads optional
  `leadgen_session_id` from request body, validates UUID, fires
  fire-and-forget after `setEmailVerified`.
- **Diagnostic log when `linkAccountCreation` finds zero candidates** —
  `[LeadgenAccountLinking] no candidate sessions { email, sessionId, userId }`.
  No more silent failures masking real bugs.
- **New `POST /api/leadgen/email-paywall` endpoint** — server-authoritative
  event recording for the in-tab paywall submit. Patches `session.email`,
  advances `final_stage`, idempotently writes `email_gate_shown` +
  `email_submitted` events. No queue, no n8n send (paywall flow already
  sends client-side).
- `recordServerSideEvent` helper now accepts a `source` param so paywall
  vs FAB events are distinguishable in `event_data.source` for admin.
- `Signup.tsx` captures `?ls=<uuid>` from the URL on mount and persists
  to localStorage so the value survives the redirect to `/verify-email`
  AND the time the user spends checking their inbox for the OTP code.
- `VerifyEmail.tsx` reads the persisted leadgen session id (URL fallback)
  and forwards it to `verifyEmail()`. Cleared on success — single-use,
  doesn't leak into a different account later.
- `api/auth-password.ts:verifyEmail` accepts an optional `leadgenSessionId`
  arg, includes it in the POST body when provided.

**Commits:**

- `fix: account-link hook + ?ls= forwarding + paywall server-authoritative endpoint`

## [0.0.16] - April 2026

### Leadgen "Email Me When Ready" FAB — Server-Driven Send-on-Complete

Adds the backend half of the floating "Email me when ready" button that
appears in the leadgen tool when an audit takes longer than 1:20 (or
errors). The leadgen-tool client posts the email to a new public endpoint
which queues it; when the audit worker finishes (or fails), the queue is
drained and the report email goes out via the existing n8n webhook —
durable, server-driven, doesn't depend on the user's tab staying open.

**Key Changes:**

- New `leadgen_email_notifications` queue table with cascade FKs to
  `leadgen_sessions` and `audit_processes`. Unique on
  `(session_id, audit_id)` so re-submissions upsert (latest email wins,
  but never overwrites a row already marked `sent`).
- New `POST /api/leadgen/email-notify` — UUID-validated, gated by the
  existing `X-Leadgen-Key`. Server-authoritatively writes
  `email_gate_shown` + `email_submitted` events to `leadgen_events` so
  the funnel reflects FAB submissions even when the JS `trackEvent` call
  doesn't land. Patches `leadgen_sessions.email` (write-once) and
  promotes `final_stage`.
- `enqueueEmailNotification` checks `audit_processes.status` — if the
  audit is already complete or failed, the report email is sent inline
  (closes the race where the FAB submit and audit completion land
  within the same second).
- Audit worker now drains the queue at `realtime_status=5` AND inside
  the failure catch block, so users who tapped the FAB still get their
  report whether the pipeline succeeds or errors out.
- Backend mirrors the leadgen-tool's email HTML in
  `service.n8n-email-sender.ts` so the worker can POST the same body
  shape as the client. New `N8N_EMAIL_URL` env var (same value as the
  leadgen-tool's `VITE_N8N_EMAIL_URL`).

**Commits:**

- `feat: leadgen email-notify FAB queue + audit-complete worker drain`

## [0.0.15] - April 2026

### Identifier Migrated to SDK; Copy Companion, Guardian, Governance Disabled

Phase 2 of the n8n exit. The Identifier agent — the last n8n dependency inside the practice ranking pipeline — now calls Claude directly through the existing `runAgent` + `loadPrompt` plumbing. Three other n8n-backed agents (Copy Companion, Guardian, Governance) are reversibly disabled because we may want to restore them later: routes are commented out in `agentsV2.ts`, the "Run Guardian & Governance" button is removed from the admin AI Data Insights page, and all code stays in place behind `DISABLED 2026-04-12` markers.

**Key Changes:**

_Identifier agent off n8n_

- New prompt at `src/agents/rankingAgents/Identifier.md` — first file in a new prompt subdirectory parallel to `dailyAgents`, `monthlyAgents`, `pmAgents`, `pmsAgents`, `websiteAgents`. Holds the system prompt for the practice specialty / market location extractor.
- `identifyLocationMeta()` in `service.webhook-orchestrator.ts` no longer calls `IDENTIFIER_AGENT_WEBHOOK` via axios. It loads the prompt and calls `runAgent` directly. Same function signature, same `{specialty, marketLocation}` return shape — no consumer changes needed in `service.ranking-executor.ts` or `service.places-competitor-discovery.ts`.
- Fallback path is preserved: `getFallbackMeta(gbpData)` still runs on SDK error or unparseable output, returning hardcoded `"orthodontist"` plus city/state extracted from the GBP storefront address.
- The new prompt also produces `specialtyKeywords[]`, `city`, `state`, `county`, and `postalCode`. Path A migration: these new fields are ignored for now to keep the migration parity-only; wiring them into competitor discovery and geographic filtering is a separate follow-up.
- The `IDENTIFIER_AGENT_WEBHOOK` env var constant stays exported at module level so the code path is restorable if we ever want the n8n route back.

_Copy Companion, Guardian, Governance disabled (reversible)_

- `POST /api/agents/gbp-optimizer-run` and `POST /api/agents/guardian-governance-agents-run` route registrations commented out in `agentsV2.ts` with a dated `DISABLED` marker. JSDoc endpoint list updated to flag both routes as disabled. Controllers and downstream services (`runGbpOptimizer`, `runGuardianGovernance`, `service.governance-validator.ts`, etc.) are untouched and remain exported.
- The `COPY_COMPANION_AGENT_WEBHOOK`, `GUARDIAN_AGENT_WEBHOOK`, and `GOVERNANCE_AGENT_WEBHOOK` env var constants stay exported for restoration.
- Admin AI Data Insights page (`AIDataInsightsList.tsx`): "Run Guardian & Governance" `ActionButton`, the `handleRunAgents` handler, and the `renderProgressBar` helper are commented out with the same `DISABLED` marker. Both `<AnimatePresence>{renderProgressBar()}</AnimatePresence>` JSX call sites are commented in place. The empty-state copy is rewritten to neutral text — `"No agent insights available for this month yet."` — so users aren't told to click a button that no longer exists.
- `setIsRunning` is dropped from the destructure because nothing references the setter anymore (only the getter `isRunning` is still read, by the Clear button). Restoration requires uncommenting `handleRunAgents` and adding `setIsRunning` back to the destructure.
- Two now-unused imports trimmed to keep the build clean: `Play` from `lucide-react` and `AnimatePresence` from `framer-motion`. Both are referenced only inside the commented-out JSX and need re-importing on restore.

_Goal achieved_

- After this entry, every performing agent (Proofline, Summary, Opportunity, CRO, Referral Engine, Practice Ranking, Identifier) runs through the in-repo `runAgent` Claude SDK pipeline. No performing agent depends on n8n. The three disabled agents are inactive and can be restored — or fully retired in a future cleanup pass — without rushing.

**Commits:**

- `src/routes/agentsV2.ts` — comment out `gbp-optimizer-run` and `guardian-governance-agents-run` route registrations with `DISABLED` marker; mark both endpoints disabled in the JSDoc endpoint list
- `src/controllers/agents/feature-services/service.webhook-orchestrator.ts` — replace the `identifyLocationMeta()` axios webhook call with `runAgent` + `loadPrompt("rankingAgents/Identifier")`; preserve the fallback path; add a note about the ignored new prompt fields. Webhook constants stay exported.
- `src/agents/rankingAgents/Identifier.md` — new prompt file in a new prompt subdirectory. System prompt for the dental specialty / market location extractor; produces `specialty`, `marketLocation`, `specialtyKeywords[]`, and `city` / `state` / `county` / `postalCode`.
- `frontend/src/pages/admin/AIDataInsightsList.tsx` — comment out the Guardian & Governance run button, the `handleRunAgents` handler, the `renderProgressBar` helper, and both `AnimatePresence` call sites. Drop `setIsRunning` from the destructure. Replace empty-state copy with neutral text. Trim `Play` and `AnimatePresence` imports.
- `plans/04122026-no-ticket-disable-n8n-agents-migrate-identifier/spec.md` — new plan folder with the spec for this work.

## [0.0.14] - April 2026

### PM Backlog Move, Multi-Select, Cross-Project AI Synth

Three composed features land together because they share the same backbone — a hardened `is_backlog` column flag and a new set of bulk / cross-project task operations. Backlog items can now be reassigned to another project without losing context. A floating multi-action bar (reusing the Action Items Hub pattern) lands on both the project board and the Me tab, with a right-click context menu on every card. A new top-level "Cross-project AI Synth" extracts tasks from raw text or files and routes each proposed task to its best-fit project before approval.

**Key Changes:**

_Move backlog tasks between projects_

- New endpoint `POST /api/pm/tasks/bulk/move-to-project` accepts `{ task_ids, target_project_id }`; the single-task right-click path calls the same endpoint with a one-element array so there is one code path to maintain
- Hard-gated to backlog-only: server rejects with `400 + offending_task_ids` metadata if any source task's column is not `is_backlog = true`. The UI also disables the bulk bar and context menu item with an explanatory tooltip, so the rule is enforced at both layers
- Tasks are appended to the end of the destination project's Backlog; source columns are compacted in the same transaction so positions stay contiguous
- One `pm_activity_log` row per moved task, logged under the **destination** project with `action: "task_moved_to_project"` and `metadata: { from_project_id, from_column_id, to_column_id, title }`

_Multi-select with floating action bar_

- New `pmStore` state: `selectedTaskIds: Set<string>` scoped to `activeProject`, plus a separate `meSelectedTaskIds` for the Me tab (tasks span projects there, so the Sets can't be shared)
- Selection auto-clears on project switch via `fetchProject` state reset — stale ids from the previous project can never leak into a bulk action
- Checkbox appears on card hover and stays pinned when any card is selected; clicks use `onClick` + `onPointerDown` stopPropagation so the dnd-kit drag sensor never fires from a checkbox tap
- Reuses the existing `BulkActionBar` from `components/ui/DesignSystem.tsx` — the same component Action Items Hub uses — with spring animation, count badge, and variant-styled action buttons. No new bar component was created
- Context menu semantics: right-clicking a **selected** card applies the action to the whole selection; right-clicking an **unselected** card acts on that single task only and does not modify the selection
- Bulk actions wired in the bar: Delete (with count-aware confirm modal), Move to project (disabled with tooltip unless every target is in Backlog). The context menu adds Open, Assign…, Set priority (P1–P5 + clear), Move to column, and Delete

_Cross-project AI Synth_

- New top-level "Cross-project AI Synth" button on `/admin/pm` dashboard, separate from the existing per-project button. The existing per-project synth flow is **completely untouched** — forked a new `CrossProjectAISynthModal` rather than refactoring `AISynthModal` to avoid regression risk
- Detached batch model: `pm_ai_synth_batches.project_id` is now nullable, and each `pm_ai_synth_batch_tasks` row gets a new `target_project_id` FK that must be set before the task can be approved
- LLM receives the active project list (id + name + description) as JSON in the system prompt and proposes a `target_project_id` per task. New prompt file `src/agents/pmAgents/AISynthCrossProject.md` lives alongside the existing `AISynth.md` — neither file modifies the other
- Server validates LLM-suggested `target_project_id` against the active project list on insert; invalid ids land as `null` for the user to fill manually — no LLM hallucination ever reaches the DB
- Approval UX: per-task project picker plus a "Set all pending to…" dropdown at the top of the task list. Approve button is disabled (with tooltip "Assign a project first") until `target_project_id` is set. Reject is always allowed
- On approve, the server re-validates the destination project is still `active` (guards the archived-between-extract-and-approve race), resolves its Backlog column via `is_backlog = true`, and creates the real task there with `source: "ai_synth"`

_Architectural lift — `is_backlog` flag_

- Every backend site that previously identified the Backlog column by name literal (`column.name === "Backlog"`) now reads `column.is_backlog`. This includes `PmTasksController.createTask`/`moveTask`, `PmStatsController.listStats`, `PmAiSynthController.approveTask`, and the frontend `pmStore.moveTask`, `CreateTaskModal`, `KanbanBoard`, `KanbanColumn`. Single grep sweep confirms only three name literals remain, all expected: migration backfill, migration comment, and the `DEFAULT_COLUMNS` seed constant
- Adding this flag in the same migration batch as the cross-project synth schema change was the "future-us won't hate present-us" call — if a column ever gets renamed or reordered, priority auto-clear, approval routing, and move-to-project validation keep working

_New primitives_

- `frontend/src/components/ui/context-menu.tsx` — shadcn-canonical wrapper around `@radix-ui/react-context-menu` (new dep), styled to the PM dark theme. First `radix-ui` primitive beyond `react-slot` in this repo; exports the full family (`ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`, `ContextMenuSub`/`SubTrigger`/`SubContent`, etc.)
- `frontend/src/components/pm/MoveToProjectModal.tsx` — searchable project picker with backlog counts per project, used by both the bulk bar and the context menu move-to-project paths
- `frontend/src/components/pm/CrossProjectAISynthModal.tsx` — the forked cross-project variant of AISynthModal (grid / new / detail views, per-task project picker, set-all dropdown, cross-project badge on history cards)

**Migration:**

- `20260412000001_pm_backlog_flag_and_cross_project_synth.ts` — additive, forward-compatible:
  - `ALTER TABLE pm_columns ADD COLUMN is_backlog BOOLEAN NOT NULL DEFAULT FALSE` + backfill `WHERE name = 'Backlog'` + partial index `idx_pm_columns_is_backlog` on `(project_id) WHERE is_backlog = TRUE`
  - `ALTER TABLE pm_ai_synth_batches ALTER COLUMN project_id DROP NOT NULL`
  - `ALTER TABLE pm_ai_synth_batch_tasks ADD COLUMN target_project_id UUID REFERENCES pm_projects(id) ON DELETE SET NULL`
- Down migration refuses to restore `NOT NULL` on `project_id` if any cross-project batches exist — loud-by-design so a rollback never nukes detached batches

**Commits:**

- `src/database/migrations/20260412000001_pm_backlog_flag_and_cross_project_synth.ts` — new migration (is_backlog flag, nullable project_id, target_project_id FK, partial index)
- `src/controllers/pm/PmTasksController.ts` — `bulkMoveTasksToProject` + `bulkDeleteTasks` controllers; `createTask` and `moveTask` switched from name checks to `is_backlog`
- `src/controllers/pm/PmAiSynthController.ts` — `extractBatch` gains `scope: "project" | "cross_project"` parameter and injects the active project list into the cross-project prompt; `approveTask` resolves destination via `batch.project_id ?? batchTask.target_project_id` with active-status revalidation; new `setBatchTaskTargetProject` and `listCrossProjectBatches` controllers
- `src/controllers/pm/PmProjectsController.ts` — `DEFAULT_COLUMNS` seed now sets `is_backlog: true` for the Backlog entry and `false` for the other three, threaded through `PmColumnModel.create`
- `src/controllers/pm/PmStatsController.ts` — backlog count query updated to `is_backlog = true`
- `src/routes/pm/tasks.ts` — registered `POST /tasks/bulk/move-to-project` and `POST /tasks/bulk/delete`
- `src/routes/pm/aiSynth.ts` — registered `GET /batches/cross-project` (before `/batches/:batchId` to avoid route collision) and `PUT /batches/:batchId/tasks/:taskId/target-project`
- `src/agents/pmAgents/AISynthCrossProject.md` — new system prompt for cross-project extraction; receives `{{PROJECTS_JSON}}` block and proposes `target_project_id` per task
- `frontend/src/types/pm.ts` — `PmColumn.is_backlog: boolean`, `PmAiSynthBatch.project_id: string | null`, `PmAiSynthBatchTask.target_project_id: string | null` (and P4/P5 added to the priority union + `"failed"` status)
- `frontend/src/api/pm.ts` — `bulkMoveTasksToProject`, `bulkDeleteTasks`, `extractCrossProjectBatch`, `fetchCrossProjectBatches`, `setBatchTaskTargetProject`
- `frontend/src/stores/pmStore.ts` — selection state (`selectedTaskIds` + `meSelectedTaskIds`), toggle/clear actions, `bulkDeleteSelectedTasks`, `bulkMoveSelectedTasksToProject`, `bulkDeleteMeSelectedTasks`; selection auto-clear on project switch; name checks replaced with `is_backlog`
- `frontend/src/components/ui/context-menu.tsx` — new shadcn primitive wrapper
- `frontend/src/components/pm/MoveToProjectModal.tsx` — new searchable picker modal
- `frontend/src/components/pm/CrossProjectAISynthModal.tsx` — new forked cross-project synth modal with per-task project picker and set-all dropdown
- `frontend/src/components/pm/TaskCard.tsx` — hover checkbox (with `stopPropagation` + `onPointerDown` guard against drag sensor), selection outline, `<ContextMenu>` wrapper with Open / Assign / Set priority / Move to column / Move to project / Delete
- `frontend/src/components/pm/MeTaskCard.tsx` — same treatment, minus Move-to-column (tasks span projects on Me tab)
- `frontend/src/components/pm/KanbanBoard.tsx` — pass selection props through to columns; `name === "Backlog"` checks and the assignee-required rule switched to `is_backlog`
- `frontend/src/components/pm/KanbanColumn.tsx` — forward selection props to each `TaskCard`; `isBacklog` derived from `column.is_backlog`
- `frontend/src/components/pm/MeKanbanBoard.tsx` — forward selection props through `DroppableColumn` → `DraggableCard` → `MeTaskCard`
- `frontend/src/components/pm/MeTabView.tsx` — Me-tab `BulkActionBar`, bulk delete confirm modal, context action handler, store selection subscription
- `frontend/src/components/pm/CreateTaskModal.tsx` — `selectedColumnIsBacklog` derived from `column.is_backlog`
- `frontend/src/pages/admin/ProjectBoard.tsx` — selection subscription, `BulkActionBar` with Move-to-project + Delete actions, `MoveToProjectModal` wiring, bulk delete confirm modal, `handleContextAction` that routes single-vs-multi based on whether the right-clicked task is in the selection, `allTargetsInBacklog` guard, `is_backlog` lookup for `TaskDetailPanel` prop
- `frontend/src/pages/admin/ProjectsDashboard.tsx` — "Cross-project AI Synth" entry button + modal mount
- `frontend/package.json` / `package-lock.json` — added `@radix-ui/react-context-menu`
- `plans/04112026-no-ticket-pm-bulk-move-cross-project-synth/spec.md` + `migrations/{pgsql.sql, mssql.sql, knexmigration.js}` — full spec with 16 tasks, Risk Level 4 section, and three migration scaffolds per convention

## [0.0.13] - April 2026

### Conditional Rendering for Post Tokens

Post blocks and single post templates can now hide markup when a field or custom field is empty, eliminating broken-image icons, empty labels, and orphan wrapper elements. Template authors wrap markup in `{{if post.X}}...{{endif}}` or `{{if_not post.X}}...{{endif}}` to conditionally render based on field presence. Supports standard post tokens and `post.custom.<slug>` custom fields. Evaluated before token replacement so the stripped markup never reaches the output.

**Key Changes:**

- New syntax: `{{if post.featured_image}}<img src="{{post.featured_image}}"/>{{endif}}` keeps the image only when set; pair with `{{if_not post.featured_image}}...{{endif}}` for a fallback branch
- "Empty" is strictly `null`, `undefined`, or empty string `""`. The values `"0"`, `0`, `false`, whitespace strings, and empty arrays/objects are intentionally **not** empty — authors writing `{{if post.custom.count}}` with a zero count see the block render as expected
- Flat only in v1 — nested conditionals trigger a `console.warn` and leave the template unchanged so the raw markers render visibly. Loud-by-design so silent template bugs don't ship
- Custom fields supported via `{{if post.custom.<slug>}}` in both post block loops and single post templates
- Works in five render paths with identical semantics: production post blocks, production single post pages, editor page preview with embedded post block shortcodes, editor post block template preview (client-side), and editor single post template preview (client-side)
- Existing templates with zero `{{if}}` tokens pass through a fast-path early return — zero behavioral change for all current data
- Known preview limitation documented in the Posts Docs page: the editor's client-side preview treats `post.custom.*` as empty because placeholder data doesn't model custom fields. Live site reflects real values.
- Companion change in `website-builder-rebuild` (production renderer) ships the same `processConditionals` logic in `src/utils/shortcodes.ts` — required for production parity. Three source-of-truth copies are kept in sync via cross-reference header comments in each file.

**Commits:**

- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — added `processConditionals` helper (local, non-exported) with field resolver handling the backend's `_categories`/`_tags` naming convention and derived `url` field; wired into `renderPostBlock`'s `posts.map` body after `customFields` is parsed. Header comment names the two sibling copies.
- `frontend/src/components/Admin/PostBlocksTab.tsx` — added `processConditionals` helper that resolves fields by looking up literal token strings in `PLACEHOLDER_POST`; invoked in both the loop path (per-post, so different preview posts can resolve differently) and the single-template fallback path of `replacePlaceholders`. Documents the custom-field preview limitation inline.
- `frontend/src/pages/admin/AlloroPostsDocs.tsx` — new "Conditional Rendering" section between "Shortcode Syntax" and "Examples" with syntax reference, empty-definition explainer, two worked examples (featured image fallback, video embed), and a rules/limits list covering flat-only constraint, absence of `{{else}}`/comparisons, preview limitation, and the supported field list.
- `plans/04112026-no-ticket-conditional-post-token-rendering/spec.md` — full spec covering why/what/context/constraints/risk/tasks/done for the cross-repo change.

## [0.0.12] - April 2026

### Allow Manager Role to Rename a Location

Manager-role users can now rename a location from Settings → Properties without escalating to an org admin. Rename is lightweight metadata and no longer requires full `canManageConnections` admin privilege. All other location management actions (Change GBP, Set Primary, Delete, Add Location, change domain) remain admin-only.

**Key Changes:**

- Backend `PUT /api/locations/:id` is now accessible to both `admin` and `manager` roles
- Server-side field-level guard rejects non-admin attempts to modify `domain` or `is_primary` with `403` — defense in depth, the client is not authoritative
- Frontend `PropertiesTab` exposes a distinct `canRenameLocation` flag (admin OR manager); the inline name-edit affordance uses this flag while every other action remains gated on `canManageConnections` (admin-only)
- Viewer role remains fully read-only; no edit affordance is rendered

**Commits:**

- `src/routes/locations.ts` — widened role gate on `PUT /:id` from `admin` to `admin, manager`; added field-level guard blocking `domain`/`is_primary` modification for non-admin roles
- `frontend/src/components/settings/PropertiesTab.tsx` — added `canRenameLocation` flag; swapped `canManageConnections` → `canRenameLocation` on the two call sites that gate the name-edit UI (click handler and hover pencil icon)

## [0.0.11] - April 2026

### PM QA Bug Fixes + UX Polish

Full Playwright QA pass on the PM feature surfaced five confirmed bugs and five friction points. All fixed before production rollout.

**Bug Fixes:**

- Task cards now immediately show "by dave" (creator name) and "→ dave" (assignee name) on creation and assignment — backend `createTask` and `assignTask` responses now enrich with LEFT JOIN on users
- Deadline panel display no longer shows the wrong date (off-by-one) — changed from `.slice(0, 10)` on a UTC ISO string to `toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })` to get the correct PST date
- ME kanban card clicks now open the task detail panel — moved click handler to outer draggable div with a `didDrag` ref to distinguish click vs drag
- Text no longer selects during ME kanban drag — added `userSelect: "none"` to draggable elements
- ME kanban drag to DONE column now works reliably — replaced `pointerWithin` collision detection with `rectIntersection` filtered to column droppables only
- Fixed missing `format` import in `pmDateFormat.ts` that would crash for far-future deadlines

**UX Improvements:**

- Truncated task titles show full text as native browser tooltip (`title` attribute) on both kanban and ME kanban cards
- Task detail panel now shows "Created by {name} · X ago" metadata row at the bottom
- ME kanban columns show an orange border ring + subtle scale on drag-over for clearer drop targeting
- ME task cards show assignee name (`→ name`) when set
- Old notifications without `actor_name` in metadata are now enriched server-side via actor email fallback

**Commits:**

- `src/controllers/pm/PmTasksController.ts` — `enrichTask()` helper, applied to createTask + assignTask
- `frontend/src/components/pm/TaskDetailPanel.tsx` — PST deadline display fix, creator metadata row
- `frontend/src/components/pm/MeKanbanBoard.tsx` — click vs drag fix, column collision detection, drop zone ring
- `frontend/src/components/pm/MeTaskCard.tsx` — no-select on drag, assignee display, title tooltip
- `frontend/src/components/pm/TaskCard.tsx` — title tooltip
- `frontend/src/utils/pmDateFormat.ts` — `format` import fix
- `src/controllers/pm/PmNotificationsController.ts` — server-side actor_name enrichment

## [0.0.10] - April 2026

### Session Expired Crash Fix (ALLORO-FRONTEND-Q)

Users with expired JWT tokens hitting `/settings/billing` saw a white screen — "Something went wrong." — because the billing page crashed trying to render a 403 error response as billing data. The app now detects expired tokens globally and shows a "Session Expired" modal prompting re-login.

**Key Changes:**

- Global 403 axios interceptor in `api/index.ts` — detects `"Invalid or expired token"` responses, dispatches `session:expired` event with dedup flag to prevent multiple modals
- `SessionExpiredModal` component — non-dismissible dark glassmorphic modal, clears all auth state (localStorage, sessionStorage, query cache, cookies), broadcasts logout to other tabs, redirects to `/signin`
- Mounted in `App.tsx` at top level alongside `<Toaster />`
- `BillingTab.tsx` defensive guard — changed `success !== false` to `success === true` so malformed API responses never set state

**Commits:**

- `frontend/src/api/index.ts` — 403 interceptor with `sessionExpiredFired` dedup flag
- `frontend/src/components/SessionExpiredModal.tsx` — new modal component
- `frontend/src/App.tsx` — mount SessionExpiredModal
- `frontend/src/components/settings/BillingTab.tsx` — tighten response guards

## [0.0.9] - March 2026

### Billing Quantity Override for Flat-Rate Legacy Clients

Caswell Orthodontics and One Endodontics have flat-rate deals — they pay for a single unit regardless of how many locations they have. A new `billing_quantity_override` column on organizations allows per-org override of the Stripe subscription quantity, bypassing the automatic location count.

**Key Changes:**

- Migration `20260323000001_add_billing_quantity_override` — adds nullable integer column, seeds `1` for Caswell (org 25) and One Endo (org 39)
- `BillingService.createCheckoutSession()` — uses override when set, falls back to location count
- `BillingService.syncSubscriptionQuantity()` — uses override when set, prevents location add/remove from changing the billed quantity
- `IOrganization` interface — added `billing_quantity_override: number | null`

**Commits:**

- `src/database/migrations/20260323000001_add_billing_quantity_override.ts` — column + seed data
- `src/controllers/billing/BillingService.ts` — guard clauses in checkout and quantity sync
- `src/models/OrganizationModel.ts` — interface update

## [0.0.8] - March 2026

### Stripe Subscription Quantity Sync on Location Change

Adding or removing a location now automatically updates the Stripe subscription quantity and sends an email notification to org admins with the billing change details.

**Key Changes:**

- `syncSubscriptionQuantity()` in BillingService — retrieves Stripe subscription, compares item quantity to current location count, updates if different
- Hooked into `LocationService.createLocation()` and `removeLocation()` as fire-and-forget after transaction commits
- Email notification to org admins: old/new quantity, unit price, new monthly total, proration note
- Best-effort: Stripe failures are logged but never block location operations
- No-op for admin-granted orgs (no `stripe_subscription_id`)

**Commits:**

- `signalsai-backend/src/controllers/billing/BillingService.ts` — Add syncSubscriptionQuantity() with Stripe update + email notification
- `signalsai-backend/src/controllers/locations/LocationService.ts` — Hook sync into createLocation() and removeLocation()

## [0.0.7] - March 2026

### Rybbit Analytics Integration & Proofline Migration

Automated Rybbit website analytics provisioning, migrated Proofline from N8N to direct Claude calls, and enriched both daily and monthly agents with website analytics data from Rybbit.

**Key Changes:**

- Automated Rybbit site creation when a custom domain is verified — creates site via Rybbit API and auto-injects tracking script into project header code
- Migrated Proofline agent from N8N webhook to direct Claude LLM call with proper JSON output schema (title, proof_type, trajectory, explanation)
- Proofline daily agent now includes Rybbit website analytics (sessions, pageviews, bounce rate) alongside GBP data for yesterday vs day-before comparison
- Monthly Summary agent now includes Rybbit website analytics (current month vs previous month) alongside GBP and PMS data
- New shared Rybbit data fetcher utility with daily and monthly comparison functions, reused across both agent types
- Added `rybbit_site_id` column to projects table for linking to Rybbit sites
- Added `ProoflineAgentOutput` and `ProoflineSkippedOutput` backend type definitions
- Added `trajectory` field to frontend `ProoflineAgentData` type

**Commits:**

- `signalsai-backend/src/database/migrations/20260312000001_add_rybbit_site_id_to_projects.ts` — Add rybbit_site_id to projects
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.rybbit.ts` — Rybbit site provisioning on domain verification
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.custom-domain.ts` — Hook provisioning into verifyDomain
- `signalsai-backend/src/utils/rybbit/service.rybbit-data.ts` — Shared Rybbit data fetcher (daily + monthly comparison)
- `signalsai-backend/src/agents/dailyAgents/Proofline.md` — Output schema added to prompt
- `signalsai-backend/src/controllers/agents/types/agent-output-schemas.ts` — ProoflineAgentOutput type
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-orchestrator.ts` — Proofline migration to direct Claude call, Rybbit data wiring for daily + monthly
- `signalsai-backend/src/controllers/agents/feature-services/service.agent-input-builder.ts` — websiteAnalytics param in proofline + summary payloads
- `signalsai/src/types/agents.ts` — Add trajectory to ProoflineAgentData

## [0.0.6] - March 2026

### Stripe Production Billing — Org Type Pricing + Dynamic Quantity

Billing was hardcoded to a single $2,000 flat price with `quantity: 1`. Now supports per-location/per-team pricing driven by organization type, dynamic quantity based on location count, and a persistent subscribe banner for unpaid users.

**Key Changes:**

- Checkout resolves Stripe price by organization type: `health` ($2,000/location/mo) or `saas` ($3,500/team/mo)
- Checkout quantity dynamically set to org's location count from DB (minimum 1)
- New `organization_type` column on organizations (nullable, immutable once set, null = health)
- Admin org detail page: type dropdown (Health / SaaS) with confirmation, locked after save
- `PATCH /api/admin/organizations/:id/type` endpoint with 409 immutability enforcement
- Persistent amber banner for admin-granted users without Stripe subscription ("Subscribe in Settings > Billing")
- ENV restructured: `STRIPE_DFY_PRICE_ID` renamed to `STRIPE_HEALTH_PRICE_ID`, added `STRIPE_SAAS_PRICE_ID`, comment-swap blocks for test/prod keys

**Commits:**

- `signalsai-backend/src/database/migrations/20260312000002_add_organization_type.ts` — Add organization_type column
- `signalsai-backend/src/config/stripe.ts` — Replace `getPriceId(tier)` with `getPriceIdByOrgType(orgType)`
- `signalsai-backend/src/controllers/billing/BillingService.ts` — Dynamic price + quantity in checkout session
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — Add updateOrganizationType handler
- `signalsai-backend/src/routes/admin/organizations.ts` — Add PATCH /:id/type route
- `signalsai-backend/src/models/OrganizationModel.ts` — Add organization_type to IOrganization
- `signalsai/src/components/Admin/OrgSubscriptionSection.tsx` — Org type dropdown with immutability lock
- `signalsai/src/components/PageWrapper.tsx` — Persistent non-subscriber amber banner
- `signalsai/src/api/admin-organizations.ts` — Add organization_type to types, adminUpdateOrganizationType function

## [0.0.5] - March 2026

### SEO Data Version Propagation & Backfill

SEO data was siloed on individual page versions. Bulk generation targeted the highest version number (often an inactive version), and manual SEO edits only wrote to one row. The page list showed score 77 from an old inactive version while the editor showed 15 (draft had null seo_data). The public renderer serves from the published row — if that row had no seo_data, zero SEO tags were injected.

**Key Changes:**

- Added `propagateSeoToSiblings` helper — when SEO data is written to any page version, all sibling versions of the same path with null seo_data are backfilled (additive only, never overwrites)
- Fixed bulk SEO generation to target the published page per path (fallback to draft, then highest version) instead of blindly picking the highest version number
- Fixed page list SEO score to use `displayPage` (published or latest) instead of scanning all versions for any with seo_data
- Fixed `getAllSeoMeta` endpoint to deduplicate pages by path (one entry per path) — prevents false uniqueness failures between draft and published versions of the same page
- Fixed SeoPanel uniqueness filter to exclude by page path instead of entity ID, preventing score flicker (77 → 66) when sibling metadata loads
- One-time backfill migration: copied best seo_data to all 79 page versions across 13 page groups that had gaps

**Commits:**

- `signalsai-backend/src/controllers/admin-websites/feature-services/service.page-editor.ts` — Add propagateSeoToSiblings helper, call from updatePageSeo
- `signalsai-backend/src/workers/processors/seoBulkGenerate.processor.ts` — Fix getPageEntities to prefer published, add sibling propagation after bulk save
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — Deduplicate getAllSeoMeta by path
- `signalsai/src/pages/admin/WebsiteDetail.tsx` — List score uses displayPage, allPageSeoMeta uses published/latest per group
- `signalsai/src/components/PageEditor/SeoPanel.tsx` — Uniqueness filter excludes by path for pages
- `signalsai-backend/src/database/migrations/20260310000001_backfill_seo_data_across_versions.ts` — One-time backfill migration

## [0.0.4] - March 2026

### Fix Monthly Agents 400 Error (Org-Centered Alignment)

Removed vestigial `domain` requirement from the monthly-agents-run endpoint — a leftover from the domain-centered execution model replaced in February. Organizations without a domain set caused silent 400 failures in the PMS pipeline.

**Key Changes:**

- `domain` no longer required in `POST /api/agents/monthly-agents-run` — endpoint resolves display name from its internal org join
- PMS retry and approval services no longer resolve org domain just to pass it back; removed unnecessary `OrganizationModel` lookups
- Fire-and-forget axios calls replaced with `await` so errors propagate correctly instead of being swallowed
- `notifyAdminsMonthlyAgentComplete` parameter renamed from `domain` to `practiceName`

**Commits:**

- `src/controllers/agents/AgentsController.ts` — Remove domain validation, use org join for admin email
- `src/utils/core/notificationHelper.ts` — Rename domain param to practiceName
- `src/controllers/pms/pms-services/pms-retry.service.ts` — Remove org lookup, domain payload, fix await
- `src/controllers/pms/pms-services/pms-approval.service.ts` — Same cleanup

### Fix SEO Data Lost on Page Draft Creation

SEO scores displayed correctly in the website page list but appeared empty when opening a page for editing. The `createDraft` function was not copying `seo_data` from the published page to the draft.

**Key Changes:**

- Draft creation now copies `seo_data` from the published source page
- Stale draft refresh now syncs `seo_data` from the published version

**Commits:**

- `src/controllers/admin-websites/feature-services/service.page-editor.ts` — Add seo_data to draft insert and stale refresh update

## [0.0.3] - March 2026

### SEO Scoring System & Meta Injection

Full SEO scoring, editing, and meta injection pipeline across admin frontend, backend, and website-builder-rebuild rendering server.

**Key Changes:**

- SEO scoring panel with sidebar navigation, per-section scores, colored dot indicators, and inline field editing for meta title, description, canonical URL, robots, OG tags, and JSON-LD schema
- SEO meta injection in website-builder-rebuild renderer: smart replace-or-inject for `<title>`, meta tags, canonical, OG tags, and JSON-LD schema blocks
- Business data service with Redis-cached lookups (10-min TTL) for org + location data
- Post-level SEO support: Content/SEO tab bar in post editor with auto-save
- Backend: `seo_data` JSONB column on pages and posts, business_data on organizations/locations, SEO generation endpoint
- Migration: `20260308000001_add_seo_and_business_data.ts`

### Admin Sidebar Collapsed Spacing

Fixed collapsed admin sidebar overlaying PageEditor and LayoutEditor content. Content now reserves 72px left margin when sidebar is collapsed.

### SeoPanel Redesign

Restructured SeoPanel from a full-width scrolling list to a sidebar+main split layout. Removed emoji indicators, added colored dot score indicators, section navigation sidebar, and business data warning CTA linking to organization settings.

### Project Display Name & Custom Domain in List

Added editable display name to website projects and custom domain preference in the list view.

**Key Changes:**

- `display_name` column on `website_builder.projects` (migration `20260309000001`)
- Inline-editable display name in WebsitesList (pencil icon, Enter to save)
- "View Site" link and domain display prefer `custom_domain` over generated subdomain
- Backend: `display_name` and `custom_domain` included in list query, set on project create

### Misc Fixes

- Removed unused imports (`Download`, `HelpCircle`, `FileText`, `Upload`, `Sparkles`) and dead `LocationFormRow` component to fix TS6133 errors

**Commits:**

- `website-builder-rebuild/src/utils/renderer.ts` — SEO meta injection with `injectSeoMeta()`, `replaceOrInjectMeta()`, `replaceOrInjectLink()`
- `website-builder-rebuild/src/services/seo.service.ts` — Business data fetch with Redis caching
- `website-builder-rebuild/src/routes/site.ts` — SEO injection in page and post assembly
- `website-builder-rebuild/src/services/singlepost.service.ts` — Added `seo_data` to post query
- `website-builder-rebuild/src/types/index.ts` — `SeoData` interface, `organization_id` on Project, `seo_data` on Page
- `signalsai-backend/src/database/migrations/20260308000001_add_seo_and_business_data.ts` — SEO + business_data columns
- `signalsai-backend/src/database/migrations/20260309000001_add_display_name_to_projects.ts` — display_name column
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.project-manager.ts` — display_name in list/create, `updateProjectDisplayName()`
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.seo-generation.ts` — SEO generation service
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — SEO endpoints
- `signalsai-backend/src/routes/admin/websites.ts` — SEO routes
- `signalsai-backend/src/routes/locations.ts` — Business data routes
- `signalsai-backend/src/controllers/locations/BusinessDataService.ts` — Business data service
- `signalsai-backend/src/models/LocationModel.ts` — Fixed create signature for optional business_data
- `signalsai/src/components/PageEditor/SeoPanel.tsx` — Redesigned SEO panel with sidebar navigation
- `signalsai/src/components/Admin/PostsTab.tsx` — Content/SEO tab bar, post SEO editing
- `signalsai/src/pages/admin/PageEditor.tsx` — SEO tab integration, sidebar margin fix
- `signalsai/src/pages/admin/LayoutEditor.tsx` — Sidebar margin fix
- `signalsai/src/pages/admin/WebsitesList.tsx` — Inline display name editing, custom domain links
- `signalsai/src/api/websites.ts` — `display_name`, `custom_domain`, SEO API functions
- `signalsai/src/api/locations.ts` — Business data API functions
- `signalsai/src/components/PMS/PMSUploadWizardModal.tsx` — Removed unused imports
- `signalsai/src/components/PMS/PMSVisualPillars.tsx` — Removed unused imports
- `signalsai/src/pages/admin/PracticeRanking.tsx` — Removed unused `LocationFormRow` and `Sparkles`

## [0.0.2] - February 2026

### Admin Set Password & User Profile Account Tab

Enables password management for legacy Google-only accounts via admin tools and user self-service.

**Key Changes:**

- Admin can now see password status (PW / No PW badge) on each user card in Organization Detail
- Admin can set a temporary auto-generated password for any user with optional email notification
- New "Account" tab in Settings (after Billing) where users can set or change their password
- Smart UX: legacy users (no password) see "Set Password" without current password requirement; users with a password must enter their current one to change it
- Password validation enforces existing rules (8+ chars, 1 uppercase, 1 number)

**Commits:**

- `signalsai-backend/src/models/OrganizationUserModel.ts` — Added password_hash to user join query
- `signalsai-backend/src/controllers/admin-organizations/AdminOrganizationsController.ts` — Added has_password mapping + setUserPassword handler with temp password generation and email notification
- `signalsai-backend/src/controllers/settings/SettingsController.ts` — Added getPasswordStatus and changePassword handlers
- `signalsai-backend/src/routes/admin/organizations.ts` — Added POST /users/:userId/set-password route
- `signalsai-backend/src/routes/settings.ts` — Added GET /password-status and PUT /password routes
- `signalsai/src/api/admin-organizations.ts` — Added has_password to AdminUser, adminSetUserPassword API function
- `signalsai/src/api/profile.ts` — Added getPasswordStatus and changePassword API functions
- `signalsai/src/components/settings/ProfileTab.tsx` — New password set/change component
- `signalsai/src/pages/Settings.tsx` — Added Account tab
- `signalsai/src/pages/admin/OrganizationDetail.tsx` — Password status badges, Set Password modal with notify checkbox
