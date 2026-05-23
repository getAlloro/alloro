# T7: Todo List Replica

## Why
The Todo List page shows a task board with prioritized action cards. Relatively simple layout.

## What
Create `TodoListReplica.tsx` with hardcoded task cards in a 2-column grid.

## Context

**Reference screenshot:** `docs/public/screenshots/0.0.82/todo-list/full.png`
**Uses:** `DashboardLayout`, `HotspotZone`
**Fixture data:** `docs/scripts/fixtures/tasks.json`

## File to create

### `docs/src/components/replicas/TodoListReplica.tsx`

**Hotspot IDs:** `header`, `progress-bar`, `task-card-1`, `task-card-2`, `task-card-3`

**Layout:**

1. **Header** (`header`):
   - Breadcrumb: avatar + "TO-DO LIST"
   - Right side: "UPDATE TO-DO LIST" button (outlined)

2. **Team Tasks section** (`progress-bar`):
   - Icon + "Team Tasks" heading
   - Progress bar: 0% complete
   - "0%" label

3. **Task Card Grid** (2 columns):
   - **Card 1** (`task-card-1`): "Reply to 3 new Google reviews"
     - "HIGH PRIORITY" badge (red/orange)
     - Description: "You have 3 unread reviews from the past week that need responses."
     - Status: pending
     - Small date label
   - **Card 2** (`task-card-2`): "Upload May PMS export"
     - "MEDIUM PRIORITY" badge (yellow)
     - Description: "Your monthly PMS data is due for upload to keep analytics current."
     - Status: pending
   - **Card 3** (`task-card-3`): "Review website content draft"
     - "LOW PRIORITY" badge (gray/blue)
     - Description: "New homepage copy is ready for your approval."
     - Status: pending
     - Expand/detail icon

**Styling:**
- Task cards: white, rounded-xl, border, shadow-sm, padding
- Priority badges: small pills, color-coded (red=high, yellow=medium, gray=low)
- Grid: `grid grid-cols-2 gap-4`
- Progress bar: thin horizontal bar, alloro-orange fill on gray track

## Verify
- 3 task cards visible in grid layout
- Priority badges color-coded

## Depends on
T1, T2
