# T10: Settings — Team Members Replica

## Why
The Team Members settings page shows the user management table with roles and invitations.

## What
Create `TeamMembersReplica.tsx` with hardcoded user table and pending invitations.

## Context

**Reference screenshot:** `docs/public/screenshots/0.0.82/settings-users/full.png`
**Uses:** `DashboardLayout`, `SettingsTabs`, `HotspotZone`

## File to create

### `docs/src/components/replicas/TeamMembersReplica.tsx`

**Hotspot IDs:** `settings-tabs`, `team-header`, `users-table`, `invitations-section`

**Layout:**

1. **Settings Tabs** (`settings-tabs`): `SettingsTabs` with `activeTab="users"`

2. **Header** (`team-header`):
   - Users icon + "Team Members" heading
   - Subtitle: "Manage who has access to this organization"
   - "INVITE MEMBER" button (right-aligned, orange or outlined)

3. **Users Table** (`users-table`):
   | Name | Role | Phone | Actions |
   |------|------|-------|---------|
   | Dr. Sarah Smith (dr.smith@smileclinic.com) | Owner | (512) 555-0100 | — |
   | Jessica Torres (jessica@smileclinic.com) | Manager | (512) 555-0101 | Edit role, Remove |
   | Marcus Lee (marcus@smileclinic.com) | Viewer | (512) 555-0102 | Edit role, Remove |

   - Owner row: no action buttons (can't remove owner)
   - Other rows: role dropdown/edit icon, remove button

4. **Pending Invitations** (`invitations-section`):
   - "Pending Invitations" sub-heading
   - One invitation row: newdentist@smileclinic.com — viewer — "Resend" and "Cancel" buttons
   - Expires date shown

**Styling:**
- Table: clean rows, subtle alternating backgrounds, small text
- Role badges: small pills (Owner=navy, Manager=orange, Viewer=gray)
- Action buttons: small, icon-based or text links
- Pending section: slightly muted background

## Verify
- 3 users visible in table
- Pending invitation section visible
- Role badges color-coded

## Depends on
T1, T2
