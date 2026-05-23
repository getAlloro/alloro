# T5: Referrals Hub Replica

## Why
The Referrals Hub (PMS Statistics tab) displays referral data, production stats, and analysis matrices. It's data-dense with tables and stat cards.

## What
Create `ReferralsHubReplica.tsx` with hardcoded referral/production data.

## Context

**Reference screenshot:** `docs/public/screenshots/0.0.82/referrals-hub/full.png`
**Uses:** `DashboardLayout`, `HotspotZone`
**Fixture data:** capture script PMS keyData (months, sources, totals) and referral engine output (doctor/non-doctor matrices)

## File to create

### `docs/src/components/replicas/ReferralsHubReplica.tsx`

**Hotspot IDs:** `stats-row`, `production-chart`, `referral-sources`, `referral-matrix`

**Layout:**

1. **Dashboard tab bar** at top: "PMS Statistics" (active), "Rankings"

2. **Stats Row** (`stats-row`): 4 stat cards in a row:
   - Total Production: $221,100 (+22.4%)
   - Total Referrals: 187
   - Doctor Referrals: 75
   - Self Referrals: 112

3. **Monthly Production Chart** (`production-chart`):
   - Placeholder bar chart showing 6 months (Dec 2025 – May 2026)
   - Values: $28k, $32k, $35k, $38k, $41k, $47k
   - Use simple CSS bars (no chart library needed)

4. **Top Referral Sources Table** (`referral-sources`):
   | Rank | Source | Referrals | Production | % |
   |------|--------|-----------|------------|---|
   | 1 | Google Search | 42 | $58,000 | 35.2% |
   | 2 | Dr. Sarah Miller | 18 | $34,000 | 15.4% |
   | 3 | Direct/Walk-in | 28 | $31,000 | 14.0% |
   | 4 | Dr. Michael Chen | 12 | $24,000 | 10.9% |
   | 5 | Patient Referral | 22 | $19,000 | 8.6% |

5. **Doctor Referral Matrix** (`referral-matrix`):
   | Referrer | Referred | % Scheduled | Trend |
   |----------|----------|-------------|-------|
   | Dr. Sarah Miller | 18 | 89% | ↑ increasing |
   | Dr. Michael Chen | 12 | 75% | ↓ decreasing |
   | Dr. James Wilson | 8 | 82% | → stable |
   | Dr. Lisa Park | 5 | 90% | ↑ increasing |

6. **Non-Doctor Referral Matrix**:
   | Source | Type | Referred | Trend |
   |--------|------|----------|-------|
   | Google Search | digital | 42 | ↑ increasing |
   | Direct/Walk-in | organic | 28 | → stable |
   | Patient Referral | word_of_mouth | 22 | ↑ increasing |
   | Insurance Dir. | directory | 15 | → stable |

**Styling:**
- Stat cards: white, rounded, shadow, large number with trend arrow (green up / red down)
- Tables: clean rows, alternating subtle backgrounds, small text
- Trend labels: colored pills (green=increasing, red=decreasing, gray=stable)

## Verify
- Shows populated referral data, not empty/upload state
- All hotspot zones work

## Depends on
T1, T2
