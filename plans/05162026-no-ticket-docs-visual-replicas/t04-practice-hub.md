# T4: Practice Hub Replica

## Why
The Practice Hub is the main dashboard — the first thing users see after login. It's the most visually complex page with multiple card types, a trajectory narrative, and status indicators.

## What
Create `PracticeHubReplica.tsx` — a hardcoded visual replica of the Practice Hub Focus view with all sections wrapped in `HotspotZone`.

## Context

**Reference screenshot:** `docs/public/screenshots/0.0.82/practice-hub/full.png`
**Uses:** `DashboardLayout` from T2, `HotspotZone` from T1
**Fixture data (for hardcoded values):** `docs/scripts/fixtures/dashboard-metrics.json`, capture script inline data

## File to create

### `docs/src/components/replicas/PracticeHubReplica.tsx`

**Hotspot IDs (from page config):** `focus-header`, `hero-card`, `trajectory-timeline`, `action-queue`, `website-card`, `local-ranking-card`, `pms-card`

**Layout (top to bottom):**

1. **Focus Header** (`focus-header`):
   - Left: "THIS MONTH AT A GLANCE" small label, "Focus — May 2026" large heading
   - Subtitle: "Powered by Practice Intelligence, built for..."
   - Right: "PERIOD: MAY 1 – MAY 31" date range badge

2. **Hero Card** (`hero-card`):
   - Large full-width card with subtle gradient or muted background
   - Text: "Your first monthly priority will appear once your data finishes processing"
   - Or: a priority action message if we want a populated look

3. **Two-column row below hero:**
   - **Left column (~60%) — Trajectory Card** (`trajectory-timeline`):
     - Header: "TRAJECTORY: LATEST UPDATE" label
     - Greeting: "Good evening, Alex."
     - Narrative paragraph about practice health: review velocity increased to 7/month, Practice Health moved from 74 to 82, Google Maps #5→#3, main growth lever is review velocity gap, 22% QoQ referral growth via Dr. Sarah Miller
     - "Read full proofline →" link in orange
   - **Right column (~40%) — Action Queue** (`action-queue`):
     - Header: "GROWTH LOOKS GOOD" with progress "0%"
     - "No queued actions" empty state message

4. **Bottom Status Row (3 equal cards):**
   - **Website Card** (`website-card`): Globe icon, "smileclinic.com", "Published" status, small green dot
   - **Rankings Card** (`local-ranking-card`): "#3" large number, "Practice Health: 82", mini progress arc
   - **PMS Card** (`pms-card`): Alloro icon, production total "$221,100", referral count "187 total referrals"

**Styling notes:**
- Cards: white background, rounded-xl, border border-alloro-border, subtle shadow
- Section labels: uppercase, tracking-wide, text-xs, text-alloro-slate
- Headings: font-display, alloro-navy
- Status badges: small pills with colored backgrounds

## Verify
- Renders populated dashboard matching the screenshot layout
- All 7 hotspot zones highlight correctly

## Depends on
T1 (HotspotZone), T2 (DashboardLayout)
