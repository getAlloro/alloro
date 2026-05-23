# T6: Local Rankings Replica

## Why
The Local Rankings page is the most information-dense page — rank badge, health score with 8 factors, competitor table, LLM analysis, and search results.

## What
Create `LocalRankingsReplica.tsx` with full rankings analysis data.

## Context

**Reference screenshot:** `docs/public/screenshots/0.0.82/local-rankings/full.png`
**Uses:** `DashboardLayout`, `HotspotZone`
**Fixture data:** capture script rankingLatest with factors, competitors, llmAnalysis

## File to create

### `docs/src/components/replicas/LocalRankingsReplica.tsx`

**Hotspot IDs:** `rank-badge`, `health-score`, `competitors-table`, `analysis-section`

**Layout:**

1. **Dashboard tab bar**: "PMS Statistics", "Rankings" (active)

2. **Top section — two columns:**
   - **Left: Rank Badge** (`rank-badge`):
     - Large "#3" in alloro-orange
     - "dentist in Austin TX" keyword below
     - "Google Maps Position" label
     - Previous: #5 → Current: #3 (improvement arrow)

   - **Right: Practice Health Score** (`health-score`):
     - Circular progress indicator showing 82/100
     - "Practice Health" label
     - 8 ranking factors list:
       | Factor | Score | Weight |
       |--------|-------|--------|
       | Category Match | 95 | 15% |
       | Reviews Quality | 90 | 15% |
       | Reviews Velocity | 85 | 15% |
       | Website Quality | 84 | 10% |
       | GBP Completeness | 80 | 10% |
       | Citations | 78 | 10% |
       | Content Freshness | 76 | 10% |
       | GBP Activity | 72 | 15% |
     - Each factor: name, horizontal bar showing score, score number

3. **Competitors Table** (`competitors-table`):
   | Rank | Practice | Rating | Reviews | Distance |
   |------|----------|--------|---------|----------|
   | 1 | Austin Family Dental | 4.9 | 312 | 0.3 mi |
   | 2 | Capitol Dental Care | 4.8 | 245 | 0.5 mi |
   | **3** | **Smile Clinic** | **4.8** | **187** | **—** |
   | 4 | Downtown Dental Group | 4.7 | 156 | 0.8 mi |
   | 5 | Riverside Dental | 4.6 | 134 | 1.2 mi |
   - Current practice row highlighted

4. **LLM Analysis** (`analysis-section`):
   - "Top moves to climb" header
   - 3 recommendation cards:
     1. "Increase review velocity to match Austin Family Dental's 12/month pace"
     2. "Post to GBP weekly — your GBP Activity score (72) is your weakest factor"
     3. "Add more service-area pages to improve Content Freshness"
   - Each card: numbered, actionable text, small priority indicator

**Styling:**
- Rank badge: large, bold, centered in a card
- Health score: circular SVG progress ring or CSS conic-gradient
- Factor bars: horizontal progress bars with score labels
- Competitor table: highlighted current practice row
- Analysis cards: white, rounded, numbered badges, subtle borders

## Verify
- Full rankings analysis visible — not header-only
- Competitor table shows 5 entries with current practice highlighted
- All 4 hotspot zones work

## Depends on
T1, T2
