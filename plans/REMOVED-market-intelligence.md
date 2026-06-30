# Removed — Market Intelligence / Search Opportunity

**Removed:** 2026-06-30
**Removal plan (record of work):** `plans/06302026-remove-market-intelligence-search-opportunity/`

The DataForSEO-backed **Market Intelligence** engine and the **Search Opportunity**
first stage of the Patient Journey funnel were torn out (recurring per-client cost;
directional-only numbers). Both generations of the search-volume infra were removed:

- **Gen-2 (Market Intelligence):** `controllers/market-intelligence/`, `config/dataforseo.ts`,
  `services/integrations/search-volume/`, `MarketKeywordModel`, `MarketKeywordSearchVolumeModel`,
  `marketIntelligence.processor.ts`, the `harvest-market-intelligence` worker + daily/monthly crons,
  and the `market_keywords` / `market_keyword_search_volume` tables.
- **Gen-1 (legacy):** `KeywordSearchVolumeModel`, `searchVolumeHarvestAdapter.ts`, the
  `monthly-search-volume-harvest` job, and the `keyword_search_volume` table.

The Patient Journey funnel **survives** minus its first stage — it now runs
`impressions → visits → leads` ("Google Visibility" is the head). Drop migration:
`src/database/migrations/20260630000000_drop_market_intelligence_and_search_volume.ts` (reversible).

The following plan folders were removed as part of this teardown (superseded):

- `plans/06262026-market-intelligence-backend-foundation`
- `plans/06262026-market-intelligence-dashboard-ui`
- `plans/06262026-market-intelligence-enrichment-ops`
- `plans/06262026-market-intelligence-patient-journey-api`

`plans/06242026-patient-journey-insights` is kept — it built the surviving funnel; only its
first-stage (Search Opportunity) tasks are superseded.
