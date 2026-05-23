# T14: Support Replica

## Why
The Support page shows a help desk with ticket list and ticket detail panel.

## What
Create `SupportReplica.tsx` with hardcoded support tickets and a detail view.

## Context

**Reference screenshot:** `docs/public/screenshots/0.0.82/support/full.png`
**Uses:** `DashboardLayout`, `HotspotZone`
**Fixture data:** capture script support ticket fixtures

## File to create

### `docs/src/components/replicas/SupportReplica.tsx`

**Hotspot IDs:** `header`, `ticket-list`, `ticket-detail`, `new-ticket-btn`

**Layout:**

1. **Header** (`header`):
   - "SUPPORT" small label with LifeBuoy icon
   - "Help desk" heading
   - Subtitle: "Submit a ticket, follow status, and keep the full support conversation in one place."

2. **New Ticket Button** (`new-ticket-btn`):
   - Right-aligned in header area
   - "+ NEW TICKET" — orange button with plus icon, shadow

3. **Two-column layout** (grid: left 360px, right flex):

   **Left: Ticket List** (`ticket-list`):
   - "TICKETS" section label with count badge "3"
   - **Ticket 1** (selected/active):
     - "SUP-001 · BUG REPORT" label
     - "Rankings not updating after GBP reconnect"
     - "NEW" badge (orange)
     - "2 days ago"
   - **Ticket 2**:
     - "SUP-002 · WEBSITE EDIT" label
     - "Homepage hero image broken on mobile Safari"
     - "IN PROGRESS" badge (blue)
     - "5 days ago"
   - **Ticket 3**:
     - "SUP-003 · FEATURE REQUEST" label
     - "How do I add a team member?"
     - "RESOLVED" badge (green)
     - "9 days ago"

   **Right: Ticket Detail** (`ticket-detail`):
   - Shows detail for selected ticket (Ticket 1)
   - "SUP-001 · BUG REPORT" header
   - "Rankings not updating after GBP reconnect" title
   - Status badge: "NEW"
   - Message thread:
     - User message: "After I reconnected my Google Business Profile, the rankings page still shows old data from last week. I expected it to refresh."
     - Author: "Dr. Sarah Smith" — avatar, timestamp
   - Reply input area at bottom (empty textarea placeholder)

**Styling:**
- Ticket list: vertical card stack, active ticket has orange left border
- Status badges: NEW=orange, IN PROGRESS=blue, RESOLVED=green — small pills
- Type labels: uppercase, tiny, tracking-wide, muted
- Message thread: chat-style bubbles, user messages right-aligned or left with avatar
- Reply area: bordered textarea with "Type a reply..." placeholder, Send button

## Verify
- 3 tickets in list with status badges
- Detail panel shows selected ticket content
- Visual distinction between ticket statuses

## Depends on
T1, T2
