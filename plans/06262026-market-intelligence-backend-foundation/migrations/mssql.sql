-- Microsoft SQL Server equivalent DDL for Market Intelligence Backend Foundation.
-- Alloro's executed app migration targets PostgreSQL. This file documents the
-- equivalent schema contract if this feature is ever ported to SQL Server.

CREATE TABLE market_keywords (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  organization_id INT NOT NULL,
  location_id INT NOT NULL,
  specialty NVARCHAR(128) NULL,
  keyword NVARCHAR(255) NOT NULL,
  normalized_keyword NVARCHAR(255) NOT NULL,
  canonical_keyword NVARCHAR(255) NULL,
  cluster NVARCHAR(128) NULL,
  intent NVARCHAR(64) NULL,
  source NVARCHAR(64) NOT NULL,
  status NVARCHAR(32) NOT NULL DEFAULT 'approved',
  confidence DECIMAL(5, 4) NULL,
  language_code NVARCHAR(16) NOT NULL DEFAULT 'en',
  location_name NVARCHAR(255) NULL,
  last_seen_at DATETIMEOFFSET NULL,
  metadata NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_market_keywords_organizations
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_market_keywords_locations
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
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
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  market_keyword_id UNIQUEIDENTIFIER NOT NULL,
  organization_id INT NOT NULL,
  location_id INT NOT NULL,
  report_month DATE NOT NULL,
  search_volume INT NULL,
  source NVARCHAR(64) NOT NULL DEFAULT 'dataforseo',
  provider NVARCHAR(64) NOT NULL DEFAULT 'dataforseo',
  provider_location_name NVARCHAR(255) NULL,
  provider_metadata NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_market_keyword_volume_keyword
    FOREIGN KEY (market_keyword_id) REFERENCES market_keywords(id) ON DELETE CASCADE,
  CONSTRAINT fk_market_keyword_volume_organizations
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE NO ACTION,
  CONSTRAINT fk_market_keyword_volume_locations
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE NO ACTION,
  CONSTRAINT market_keyword_search_volume_unique_keyword_month_source
    UNIQUE (market_keyword_id, report_month, source)
);

CREATE INDEX idx_market_keyword_volume_org_month
  ON market_keyword_search_volume(organization_id, report_month);
CREATE INDEX idx_market_keyword_volume_location_month
  ON market_keyword_search_volume(location_id, report_month);
CREATE INDEX idx_market_keyword_volume_keyword_month
  ON market_keyword_search_volume(market_keyword_id, report_month);
