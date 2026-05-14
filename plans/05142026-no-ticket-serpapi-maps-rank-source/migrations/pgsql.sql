-- SerpApi Maps Rank Source
-- PostgreSQL schema plan
--
-- Change:
-- - Expand practice_rankings.search_position_source constraint to allow:
--   - 'serpapi_maps'
--   - existing 'apify_maps'
--   - existing 'places_text'
--
ALTER TABLE practice_rankings
  DROP CONSTRAINT IF EXISTS practice_rankings_search_position_source_check;

ALTER TABLE practice_rankings
  ADD CONSTRAINT practice_rankings_search_position_source_check
  CHECK (search_position_source IS NULL OR search_position_source IN (
    'apify_maps',
    'places_text',
    'serpapi_maps'
  ));
