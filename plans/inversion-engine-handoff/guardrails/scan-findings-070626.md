# Honesty-Scan Findings — dashboard-metrics + Summary path (2026-07-06)

First sweep with the hardened 8-signature `alloro-honesty-scan`. All receipts `origin/dev/dave`. **Routing:** these fold into the *Dashboard Accuracy & Trust* doc (Notion `394…`) as **Wave 2**, after Dave clears the emergency nine — not injected mid-fire. F3/F4 are already flagged in the demand-gen guide.

## New findings (F1–F9)

| # | Finding | Signature | File:line | Reach | Fix |
|---|---|---|---|---|---|
| **F1** | `current_rating` = **unweighted mean of per-location averages** (5.0/2rev + 4.0/500rev → 4.5, shown at 2dp) | 5 wrong-agg | `metricsHelpers.ts:98,163-165`; `rating_change_30d` inherits it `sectionBuilders.ts:73-76` | 🟥 customer + LLM | weight by each location's review count, or label "avg across N locations" |
| **F2** | `reviews_this_month` **fail-degrades to `0`** on GBP fetch failure, under `currentMonthLabel()`, no as-of | 6 staleness | `metricsHelpers.ts:116,123` → `sectionBuilders.ts:87` | 🟥 customer | fetch-failed sentinel → "—" / surface the as-of |
| **F3** | Funnel "Only X% moved through" **stitches Rybbit all-channel visits over GSC search impressions** (causal frame, two populations) | 8 stitched | `funnelMath.ts:18,49,104`; `stageReaders.ts:252,293` | 🟥 customer | drop causal frame or use GSC *clicks* as numerator (shares population) |
| **F4** | `ranking.total_competitors` **no small-sample floor** → "#1 of 2" as a market rank | 7 small-sample | `service.ranking-stage-scoring.ts:394`; render `RankingsHubSurface.tsx:145` | 🟥 LLM+customer | n-gate below threshold, or "of your 1 tracked competitor" |
| **F5** | `production/referrals_this_month` = latest **uploaded** PMS month (can be stale), labeled "this_month", no as-of | 6+4 | `sectionBuilders.ts:395,406-408` | 🟨 LLM | rename `_latest_month` + carry month key/as-of |
| **F6** | `production_change_30d` = latest-two-uploaded-months delta, **not 30 days** | 4 false-precision | `sectionBuilders.ts:369-388,402` | 🟨 LLM | rename `_month_over_month`; emit only when months adjacent |
| **F7** | `rank_score = competitiveScore \|\| totalScore` **collapses two score definitions**; 0-100 vs 0-1 scale ambiguous end-to-end (root of the documented `score_gap`) | 5 wrong-source | `service.ranking-stage-scoring.ts:392`; `sectionBuilders.ts:227-228` | 🟨 LLM | pick one score def + assert range at the boundary |
| **F8** | Referral `drop_pct`/`growth_pct`/`days_since_last` **hardcoded `0`** ("RE exposes no delta") | 1 placeholder | `sectionBuilders.ts:467-468,483` | 🟨 LLM | `null` not `0` so "unknown" can't render as "0%" |
| **F9** | `days_since_last_post` **null on GBP post-fetch failure** = "no posts in 90d"; drives "Post Due" nudge on an outage | 6 staleness | `sectionBuilders.ts:145-160` | 🟨 minor | distinguish fetch-failed from no-posts |

## The one check that gates F1's severity
F1 is **likely live, not latent**: **1Endo** (a paying account, ~$1.5k/mo) is multi-location — the churn autopsy flagged it needs multi-location support — so its displayed rating is at risk of the unweighted-mean error. **Confirm:** 1Endo's shown `current_rating` vs. its real review-count-weighted Google average. If they differ, F1 is a live wrong number on a paying dashboard.

## Surfaces NOT scanned (next sweeps)
Audit PDF / audit pillars · transactional email/SMS · GBP/social posts Alloro publishes · the ranking **LLM** output (`service.ranking-llm.ts`) + `ranking_recommendations` · the ReviewModel patient-journey `readReviews` path · `wizardDemoData.ts` subscription-bypass · getalloro.com marketing copy.

## Already-documented (left as receipts, not re-counted)
`score_gap_to_top = 100−score`, production-as-gross, Reviews wall-clock label, referral-count inflation — all in the honesty doc / demand-gen guide.
