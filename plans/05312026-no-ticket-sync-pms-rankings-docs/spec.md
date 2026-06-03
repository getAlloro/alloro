# Sync PMS and Rankings Docs Pages

## Why
Recent client-dashboard updates changed the PMS Statistics / Referrals Hub and Local Rankings experiences. The docs pages must mirror the real Alloro UI, otherwise the interactive docs will teach users stale workflows.

## What
Audit the real app surfaces for `/pmsStatistics` and `/rankings`, then update the matching Alloro Docs pages so the visual replicas, hotspots, step copy, page descriptions, and changelog/version metadata match the current product. No app behavior changes.

## Context

**Relevant app source files, read-only:**
- `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx` - current `/pmsStatistics` composition: hero, optional processing card, referrals meaning card, growth opportunities, ingestion card, and source/trend detail modals.
- `frontend/src/components/PMS/dashboard/PmsDashboardHero.tsx` - current Referrals Hub heading and Update data CTA.
- `frontend/src/components/PMS/dashboard/PmsReferralsMeaningCard.tsx` - current PMS meaning-card layout, metrics, top-source highlight, and modal triggers.
- `frontend/src/components/PMS/dashboard/PmsGrowthOpportunities.tsx` - current "Best next actions" card grid.
- `frontend/src/components/PMS/dashboard/PmsIngestionCard.tsx` - current data-ingestion section and permission states.
- `frontend/src/components/dashboard/RankingsDashboard.tsx` - current Local Rankings page composition, overview/engage tabs, meaning hero, Alloro Engage summary, and competitor card.
- `frontend/src/components/dashboard/rankings/RankingsDashboardViewTabs.tsx` - current Overview / Reviews & Posts tab control.
- `frontend/src/components/dashboard/gbp-automation/GbpEngagementSummaryCard.tsx` - current Alloro Engage summary card in the Rankings overview.

**Docs target files:**
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/ReferralsHubReplica.tsx` - currently stale against the new PMS meaning-card layout.
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/referrals-hub.ts` - hotspots, steps, description, and page changelog for `/pmsStatistics`.
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx` - current Local Rankings visual replica; likely close, but must be audited against live source.
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts` - Local Rankings hotspots, steps, and page changelog.
- `/Users/rustinedave/Desktop/alloro-docs/src/data/changelog.ts` - global docs changelog.
- `/Users/rustinedave/Desktop/alloro-docs/src/pages/HomePage.tsx` - hard-coded current docs version.
- `/Users/rustinedave/Desktop/alloro-docs/package.json` and `/Users/rustinedave/Desktop/alloro-docs/package-lock.json` - docs package version metadata if bumped.

**Patterns to follow:**
- Alloro Docs `AGENTS.md`: read the real app components first, compare against the replica, then sync layout, typography, spacing, colors, data shape, and component hierarchy.
- Existing docs replica pattern: static fixture data, no API calls, no auth/routing logic, local state only for replica interactions such as tabs or modal previews.
- Local Rankings docs replica is the closest pattern for a hand-built dashboard replica with `DashboardLayout`, `HotspotZone`, static data, and page-level changelog entries.

**Reference file:** `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx` - closest existing docs replica for the meaning-card/dashboard-detail pattern.

## Constraints

**Must:**
- Keep app code read-only unless the audit exposes a docs-blocking mismatch caused by actual app source errors.
- Rebuild Referrals Hub docs from the current `PmsDashboardSurface` hierarchy, not the old PMS Vitals / Executive Summary / attribution matrix shape.
- Audit Local Rankings against current app source before deciding whether to modify it.
- Keep all fixture data fake and obvious; no real client data.
- Keep docs changes in `/Users/rustinedave/Desktop/alloro-docs` and the plan file in this repo.
- Check git status in both repos before execution and keep unrelated changes out.

**Must not:**
- Change backend routes, PMS/ranking data derivation, wizard behavior, or live dashboard behavior.
- Add dependencies.
- Recreate API calls or real app state in docs replicas.
- Rewrite unrelated docs pages or reconcile historical docs changelog gaps beyond the metadata needed for this sync.

**Out of scope:**
- Production deployment.
- App changelog/Friyay finalization.
- Referrals Hub product changes beyond documentation parity.
- Full docs information-architecture cleanup.

## Risk

**Level:** 2

**Risks identified:**
- PMS docs are materially stale, not just cosmetically different. Updating only descriptions would preserve false UI guidance. -> **Mitigation:** rebuild the Referrals Hub replica and page data around the current app hierarchy: hero, meaning card, best next actions, ingestion, and detail modal triggers.
- Local Rankings may already be mostly synced. Over-editing it would create churn and possibly new drift. -> **Mitigation:** audit first; update only confirmed mismatches and report a no-op if it is already in parity.
- Hotspot positions are brittle after a replica layout rewrite. -> **Mitigation:** update hotspots and steps together, then visually verify `/docs/referrals-hub` and `/docs/local-rankings` in the docs app.
- Docs version metadata is already inconsistent with page-level changelogs. -> **Mitigation:** use one new docs version for this sync if files change, update the affected page changelog(s), global changelog, homepage version, and package metadata without rewriting unrelated history.
- Cross-repo work can accidentally mix app and docs changes. -> **Mitigation:** treat app and docs as separate working trees; only the plan file changes in Alloro, implementation files change in `alloro-docs`.

**Blast radius:**
- Docs pages `/docs/referrals-hub` and `/docs/local-rankings`.
- Docs sidebar/global changelog/home version display if version metadata is updated.
- No live Alloro app runtime blast radius expected.

