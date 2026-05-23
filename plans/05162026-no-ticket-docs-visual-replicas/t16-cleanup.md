# T16: Cleanup

## Why
Once all replicas are wired in and working, the screenshot assets, capture script, and fixture files are dead weight.

## What
Remove all screenshot-era artifacts.

## Tasks

1. **Delete `docs/public/screenshots/`** — entire directory tree (all PNGs for all versions)
2. **Delete `docs/scripts/capture-screenshots.ts`** — Playwright capture pipeline
3. **Delete `docs/scripts/fixtures/*.json`** — all fixture data files (dashboard-metrics.json, locations.json, notifications.json, tasks.json, support.json, users.json, pms.json, etc.)
4. **Delete `docs/scripts/` directory** if empty after above deletions
5. **Verify no broken imports** — grep for "screenshots", "fixtures", "capture-screenshots", "ScreenshotViewer", "HotspotOverlay", "ZoomRegion" across the docs app
6. **Verify `npm run build` still succeeds**
7. **Verify docs app loads every page** in the browser

## Verify
- No references to `screenshots/` directory in source
- No references to `ScreenshotViewer`, `HotspotOverlay`, `ZoomRegion`
- `npm run build` passes
- All 14+ pages load in docs app at localhost:5176

## Depends on
T15 (wiring must be complete and verified first)
