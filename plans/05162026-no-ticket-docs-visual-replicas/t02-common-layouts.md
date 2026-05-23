# T2: Common Replica Components — Sidebar, Settings Tabs, Auth Layout

## Why
All 16 page replicas share common layout chrome — the Alloro sidebar (for authenticated pages), settings tab bar (for 4 settings pages), auth card layout (for 3 auth pages), and a dashboard wrapper. Building these shared components first eliminates duplication across replicas.

## What
Create 4 shared layout components in `docs/src/components/replicas/` that page replicas compose.

## Context

**Visual reference (from captured screenshots):**
- Sidebar: ~220px wide, light gray background, Alloro logo at top, grouped nav items with lucide icons, location selector at bottom
- Settings tabs: horizontal pill-style tabs (Integrations, Users & Roles, Billing, Account), sits at top of settings content area
- Auth layout: centered white card on light background, Alloro logo above the card
- Dashboard layout: sidebar on left, main content area with padding on right

**Brand tokens:** `alloro-navy`, `alloro-orange`, `alloro-orange-light`, `alloro-slate`, `alloro-border`
**Icon library:** lucide-react (already installed)

## Constraints
- Purely presentational — no routing, no state management beyond prop-driven active states
- Do NOT import from `../frontend/`
- Sidebar nav items are static labels, not real links

## Tasks

### 1. Create `docs/src/components/replicas/AlloroSidebar.tsx`

**Props:** `activeItem: string`

**Structure:**
```
┌──────────────────┐
│ 🟠 Alloro   [⚙]  │  ← logo + settings gear
├──────────────────┤
│                  │
│ ▸ Practice Hub   │  ← Dashboard section
│ ▸ Referrals Hub  │
│ ▸ Local Rankings │
│                  │
│ SETTINGS         │  ← Section label
│ ▸ Integrations   │
│ ▸ Team           │
│ ▸ Billing        │
│ ▸ Account        │
│                  │
│ FEATURES         │
│ ▸ Website        │
│                  │
│ HELP & SUPPORT   │
│ ▸ Support        │
│                  │
│ ┌──────────────┐ │
│ │ To-Do List   │ │  ← highlighted nav item if active
│ └──────────────┘ │
│ ┌──────────────┐ │
│ │ Notifications│ │
│ └──────────────┘ │
│                  │
├──────────────────┤
│ 📍 Smile Clinic  │  ← location selector
│    Downtown      │
└──────────────────┘
```

**Styling:**
- Width: 220px, min-height: 100%
- Background: very light gray (`bg-gray-50` or similar)
- Active item: alloro-orange text, light orange background
- Inactive items: gray text, hover brightens
- Section labels: uppercase, small, tracking-wide, muted color
- Icons: lucide (LayoutDashboard, TrendingUp, MapPin, CheckSquare, Bell, Settings, Users, CreditCard, User, Globe, LifeBuoy)

### 2. Create `docs/src/components/replicas/SettingsTabs.tsx`

**Props:** `activeTab: "integrations" | "users" | "billing" | "account"`

**Tabs:** `INTEGRATIONS`, `USERS & ROLES`, `BILLING`, `ACCOUNT`

**Styling:**
- Horizontal row of pill buttons
- Active tab: dark background (alloro-navy or similar), white text
- Inactive tabs: transparent, muted text, hover brightens
- Small text, uppercase, tracking-wide

### 3. Create `docs/src/components/replicas/AuthLayout.tsx`

**Props:** `children: React.ReactNode`

**Structure:**
- Full viewport height, centered content
- Light background
- Alloro logo/icon centered above the card
- White card: `max-w-[440px]`, rounded-2xl, shadow-lg, padding
- Children render inside the card

### 4. Create `docs/src/components/replicas/DashboardLayout.tsx`

**Props:** `activeItem: string`, `children: React.ReactNode`

**Structure:**
- Flexbox row: `AlloroSidebar` on left + main content area on right
- Main content area: flex-1, padding, overflow-y auto
- Full height (fills the DesktopViewport)

## Verify
- Each component renders without errors when given valid props
- Sidebar highlights the correct active item
- Settings tabs highlight the correct active tab

## Depends on
None (independent of T1)
