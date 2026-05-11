-- Selected Competitor Maps and Radius Discovery
-- Spec: plans/05102026-no-ticket-selected-competitor-maps-radius/spec.md
--
-- Schema intent:
-- 1. Store the per-location suggestion radius used by competitor discovery.
-- 2. Store the radius used when a competitor was discovered.
-- 3. Snapshot the suggestion radius onto each ranking row.
--
-- Proposed columns:
-- - locations.competitor_discovery_radius_meters integer nullable/default 40234
-- - location_competitors.discovery_radius_meters integer nullable
-- - practice_rankings.competitor_discovery_radius_meters integer nullable
--
ALTER TABLE locations
  ADD COLUMN competitor_discovery_radius_meters integer NOT NULL DEFAULT 40234;

ALTER TABLE location_competitors
  ADD COLUMN discovery_radius_meters integer NULL;

ALTER TABLE practice_rankings
  ADD COLUMN competitor_discovery_radius_meters integer NULL;

UPDATE location_competitors
SET discovery_radius_meters = 40234
WHERE discovery_radius_meters IS NULL;

UPDATE practice_rankings
SET competitor_discovery_radius_meters = 40234
WHERE competitor_discovery_radius_meters IS NULL;

-- Down:
-- ALTER TABLE practice_rankings DROP COLUMN IF EXISTS competitor_discovery_radius_meters;
-- ALTER TABLE location_competitors DROP COLUMN IF EXISTS discovery_radius_meters;
-- ALTER TABLE locations DROP COLUMN IF EXISTS competitor_discovery_radius_meters;