**Pushback:**
- This is not a quick docs copy pass. The PMS replica is documenting an old page. Future-us will hate a half-sync because the docs would look polished while being wrong.

## Tasks

### T1: Source and Docs Drift Audit
**Do:** Re-read the real PMS and Rankings source components, then compare them against the current docs replicas and page data. Record the concrete drift list in execution notes before editing.
**Files:** app source files listed above, docs target files listed above.
**Depends on:** none
**Verify:** Manual: drift list covers layout, visible copy, CTA labels, tabs/modals, hotspots, and changelog/version implications.

### T2: Referrals Hub Replica Sync
**Do:** Rewrite `ReferralsHubReplica.tsx` to mirror the current `/pmsStatistics` data-loaded state:
- hero: Revenue Attribution / Referral Intelligence / Update data
- referrals meaning card: "What the data says", insight sentence, four metrics, top source highlight, "See all sources ranked" and "View referral trends" triggers
- best next actions: white card grid with numbered actions
- ingestion: "Update your referral data", upload CTA, HIPAA secure/encrypted badges
- static source/trend detail previews via local state if needed, matching the real modal behavior without API calls
Remove stale PMS Vitals, AttentionCard, Executive Summary, old production chart grid, attribution matrix, and Ledger Ingestion language unless still present in the live source.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/ReferralsHubReplica.tsx`
**Depends on:** T1
**Verify:** Manual: replica structure matches `PmsDashboardSurface` and related PMS child components.

### T3: Referrals Hub Page Data Sync
**Do:** Update `referrals-hub.ts` description, hotspots, steps, and page changelog to match the new replica and real workflow. Hotspots should explain the meaning card, source/trend drill-ins, best next actions, and ingestion card using owner-readable language.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/referrals-hub.ts`
**Depends on:** T2
**Verify:** Manual: every step points to an existing hotspot id and describes a visible section accurately.

### T4: Local Rankings Parity Audit and Targeted Sync
**Do:** Compare current `RankingsDashboard.tsx`, `RankingsDashboardViewTabs.tsx`, and `GbpEngagementSummaryCard.tsx` against `LocalRankingsReplica.tsx` and `local-rankings.ts`. Update only confirmed drift, especially:
- Overview / Reviews & Posts tabs
- hero CTA and Alloro Engage GBP Posts action
- score/detail modal trigger labels
- Best next actions placement
- Alloro Engage summary metrics/latest-review quick action
- competitor table, sort control, scrollbar, and Manage competitors placement
If no material drift exists, leave files unchanged and state that in the execution summary.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`, `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`
**Depends on:** T1
**Verify:** Manual: `/docs/local-rankings` matches the current app source for the documented data-loaded overview state.

### T5: Docs Version and Changelog Metadata
**Do:** If docs files change, add a global changelog entry for this sync and align visible docs version metadata. Use the next docs version after the highest affected page version (`0.0.120` unless execution discovers a newer current value). Update page-level changelogs only for pages that actually changed.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/data/changelog.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/pages/HomePage.tsx`, `/Users/rustinedave/Desktop/alloro-docs/package.json`, `/Users/rustinedave/Desktop/alloro-docs/package-lock.json`, affected page data files.
**Depends on:** T3, T4
**Verify:** Manual: homepage, global changelog, and affected page changelogs do not contradict each other.

### T6: Build and Visual Verification
**Do:** Build the docs app, then inspect the two docs routes.
**Files:** docs repo only.
**Depends on:** T5
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`; Manual/Browser: `/docs/referrals-hub` and `/docs/local-rankings` render without broken layout or hotspot/step mismatch.

## Done
- [x] Drift audit completed from real app source, not assumptions.
- [x] Referrals Hub docs no longer reference stale PMS Vitals / Executive Summary / Attribution Master Matrix / Ledger Ingestion layout unless present in app source.
- [x] Referrals Hub replica matches the current hero -> meaning card -> best next actions -> ingestion flow.
- [x] Referrals Hub hotspots and steps match visible sections and modal/detail behavior.
- [x] Local Rankings docs either updated for confirmed drift or explicitly verified as already in sync.
- [x] Docs version/changelog metadata updated if docs files change.
- [x] `cd /Users/rustinedave/Desktop/alloro-docs && npm run build` passes.
- [x] Browser/manual check of `/docs/referrals-hub` and `/docs/local-rankings` completed.
- [x] No Alloro app runtime files changed by this execution.

## Execution Notes

### 2026-05-31

**Drift found:** Referrals Hub docs were still documenting the old PMS Vitals / Executive Summary / production chart / attribution matrix / Ledger Ingestion experience. Current app source is hero -> processing card when applicable -> referrals meaning card -> best next actions -> ingestion card, with source and trend detail modals.

**Rankings parity:** Local Rankings docs already reflected the current non-leading-location wording from the dirty app source: "is currently #N in Local Search" and "improve the position." Added page/global changelog metadata for that confirmed parity point.

**Verification:** `npm run build` passed in `/Users/rustinedave/Desktop/alloro-docs` with only the existing Vite large-chunk warning. Playwright smoke checks passed for `/docs/referrals-hub`, both Referrals Hub modal triggers, and `/docs/local-rankings`.

**Working-tree note:** The Alloro app repo had pre-existing dirty runtime files before execution. This work only changed the plan file in the app repo and docs files in `/Users/rustinedave/Desktop/alloro-docs`.
