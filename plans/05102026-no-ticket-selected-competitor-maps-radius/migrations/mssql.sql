-- Selected Competitor Maps and Radius Discovery
-- Spec: plans/05102026-no-ticket-selected-competitor-maps-radius/spec.md
--
-- Schema intent:
-- 1. Store the per-location suggestion radius used by competitor discovery.
-- 2. Store the radius used when a competitor was discovered.
-- 3. Snapshot the suggestion radius onto each ranking row.
--
-- Proposed columns:
-- - locations.competitor_discovery_radius_meters int null/default 40234
-- - location_competitors.discovery_radius_meters int null
-- - practice_rankings.competitor_discovery_radius_meters int null
--
ALTER TABLE locations
  ADD competitor_discovery_radius_meters int NOT NULL
    CONSTRAINT DF_locations_competitor_discovery_radius_meters DEFAULT 40234;

ALTER TABLE location_competitors
  ADD discovery_radius_meters int NULL;

ALTER TABLE practice_rankings
  ADD competitor_discovery_radius_meters int NULL;

UPDATE location_competitors
SET discovery_radius_meters = 40234
WHERE discovery_radius_meters IS NULL;

UPDATE practice_rankings
SET competitor_discovery_radius_meters = 40234
WHERE competitor_discovery_radius_meters IS NULL;

-- Down:
-- ALTER TABLE practice_rankings DROP COLUMN competitor_discovery_radius_meters;
-- ALTER TABLE location_competitors DROP COLUMN discovery_radius_meters;
-- ALTER TABLE locations DROP CONSTRAINT DF_locations_competitor_discovery_radius_meters;
-- ALTER TABLE locations DROP COLUMN competitor_discovery_radius_meters;
