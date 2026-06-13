-- AI SEO Audit Mini App - PostgreSQL DDL
-- Production safety: additive tables only, no data rewrite, no backfill.

CREATE TABLE IF NOT EXISTS website_builder.ai_seo_audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('url_only', 'organization', 'sitewide', 'location')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  organization_id INTEGER NULL REFERENCES organizations(id) ON DELETE SET NULL,
  project_id UUID NULL REFERENCES website_builder.projects(id) ON DELETE SET NULL,
  requested_url TEXT NULL,
  normalized_url TEXT NULL,
  score NUMERIC(5,2) NULL,
  data_coverage NUMERIC(5,2) NULL,
  confidence TEXT NULL CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
  rule_version TEXT NOT NULL,
  hard_caps JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT NULL,
  error_message TEXT NULL,
  created_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS website_builder.ai_seo_audit_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES website_builder.ai_seo_audit_runs(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('page', 'location', 'site')),
  page_id UUID NULL REFERENCES website_builder.pages(id) ON DELETE SET NULL,
  location_id INTEGER NULL REFERENCES locations(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  label TEXT NULL,
  score NUMERIC(5,2) NULL,
  data_coverage NUMERIC(5,2) NULL,
  confidence TEXT NULL CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
  mapping_confidence NUMERIC(5,2) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS website_builder.ai_seo_audit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES website_builder.ai_seo_audit_runs(id) ON DELETE CASCADE,
  target_id UUID NULL REFERENCES website_builder.ai_seo_audit_targets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  check_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'partial', 'fail', 'unavailable', 'not_applicable')),
  weight NUMERIC(6,3) NOT NULL,
  points_awarded NUMERIC(6,3) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('deterministic', 'llm_assisted', 'integration')),
  data_scope TEXT NOT NULL CHECK (data_scope IN ('url', 'organization', 'location', 'external')),
  remediation TEXT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS website_builder.ai_seo_audit_external_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES website_builder.ai_seo_audit_runs(id) ON DELETE CASCADE,
  target_id UUID NULL REFERENCES website_builder.ai_seo_audit_targets(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NULL,
  source_host TEXT NOT NULL,
  source_type TEXT NULL,
  reliability_score NUMERIC(5,2) NULL,
  entity_match_state TEXT NOT NULL CHECK (entity_match_state IN ('consistent', 'conflicting', 'missing_on_site', 'external_candidate', 'ambiguous_entity', 'unavailable')),
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  compared_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS website_builder.ai_seo_audit_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES website_builder.ai_seo_audit_results(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  source TEXT NOT NULL,
  excerpt TEXT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_seo_runs_org_created ON website_builder.ai_seo_audit_runs (organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_seo_runs_project_created ON website_builder.ai_seo_audit_runs (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_seo_runs_scope_status ON website_builder.ai_seo_audit_runs (scope, status);
CREATE INDEX IF NOT EXISTS idx_ai_seo_runs_created ON website_builder.ai_seo_audit_runs (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_seo_targets_run ON website_builder.ai_seo_audit_targets (run_id);
CREATE INDEX IF NOT EXISTS idx_ai_seo_targets_location ON website_builder.ai_seo_audit_targets (location_id);
CREATE INDEX IF NOT EXISTS idx_ai_seo_targets_page ON website_builder.ai_seo_audit_targets (page_id);
CREATE INDEX IF NOT EXISTS idx_ai_seo_targets_url ON website_builder.ai_seo_audit_targets (url);
CREATE INDEX IF NOT EXISTS idx_ai_seo_results_run ON website_builder.ai_seo_audit_results (run_id);
CREATE INDEX IF NOT EXISTS idx_ai_seo_results_target ON website_builder.ai_seo_audit_results (target_id);
CREATE INDEX IF NOT EXISTS idx_ai_seo_results_category_status ON website_builder.ai_seo_audit_results (category, status);
CREATE INDEX IF NOT EXISTS idx_ai_seo_results_check ON website_builder.ai_seo_audit_results (check_id);
CREATE INDEX IF NOT EXISTS idx_ai_seo_sources_run ON website_builder.ai_seo_audit_external_sources (run_id);
CREATE INDEX IF NOT EXISTS idx_ai_seo_sources_target ON website_builder.ai_seo_audit_external_sources (target_id);
CREATE INDEX IF NOT EXISTS idx_ai_seo_sources_host ON website_builder.ai_seo_audit_external_sources (source_host);
CREATE INDEX IF NOT EXISTS idx_ai_seo_sources_state ON website_builder.ai_seo_audit_external_sources (entity_match_state);
CREATE INDEX IF NOT EXISTS idx_ai_seo_evidence_result ON website_builder.ai_seo_audit_evidence (result_id);
CREATE INDEX IF NOT EXISTS idx_ai_seo_evidence_type ON website_builder.ai_seo_audit_evidence (evidence_type);

-- Rollback:
-- DROP TABLE IF EXISTS website_builder.ai_seo_audit_evidence;
-- DROP TABLE IF EXISTS website_builder.ai_seo_audit_external_sources;
-- DROP TABLE IF EXISTS website_builder.ai_seo_audit_results;
-- DROP TABLE IF EXISTS website_builder.ai_seo_audit_targets;
-- DROP TABLE IF EXISTS website_builder.ai_seo_audit_runs;
