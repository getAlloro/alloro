# T11: Settings — Billing Replica

## Why
The Billing page shows subscription details, payment method, and invoice history.

## What
Create `BillingReplica.tsx` with hardcoded subscription card and payment history.

## Context

**Reference screenshot:** `docs/public/screenshots/0.0.82/settings-billing/full.png`
**Uses:** `DashboardLayout`, `SettingsTabs`, `HotspotZone`

## File to create

### `docs/src/components/replicas/BillingReplica.tsx`

**Hotspot IDs:** `settings-tabs`, `subscription-card`, `manage-btn`, `payment-history`

**Layout:**

1. **Settings Tabs** (`settings-tabs`): `SettingsTabs` with `activeTab="billing"`

2. **Subscription Card** (`subscription-card`):
   - Orange/coral gradient background card
   - "ACTIVE" badge (top right, green)
   - Alloro logo/icon
   - "Alloro Intelligence" plan name
   - "Your active subscription"
   - Features list (2 columns):
     - Practice rankings tracking
     - Team collaboration
     - AI-powered insights
     - AI-powered website builder
     - Task management
   - Payment method: "Visa ending in 4242" with card icon
   - "MANAGE SUBSCRIPTION" button at bottom

3. **Manage Subscription Button** (`manage-btn`):
   - Full-width or centered button below the card
   - "Manage Subscription" — orange, outlined or solid

4. **Payment History** (`payment-history`):
   - "Payment History" heading with receipt icon
   - Table:
     | Date | Amount | Status | Coupon | Invoice |
     |------|--------|--------|--------|---------|
     | May 1, 2026 | $19,900.00 | PAID (green) | — | Download |
   - Single row showing latest payment

**Styling:**
- Subscription card: gradient background (coral/orange tones), white text, rounded-2xl, shadow
- Feature list: small checkmark icons, white text
- ACTIVE badge: small green pill
- Payment table: standard clean table styling
- PAID badge: small green pill

## Verify
- Subscription card shows plan details and features
- Payment history has at least one entry

## Depends on
T1, T2
