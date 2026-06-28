-- PostgreSQL migration for Market Intelligence Backend Foundation.
-- Plan: plans/06262026-market-intelligence-backend-foundation

CREATE TABLE market_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  specialty VARCHAR(128),
  keyword VARCHAR(255) NOT NULL,
  normalized_keyword VARCHAR(255) NOT NULL,
  canonical_keyword VARCHAR(255),
  cluster VARCHAR(128),
  intent VARCHAR(64),
  source VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'approved',
  confidence NUMERIC(5, 4),
  language_code VARCHAR(16) NOT NULL DEFAULT 'en',
  location_name VARCHAR(255),
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_keywords_unique_org_location_keyword
    UNIQUE (organization_id, location_id, normalized_keyword)
);

CREATE INDEX idx_market_keywords_org_location_status
  ON market_keywords(organization_id, location_id, status);
CREATE INDEX idx_market_keywords_org_status
  ON market_keywords(organization_id, status);
CREATE INDEX idx_market_keywords_location_keyword
  ON market_keywords(location_id, normalized_keyword);

CREATE TABLE market_keyword_search_volume (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_keyword_id UUID NOT NULL REFERENCES market_keywords(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  report_month DATE NOT NULL,
  search_volume INTEGER,
  source VARCHAR(64) NOT NULL DEFAULT 'dataforseo',
  provider VARCHAR(64) NOT NULL DEFAULT 'dataforseo',
  provider_location_name VARCHAR(255),
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_keyword_search_volume_unique_keyword_month_source
    UNIQUE (market_keyword_id, report_month, source)
);

CREATE INDEX idx_market_keyword_volume_org_month
  ON market_keyword_search_volume(organization_id, report_month);
CREATE INDEX idx_market_keyword_volume_location_month
  ON market_keyword_search_volume(location_id, report_month);
CREATE INDEX idx_market_keyword_volume_keyword_month
  ON market_keyword_search_volume(market_keyword_id, report_month);

-- Rollback:
-- DROP TABLE IF EXISTS market_keyword_search_volume;
-- DROP TABLE IF EXISTS market_keywords;
