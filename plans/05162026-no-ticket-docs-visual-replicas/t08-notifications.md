# T8: Notifications Replica

## Why
The Notifications page shows a chronological feed of alerts and updates.

## What
Create `NotificationsReplica.tsx` with hardcoded notification cards.

## Context

**Reference screenshot:** `docs/public/screenshots/0.0.82/notifications/full.png`
**Uses:** `DashboardLayout`, `HotspotZone`
**Fixture data:** `docs/scripts/fixtures/notifications.json`

## File to create

### `docs/src/components/replicas/NotificationsReplica.tsx`

**Hotspot IDs:** `header`, `notification-1`, `notification-2`, `notification-3`

**Layout:**

1. **Header** (`header`):
   - Breadcrumb: bell icon + "NOTIFICATIONS"
   - Right side: "MARK ALL AS READ" and "DELETE ALL" buttons (small, muted)

2. **Notification Cards** (vertical stack, full width):

   - **Card 1** (`notification-1`): "Ranking improved!"
     - NEW badge (orange pill)
     - "You moved from #5 to #3 for 'dentist in Austin TX'"
     - "STRATEGIC ALPHA" tag on right
     - "2 days ago" timestamp
     - "Mark as read" button

   - **Card 2** (`notification-2`): "New 5-star review"
     - NEW badge (orange pill)
     - "A patient left a 5-star review on Google"
     - "UPDATE" button on right
     - "3 days ago" timestamp
     - "Mark as read" button

   - **Card 3** (`notification-3`): "Website published"
     - Read state (no NEW badge, slightly muted styling)
     - "Your new homepage design is now live"
     - "4 days ago" timestamp

   - **Card 4** (optional, no hotspot): "PMS data processed"
     - Read state
     - "Your May PMS export has been analyzed — new insights available"
     - "5 days ago" timestamp

**Styling:**
- Notification cards: white, rounded-xl, border, padding, stack with gap-3
- Unread cards: slightly brighter/bolder, subtle left border accent in orange
- Read cards: muted text, no accent
- NEW badge: small orange pill, uppercase, bold
- Action buttons: small, outlined, muted color
- Timestamps: text-xs, text-alloro-slate

## Verify
- 4 notification cards visible
- Unread vs read visual distinction clear

## Depends on
T1, T2
