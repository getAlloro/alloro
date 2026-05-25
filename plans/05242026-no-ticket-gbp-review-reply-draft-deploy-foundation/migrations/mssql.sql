-- GBP Review Reply Draft Deploy Foundation
-- SQL Server parity sketch. Alloro deploys PostgreSQL through Knex; this file
-- documents equivalent additive DDL if SQL Server execution is ever requested.

CREATE TABLE gbp_automation_settings (
  id uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
  organization_id int NOT NULL,
  location_id int NULL,
  review_reply_enabled bit NOT NULL DEFAULT 0,
  review_reply_customizations nvarchar(max) NULL,
  local_post_customizations nvarchar(max) NULL,
  local_post_generation_enabled bit NOT NULL DEFAULT 0,
  local_post_frequency nvarchar(50) NOT NULL DEFAULT 'twice_monthly',
  next_post_generation_at datetimeoffset NULL,
  default_featured_image_url nvarchar(max) NULL,
  metadata nvarchar(max) NOT NULL DEFAULT '{}',
  created_at datetimeoffset NOT NULL DEFAULT sysdatetimeoffset(),
  updated_at datetimeoffset NOT NULL DEFAULT sysdatetimeoffset(),
  CONSTRAINT fk_gbp_settings_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_gbp_settings_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX ix_gbp_settings_org_location ON gbp_automation_settings(organization_id, location_id);
CREATE UNIQUE INDEX ux_gbp_settings_org_default
  ON gbp_automation_settings(organization_id)
  WHERE location_id IS NULL;
CREATE UNIQUE INDEX ux_gbp_settings_org_location
  ON gbp_automation_settings(organization_id, location_id)
  WHERE location_id IS NOT NULL;

CREATE TABLE gbp_work_items (
  id uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
  organization_id int NOT NULL,
  location_id int NOT NULL,
  google_property_id int NOT NULL,
  content_type nvarchar(50) NOT NULL,
  source_review_id uniqueidentifier NULL,
  status nvarchar(50) NOT NULL DEFAULT 'draft',
  draft_content nvarchar(max) NOT NULL,
  approved_content nvarchar(max) NULL,
  published_content nvarchar(max) NULL,
  local_post_payload nvarchar(max) NULL,
  featured_image_url nvarchar(max) NULL,
  google_resource_name nvarchar(max) NULL,
  google_response nvarchar(max) NULL,
  generation_prompt_key nvarchar(120) NULL,
  generation_input nvarchar(max) NULL,
  generation_customizations nvarchar(max) NULL,
  created_by_user_id int NULL,
  approved_by_user_id int NULL,
  published_by_user_id int NULL,
  rejected_by_user_id int NULL,
  approved_at datetimeoffset NULL,
  published_at datetimeoffset NULL,
  rejected_at datetimeoffset NULL,
  last_deploy_failed_at datetimeoffset NULL,
  next_retry_at datetimeoffset NULL,
  last_error_code nvarchar(120) NULL,
  last_error_message nvarchar(max) NULL,
  retry_count int NOT NULL DEFAULT 0,
  metadata nvarchar(max) NOT NULL DEFAULT '{}',
  created_at datetimeoffset NOT NULL DEFAULT sysdatetimeoffset(),
  updated_at datetimeoffset NOT NULL DEFAULT sysdatetimeoffset(),
  CONSTRAINT fk_gbp_work_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_gbp_work_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_gbp_work_property FOREIGN KEY (google_property_id) REFERENCES google_properties(id),
  CONSTRAINT ck_gbp_work_content_type CHECK (content_type IN ('review_reply', 'local_post')),
  CONSTRAINT ck_gbp_work_status CHECK (status IN ('draft', 'awaiting_approval', 'approved', 'deploying', 'published', 'rejected'))
);

CREATE INDEX ix_gbp_work_org_location_status ON gbp_work_items(organization_id, location_id, status);
CREATE INDEX ix_gbp_work_source_review ON gbp_work_items(source_review_id);
CREATE INDEX ix_gbp_work_type_status ON gbp_work_items(content_type, status);
CREATE INDEX ix_gbp_work_next_retry ON gbp_work_items(next_retry_at);
CREATE UNIQUE INDEX ux_gbp_work_active_review_reply
  ON gbp_work_items(source_review_id)
  WHERE content_type = 'review_reply'
    AND source_review_id IS NOT NULL
    AND status IN ('draft', 'awaiting_approval', 'approved', 'deploying');

CREATE TABLE gbp_deployment_attempts (
  id uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
  work_item_id uniqueidentifier NOT NULL,
  attempt_number int NOT NULL,
  status nvarchar(50) NOT NULL DEFAULT 'pending',
  requested_by_user_id int NULL,
  started_at datetimeoffset NULL,
  completed_at datetimeoffset NULL,
  request_payload nvarchar(max) NULL,
  response_payload nvarchar(max) NULL,
  error_code nvarchar(120) NULL,
  error_message nvarchar(max) NULL,
  created_at datetimeoffset NOT NULL DEFAULT sysdatetimeoffset(),
  updated_at datetimeoffset NOT NULL DEFAULT sysdatetimeoffset(),
  CONSTRAINT fk_gbp_attempt_work FOREIGN KEY (work_item_id) REFERENCES gbp_work_items(id) ON DELETE CASCADE,
  CONSTRAINT ck_gbp_attempt_status CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  CONSTRAINT ux_gbp_attempt_work_number UNIQUE (work_item_id, attempt_number)
);

CREATE INDEX ix_gbp_attempt_work_created ON gbp_deployment_attempts(work_item_id, created_at);
CREATE INDEX ix_gbp_attempt_status_created ON gbp_deployment_attempts(status, created_at);

CREATE TABLE gbp_work_events (
  id uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
  work_item_id uniqueidentifier NOT NULL,
  actor_user_id int NULL,
  event_type nvarchar(120) NOT NULL,
  metadata nvarchar(max) NOT NULL DEFAULT '{}',
  created_at datetimeoffset NOT NULL DEFAULT sysdatetimeoffset(),
  CONSTRAINT fk_gbp_event_work FOREIGN KEY (work_item_id) REFERENCES gbp_work_items(id) ON DELETE CASCADE
);

CREATE INDEX ix_gbp_event_work_created ON gbp_work_events(work_item_id, created_at);
CREATE INDEX ix_gbp_event_type_created ON gbp_work_events(event_type, created_at);

-- Rollback:
-- DROP TABLE IF EXISTS gbp_work_events;
-- DROP TABLE IF EXISTS gbp_deployment_attempts;
-- DROP TABLE IF EXISTS gbp_work_items;
-- DROP TABLE IF EXISTS gbp_automation_settings;
