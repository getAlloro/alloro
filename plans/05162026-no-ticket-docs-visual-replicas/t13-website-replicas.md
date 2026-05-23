# T13: Website Replicas — Editor, Submissions, Menus

## Why
The Website page has 3 distinct tab views that each need their own visual replica: the page editor, form submissions list, and navigation menus builder.

## What
Create 3 replica components for the website tab views.

## Context

**Reference screenshots:**
- `docs/public/screenshots/0.0.82/website-editor/full.png`
- `docs/public/screenshots/0.0.82/website-submissions/full.png`
- `docs/public/screenshots/0.0.82/website-menus/full.png`
**Uses:** `DashboardLayout`, `HotspotZone`

## Files to create

### `docs/src/components/replicas/WebsiteEditorReplica.tsx`

**Hotspot IDs:** `website-tabs`, `editor-preview`, `editor-controls`

**Layout:**
1. **Tab bar** (`website-tabs`): "Editing App" label, then tabs: "Editor" (active), "Submissions", "Posts", "Menus" — plus icons for preview/settings
2. **Two-column layout:**
   - **Left panel (~60%) — Preview** (`editor-preview`):
     - Site preview area showing a webpage layout
     - Component sections visible (hero, about, services, etc.)
     - Each section has a subtle hover indicator
   - **Right panel (~40%) — Controls** (`editor-controls`):
     - "Contact/Location" component selector at top
     - Form fields: "START", "END/CITY" inputs
     - "Choose a section or component to start editing" placeholder text

### `docs/src/components/replicas/WebsiteSubmissionsReplica.tsx`

**Hotspot IDs:** `website-tabs`, `submissions-list`, `submission-detail`

**Layout:**
1. **Tab bar** (`website-tabs`): Same as editor, "Submissions" active
2. **Submissions list** (`submissions-list`):
   - Form selector dropdown
   - Table with submissions:
     | Name | Email | Date | Status |
     |------|-------|------|--------|
     | John Smith | john@email.com | May 15, 2026 | Unread |
     | Maria Garcia | maria@email.com | May 13, 2026 | Read |
     | David Chen | david@email.com | May 10, 2026 | Flagged |
3. **Stats** (`submission-detail`):
   - Total submissions count, unread count, flagged count

### `docs/src/components/replicas/WebsiteMenusReplica.tsx`

**Hotspot IDs:** `website-tabs`, `menus-list`, `menu-editor`

**Layout:**
1. **Tab bar** (`website-tabs`): Same, "Menus" active
2. **Menus list** (`menus-list`):
   - "Main Navigation" menu
   - Menu items listed:
     - Home
     - About
     - Services
     - Contact
3. **Menu editor** (`menu-editor`):
   - Item properties: label, URL, order
   - Add/remove buttons

**Styling notes (all 3):**
- Tab bar: horizontal, small text, active tab underlined or filled
- Editor panels: bordered sections, subtle backgrounds
- Tables: clean, small text, standard formatting

## Verify
- All 3 tab views render distinct content
- Tab bar shows correct active tab in each

## Depends on
T1, T2
