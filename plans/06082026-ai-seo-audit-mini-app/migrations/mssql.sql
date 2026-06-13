-- AI SEO Audit Mini App - Microsoft SQL Server parity DDL
-- Production safety: additive tables only, no data rewrite, no backfill.

IF OBJECT_ID('dbo.ai_seo_audit_runs', 'U') IS NULL
CREATE TABLE dbo.ai_seo_audit_runs (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  scope NVARCHAR(40) NOT NULL CHECK (scope IN ('url_only', 'organization', 'sitewide', 'location')),
  status NVARCHAR(40) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  organization_id INT NULL,
  project_id UNIQUEIDENTIFIER NULL,
  requested_url NVARCHAR(MAX) NULL,
  normalized_url NVARCHAR(MAX) NULL,
  score DECIMAL(5,2) NULL,
  data_coverage DECIMAL(5,2) NULL,
  confidence NVARCHAR(20) NULL CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
  rule_version NVARCHAR(120) NOT NULL,
  hard_caps NVARCHAR(MAX) NOT NULL DEFAULT '[]',
  summary NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  error_code NVARCHAR(120) NULL,
  error_message NVARCHAR(MAX) NULL,
  created_by_user_id INT NULL,
  started_at DATETIMEOFFSET NULL,
  completed_at DATETIMEOFFSET NULL,
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);

IF OBJECT_ID('dbo.ai_seo_audit_targets', 'U') IS NULL
CREATE TABLE dbo.ai_seo_audit_targets (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  run_id UNIQUEIDENTIFIER NOT NULL,
  target_type NVARCHAR(40) NOT NULL CHECK (target_type IN ('page', 'location', 'site')),
  page_id UNIQUEIDENTIFIER NULL,
  location_id INT NULL,
  url NVARCHAR(MAX) NOT NULL,
  label NVARCHAR(500) NULL,
  score DECIMAL(5,2) NULL,
  data_coverage DECIMAL(5,2) NULL,
  confidence NVARCHAR(20) NULL CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
  mapping_confidence DECIMAL(5,2) NULL,
  metadata NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_ai_seo_targets_run FOREIGN KEY (run_id) REFERENCES dbo.ai_seo_audit_runs(id) ON DELETE CASCADE
);

IF OBJECT_ID('dbo.ai_seo_audit_results', 'U') IS NULL
CREATE TABLE dbo.ai_seo_audit_results (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  run_id UNIQUEIDENTIFIER NOT NULL,
  target_id UNIQUEIDENTIFIER NULL,
  category NVARCHAR(80) NOT NULL,
  check_id NVARCHAR(160) NOT NULL,
  status NVARCHAR(40) NOT NULL CHECK (status IN ('pass', 'partial', 'fail', 'unavailable', 'not_applicable')),
  weight DECIMAL(6,3) NOT NULL,
  points_awarded DECIMAL(6,3) NOT NULL,
  method NVARCHAR(40) NOT NULL CHECK (method IN ('deterministic', 'llm_assisted', 'integration')),
  data_scope NVARCHAR(40) NOT NULL CHECK (data_scope IN ('url', 'organization', 'location', 'external')),
  remediation NVARCHAR(MAX) NULL,
  details NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_ai_seo_results_run FOREIGN KEY (run_id) REFERENCES dbo.ai_seo_audit_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_seo_results_target FOREIGN KEY (target_id) REFERENCES dbo.ai_seo_audit_targets(id)
);

IF OBJECT_ID('dbo.ai_seo_audit_external_sources', 'U') IS NULL
CREATE TABLE dbo.ai_seo_audit_external_sources (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  run_id UNIQUEIDENTIFIER NOT NULL,
  target_id UNIQUEIDENTIFIER NULL,
  query NVARCHAR(MAX) NOT NULL,
  url NVARCHAR(MAX) NOT NULL,
  title NVARCHAR(500) NULL,
  source_host NVARCHAR(255) NOT NULL,
  source_type NVARCHAR(80) NULL,
  reliability_score DECIMAL(5,2) NULL,
  entity_match_state NVARCHAR(40) NOT NULL CHECK (entity_match_state IN ('consistent', 'conflicting', 'missing_on_site', 'external_candidate', 'ambiguous_entity', 'unavailable')),
  extracted_fields NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  compared_fields NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  metadata NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  fetched_at DATETIMEOFFSET NULL,
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_ai_seo_sources_run FOREIGN KEY (run_id) REFERENCES dbo.ai_seo_audit_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_seo_sources_target FOREIGN KEY (target_id) REFERENCES dbo.ai_seo_audit_targets(id)
);

IF OBJECT_ID('dbo.ai_seo_audit_evidence', 'U') IS NULL
CREATE TABLE dbo.ai_seo_audit_evidence (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  result_id UNIQUEIDENTIFIER NOT NULL,
  evidence_type NVARCHAR(120) NOT NULL,
  source NVARCHAR(MAX) NOT NULL,
  excerpt NVARCHAR(MAX) NULL,
  value NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_ai_seo_evidence_result FOREIGN KEY (result_id) REFERENCES dbo.ai_seo_audit_results(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_seo_runs_org_created ON dbo.ai_seo_audit_runs (organization_id, created_at);
CREATE INDEX idx_ai_seo_runs_project_created ON dbo.ai_seo_audit_runs (project_id, created_at);
CREATE INDEX idx_ai_seo_targets_run ON dbo.ai_seo_audit_targets (run_id);
CREATE INDEX idx_ai_seo_results_run ON dbo.ai_seo_audit_results (run_id);
CREATE INDEX idx_ai_seo_sources_run ON dbo.ai_seo_audit_external_sources (run_id);
CREATE INDEX idx_ai_seo_sources_host ON dbo.ai_seo_audit_external_sources (source_host);
CREATE INDEX idx_ai_seo_evidence_result ON dbo.ai_seo_audit_evidence (result_id);

-- Rollback:
-- DROP TABLE IF EXISTS dbo.ai_seo_audit_evidence;
-- DROP TABLE IF EXISTS dbo.ai_seo_audit_external_sources;
-- DROP TABLE IF EXISTS dbo.ai_seo_audit_results;
-- DROP TABLE IF EXISTS dbo.ai_seo_audit_targets;
-- DROP TABLE IF EXISTS dbo.ai_seo_audit_runs;
