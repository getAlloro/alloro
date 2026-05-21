# T9: Settings — Integrations Replica

## Why
The Integrations settings page shows connected third-party services and practice details.

## What
Create `IntegrationsReplica.tsx` with hardcoded practice details, GSC connection, and locations.

## Context

**Reference screenshot:** `docs/public/screenshots/0.0.82/settings-integrations/full.png`
**Uses:** `DashboardLayout`, `SettingsTabs`, `HotspotZone`

## File to create

### `docs/src/components/replicas/IntegrationsReplica.tsx`

**Hotspot IDs:** `settings-tabs`, `practice-details`, `gsc-card`, `locations-section`

**Layout:**

1. **Settings Tabs** (`settings-tabs`): `SettingsTabs` with `activeTab="integrations"`

2. **Practice Details** (`practice-details`):
   - "Practice Details" heading
   - Subtitle: "Manage your information and contact details"
   - Domain cards:
     - "smileclinic.com" — primary, with globe icon
     - "alexandleclinic.com" — secondary
   - **Encryption notice**: Shield icon, "Encrypted & Secure: All patient and practice data protected by high-level encryption protocols" — dark card with green accent

3. **Google Search Console** (`gsc-card`):
   - "Google Search Console" heading
   - "Connected" badge (green)
   - Connected account info

4. **Locations** (`locations-section`):
   - "Locations" heading
   - "Manage the Google Business Profile locations that..."
   - "+ ADD LOCATION" button (orange, right-aligned)
   - Location card: "Smile Clinic - Downtown"
     - Address: 123 Main Street, Suite 200, Austin, TX 78701
     - "MANAGE" button
   - Second location card: "Smile Clinic - Westlake" (if space allows)

**Styling:**
- Section cards: white background, rounded-xl, border, padding
- Connected badge: small green pill
- Domain cards: subtle border, domain name in mono/bold
- Encryption card: dark navy background, shield icon, green accent text

## Verify
- Settings tabs visible with Integrations active
- Practice details, GSC, and locations all populated

## Depends on
T1, T2
