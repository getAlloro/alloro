-- SerpApi Maps Rank Source
-- Microsoft SQL Server schema plan
--
-- Alloro production uses PostgreSQL for this table, but this scaffold records
-- the equivalent contract for the required planning artifact.
--
-- Change:
-- - Expand practice_rankings.search_position_source check constraint to allow
--   'serpapi_maps' alongside existing values.
--
ALTER TABLE practice_rankings
  DROP CONSTRAINT practice_rankings_search_position_source_check;

ALTER TABLE practice_rankings
  ADD CONSTRAINT practice_rankings_search_position_source_check
  CHECK (
    search_position_source IS NULL OR
    search_position_source IN ('apify_maps', 'places_text', 'serpapi_maps')
  );
