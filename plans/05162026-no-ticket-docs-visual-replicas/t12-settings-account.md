# T12: Settings — Account Replica

## Why
The Account settings page shows a simple change password form. Simplest settings page.

## What
Create `AccountReplica.tsx` with hardcoded password change form.

## Context

**Reference screenshot:** `docs/public/screenshots/0.0.82/settings-account/full.png`
**Uses:** `DashboardLayout`, `SettingsTabs`, `HotspotZone`

## File to create

### `docs/src/components/replicas/AccountReplica.tsx`

**Hotspot IDs:** `settings-tabs`, `password-form`, `submit-btn`

**Layout:**

1. **Settings Tabs** (`settings-tabs`): `SettingsTabs` with `activeTab="account"`

2. **Change Password Section** (`password-form`):
   - Lock icon + "Change Password" heading
   - Subtitle: "Update your account password"
   - Form fields (stacked):
     - "CURRENT PASSWORD" label + input (placeholder: "Enter current password")
     - "NEW PASSWORD" label + input (placeholder: "Enter new password")
     - "CONFIRM PASSWORD" label + input (placeholder: "Confirm your password")

3. **Submit Button** (`submit-btn`):
   - "UPDATE PASSWORD" button — full-width, orange/coral

**Styling:**
- Form: white card, rounded-xl, border, padding, max-width ~500px
- Input fields: standard input styling with border, rounded, placeholder text
- Labels: uppercase, text-xs, tracking-wide, alloro-slate
- Button: alloro-orange background, white text, rounded-xl

## Verify
- Password form renders with 3 fields
- Hotspot zones highlight correctly

## Depends on
T1, T2
